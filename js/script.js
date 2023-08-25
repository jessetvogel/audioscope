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
class Channel {
    constructor(size) {
        size = Math.min(65536, Math.max(0, Math.floor(size))); // don't trust user input
        this.buffer = new Float32Array(size);
        this.focus = size / 2;
        this.visible = false;
        this.estimatedPeriod = 1.0;
    }
    feed(data) {
        // Update this.buffer and this.focus
        this.buffer.copyWithin(0, data.length);
        this.buffer.set(data, this.buffer.length - data.length);
        this.focus -= data.length;
        // Estimate period and frequency based on the new data
        this.estimatedPeriod = Math.max(1.0, this._estimatePeriod(data));
    }
    _findZeroCrossingBefore(i) {
        for (let j = Math.min(i, this.buffer.length - 1); j > 0; j--) {
            if (this.buffer[j - 1] <= 0 && this.buffer[j] > 0)
                return j;
        }
        return i; // by default
    }
    _findNearestZeroCrossing(i) {
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
    _estimatePeriod(data) {
        const n = data.length;
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
                corr_3 += data[i] * data[i + l];
            if (l > 1 && corr_2 > corr_1 && corr_2 > corr_3) {
                const offset = (corr_1 - corr_3) / (2 * (corr_1 - 2 * corr_2 + corr_3));
                const maxima = (l - 1) + offset;
                sumDistanceMaxima += maxima - prevMaxima;
                prevMaxima = maxima;
                numberMaxima++;
            }
        }
        if (numberMaxima == 0) // for safety
            return 1.0;
        return sumDistanceMaxima / numberMaxima;
    }
}
;
class Oscilloscope {
    constructor(options) {
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
    set mode(mode) {
        this._mode = mode;
    }
    set timePerDivision(ms) {
        this.scale.x = ms / 1000.0 * this.sampleRate;
    }
    set volumePerDivision(volume) {
        this.scale.y = volume;
    }
    resize() {
        const dpr = window.devicePixelRatio;
        this.width = this.canvas.offsetWidth;
        this.height = this.canvas.offsetHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.scale(dpr, dpr);
    }
    feed(data) {
        const channel = this.channels[0];
        // Feed data to first channel
        if (this._mode !== 'trigger')
            channel.feed(data);
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
            if (this.channels[i].visible) {
                const color = this._getChannelColor(i);
                this._drawChannel(this.channels[i], color);
                texts.push({ text: `frequency = ${(this.sampleRate / this.channels[i].estimatedPeriod).toFixed(1)} Hz`, color });
                texts.push({ text: `period = ${(this.channels[i].estimatedPeriod * 1000.0).toFixed(0)} ms`, color });
            }
        }
        // Draw texts
        this._drawText(texts);
    }
    _drawChannel(channel, color) {
        const center = Math.round(channel.focus);
        const shift = (center - channel.focus) / this.scale.x * this.grid.width;
        const maxLength = Math.ceil(this.width / this.grid.width * this.scale.x);
        const start = Math.max(0, Math.floor(center - maxLength / 2));
        const end = Math.min(channel.buffer.length, Math.ceil(center + maxLength / 2));
        let points = [];
        if (maxLength <= this.width / 2) { // if there is at least one pixel per sample, just draw all samples
            for (let i = start; i < end; ++i) {
                const value = channel.buffer[i];
                const x = this.width / 2 + (i - center) / this.scale.x * this.grid.width + shift;
                const y = this.height / 2 - (value / this.scale.y) * this.grid.height;
                points.push([x, y]);
            }
        }
        else { // if there are multiple samples per pixel, only draw the maximum and minimum (every 2 pixels)
            for (let x = 0; x < this.width; x += 2) {
                let iStart = Math.max(start, Math.floor((x - this.width / 2 - shift) / this.grid.width * this.scale.x + center));
                let iEnd = Math.min(end, Math.floor(((x + 1) - this.width / 2 - shift) / this.grid.width * this.scale.x + center));
                if (iStart < iEnd) {
                    let max = -Infinity;
                    let min = Infinity;
                    for (let i = iStart; i < iEnd; ++i) {
                        if (channel.buffer[i] > max)
                            max = channel.buffer[i];
                        if (channel.buffer[i] < min)
                            min = channel.buffer[i];
                    }
                    const yMin = this.height / 2 - (min / this.scale.y) * this.grid.height;
                    const yMax = this.height / 2 - (max / this.scale.y) * this.grid.height;
                    points.push([x, yMin]);
                    points.push([x + 1, yMax]);
                }
            }
        }
        this._drawLine(points, color);
    }
    _drawLine(points, color) {
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
    _drawGrid() {
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
    _drawText(items) {
        this.ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--font-oscilloscope');
        const x = this.width - 192;
        this.width - 192;
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
    _getChannelColor(i) {
        switch (i) {
            case 0: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-green');
            case 1: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-red');
            case 2: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-blue');
            case 3: return getComputedStyle(document.body).getPropertyValue('--clr-oscilloscope-wave-yellow');
        }
    }
    copyChannel(from, to) {
        this.channels[to].buffer.set(this.channels[from].buffer); // copy buffer
        this.channels[to].focus = this.channels[from].focus; // copy focus point
        this.channels[to].estimatedPeriod = this.channels[from].estimatedPeriod; // copy estimated period
    }
    clearChannel(i) {
        for (let j = 0; j < this.channels[i].buffer.length; ++j)
            this.channels[i].buffer[j] = 0.0;
    }
}
const SAMPLE_RATE = 44100;
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
        bufferSize: 65536,
        channels: 4
    });
    // Controls
    connectInputs(oscilloscope, 'timePerDivision', [$('knob-time'), $('input-time')]);
    connectInputs(oscilloscope, 'volumePerDivision', [$('knob-volume'), $('input-volume')]);
    const buttonThemeLight = $('button-theme-light');
    const buttonThemeDark = $('button-theme-dark');
    onClick(buttonThemeLight, () => { removeClass(document.body, 'dark'); addClass(buttonThemeLight, 'selected'); removeClass(buttonThemeDark, 'selected'); });
    onClick(buttonThemeDark, () => { addClass(document.body, 'dark'); removeClass(buttonThemeLight, 'selected'); addClass(buttonThemeDark, 'selected'); });
    buttonThemeDark.click();
    const buttonModeStream = $('button-mode-stream');
    const buttonModeTrack = $('button-mode-track');
    const buttonModeTrigger = $('button-mode-trigger');
    onClick(buttonModeStream, () => { oscilloscope.mode = 'stream'; addClass(buttonModeStream, 'selected'); removeClass(buttonModeTrack, 'selected'); removeClass(buttonModeTrigger, 'selected'); });
    onClick(buttonModeTrack, () => { oscilloscope.mode = 'track'; removeClass(buttonModeStream, 'selected'); addClass(buttonModeTrack, 'selected'); removeClass(buttonModeTrigger, 'selected'); });
    onClick(buttonModeTrigger, () => { oscilloscope.mode = 'trigger'; removeClass(buttonModeStream, 'selected'); removeClass(buttonModeTrack, 'selected'); addClass(buttonModeTrigger, 'selected'); });
    buttonModeStream.click();
    connectToggle(oscilloscope.channels[0], 'visible', $('button-show-input'));
    connectToggle(oscilloscope.channels[1], 'visible', $('button-show-red'));
    connectToggle(oscilloscope.channels[2], 'visible', $('button-show-blue'));
    connectToggle(oscilloscope.channels[3], 'visible', $('button-show-yellow'));
    onClick($('button-copy-red'), () => { oscilloscope.copyChannel(0, 1); if (!oscilloscope.channels[1].visible)
        $('button-show-red').click(); });
    onClick($('button-copy-blue'), () => { oscilloscope.copyChannel(0, 2); if (!oscilloscope.channels[2].visible)
        $('button-show-blue').click(); });
    onClick($('button-copy-yellow'), () => { oscilloscope.copyChannel(0, 3); if (!oscilloscope.channels[3].visible)
        $('button-show-yellow').click(); });
    onClick($('button-clear-input'), () => oscilloscope.clearChannel(0));
    onClick($('button-clear-red'), () => oscilloscope.clearChannel(1));
    onClick($('button-clear-blue'), () => oscilloscope.clearChannel(2));
    onClick($('button-clear-yellow'), () => oscilloscope.clearChannel(3));
    // Re-initialize the canvas whenever the window resizes
    window.addEventListener('resize', () => oscilloscope.resize());
    // Setup everything on user-input (click)
    document.body.addEventListener('click', async function () {
        // Remove placeholder
        $('canvas-placeholder').remove();
        // Create AudioContext
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, });
        await audioContext.audioWorklet.addModule('js/recorder-worklet.js');
        // Create an AudioNode from the microphone stream
        const stream = await requestMicrophone();
        const input = audioContext.createMediaStreamSource(stream);
        const buttonOutputOn = $('button-output-on');
        const buttonOutputOff = $('button-output-off');
        onClick(buttonOutputOn, () => { if (hasClass(buttonOutputOff, 'selected')) {
            input.connect(audioContext.destination);
            addClass(buttonOutputOn, 'selected');
            removeClass(buttonOutputOff, 'selected');
        } });
        onClick(buttonOutputOff, () => { if (!hasClass(buttonOutputOff, 'selected')) {
            input.disconnect(audioContext.destination);
            removeClass(buttonOutputOn, 'selected');
            addClass(buttonOutputOff, 'selected');
        } });
        buttonOutputOff.click();
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
function connectToggle(object, key, button) {
    onClick(button, () => {
        object[key] = !object[key];
        (object[key] ? addClass : removeClass)(button, 'selected');
    });
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
