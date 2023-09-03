const SAMPLE_RATE = new AudioContext().sampleRate;
const BATCH_SIZE = 2048;

let oscilloscope: Oscilloscope = null;

function requestMicrophone(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: false,
            echoCancellation: false
        }
    });
}

function init() {
    // Oscilloscope
    oscilloscope = new Oscilloscope({
        canvas: $('canvas') as HTMLCanvasElement,
        sampleRate: SAMPLE_RATE,
        bufferSize: 65536,
        channels: 4
    });

    // Controls
    connectKnob(oscilloscope, 'timePerDivision', $('knob-time') as KnobElement);
    connectKnob(oscilloscope, 'volumePerDivision', $('knob-volume') as KnobElement);

    connectOptions([
        [$('button-theme-dark') as HTMLButtonElement, () => addClass(document.body, 'dark')],
        [$('button-theme-light') as HTMLButtonElement, () => removeClass(document.body, 'dark')]
    ]);

    connectOptions([
        [$('button-mode-stream') as HTMLButtonElement, () => oscilloscope.mode = 'stream'],
        [$('button-mode-track') as HTMLButtonElement, () => oscilloscope.mode = 'track'],
        [$('button-mode-trigger') as HTMLButtonElement, () => oscilloscope.mode = 'trigger']
    ]);

    connectToggle(oscilloscope.channels[0], 'visible', $('button-show-input') as HTMLButtonElement);
    connectToggle(oscilloscope.channels[1], 'visible', $('button-show-red') as HTMLButtonElement);
    connectToggle(oscilloscope.channels[2], 'visible', $('button-show-blue') as HTMLButtonElement);
    connectToggle(oscilloscope.channels[3], 'visible', $('button-show-yellow') as HTMLButtonElement);

    onClick($('button-copy-red') as HTMLButtonElement, () => { oscilloscope.copyChannel(0, 1); if (!oscilloscope.channels[1].visible) $('button-show-red').click(); });
    onClick($('button-copy-blue') as HTMLButtonElement, () => { oscilloscope.copyChannel(0, 2); if (!oscilloscope.channels[2].visible) $('button-show-blue').click(); });
    onClick($('button-copy-yellow') as HTMLButtonElement, () => { oscilloscope.copyChannel(0, 3); if (!oscilloscope.channels[3].visible) $('button-show-yellow').click(); });

    onClick($('button-clear-input'), () => oscilloscope.clearChannel(0));
    onClick($('button-clear-red'), () => oscilloscope.clearChannel(1));
    onClick($('button-clear-blue'), () => oscilloscope.clearChannel(2));
    onClick($('button-clear-yellow'), () => oscilloscope.clearChannel(3));

    // Re-initialize the canvas whenever the window resizes
    window.addEventListener('resize', () => oscilloscope.resize());

    // Setup everything on user-input (click)
    document.body.addEventListener('click', async function () {
        try {
            // Remove placeholder
            $('canvas-placeholder').remove();

            // Create AudioContext
            const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, });
            await audioContext.audioWorklet.addModule('js/recorder-worklet.js');

            // Create collector through which the output must pass. Note: by default this node is not yet connected to audioContext.destination
            const collector = audioContext.createGain();
            collector.gain.value = 1.0;
            const output = audioContext.createGain();
            output.gain.value = 1.0;
            output.connect(audioContext.destination);

            // Create an AudioNode from the microphone stream
            const stream = await requestMicrophone();
            const input = audioContext.createMediaStreamSource(stream);
            input.connect(collector);

            // Create a filter
            const filter = audioContext.createBiquadFilter();
            filter.Q.value = 1.0;
            filter.frequency.value = 1000.0;
            filter.gain.value = 1.0;
            filter.type = 'allpass';
            filter.connect(collector);

            const knobOutputGain = $('knob-output-gain') as KnobElement;
            connectKnob(output.gain, 'value', knobOutputGain, (dB: number) => {
                return Math.pow(10.0, dB / 20.0);
            });

            let isOutputConneted = false;

            connectOptions([
                [$('button-output-off') as HTMLButtonElement, function () { if (isOutputConneted) { collector.disconnect(output); isOutputConneted = false; addClass(knobOutputGain, 'disabled'); } }],
                [$('button-output-on') as HTMLButtonElement, function () { if (!isOutputConneted) { collector.connect(output); isOutputConneted = true; removeClass(knobOutputGain, 'disabled'); } }]
            ]);

            const knobFilterFrequency = $('knob-filter-frequency') as KnobElement;
            connectKnob(filter.frequency, 'value', knobFilterFrequency);

            let isFilterConnected = false;
            connectOptions([
                [$('button-filter-off') as HTMLButtonElement, () => { if (isFilterConnected) { input.disconnect(filter); input.connect(collector); isFilterConnected = false; addClass(knobFilterFrequency, 'disabled'); } }],
                [$('button-filter-low') as HTMLButtonElement, () => { if (!isFilterConnected) { input.disconnect(collector); input.connect(filter); isFilterConnected = true; removeClass(knobFilterFrequency, 'disabled'); }; filter.type = 'lowpass'; }],
                [$('button-filter-high') as HTMLButtonElement, () => { if (!isFilterConnected) { input.disconnect(collector); input.connect(filter); isFilterConnected = true; removeClass(knobFilterFrequency, 'disabled'); }; filter.type = 'highpass'; }],
            ]);

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
            collector.connect(recorder);
            (recorder.parameters as any).get('isRecording').setValueAtTime(1, 0.0);

            // // DEBUG SOUND
            // const FEED = new Array(2048);
            // setInterval(() => {
            //     for (let i = 0; i < FEED.length; ++i) {
            //         FEED[i] = Math.sin(2 * Math.PI * 123.0 * t) + Math.random() * 0.1; // noise sine
            //         // FEED[i] = (2.0 * ((123.0 * t) % 1.0) - 1.0) + Math.random() * 0.25; // noise saw
            //         // FEED[i] = (((123.0 * t) % 1.0) < 0.5 ? -1.0 : 1.0) + Math.random() * 0.25; // noise square
            //         t += 1.0 / SAMPLE_RATE;
            //     }
            //     oscilloscope.feed(FEED);
            // }, 100);
        }
        catch (error) {
            alert(error);
        }
    }, { once: true });
}

window.onload = init;

function connectKnob(object: Object, key: string, knob: KnobElement, conversion: (x: number) => number = null): void {
    function update(value: number): void {
        if (conversion != null)
            value = conversion(value);
        object[key] = value;
    }
    knob.onChange = () => update(knob.value);
    update(knob.value);
}

function connectToggle(object: Object, key: string, button: HTMLButtonElement): void {
    onClick(button, () => {
        object[key] = !object[key];
        (object[key] ? addClass : removeClass)(button, 'selected');
    });
}

function connectOptions(items: [HTMLButtonElement, () => void][]): void {
    for (let i = 0; i < items.length; ++i) {
        onClick(items[i][0], () => {
            items[i][1].call(items[i][0]);
            for (let j = 0; j < items.length; ++j)
                (i == j ? addClass : removeClass)(items[j][0], 'selected');
        });
    }
    if (items.length > 0)
        items[0][0].click();
}

function prettyValueUnit(value: number, unit: string): string {
    if (unit == null || unit == '')
        return value.toPrecision(3);

    if (unit == 'dB')
        return (value > 0 ? '+' : '') + value.toPrecision(3) + ' ' + unit;

    if (!(unit == 's' || unit == 'Hz'))
        return value.toPrecision(3) + ' ' + unit;

    if (value >= 1.0 && value <= 1000.0)
        return value.toPrecision(3) + ' ' + unit;

    if (value >= 0.001 && value <= 1.0)
        return (value * 1000.0).toPrecision(3) + ' m' + unit;

    if (value <= 0.001)
        return (value * 1000000.0).toPrecision(3) + ' μ' + unit;

    if (value >= 1000.0)
        return (value / 1000.0).toPrecision(3) + ' k' + unit;
}
