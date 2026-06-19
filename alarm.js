let audioContext = null;

let oscillator = null;

let gainNode = null;

let intervalId = null;

export function startAlarm() {

    if (intervalId) {
        return;
    }

    if (!audioContext) {

        audioContext =
            new AudioContext();
    }

    intervalId =
        setInterval(() => {

            oscillator =
                audioContext.createOscillator();

            gainNode =
                audioContext.createGain();

            oscillator.type = "square";

            oscillator.frequency.value = 1000;

            gainNode.gain.value = 0.05;

            oscillator.connect(gainNode);

            gainNode.connect(
                audioContext.destination
            );

            oscillator.start();

            setTimeout(() => {

                if (oscillator) {

                    oscillator.stop();

                    oscillator.disconnect();

                    oscillator = null;
                }

            }, 500);

        }, 1000);
}

export function stopAlarm() {

    if (intervalId) {

        clearInterval(
            intervalId
        );

        intervalId = null;
    }

    if (oscillator) {

        oscillator.stop();

        oscillator.disconnect();

        oscillator = null;
    }
}