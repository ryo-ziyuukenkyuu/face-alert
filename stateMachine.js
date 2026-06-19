let currentState = "UNKNOWN";

let candidateState = "UNKNOWN";

let candidateStartTime = performance.now();

let stateStartTime = performance.now();

export function updateState(nextCandidateState) {

    const now = performance.now();

    if (nextCandidateState !== candidateState) {

        candidateState = nextCandidateState;

        candidateStartTime = now;
    }

    const candidateDuration =
        (now - candidateStartTime) / 1000;

    let changed = false;

    let previousState = currentState;

    if (
        candidateState !== currentState &&
        candidateDuration >= 2
    ) {

        currentState = candidateState;

        stateStartTime = now;

        changed = true;
    }

    const stateDuration =
        (now - stateStartTime) / 1000;

    return {
        currentState,
        previousState,
        candidateState,
        candidateDuration,
        stateDuration,
        changed
    };
}