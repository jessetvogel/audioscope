const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;

function requestMicrophone(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            noiseSuppression: false,
            // echoCancellation: false,
        }
    });
}

var complexFrequencyData: Float32Array;

window.onload = function () {
    onChange($('input-theme'), function () {
        const checked = (this as HTMLInputElement).checked;
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
        const canvas = $('canvas') as HTMLCanvasElement;
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
        (recorder.parameters as any).get('isRecording').setValueAtTime(1, 0.0);
    }, { once: true });
}
