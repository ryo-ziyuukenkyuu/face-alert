import { getHistory } from "./history.js";

export function updateStateDisplay(
    state,
    reason,
    debug
) {

    const stateEl =
        document.getElementById("state");

    const reasonEl =
        document.getElementById("reason");

    const debugEl =
        document.getElementById("debugInfo");

    const historyEl =
        document.getElementById(
            "historyList"
        );

    if (
        !stateEl ||
        !reasonEl ||
        !debugEl
    ) {
        return;
    }

    stateEl.textContent = state;

    reasonEl.textContent = reason;

    debugEl.innerHTML = `
        Face : ${debug.faceVisible ? "○" : "×"}<br>
        Nose : ${debug.noseVisible ? "○" : "×"}<br>
        Mouth : ${debug.mouthVisible ? "○" : "×"}<br>
        Left Shoulder : ${debug.leftShoulderVisible ? "○" : "×"}<br>
        Right Shoulder : ${debug.rightShoulderVisible ? "○" : "×"}<br>

        <br>

        Left Ear Dist :
        ${debug.leftEarDistance?.toFixed(3)}

        <br>

        Right Ear Dist :
        ${debug.rightEarDistance?.toFixed(3)}

        <br>

        Ear Dominant :
        ${debug.earDominant}
    `;

    if (historyEl) {

        const history =
            getHistory();

        historyEl.innerHTML =
            history
                .map(
                    item => `
                        <div
    style="
        border:1px solid #444;
        margin-bottom:10px;
        padding:5px;
    "
>

    <div>
        ${item.time}
    </div>

    <div>
        ${item.fromState}
        →
        ${item.toState}
    </div>

    <img
        src="${item.image}"
        style="
            width:240px;
            margin-top:5px;
        "
    >

</div>
                    `
                )
                .join("");
    }
}