function distance(a, b) {

    if (!a || !b) {
        return Infinity;
    }

    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return Math.sqrt(
        dx * dx +
        dy * dy
    );
}

export function classify(faceResults, poseResults) {

    const EAR_DOMINANT_THRESHOLD = 0.10;

    const face =
        faceResults &&
        faceResults.multiFaceLandmarks &&
        faceResults.multiFaceLandmarks.length > 0
            ? faceResults.multiFaceLandmarks[0]
            : null;

    const noseVisible =
        !!face &&
        !!face[1];

    const mouthVisible =
        !!face &&
        !!face[13];

    const faceVisible =
        noseVisible || mouthVisible;

    const leftEar =
        face && face[234]
            ? face[234]
            : null;

    const rightEar =
        face && face[454]
            ? face[454]
            : null;

    const nose =
        face && face[1]
            ? face[1]
            : null;

    const leftEarDistance =
        distance(
            nose,
            leftEar
        );

    const rightEarDistance =
        distance(
            nose,
            rightEar
        );

    const earDistanceDiff =
        Math.abs(
            leftEarDistance -
            rightEarDistance
        );

    let earDominant = "NONE";

    if (
        earDistanceDiff >=
        EAR_DOMINANT_THRESHOLD
    ) {

        earDominant =
            leftEarDistance <
            rightEarDistance
                ? "LEFT"
                : "RIGHT";
    }

    const leftShoulderVisible =
        poseResults &&
        poseResults.poseLandmarks &&
        !!poseResults.poseLandmarks[11];

    const rightShoulderVisible =
        poseResults &&
        poseResults.poseLandmarks &&
        !!poseResults.poseLandmarks[12];

    /*
    SIDE
    */
    if (
        earDominant !== "NONE"
    ) {

        return {
            state: "SIDE",
            reason: `EAR ${earDominant}`,

            debug: {
                faceVisible,
                noseVisible,
                mouthVisible,
                leftShoulderVisible,
                rightShoulderVisible,
                leftEarDistance,
                rightEarDistance,
                earDistanceDiff,
                earDominant
            }
        };
    }

    if (
        leftShoulderVisible &&
        !rightShoulderVisible
    ) {

        return {
            state: "SIDE",
            reason: "LEFT SHOULDER ONLY",

            debug: {
                faceVisible,
                noseVisible,
                mouthVisible,
                leftShoulderVisible,
                rightShoulderVisible,
                leftEarDistance,
                rightEarDistance,
                earDistanceDiff,
                earDominant
            }
        };
    }

    if (
        !leftShoulderVisible &&
        rightShoulderVisible
    ) {

        return {
            state: "SIDE",
            reason: "RIGHT SHOULDER ONLY",

            debug: {
                faceVisible,
                noseVisible,
                mouthVisible,
                leftShoulderVisible,
                rightShoulderVisible,
                leftEarDistance,
                rightEarDistance,
                earDistanceDiff,
                earDominant
            }
        };
    }

    /*
    BACK
    */
    if (
        faceVisible &&
        leftShoulderVisible &&
        rightShoulderVisible
    ) {

        return {
            state: "BACK",
            reason: "FACE + BOTH SHOULDERS",

            debug: {
                faceVisible,
                noseVisible,
                mouthVisible,
                leftShoulderVisible,
                rightShoulderVisible,
                leftEarDistance,
                rightEarDistance,
                earDistanceDiff,
                earDominant
            }
        };
    }

    /*
    FACE_DOWN
    */
    if (
        !faceVisible &&
        leftShoulderVisible &&
        rightShoulderVisible
    ) {

        return {
            state: "FACE_DOWN",
            reason: "NO FACE + BOTH SHOULDERS",

            debug: {
                faceVisible,
                noseVisible,
                mouthVisible,
                leftShoulderVisible,
                rightShoulderVisible,
                leftEarDistance,
                rightEarDistance,
                earDistanceDiff,
                earDominant
            }
        };
    }

    return {
        state: "UNKNOWN",
        reason: "NO MATCH",

        debug: {
            faceVisible,
            noseVisible,
            mouthVisible,
            leftShoulderVisible,
            rightShoulderVisible,
            leftEarDistance,
            rightEarDistance,
            earDistanceDiff,
            earDominant
        }
    };
}