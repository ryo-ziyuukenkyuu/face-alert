const video = document.getElementById("video");
const alarm = document.getElementById("alarm");

// ===== 状態 =====
let isRunning = false;
let currentFacingMode = "user"; // user / environment
let camera = null;

// ===== 設定 =====
let MAX_YAW = 80;
let MAX_PITCH_DEG = 25;
let ALARM_DELAY = 0.3;

const PITCH_FIXED_OFFSET = -18;

let yawZeroOffset = 0;
let pitchZeroOffset = 0;
let overStartTime = null;

// ===== UI =====
const toggleBtn = document.getElementById("toggleBtn");
const statusText = document.getElementById("statusText");

const cameraBtn = document.getElementById("cameraBtn");
const cameraStatus = document.getElementById("cameraStatus");

const yawSlider = document.getElementById("yawSlider");
const pitchSlider = document.getElementById("pitchSlider");
const timeSlider = document.getElementById("timeSlider");

const yawLimit = document.getElementById("yawLimit");
const pitchLimit = document.getElementById("pitchLimit");
const timeLimit = document.getElementById("timeLimit");

const yawText = document.getElementById("yawValue");
const pitchText = document.getElementById("pitchValue");

const calibBtn = document.getElementById("calibBtn");

// ===== スライダー =====
yawSlider.oninput = () => {
  MAX_YAW = parseInt(yawSlider.value);
  yawLimit.textContent = MAX_YAW;
};

pitchSlider.oninput = () => {
  MAX_PITCH_DEG = parseInt(pitchSlider.value);
  pitchLimit.textContent = MAX_PITCH_DEG;
};

timeSlider.oninput = () => {
  ALARM_DELAY = parseFloat(timeSlider.value);
  timeLimit.textContent = ALARM_DELAY.toFixed(1);
};

// ===== 音 =====
function enableAudio() {
  alarm.play().then(() => {
    alarm.pause();
    alarm.currentTime = 0;
  }).catch(() => {});
}

function playAlarm() {
  if (alarm.paused) alarm.play();
}

function stopAlarm() {
  if (!alarm.paused) {
    alarm.pause();
    alarm.currentTime = 0;
  }
}

// ===== 開始／停止 =====
toggleBtn.onclick = () => {
  isRunning = !isRunning;

  if (isRunning) {
    toggleBtn.textContent = "■ 停止";
    toggleBtn.className = "stop";
    statusText.textContent = "🟢 作動中";
    enableAudio();
  } else {
    toggleBtn.textContent = "▶ 開始";
    toggleBtn.className = "start";
    statusText.textContent = "🔴 停止中";
    stopAlarm();
    overStartTime = null;
  }
};

// ===== カメラ切替 =====
cameraBtn.onclick = async () => {
  currentFacingMode =
    currentFacingMode === "user" ? "environment" : "user";

  cameraStatus.textContent =
    currentFacingMode === "user" ? "🤳 インカメ" : "📷 外カメラ";

  cameraBtn.textContent =
    currentFacingMode === "user" ? "📷 外カメラ" : "🤳 インカメ";

  await restartCamera();
};

// ===== キャリブ =====
let latestYaw = 0;
let latestPitch = 0;

calibBtn.onclick = () => {
  yawZeroOffset = latestYaw;
  pitchZeroOffset = latestPitch;
  overStartTime = null;
  stopAlarm();
};

// ===== FaceMesh =====
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

function toDeg(rad) {
  return rad * 180 / Math.PI;
}

function calcYaw(l, r) {
  return toDeg(Math.atan2(r.z - l.z, r.x - l.x));
}

function calcPitchIndex(eyes, nose, chin) {
  return ((nose.y - eyes.y) / (chin.y - eyes.y)) * 40;
}

function pitchIndexToDegree(i) {
  return i * 1.2;
}

faceMesh.onResults((results) => {
  if (!isRunning) return;

  if (results.multiFaceLandmarks.length === 0) {
    playAlarm();
    return;
  }

  const lm = results.multiFaceLandmarks[0];
  const leftEye = lm[33];
  const rightEye = lm[263];
  const nose = lm[1];
  const chin = lm[152];

  const eyes = {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };

  const rawYaw = calcYaw(leftEye, rightEye);
  const rawPitch =
    pitchIndexToDegree(calcPitchIndex(eyes, nose, chin)) +
    PITCH_FIXED_OFFSET;

  const yaw = rawYaw - yawZeroOffset;
  const pitch = rawPitch - pitchZeroOffset;

  latestYaw = yaw;
  latestPitch = pitch;

  yawText.textContent = yaw.toFixed(1);
  pitchText.textContent = pitch.toFixed(1);

  const over =
    Math.abs(yaw) > MAX_YAW || pitch > MAX_PITCH_DEG;

  const now = performance.now();

  if (over) {
    if (!overStartTime) overStartTime = now;
    if ((now - overStartTime) / 1000 >= ALARM_DELAY) playAlarm();
  } else {
    overStartTime = null;
    stopAlarm();
  }
});

// ===== カメラ起動／再起動 =====
async function restartCamera() {
  if (camera) camera.stop();

  camera = new Camera(video, {
    onFrame: async () => {
      await faceMesh.send({ image: video });
    },
    width: 640,
    height: 480,
    facingMode: currentFacingMode,
  });

  await camera.start();
}

// 初期起動
restartCamera();
