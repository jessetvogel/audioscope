class KnobElement extends HTMLElement {
    constructor() {
        super();
        const min = this.getAttribute('min');
        this._min = (min !== null) ? parseFloat(min) : 0.0;
        const max = this.getAttribute('max');
        this._max = (max !== null) ? parseFloat(max) : 1.0;
        const type = this.getAttribute('type');
        this._type = (type === 'lin' || type === 'exp') ? type : 'lin';
        this._position = 0.0;
        const value = this.getAttribute('value');
        if (value !== null)
            this.value = parseFloat(value);
        this._onChange = null;
        this.addEventListener('pointerdown', (event) => this._dragStart(event));
        this.ownerDocument.addEventListener('pointermove', (event) => this._dragMove(event));
        this.ownerDocument.addEventListener('pointerup', (event) => this._dragEnd(event));
        this._updateRotation();
    }
    get value() {
        switch (this._type) {
            case 'lin': return this._min + (this._max - this._min) * this._position;
            case 'exp': return this._min * Math.exp(this._position * Math.log(this._max / this._min));
        }
    }
    set value(value) {
        switch (this._type) {
            case 'lin':
                this._setPosition((value - this._min) / (this._max - this._min));
                break;
            case 'exp':
                this._setPosition(Math.log(value / this._min) / Math.log(this._max / this._min));
                break;
        }
    }
    get type() {
        return this._type;
    }
    set type(type) {
        if (type === 'lin' || type === 'exp') {
            const value = this.value;
            this._type = type;
            this.value = value;
        }
    }
    set onChange(callback) {
        this._onChange = callback;
    }
    _setPosition(x) {
        var _a;
        x = Math.min(1.0, Math.max(0.0, x)); // clamp to [0..1]
        if (this._position == x)
            return;
        this._position = x;
        this._updateRotation();
        (_a = this._onChange) === null || _a === void 0 ? void 0 : _a.call(this, this);
    }
    _updateRotation() {
        const angle = -135 + 270 * this._position;
        this.style.transform = `rotate(${angle}deg)`;
    }
    _dragStart(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) // only listen to left mouse button
            return;
        if (!this._dragging) {
            this._dragging = true;
            this.classList.add('dragging');
            this._dragInfo = { id: event.pointerId, x: event.x, y: event.y, position: this._position };
        }
    }
    _dragMove(event) {
        if (this._dragging && event.pointerId == this._dragInfo.id) {
            // const angle = Math.atan2(event.x - (this.offsetLeft + this.offsetWidth / 2), - (event.y - (this.offsetTop + this.offsetHeight / 2))) / Math.PI * 180.0;
            const dy = event.y - this._dragInfo.y;
            const dx = event.x - this._dragInfo.x;
            this._setPosition(this._dragInfo.position - dy / 128.0 + dx / 512.0);
            this._dragInfo.x = event.x;
            this._dragInfo.y = event.y;
            this._dragInfo.position = this._position;
        }
    }
    _dragEnd(event) {
        if (this._dragging && event.pointerId == this._dragInfo.id) {
            this._dragging = false;
            this.classList.remove('dragging');
        }
    }
}
customElements.define('x-knob', KnobElement);
class Oscilloscope {
    constructor(options) {
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
    set mode(mode) {
        this._mode = mode;
    }
    set timePerDivision(ms) {
        this.scale.x = ms / 1000.0 * this.sampleRate;
    }
    set volumePerDivision(volume) {
        this.scale.y = volume;
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
    feed(data) {
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
    drawFrequency(frequency) {
        this.ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--font-oscilloscope');
        this.ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-text');
        this.ctx.fillText(`frequency = ${frequency.toFixed(2)} Hz`, this.width - 192, 24);
    }
    drawWave(buffer, centerIndex) {
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
                    if (buffer[i] > max)
                        max = buffer[i];
                    if (buffer[i] < min)
                        min = buffer[i];
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
    drawGrid() {
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
    getEstimatedFrequency() {
        return this.estimatedFrequency;
    }
}
const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
let oscilloscope;
function requestMicrophone() {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: false,
            // echoCancellation: false,
        }
    });
}
function init() {
    // Oscilloscope
    oscilloscope = new Oscilloscope({
        canvas: $('canvas'),
        sampleRate: SAMPLE_RATE,
        bufferSize: 65536
    });
    // Controls
    connectInputs(oscilloscope, 'timePerDivision', [$('knob-time'), $('input-time')]);
    connectInputs(oscilloscope, 'volumePerDivision', [$('knob-volume'), $('input-volume')]);
    const buttonThemeLight = $('button-theme-light');
    const buttonThemeDark = $('button-theme-dark');
    onClick(buttonThemeLight, () => { document.body.classList.remove('dark'); buttonThemeLight.classList.add('selected'); buttonThemeDark.classList.remove('selected'); });
    onClick(buttonThemeDark, () => { document.body.classList.add('dark'); buttonThemeLight.classList.remove('selected'); buttonThemeDark.classList.add('selected'); });
    buttonThemeDark.click();
    const buttonModeStream = $('button-mode-stream');
    const buttonModeTrack = $('button-mode-track');
    const buttonModeTrigger = $('button-mode-trigger');
    onClick(buttonModeStream, () => { oscilloscope.mode = 'stream'; buttonModeStream.classList.add('selected'); buttonModeTrack.classList.remove('selected'); buttonModeTrigger.classList.remove('selected'); });
    onClick(buttonModeTrack, () => { oscilloscope.mode = 'track'; buttonModeStream.classList.remove('selected'); buttonModeTrack.classList.add('selected'); buttonModeTrigger.classList.remove('selected'); });
    onClick(buttonModeTrigger, () => { oscilloscope.mode = 'trigger'; buttonModeStream.classList.remove('selected'); buttonModeTrack.classList.remove('selected'); buttonModeTrigger.classList.add('selected'); });
    buttonModeStream.click();
    // Create AudioContext on user input
    document.body.addEventListener('click', async function () {
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, });
        await audioContext.audioWorklet.addModule('js/recorder-worklet.js');
        // Create an AudioNode from the microphone stream
        const stream = await requestMicrophone();
        const input = audioContext.createMediaStreamSource(stream);
        // Create a RecorderWorklet
        const recorder = new AudioWorkletNode(audioContext, 'recorder-worklet');
        recorder.port.onmessage = (e) => {
            if (e.data.eventType === 'data') {
                const buffer = e.data.audioBuffer;
                oscilloscope.feed(buffer);
            }
            if (e.data.eventType === 'stop') {
                // recording has stopped
                console.log('Stop signal received.');
            }
        };
        input.connect(recorder);
        recorder.parameters.get('isRecording').setValueAtTime(1, 0.0);
    }, { once: true });
}
window.onload = init;
function connectInputs(object, key, inputs) {
    function update(value) {
        object[key] = value;
        for (const input of inputs) {
            if (input instanceof HTMLInputElement)
                input.value = value.toFixed(2);
            if (input instanceof KnobElement)
                input.value = value;
        }
    }
    for (const input of inputs) {
        if (input instanceof HTMLInputElement)
            onChange(input, () => update(parseFloat(input.value)));
        if (input instanceof KnobElement) {
            input.onChange = () => {
                update(input.value);
            };
        }
    }
    if (inputs.length > 0)
        update(parseFloat(inputs[0].value));
}
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
