const SAMPLE_RATE = 44100;
const BATCH_SIZE = 2048;

let oscilloscope: Oscilloscope = null;

function requestMicrophone(): Promise<MediaStream> {
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
        canvas: $('canvas') as HTMLCanvasElement,
        sampleRate: SAMPLE_RATE,
        bufferSize: 65536,
        channels: 4
    });

    // Controls
    connectInputs(oscilloscope, 'timePerDivision', [$('knob-time'), $('input-time')]);
    connectInputs(oscilloscope, 'volumePerDivision', [$('knob-volume'), $('input-volume')]);

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
        // Remove placeholder
        $('canvas-placeholder').remove();

        // Create AudioContext
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE, });
        await audioContext.audioWorklet.addModule('js/recorder-worklet.js');

        // Create an AudioNode from the microphone stream
        const stream = await requestMicrophone();
        const input = audioContext.createMediaStreamSource(stream);

        // Create a filter
        const filter = audioContext.createBiquadFilter();
        filter.Q.value = 1.0;
        filter.frequency.value = 1000.0;
        filter.gain.value = 1.0;
        filter.type = 'allpass';
        input.connect(filter);

        connectOptions([
            [$('button-output-off') as HTMLButtonElement, function () { if (!hasClass(this, 'selected')) input.disconnect(audioContext.destination); }],
            [$('button-output-on') as HTMLButtonElement, function () { if (!hasClass(this, 'selected')) input.connect(audioContext.destination); }]
        ]);

        let isFilterConnected = false;
        connectOptions([
            [$('button-filter-off') as HTMLButtonElement, () => { if (isFilterConnected) { filter.disconnect(audioContext.destination); input.connect(audioContext.destination); isFilterConnected = false; } }],
            [$('button-filter-low') as HTMLButtonElement, () => { if (!isFilterConnected) { input.disconnect(audioContext.destination); filter.connect(audioContext.destination); isFilterConnected = true; }; filter.type = 'lowpass'; }],
            [$('button-filter-high') as HTMLButtonElement, () => { if (!isFilterConnected) { input.disconnect(audioContext.destination); filter.connect(audioContext.destination); isFilterConnected = true; }; filter.type = 'highpass'; }],
        ]);

        connectInputs(filter.frequency, 'value', [$('knob-filter-frequency'), $('input-filter-frequency')]);

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
        filter.connect(recorder);
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

    }, { once: true });
}

window.onload = init;

function connectInputs(object: Object, key: string, inputs: HTMLElement[]): void {
    function update(value: number): void {
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
            }
        }
    }

    if (inputs.length > 0)
        update(parseFloat((inputs[0] as HTMLInputElement).value));
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