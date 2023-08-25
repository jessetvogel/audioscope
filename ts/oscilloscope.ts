class Oscilloscope {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sampleRate: number;
    width: number;
    height: number;
    grid: { width: number, height: number };
    scale: { x: number, y: number }; // x = number of samples per horizontal grid cell, y = value per vertical grid cell
    _mode: 'stream' | 'track' | 'trigger';

    buffer: Float32Array;
    estimatedFrequency: number;
    centerIndex: number;

    constructor(options: { canvas: HTMLCanvasElement, sampleRate: number, bufferSize: number }) {
        this.canvas = options.canvas;
        this.sampleRate = options.sampleRate;
        this.grid = { width: 64, height: 64 };
        this.scale = { x: 64, y: 0.1 };
        this._mode = 'stream';

        options.bufferSize = Math.min(65536, Math.max(0, Math.floor(options.bufferSize))); // don't trust user input
        this.buffer = new Float32Array(options.bufferSize);
        this.estimatedFrequency = 0.0;
        this.centerIndex = 0;

        this._setupCanvas();
    }

    get mode() {
        return this._mode;
    }

    set mode(mode: 'stream' | 'track' | 'trigger') {
        this._mode = mode;
    }

    set timePerDivision(ms: number) {
        this.scale.x = ms / 1000.0 * this.sampleRate;
    }

    set volumePerDivision(volume: number) {
        this.scale.y = volume;
    }

    _setupCanvas(): void {
        const dpr = window.devicePixelRatio;
        this.width = this.canvas.offsetWidth;
        this.height = this.canvas.offsetHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
    }

    feed(data: Float32Array): void {
        // Update this.buffer and this.centerIndex
        this.buffer.copyWithin(0, data.length);
        this.buffer.set(data, this.buffer.length - data.length);
        this.centerIndex -= data.length;

        // Estimate period and frequency from new data
        const period = Math.max(1, this._estimatePeriod(data));
        this.estimatedFrequency = this.sampleRate / period;

        // Compute the maximum number of samples that fit on the screen
        const maxLength = Math.ceil(this.width / this.grid.width * this.scale.x);

        // ---
        switch (this._mode) {
            case 'stream': // show the most recent output
                this.centerIndex = this.buffer.length - maxLength / 2;
                break;

            case 'track':
                this.centerIndex += Math.floor(period * Math.floor((this.buffer.length - maxLength / 2 - this.centerIndex) / period));
                this.centerIndex = this._findNearestZeroCrossing(this.buffer, this.centerIndex);
                break;

            case 'trigger':

                break;
        }

        // Draw background
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.width, this.height);
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-background');
        this.ctx.fill();
        this.drawGrid();
        this.drawWave(this.buffer, this.centerIndex);
        this.drawFrequency(this.estimatedFrequency);
    }

    drawFrequency(frequency: number): void {
        this.ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--font-oscilloscope');
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-text');
        this.ctx.fillText(`frequency = ${frequency.toFixed(2)} Hz`, this.width - 192, 24);
    }

    drawWave(buffer: Float32Array, centerIndex: number): void {
        const center = Math.round(centerIndex);
        const shift = (center - centerIndex) / this.scale.x * this.grid.width;
        const maxLength = Math.ceil(this.width / this.grid.width * this.scale.x);
        const start = Math.max(0, Math.floor(center - maxLength / 2));
        const end = Math.min(buffer.length, Math.ceil(center + maxLength / 2));

        this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave');
        this.ctx.shadowColor = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-shadow');
        // this.ctx.shadowBlur = 8;
        this.ctx.beginPath();

        if (end - start <= this.width) { // if there is at least one pixel per sample, just draw all samples
            for (let i = start; i < end; ++i) {
                const value = buffer[i];
                const x = this.width / 2 + (i - center) / this.scale.x * this.grid.width + shift;
                const y = this.height / 2 - (value / this.scale.y) * this.grid.height;
                if (x >= 0 && x <= this.width)
                    this.ctx.lineTo(x, y);
            }
        }
        else { // if there are multiple samples per pixel, only draw the maximum and minimum
            for (let x = 0; x < this.width; ++x) {
                let iStart = Math.max(start, Math.floor((x - this.width / 2 - shift) / this.grid.width * this.scale.x + center));
                let iEnd = Math.min(end, Math.floor(((x + 1) - this.width / 2 - shift) / this.grid.width * this.scale.x + center));

                let max = -Infinity;
                let min = Infinity;
                for (let i = iStart; i < iEnd; ++i) {
                    if (buffer[i] > max) max = buffer[i];
                    if (buffer[i] < min) min = buffer[i];
                }

                const yMin = this.height / 2 - (min / this.scale.y) * this.grid.height;
                const yMax = this.height / 2 - (max / this.scale.y) * this.grid.height;

                this.ctx.lineTo(x, yMin);
                this.ctx.lineTo(x, yMax);
            }
        }
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawGrid(): void {
        this.ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-grid');
        const xStart = this.width / 2 - Math.ceil(this.width / 2 / this.grid.width) * this.grid.width;
        const yStart = this.height / 2 - Math.ceil(this.height / 2 / this.grid.height) * this.grid.height;
        for (let x = xStart; x < this.width; x += this.grid.width) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
        const d = Math.sqrt(this.grid.width * this.grid.height) / 10;
        for (let y = yStart; y < this.height; y += this.grid.height) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }
        for (let x = xStart; x < this.width; x += this.grid.width / 5) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.height / 2 - d);
            this.ctx.lineTo(x, this.height / 2 + d);
            this.ctx.stroke();
        }
        for (let y = yStart; y < this.height; y += this.grid.height / 5) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.width / 2 - d, y);
            this.ctx.lineTo(this.width / 2 + d, y);
            this.ctx.stroke();
        }
    }

    _estimatePeriod(buffer: Float32Array): number {
        const n = buffer.length;

        let corr_1 = 0.0;
        let corr_2 = 0.0;
        let corr_3 = 0.0;

        let prevMaxima = 0.0;
        let sumDistanceMaxima = 0.0;
        let numberMaxima = 0;

        for (let l = 0; l < n * (3 / 4); l++) {
            corr_1 = corr_2;
            corr_2 = corr_3;
            corr_3 = 0.0;
            for (let i = 0; i < n - l; i++)
                corr_3 += buffer[i] * buffer[i + l];

            if (l > 1 && corr_2 > corr_1 && corr_2 > corr_3) {
                const offset = (corr_1 - corr_3) / (2 * (corr_1 - 2 * corr_2 + corr_3));
                const maxima = (l - 1) + offset;

                sumDistanceMaxima += maxima - prevMaxima;
                prevMaxima = maxima;
                numberMaxima++;
            }
        }

        if (numberMaxima == 0) // for safety
            return 0.0;

        const periodEstimate = sumDistanceMaxima / numberMaxima;
        return periodEstimate;
    }

    _findZeroCrossingBefore(buffer: Float32Array, i: number): number {
        for (let j = Math.min(i, buffer.length - 1); j > 0; j--) {
            if (buffer[j - 1] <= 0 && buffer[j] > 0)
                return j;
        }
        return i; // by default
    }

    _findNearestZeroCrossing(buffer: Float32Array, i: number): number {
        i = Math.round(i);
        for (let j = 0; j < buffer.length; j++) {
            if (i - j - 1 >= 0) {
                let a = buffer[i - j - 1];
                let b = buffer[i - j];
                if (a * b <= 0)
                    return (i - j - 1) + a / (a - b);
            }

            if (i + j + 1 < buffer.length) {
                let a = buffer[i + j];
                let b = buffer[i + j + 1];
                if (a * b <= 0)
                    return (i + j) + a / (a - b);
            }
        }
        return i; // by default
    }

    getEstimatedFrequency(): number {
        return this.estimatedFrequency;
    }
}
