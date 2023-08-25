const SAMPLE_RATE = 44100;

let oscilloscope: Oscilloscope;

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

    const buttonThemeLight = $('button-theme-light') as HTMLButtonElement;
    const buttonThemeDark = $('button-theme-dark') as HTMLButtonElement;
    onClick(buttonThemeLight, () => { removeClass(document.body, 'dark'); addClass(buttonThemeLight, 'selected'); removeClass(buttonThemeDark, 'selected'); });
    onClick(buttonThemeDark, () => { addClass(document.body, 'dark'); removeClass(buttonThemeLight, 'selected'); addClass(buttonThemeDark, 'selected'); });
    buttonThemeDark.click();

    const buttonModeStream = $('button-mode-stream') as HTMLButtonElement;
    const buttonModeTrack = $('button-mode-track') as HTMLButtonElement;
    const buttonModeTrigger = $('button-mode-trigger') as HTMLButtonElement;
    onClick(buttonModeStream, () => { oscilloscope.mode = 'stream'; addClass(buttonModeStream, 'selected'); removeClass(buttonModeTrack, 'selected'); removeClass(buttonModeTrigger, 'selected'); })
    onClick(buttonModeTrack, () => { oscilloscope.mode = 'track'; removeClass(buttonModeStream, 'selected'); addClass(buttonModeTrack, 'selected'); removeClass(buttonModeTrigger, 'selected'); })
    onClick(buttonModeTrigger, () => { oscilloscope.mode = 'trigger'; removeClass(buttonModeStream, 'selected'); removeClass(buttonModeTrack, 'selected'); addClass(buttonModeTrigger, 'selected'); })
    buttonModeStream.click();

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

        const buttonOutputOn = $('button-output-on') as HTMLButtonElement;
        const buttonOutputOff = $('button-output-off') as HTMLButtonElement;
        onClick(buttonOutputOn, () => { if (hasClass(buttonOutputOff, 'selected')) { input.connect(audioContext.destination); addClass(buttonOutputOn, 'selected'); removeClass(buttonOutputOff, 'selected'); } });
        onClick(buttonOutputOff, () => { if (!hasClass(buttonOutputOff, 'selected')) { input.disconnect(audioContext.destination); removeClass(buttonOutputOn, 'selected'); addClass(buttonOutputOff, 'selected'); } });
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
        (recorder.parameters as any).get('isRecording').setValueAtTime(1, 0.0);
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
