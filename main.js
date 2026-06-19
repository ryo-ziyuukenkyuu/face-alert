import { classify } from "./classifier.js";
import { updateStateDisplay } from "./ui.js";
import { updateState } from "./stateMachine.js";
import { addHistory } from "./history.js";

import {
    startAlarm,
    stopAlarm
}
from "./alarm.js";

function captureSnapshot() {

    const tempCanvas =
        document.createElement(
            "canvas"
        );

    tempCanvas.width = 320;
    tempCanvas.height = 180;

    const tempCtx =
        tempCanvas.getContext("2d");

    tempCtx.drawImage(
        video,
        0,
        0,
        320,
        180
    );

    return tempCanvas.toDataURL(
        "image/jpeg",
        0.8
    );
}

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");

let faceResults = null;
let poseResults = null;

const faceMesh = new FaceMesh({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});

faceMesh.onResults((results) => {
    faceResults = results;
});

const pose = new Pose({
    locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
});

pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
});

pose.onResults((results) => {
    poseResults = results;
});

function draw() {

    if (!video.videoWidth) {
        requestAnimationFrame(draw);
        return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    if (
        faceResults &&
        faceResults.multiFaceLandmarks &&
        faceResults.multiFaceLandmarks.length > 0
    ) {

        const face =
            faceResults.multiFaceLandmarks[0];

        const points = [
            { index: 33, label: "1" },
            { index: 263, label: "2" },
            { index: 1, label: "3" },
            { index: 13, label: "4" },
            { index: 234, label: "5" },
            { index: 454, label: "6" },
        ];

        points.forEach((p) => {

            const lm = face[p.index];

            const x =
                lm.x * canvas.width;

            const y =
                lm.y * canvas.height;

            ctx.fillStyle = "red";

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                6,
                0,
                Math.PI * 2
            );

            ctx.fill();

            ctx.fillStyle = "yellow";
            ctx.font = "20px Arial";

            ctx.fillText(
                p.label,
                x + 10,
                y
            );
        });
    }

    if (
        poseResults &&
        poseResults.poseLandmarks
    ) {

        const leftShoulder =
            poseResults.poseLandmarks[11];

        const rightShoulder =
            poseResults.poseLandmarks[12];

        if (leftShoulder) {

            const x =
                leftShoulder.x *
                canvas.width;

            const y =
                leftShoulder.y *
                canvas.height;

            ctx.fillStyle = "lime";

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                8,
                0,
                Math.PI * 2
            );

            ctx.fill();

            ctx.fillStyle = "white";

            ctx.fillText(
                "7",
                x + 10,
                y
            );
        }

        if (rightShoulder) {

            const x =
                rightShoulder.x *
                canvas.width;

            const y =
                rightShoulder.y *
                canvas.height;

            ctx.fillStyle = "lime";

            ctx.beginPath();
            ctx.arc(
                x,
                y,
                8,
                0,
                Math.PI * 2
            );

            ctx.fill();

            ctx.fillStyle = "white";

            ctx.fillText(
                "8",
                x + 10,
                y
            );
        }

        if (
            leftShoulder &&
            rightShoulder
        ) {

            ctx.strokeStyle = "cyan";
            ctx.lineWidth = 3;

            ctx.beginPath();

            ctx.moveTo(
                leftShoulder.x *
                canvas.width,
                leftShoulder.y *
                canvas.height
            );

            ctx.lineTo(
                rightShoulder.x *
                canvas.width,
                rightShoulder.y *
                canvas.height
            );

            ctx.stroke();
        }
    }

    const result =
        classify(
           faceResults,
           poseResults
        );

    const stateInfo =
        updateState(
            result.state
        );
    if (
    stateInfo.changed
) {

    addHistory(
    stateInfo.previousState,
    stateInfo.currentState,
    captureSnapshot()
    );
}
        updateStateDisplay(
        stateInfo.currentState,
        result.reason,
        result.debug
        );
        if (
    stateInfo.currentState
    ===
    "FACE_DOWN"
) {

    startAlarm();

}
else {

    stopAlarm();
}
    requestAnimationFrame(draw);
}

const camera = new Camera(
    video,
    {
        onFrame: async () => {

            await faceMesh.send({
                image: video
            });

            await pose.send({
                image: video
            });

            statusEl.textContent =
                "RUNNING";
        },
        width: 1280,
        height: 720,
    }
);

camera.start();

draw();
document
    .getElementById(
        "enableAudio"
    )
    .addEventListener(
        "click",
        () => {

            const audio =
                new AudioContext();

            audio.resume();
        }
    );