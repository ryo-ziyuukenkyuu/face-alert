const video = document.getElementById("video");
const softAlarm = document.getElementById("softAlarm");
const hardAlarm = document.getElementById("hardAlarm");

let isRunning = false;

// 閾値
let MAX_YAW = 80;
let MAX_PITCH_DEG = 25;
let ALARM_DELAY = 0;
let FACE_MISSING_DELAY = 3.0;
let NOSE_CHIN_RATIO_THRESHOLD = 0.55;
let FACE_AREA_RATIO_THRESHOLD = 0.6;
let EYE_VISIBILITY_THRESHOLD = 0.4;
const PITCH_FIXED_OFFSET = -18;

// キャリブ
let yawZeroOffset = 0;
let pitchZeroOffset = 0;

// ★ raw値保持（追加）
let latestRawYaw = 0;
let latestRawPitch = 0;

let latestYaw = 0;
let latestPitch = 0;

// 基準値
let baseNoseChin = null;
let baseFaceArea = null;
let baseEyeDist = null;

// 軽度アラーム
const alarmKeys = ["yaw","pitch","nose","area","eye"];
let alertTimers = {};
let softAlarmActive = false;
let lastSoftAlarmTime = 0;
const SOFT_ALARM_INTERVAL = 1000;
const SOFT_ALARM_ON = 500;

// 強度アラーム
let faceMissingStart = null;
let lastHardAlarmTime = 0;
const HARD_ALARM_INTERVAL = 500;

// カメラ
let currentFacingMode = "user";
let currentStream = null;

// UI
const toggleBtn = document.getElementById("toggleBtn");
const statusText = document.getElementById("statusText");
const alertReason = document.getElementById("alertReason");
const switchCamBtn = document.getElementById("switchCamBtn");

const yawText = document.getElementById("yawValue");
const pitchText = document.getElementById("pitchValue");
const noseValue = document.getElementById("noseValue");
const areaValue = document.getElementById("areaValue");
const eyeValue = document.getElementById("eyeValue");

const calibBtn = document.getElementById("calibBtn");

// --- アラーム ---
function playSoft(){
  const now = performance.now();
  if(now - lastSoftAlarmTime >= SOFT_ALARM_INTERVAL){
    softAlarmActive = true;
    softAlarm.currentTime = 0;
    softAlarm.play();
    lastSoftAlarmTime = now;
    setTimeout(()=>{
      softAlarm.pause();
      softAlarm.currentTime = 0;
      softAlarmActive = false;
    }, SOFT_ALARM_ON);
  }
}

function playHard(){
  const now = performance.now();
  if(now - lastHardAlarmTime >= HARD_ALARM_INTERVAL){
    hardAlarm.currentTime = 0;
    hardAlarm.play();
    lastHardAlarmTime = now;
  }
}

function stopAlarms(){
  softAlarm.pause(); softAlarm.currentTime = 0;
  hardAlarm.pause(); hardAlarm.currentTime = 0;
  softAlarmActive = false;
  lastSoftAlarmTime = 0;
  lastHardAlarmTime = 0;
}

// --- 開始 / 停止 ---
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  if(isRunning){
    toggleBtn.textContent = "■ 停止";
    toggleBtn.className = "stop";
    statusText.textContent = "🟢 作動中";
  } else {
    toggleBtn.textContent = "▶ 開始";
    toggleBtn.className = "start";
    statusText.textContent = "🔴 停止中";
    stopAlarms();
  }
};

// --- キャリブ（★raw基準で修正） ---
calibBtn.onclick = () => {
  yawZeroOffset = latestRawYaw;
  pitchZeroOffset = latestRawPitch;

  baseNoseChin = null;
  baseFaceArea = null;
  baseEyeDist  = null;

  alertTimers = {};
  faceMissingStart = null;
  stopAlarms();
};

// --- FaceMesh ---
const faceMesh = new FaceMesh({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({ maxNumFaces: 1 });

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

// --- カメラ ---
async function startCamera(){
  if(currentStream){
    currentStream.getTracks().forEach(t => t.stop());
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width:640, height:480, facingMode: currentFacingMode },
    audio: false
  });
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
}

switchCamBtn.onclick = async () => {
  currentFacingMode = currentFacingMode === "user" ? "environment" : "user";
  await startCamera();
};

// --- ループ ---
async function faceLoop(){
  if(isRunning){
    await faceMesh.send({ image: video });
  }
  requestAnimationFrame(faceLoop);
}
startCamera().then(faceLoop);

// --- 結果 ---
faceMesh.onResults(res=>{
  if(!isRunning) return;
  const now = performance.now();

  if(!res.multiFaceLandmarks || res.multiFaceLandmarks.length === 0){
    if(!faceMissingStart) faceMissingStart = now;
    if((now-faceMissingStart)/1000 >= FACE_MISSING_DELAY){
      alertReason.textContent = "🚨 顔が見えない（危険）";
      alertReason.className = "danger";
      playHard();
    }
    return;
  }
  faceMissingStart = null;

  const lm = res.multiFaceLandmarks[0];
  const leftEye = lm[33], rightEye = lm[263], nose = lm[1], chin = lm[152];

  // ★ raw値を保存
  latestRawYaw =
    Math.atan2(rightEye.z-leftEye.z, rightEye.x-leftEye.x) * 180/Math.PI;

  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  latestRawPitch =
    ((nose.y-eyeCenterY)/(chin.y-eyeCenterY))*48 + PITCH_FIXED_OFFSET;

  // ★ 補正はここだけ
  latestYaw = latestRawYaw - yawZeroOffset;
  latestPitch = latestRawPitch - pitchZeroOffset;

  yawText.textContent = latestYaw.toFixed(1);
  pitchText.textContent = latestPitch.toFixed(1);

  const noseChin = dist(nose, chin);
  const faceArea = dist(leftEye, rightEye) * noseChin;
  const eyeDist = dist(lm[133], lm[33]);

  if(!baseNoseChin){
    baseNoseChin = noseChin;
    baseFaceArea = faceArea;
    baseEyeDist = eyeDist;
  }

  noseValue.textContent = (noseChin/baseNoseChin).toFixed(2);
  areaValue.textContent = (faceArea/baseFaceArea).toFixed(2);
  eyeValue.textContent = (eyeDist/baseEyeDist).toFixed(2);
});
