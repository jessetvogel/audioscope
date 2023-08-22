class Oscilloscope {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sampleRate: number;
    width: number;
    height: number;
    grid: { width: number, height: number };
    scale: { x: number, y: number }; // x = number of samples per horizontal grid cell, y = value per vertical grid cell

    estimatedFrequency: number;
    followWave: boolean;
    index: number;

    constructor(options: { canvas: HTMLCanvasElement, sampleRate: number }) {
        this.canvas = options.canvas;
        this.sampleRate = options.sampleRate;
        this.grid = { width: 64, height: 64 };
        this.scale = { x: 64, y: 0.1 };

        this.estimatedFrequency = 0.0;
        this.followWave = true;
        this.index = 0;

        this._setupCanvas();
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

    feed(buffer: Float32Array): void {
        const length = this.width / this.grid.width * this.scale.x; // maximum number of samples that fit on the screen

        this.index = this.index - buffer.length; // TODO: this assumes all buffers have the same size

        const period = Math.max(1, this._estimatePeriod(buffer));
        this.estimatedFrequency = this.sampleRate / period;

        while (this.index < buffer.length - length / 2 - period)
            this.index += period;

        this.index = Math.floor(this.index);
        this.index = this._findNearestZeroCrossing(buffer, this.index);

        const a = buffer[this.index];
        const b = buffer[this.index + 1];
        const xShift = (a - b == 0) ? 0 : -a / (a - b);

        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.width, this.height);
        this.ctx.fillStyle = 'lightgray';
        this.ctx.fill();

        this.drawGrid();
        this.drawWave(buffer, this.index - length / 2, length, { x: xShift, y: 0 });
    }

    drawWave(buffer: Float32Array, start: number, length: number, shift: { x: number, y: number } = null): void {
        if (shift == null)
            shift = { x: 0, y: 0 };

        this.ctx.strokeStyle = 'black';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = 'blue';
        this.ctx.beginPath();
        // this.ctx.moveTo(0, this.height / 2);
        const end = Math.min(start + length, buffer.length); // to prevent overflows
        for (let i = start; i < end; ++i) {
            const value = buffer[i];
            const x = this.width - ((end - i) / this.scale.x) * this.grid.width + shift.x;
            const y = this.height / 2 - (value / this.scale.y) * this.grid.height + shift.y;
            if (x >= 0)
                this.ctx.lineTo(x, y);
        }

        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    drawGrid(): void {
        this.ctx.strokeStyle = 'grey';
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
        for (let j = 0; j < buffer.length; j++) {
            if (i - j - 1 >= 0 && buffer[i - j - 1] * buffer[i - j] <= 0)
                return i - j;
            if (i + j + 1 < buffer.length && buffer[i + j] * buffer[i + j + 1] <= 0)
                return i + j;
        }
        return i; // by default
    }

    getEstimatedFrequency(): number {
        return this.estimatedFrequency;
    }
}
