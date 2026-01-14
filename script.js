const video = document.getElementById("video");
const softAlarm = document.getElementById("softAlarm");
const hardAlarm = document.getElementById("hardAlarm");

let isRunning = false;

// ===== 閾値 =====
let MAX_YAW = 80;
let MAX_PITCH_DEG = 25;
let ALARM_DELAY = 0;
let FACE_MISSING_DELAY = 3.0;
let NOSE_CHIN_RATIO_THRESHOLD = 0.55;
let FACE_AREA_RATIO_THRESHOLD = 0.6;
let EYE_VISIBILITY_THRESHOLD = 0.4;
const PITCH_FIXED_OFFSET = -18;

// ===== キャリブ =====
let yawZeroOffset = 0;
let pitchZeroOffset = 0;
let latestYaw = 0;
let latestPitch = 0;

// ===== 基準値 =====
let baseNoseChin = null;
let baseFaceArea = null;
let baseEyeDist = null;

// ===== アラーム =====
const alarmKeys = ["yaw","pitch","nose","area","eye"];
let alertTimers = {};
let softAlarmActive = false;
let lastSoftAlarmTime = 0;
const SOFT_ALARM_INTERVAL = 1000;
const SOFT_ALARM_ON = 500;

let faceMissingStart = null;
let lastHardAlarmTime = 0;
const HARD_ALARM_INTERVAL = 500;

// ===== カメラ =====
let currentFacingMode = "user";
let currentStream = null;

// ===== UI =====
const toggleBtn = document.getElementById("toggleBtn");
const statusText = document.getElementById("statusText");
const alertReason = document.getElementById("alertReason");

const yawText = document.getElementById("yawValue");
const pitchText = document.getElementById("pitchValue");
const noseValue = document.getElementById("noseValue");
const areaValue = document.getElementById("areaValue");
const eyeValue = document.getElementById("eyeValue");

const yawSlider = document.getElementById("yawSlider");
const yawLimit = document.getElementById("yawLimit");
const pitchSlider = document.getElementById("pitchSlider");
const pitchLimit = document.getElementById("pitchLimit");
const timeSlider = document.getElementById("timeSlider");
const timeLimit = document.getElementById("timeLimit");
const faceMissingSlider = document.getElementById("faceMissingSlider");
const faceMissingLimit = document.getElementById("faceMissingLimit");
const noseSlider = document.getElementById("noseSlider");
const noseLimit = document.getElementById("noseLimit");
const areaSlider = document.getElementById("areaSlider");
const areaLimit = document.getElementById("areaLimit");
const eyeSlider = document.getElementById("eyeSlider");
const eyeLimit = document.getElementById("eyeLimit");

const calibBtn = document.getElementById("calibBtn");
const switchCamBtn = document.getElementById("switchCamBtn");

// ===== スライダー連動（完全復旧）=====
yawSlider.oninput = () => {
  MAX_YAW = Number(yawSlider.value);
  yawLimit.textContent = MAX_YAW;
};

pitchSlider.oninput = () => {
  MAX_PITCH_DEG = Number(pitchSlider.value);
  pitchLimit.textContent = MAX_PITCH_DEG;
};

timeSlider.oninput = () => {
  ALARM_DELAY = Number(timeSlider.value);
  timeLimit.textContent = ALARM_DELAY.toFixed(1);
};

faceMissingSlider.oninput = () => {
  FACE_MISSING_DELAY = Number(faceMissingSlider.value);
  faceMissingLimit.textContent = FACE_MISSING_DELAY.toFixed(1);
};

noseSlider.oninput = () => {
  NOSE_CHIN_RATIO_THRESHOLD = Number(noseSlider.value);
  noseLimit.textContent = NOSE_CHIN_RATIO_THRESHOLD.toFixed(2);
};

areaSlider.oninput = () => {
  FACE_AREA_RATIO_THRESHOLD = Number(areaSlider.value);
  areaLimit.textContent = FACE_AREA_RATIO_THRESHOLD.toFixed(2);
};

eyeSlider.oninput = () => {
  EYE_VISIBILITY_THRESHOLD = Number(eyeSlider.value);
  eyeLimit.textContent = EYE_VISIBILITY_THRESHOLD.toFixed(2);
};

// ===== アラーム =====
function playSoft(){
  const now = performance.now();
  if(now - lastSoftAlarmTime >= SOFT_ALARM_INTERVAL){
    softAlarm.currentTime = 0;
    softAlarm.play();
    lastSoftAlarmTime = now;
    setTimeout(()=>softAlarm.pause(), SOFT_ALARM_ON);
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
  softAlarm.pause(); hardAlarm.pause();
  lastSoftAlarmTime = 0;
  lastHardAlarmTime = 0;
}

// ===== 開始/停止 =====
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  toggleBtn.textContent = isRunning ? "■ 停止" : "▶ 開始";
  toggleBtn.className = isRunning ? "stop" : "start";
  statusText.textContent = isRunning ? "🟢 作動中" : "🔴 停止中";
  if(!isRunning) stopAlarms();
};

// ===== キャリブ =====
calibBtn.onclick = () => {
  yawZeroOffset = latestYaw;
  pitchZeroOffset = latestPitch;
  baseNoseChin = null;
  baseFaceArea = null;
  baseEyeDist = null;
  alertTimers = {};
  faceMissingStart = null;
  stopAlarms();
};

// ===== FaceMesh =====
const faceMesh = new FaceMesh({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({ maxNumFaces:1 });

function dist(a,b){ return Math.hypot(a.x-b.x, a.y-b.y); }

// ===== カメラ =====
async function startCamera(){
  if(currentStream){
    currentStream.getTracks().forEach(t=>t.stop());
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{facingMode: currentFacingMode, width:640, height:480},
    audio:false
  });
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
}

switchCamBtn.onclick = async ()=>{
  currentFacingMode = currentFacingMode==="user"?"environment":"user";
  await startCamera();
};

// ===== 検出ループ =====
async function loop(){
  if(isRunning) await faceMesh.send({image:video});
  requestAnimationFrame(loop);
}
startCamera().then(loop);

// ===== 結果処理 =====
faceMesh.onResults(res=>{
  if(!isRunning) return;

  if(!res.multiFaceLandmarks?.length){
    if(!faceMissingStart) faceMissingStart = performance.now();
    if((performance.now()-faceMissingStart)/1000 >= FACE_MISSING_DELAY){
      alertReason.textContent = "🚨 顔が見えない（危険）";
      playHard();
    }
    return;
  }
  faceMissingStart = null;

  const lm = res.multiFaceLandmarks[0];
  const leftEye = lm[33], rightEye = lm[263], nose = lm[1], chin = lm[152];

  const rawYaw = Math.atan2(rightEye.z-leftEye.z, rightEye.x-leftEye.x)*180/Math.PI;
  const eyeCenterY = (leftEye.y+rightEye.y)/2;
  const rawPitch = ((nose.y-eyeCenterY)/(chin.y-eyeCenterY))*48 + PITCH_FIXED_OFFSET;

  const yaw = rawYaw - yawZeroOffset;
  const pitch = rawPitch - pitchZeroOffset;
  latestYaw = yaw;
  latestPitch = pitch;

  yawText.textContent = yaw.toFixed(1);
  pitchText.textContent = pitch.toFixed(1);

  const noseChin = dist(nose,chin);
  const faceArea = dist(leftEye,rightEye)*noseChin;
  const eyeDist = dist(lm[133],lm[33]);

  if(!baseNoseChin){
    baseNoseChin = noseChin;
    baseFaceArea = faceArea;
    baseEyeDist = eyeDist;
  }

  noseValue.textContent = (noseChin/baseNoseChin).toFixed(2);
  areaValue.textContent = (faceArea/baseFaceArea).toFixed(2);
  eyeValue.textContent = (eyeDist/baseEyeDist).toFixed(2);
});
