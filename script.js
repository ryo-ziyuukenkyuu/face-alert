const video = document.getElementById("video");
const alarm = document.getElementById("alarm");

let MAX_YAW = 80;
let MAX_PITCH_DEG = 25;
let ALARM_DELAY = 0.3; // 秒

// 固定 pitch 補正
const PITCH_FIXED_OFFSET = -18;

// キャリブレーションオフセット
let yawZeroOffset = 0;
let pitchZeroOffset = 0;

// NG継続管理
let overStartTime = null;

// UI
const yawSlider = document.getElementById("yawSlider");
const pitchSlider = document.getElementById("pitchSlider");
const timeSlider = document.getElementById("timeSlider");

const yawLimit = document.getElementById("yawLimit");
const pitchLimit = document.getElementById("pitchLimit");
const timeLimit = document.getElementById("timeLimit");

const yawText = document.getElementById("yawValue");
const pitchText = document.getElementById("pitchValue");

const calibBtn = document.getElementById("calibBtn");

yawSlider.addEventListener("input", () => {
  MAX_YAW = parseInt(yawSlider.value);
  yawLimit.textContent = MAX_YAW;
});

pitchSlider.addEventListener("input", () => {
  MAX_PITCH_DEG = parseInt(pitchSlider.value);
  pitchLimit.textContent = MAX_PITCH_DEG;
});

timeSlider.addEventListener("input", () => {
  ALARM_DELAY = parseFloat(timeSlider.value);
  timeLimit.textContent = ALARM_DELAY.toFixed(1);
});

function playAlarm() {
  if (alarm.paused) alarm.play();
}

function stopAlarm() {
  if (!alarm.paused) {
    alarm.pause();
    alarm.currentTime = 0;
  }
}

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

// Yaw
function calcYaw(leftEye, rightEye) {
  const dx = rightEye.x - leftEye.x;
  const dz = rightEye.z - leftEye.z;
  return toDeg(Math.atan2(dz, dx));
}

// Pitch 指標
function calcPitchIndex(eyesCenter, nose, chin) {
  const faceHeight = chin.y - eyesCenter.y;
  const noseOffset = nose.y - eyesCenter.y;
  return (noseOffset / faceHeight) * 40;
}

// 指標 → °
function pitchIndexToDegree(pitchIndex) {
  return pitchIndex * 1.2;
}

let latestYaw = 0;
let latestPitch = 0;

// キャリブ
calibBtn.addEventListener("click", () => {
  yawZeroOffset = latestYaw;
  pitchZeroOffset = latestPitch;
  overStartTime = null;
  stopAlarm();
});

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
  if (results.multiFaceLandmarks.length === 0) {
    playAlarm();
    return;
  }

  const lm = results.multiFaceLandmarks[0];

  const leftEye = lm[33];
  const rightEye = lm[263];
  const nose = lm[1];
  const chin = lm[152];

  const eyesCenter = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };

  const rawYaw = calcYaw(leftEye, rightEye);
  const pitchIndex = calcPitchIndex(eyesCenter, nose, chin);
  const rawPitchDeg =
    pitchIndexToDegree(pitchIndex) + PITCH_FIXED_OFFSET;

  const yaw = rawYaw - yawZeroOffset;
  const pitch = rawPitchDeg - pitchZeroOffset;

  latestYaw = yaw;
  latestPitch = pitch;

  yawText.textContent = yaw.toFixed(1);
  pitchText.textContent = pitch.toFixed(1);

  const isOver =
    Math.abs(yaw) > MAX_YAW ||
    pitch > MAX_PITCH_DEG;

  const now = performance.now();

  if (isOver) {
    if (overStartTime === null) {
      overStartTime = now;
    }
    const elapsed = (now - overStartTime) / 1000;
    if (elapsed >= ALARM_DELAY) {
      playAlarm();
    }
  } else {
    overStartTime = null;
    stopAlarm();
  }
});

const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 640,
  height: 480,
});

camera.start();
