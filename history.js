const history = [];

export function addHistory(
    fromState,
    toState,
    image
) {

    const now = new Date();

    const time =
        now.toLocaleTimeString(
            "ja-JP",
            {
                hour12: false
            }
        );

    history.unshift({
        time,
        fromState,
        toState,
        image
    });

    if (history.length > 20) {
        history.pop();
    }
}

export function getHistory() {

    return history;
}