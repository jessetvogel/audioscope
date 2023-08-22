class Oscilloscope {
    constructor(options) {
        this.canvas = options.canvas;
        this.sampleRate = options.sampleRate;
        this.grid = { width: 64, height: 64 };
        this.scale = { x: 64, y: 0.1 };
        this.estimatedFrequency = 0.0;
        this.followWave = true;
        this.index = 0;
        this._setupCanvas();
    }
    _setupCanvas() {
        const dpr = window.devicePixelRatio;
        this.width = this.canvas.offsetWidth;
        this.height = this.canvas.offsetHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
    }
    feed(buffer) {
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
    drawWave(buffer, start, length, shift = null) {
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
    drawGrid() {
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
    _estimatePeriod(buffer) {
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
    _findZeroCrossingBefore(buffer, i) {
        for (let j = Math.min(i, buffer.length - 1); j > 0; j--) {
            if (buffer[j - 1] <= 0 && buffer[j] > 0)
                return j;
        }
        return i; // by default
    }
    _findNearestZeroCrossing(buffer, i) {
        for (let j = 0; j < buffer.length; j++) {
            if (i - j - 1 >= 0 && buffer[i - j - 1] * buffer[i - j] <= 0)
                return i - j;
            if (i + j + 1 < buffer.length && buffer[i + j] * buffer[i + j + 1] <= 0)
                return i + j;
        }
        return i; // by default
    }
    getEstimatedFrequency() {
        return this.estimatedFrequency;
    }
}
const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
function requestMicrophone() {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: false,
            // echoCancellation: false,
        }
    });
}
var complexFrequencyData;
window.onload = function () {
    onChange($('input-theme'), function () {
        const checked = this.checked;
        document.body.classList[checked ? 'add' : 'remove']('dark');
    });
    document.body.addEventListener('click', async function () {
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, });
        await audioContext.audioWorklet.addModule('js/recorder-worklet.js');
        // Create an AudioNode from the microphone stream
        const stream = await requestMicrophone();
        const input = audioContext.createMediaStreamSource(stream);
        // input = convertToMono(input); // mono ?
        // Create an AnalyserNode
        // const analyser = new ComplexAnalyserNode(audioContext, { fftSize: FFT_SIZE });
        // complexFrequencyData = new Float32Array(FFT_SIZE);
        // input.connect(analyser);
        // Canvas
        const canvas = $('canvas');
        canvas.width = 1024;
        canvas.height = 1024;
        const oscilloscope = new Oscilloscope({
            canvas: canvas,
            sampleRate: SAMPLE_RATE
        });
        // Create a RecorderWorklet
        const recorder = new AudioWorkletNode(audioContext, 'recorder-worklet');
        recorder.port.onmessage = (e) => {
            if (e.data.eventType === 'data') {
                const buffer = e.data.audioBuffer;
                oscilloscope.feed(buffer);
                setText($('frequency'), `${oscilloscope.getEstimatedFrequency().toFixed(2)} Hz`);
            }
            if (e.data.eventType === 'stop') {
                // recording has stopped
                console.log('Stop signal received.');
            }
        };
        input.connect(recorder);
        recorder.parameters.get('isRecording').setValueAtTime(1, 0.0);
    }, { once: true });
};
function $(id) {
    return document.getElementById(id);
}
function $$(selector) {
    return Array.from(document.querySelectorAll(selector));
}
function create(tag, properties, content) {
    const elem = document.createElement(tag);
    if (properties !== undefined) {
        for (const key in properties) {
            if (key.startsWith('@'))
                elem.addEventListener(key.substring(1), properties[key]);
            else
                elem.setAttribute(key, properties[key]);
        }
    }
    if (content !== undefined) {
        if (typeof (content) === 'string')
            elem.innerHTML = content;
        if (content instanceof HTMLElement)
            elem.append(content);
        if (Array.isArray(content))
            for (const child of content)
                elem.append(child);
    }
    return elem;
}
function clear(elem) {
    elem.innerHTML = '';
}
function onClick(elem, f) {
    elem.addEventListener('click', f);
}
function onMouseDown(elem, f) {
    elem.addEventListener('mousedown', f);
}
function onMouseUp(elem, f) {
    elem.addEventListener('mouseup', f);
}
function onMouseMove(elem, f) {
    elem.addEventListener('mousemove', f);
}
function onWheel(elem, f) {
    elem.addEventListener('wheel', f);
}
function onContextMenu(elem, f) {
    elem.addEventListener('contextmenu', f);
}
function onChange(elem, f) {
    elem.addEventListener('change', f);
}
function onInput(elem, f) {
    elem.addEventListener('input', f);
}
function onRightClick(elem, f) {
    elem.addEventListener('contextmenu', f);
}
function onKeyPress(elem, f) {
    elem.addEventListener('keypress', f);
}
function onKeyDown(elem, f) {
    elem.addEventListener('keydown', f);
}
function onKeyUp(elem, f) {
    elem.addEventListener('keyup', f);
}
function onDrop(elem, f) {
    elem.addEventListener('drop', f);
}
function onDragOver(elem, f) {
    elem.addEventListener('dragover', f);
}
function addClass(elem, c) {
    elem.classList.add(c);
}
function removeClass(elem, c) {
    elem.classList.remove(c);
}
function hasClass(elem, c) {
    return elem.classList.contains(c);
}
function toggleClass(elem, c) {
    hasClass(elem, c) ? removeClass(elem, c) : addClass(elem, c);
}
function setHTML(elem, html) {
    elem.innerHTML = html;
}
function setText(elem, text) {
    elem.innerText = text;
}
function requestGET(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.responseText); };
        xhr.onerror = reject;
        xhr.open('GET', url);
        xhr.send();
    });
}
function requestPOST(url, data) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.responseText); };
        xhr.onerror = reject;
        xhr.open('POST', url);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(typeof data === 'string' ? data : JSON.stringify(data));
    });
}
function requestHEAD(url) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(this.status == 200); };
        xhr.onerror = reject;
        xhr.open('HEAD', url);
        xhr.send();
    });
}
function cssVariable(name) {
    return getComputedStyle(document.body).getPropertyValue(name);
}
function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/`;
}
function getCookie(name) {
    const cookies = decodeURIComponent(document.cookie).split(';');
    const needle = `${name}=`;
    for (let c of cookies) {
        while (c.charAt(0) == ' ')
            c = c.substring(1);
        if (c.indexOf(needle) == 0)
            return c.substring(needle.length, c.length);
    }
    return null;
}
