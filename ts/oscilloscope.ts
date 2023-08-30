class Channel {
    buffer: Array<number>; // buffer containing samples
    focus: number; // index [0..buffer.length] which is the focus point of the buffer (allowed to be non-integer!)
    visible: boolean;
    estimatedPeriod: number; // estimated period of the last buffer
    estimatedPeriodSure: boolean;

    autoCorrelationChannel: Channel;

    constructor(size: number) {
        size = Math.min(65536, Math.max(0, Math.floor(size))); // don't trust user input
        this.buffer = new Array(size);
        this.focus = size / 2;
        this.visible = false;
        this.estimatedPeriod = 1.0;
        this.autoCorrelationChannel = null;
    }

    feed(data: Array<number>): void {
        // Update this.buffer and this.focus
        this.buffer.copyWithin(0, data.length);
        for (let i = 0; i < data.length; ++i)
            this.buffer[this.buffer.length - data.length + i] = data[i];
        this.focus -= data.length;

        // Estimate period and frequency based on the new data
        const estimation = this._estimatePeriod(data);
        if (estimation == null)
            this.estimatedPeriodSure = false; // do not change the estimated period, for `track` mode, but indicate that not sure
        else {
            this.estimatedPeriod = estimation;
            this.estimatedPeriodSure = true;
        }
    }

    _findZeroCrossingBefore(i: number): number {
        for (let j = Math.min(i, this.buffer.length - 1); j > 0; j--) {
            if (this.buffer[j - 1] <= 0 && this.buffer[j] > 0)
                return j;
        }
        return i; // by default
    }

    _findNearestZeroCrossing(i: number): number {
        i = Math.round(i);
        for (let j = 0; j < this.buffer.length; j++) {
            if (i - j - 1 >= 0) {
                let a = this.buffer[i - j - 1];
                let b = this.buffer[i - j];
                if (a * b <= 0)
                    return (i - j - 1) + a / (a - b);
            }

            if (i + j + 1 < this.buffer.length) {
                let a = this.buffer[i + j];
                let b = this.buffer[i + j + 1];
                if (a * b <= 0)
                    return (i + j) + a / (a - b);
            }
        }
        return i; // by default
    }

    _estimatePeriod(data: Array<number>): number {
        // Autocorrelation
        const n = data.length;
        const peakThreshold = 0.3;

        let corr_1 = 0.0;
        let corr_2 = 0.0;
        let corr_3 = 0.0;

        let normalization: number;
        let previousPeak = 0.0;
        let sumPeakDistance = 0.0;
        let numberPeaks = 0;
        let minPeakDistance = Infinity;
        let maxPeakDistance = -Infinity;

        for (let k = 0; k < n * (3 / 4); k++) {
            corr_1 = corr_2;
            corr_2 = corr_3;

            // Compute autocorrelation
            let corr = 0.0;
            for (let i = 0; i < n - k; i++)
                corr += data[i] * data[i + k];
            if (k == 0)
                normalization = corr;

            // Normalize autocorrelation
            corr_3 = corr / normalization;

            // Store autocorrelation
            if (this.autoCorrelationChannel != null)
                this.autoCorrelationChannel.buffer[k] = corr_3;

            const threshold = peakThreshold * (n - k) / n;
            if (k > 1 && corr_2 > threshold && corr_2 > corr_1 && corr_2 > corr_3) {
                const offset = (corr_1 - corr_3) / (2 * (corr_1 - 2 * corr_2 + corr_3)); // quadratic correction
                const peak = (k - 1) + offset;
                const peakDistance = peak - previousPeak;

                if (peakDistance < minPeakDistance)
                    minPeakDistance = peakDistance;
                if (peakDistance > maxPeakDistance)
                    maxPeakDistance = peakDistance;

                previousPeak = peak;
                sumPeakDistance += peakDistance;
                numberPeaks++;
            }
        }

        if (this.autoCorrelationChannel != null)
            this.autoCorrelationChannel.focus = data.length / 2;

        if (numberPeaks == 0) // for safety
            return null;

        const meanPeakDistance = sumPeakDistance / numberPeaks;
        if (minPeakDistance / meanPeakDistance < 0.95 || maxPeakDistance / meanPeakDistance > 1.05) // if too uncertain, return null
            return null;

        return meanPeakDistance;
    }
};

class Oscilloscope {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    sampleRate: number;
    width: number;
    height: number;
    grid: { width: number, height: number };
    scale: { x: number, y: number }; // x = number of samples per horizontal grid cell, y = value per vertical grid cell
    _mode: 'stream' | 'track' | 'trigger';

    channels: Channel[];

    constructor(options: { canvas: HTMLCanvasElement, sampleRate: number, bufferSize: number, channels: number }) {
        this.canvas = options.canvas;
        this.sampleRate = options.sampleRate;
        this.grid = { width: 64, height: 64 };
        this.scale = { x: 64, y: 0.1 };
        this._mode = 'stream';

        options.channels = Math.min(4, Math.max(1, Math.floor(options.channels))); // don't trust user input
        this.channels = [];
        for (let i = 0; i < options.channels; ++i)
            this.channels.push(new Channel(options.bufferSize));
        this.channels[0].visible = true;

        this.resize();
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

    resize(): void {
        const dpr = window.devicePixelRatio;
        this.width = this.canvas.offsetWidth;
        this.height = this.canvas.offsetHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
    }

    feed(data: Array<number>): void {
        const channel = this.channels[0];

        // Feed data to first channel
        if (this._mode !== 'trigger') {
            // channel.autoCorrelationChannel = this.channels[1];
            channel.feed(data);
        }

        // Compute the maximum number of samples that fit on the screen
        const maxLength = Math.ceil(this.width / this.grid.width * this.scale.x);

        // ---
        switch (this._mode) {
            case 'stream': // show the most recent output
                channel.focus = channel.buffer.length - maxLength / 2;
                break;

            case 'track':
                channel.focus += Math.floor(channel.estimatedPeriod * Math.floor((channel.buffer.length - maxLength / 2 - channel.focus) / channel.estimatedPeriod));
                channel.focus = channel._findNearestZeroCrossing(channel.focus);
                break;

            case 'trigger':
                if (data.some(x => Math.abs(x) > 0.1))
                    channel.feed(data);
                channel.focus = channel.buffer.length;
                while (Math.abs(channel.buffer[channel.focus]) <= 0.1)
                    channel.focus -= 1;
                channel.focus -= maxLength / 2;
                break;
        }

        // Draw background
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.width, this.height);
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-background');
        this.ctx.fill();
        this._drawGrid();

        // Draw channels
        const texts = [];
        for (let i = 0; i < this.channels.length; ++i) {
            const channel = this.channels[i];
            if (channel.visible) {
                const color = this._getChannelColor(i);
                this._drawChannel(channel, color);
                const frequency = channel.estimatedPeriodSure ? (this.sampleRate / channel.estimatedPeriod).toFixed(1) + ' Hz' : '--';
                const period = channel.estimatedPeriodSure ? (channel.estimatedPeriod * 1000.0).toFixed(0) + ' ms' : '--';
                texts.push({ text: `frequency = ${frequency}`, color });
                texts.push({ text: `period = ${period}`, color });
            }
        }

        // Draw texts
        this._drawText(texts);
    }

    _drawChannel(channel: Channel, color: string): void {
        const center = Math.round(channel.focus);
        const shift = (center - channel.focus) / this.scale.x * this.grid.width;
        const maxLength = Math.ceil(this.width / this.grid.width * this.scale.x);
        const start = Math.max(0, Math.floor(center - maxLength / 2));
        const end = Math.min(channel.buffer.length, Math.ceil(center + maxLength / 2));

        let points = [];
        if (maxLength <= this.width) { // if there is at least one pixel per sample, just draw all samples
            for (let i = start; i < end; ++i) {
                const value = channel.buffer[i];
                const x = this.width / 2 + (i - center) / this.scale.x * this.grid.width + shift;
                const y = this.height / 2 - (value / this.scale.y) * this.grid.height;
                points.push([x, y]);
            }
        }
        else { // if there are multiple samples per pixel, draw one (interpolated) sample per pixel
            for (let x = 0; x < this.width; ++x) {
                let i = (x - this.width / 2 - shift) / this.grid.width * this.scale.x + center;
                if (i >= start && i < end) {
                    const iFloor = Math.floor(i);
                    const iFrac = i - iFloor;
                    const value = channel.buffer[iFloor] * (1.0 - iFrac) + channel.buffer[iFloor + 1] * iFrac;
                    const y = this.height / 2 - (value / this.scale.y) * this.grid.height;
                    points.push([x, y]);
                }
            }
        }

        this._drawLine(points, color);
    }

    _drawLine(points: [number, number][], color: string): void {
        let length = 0.0;
        this.ctx.beginPath();
        for (let i = 0; i < points.length; ++i) {
            this.ctx.lineTo(points[i][0], points[i][1]);
            if (i > 0)
                length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        }

        this.ctx.strokeStyle = color;
        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = Math.max(0, Math.min(8, 8 - (length - 20000) / 1000)); // shadowBlur is very hard on performance, but looks pretty
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    _drawGrid(): void {
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

    _drawText(items: { text: string, color: string }[]): void {
        this.ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--font-oscilloscope');
        const x = this.width - 192; this.width - 192;
        let y = 24;
        this.ctx.shadowBlur = 2;
        for (let i = 0; i < items.length; ++i) {
            this.ctx.shadowColor = 'black';
            this.ctx.fillStyle = items[i].color;
            this.ctx.fillText(items[i].text, x, y);
            y += 16;
        }
        this.ctx.shadowBlur = 0;
    }

    _getChannelColor(i: number): string {
        switch (i) {
            case 0: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-green');
            case 1: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-red');
            case 2: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-blue');
            case 3: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-yellow');
        }
    }

    copyChannel(from: number, to: number): void {
        for (let i = 0; i < this.channels[from].buffer.length; ++i)
            this.channels[to].buffer[i] = this.channels[from].buffer[i]; // copy buffer
        this.channels[to].focus = this.channels[from].focus; // copy focus point
        this.channels[to].estimatedPeriod = this.channels[from].estimatedPeriod; // copy estimated period
    }

    clearChannel(i: number): void {
        for (let j = 0; j < this.channels[i].buffer.length; ++j)
            this.channels[i].buffer[j] = 0.0;
    }
}
