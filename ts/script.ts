const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

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
        bufferSize: 65536
    });

    // Controls
    connectInputs(oscilloscope, 'timePerDivision', [$('knob-time'), $('input-time')]);
    connectInputs(oscilloscope, 'volumePerDivision', [$('knob-volume'), $('input-volume')]);

    const buttonThemeLight = $('button-theme-light') as HTMLButtonElement;
    const buttonThemeDark = $('button-theme-dark') as HTMLButtonElement;
    onClick(buttonThemeLight, () => { document.body.classList.remove('dark'); buttonThemeLight.classList.add('selected'); buttonThemeDark.classList.remove('selected'); });
    onClick(buttonThemeDark, () => { document.body.classList.add('dark'); buttonThemeLight.classList.remove('selected'); buttonThemeDark.classList.add('selected'); });
    buttonThemeDark.click();

    const buttonModeStream = $('button-mode-stream') as HTMLButtonElement;
    const buttonModeTrack = $('button-mode-track') as HTMLButtonElement;
    const buttonModeTrigger = $('button-mode-trigger') as HTMLButtonElement;
    onClick(buttonModeStream, () => { oscilloscope.mode = 'stream'; buttonModeStream.classList.add('selected'); buttonModeTrack.classList.remove('selected'); buttonModeTrigger.classList.remove('selected'); })
    onClick(buttonModeTrack, () => { oscilloscope.mode = 'track'; buttonModeStream.classList.remove('selected'); buttonModeTrack.classList.add('selected'); buttonModeTrigger.classList.remove('selected'); })
    onClick(buttonModeTrigger, () => { oscilloscope.mode = 'trigger'; buttonModeStream.classList.remove('selected'); buttonModeTrack.classList.remove('selected'); buttonModeTrigger.classList.add('selected'); })
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
