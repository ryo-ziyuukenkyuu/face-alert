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

// キャリブ（raw基準）
let yawZeroOffset = 0;
let pitchZeroOffset = 0;

// 最新値
let latestYaw = 0;
let latestPitch = 0;
let latestRawYaw = 0;
let latestRawPitch = 0;

// 基準値（比率）
let baseNoseChin = null;
let baseFaceArea = null;
let baseEyeDist = null;

// 軽度アラーム
const alarmKeys = ["yaw","pitch","nose","area","eye"];
let alertTimers = {};
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

// --- スライダー ---
yawSlider.oninput = () => { MAX_YAW = +yawSlider.value; yawLimit.textContent = MAX_YAW; };
pitchSlider.oninput = () => { MAX_PITCH_DEG = +pitchSlider.value; pitchLimit.textContent = MAX_PITCH_DEG; };
timeSlider.oninput = () => { ALARM_DELAY = +timeSlider.value; timeLimit.textContent = ALARM_DELAY.toFixed(1); };
faceMissingSlider.oninput = () => { FACE_MISSING_DELAY = +faceMissingSlider.value; faceMissingLimit.textContent = FACE_MISSING_DELAY.toFixed(1); };
noseSlider.oninput = () => { NOSE_CHIN_RATIO_THRESHOLD = +noseSlider.value; noseLimit.textContent = NOSE_CHIN_RATIO_THRESHOLD.toFixed(2); };
areaSlider.oninput = () => { FACE_AREA_RATIO_THRESHOLD = +areaSlider.value; areaLimit.textContent = FACE_AREA_RATIO_THRESHOLD.toFixed(2); };
eyeSlider.oninput = () => { EYE_VISIBILITY_THRESHOLD = +eyeSlider.value; eyeLimit.textContent = EYE_VISIBILITY_THRESHOLD.toFixed(2); };

// --- アラーム ---
function playSoft(){
  const now = performance.now();
  if(now - lastSoftAlarmTime >= SOFT_ALARM_INTERVAL){
    softAlarm.currentTime = 0;
    softAlarm.play().catch(()=>{});
    lastSoftAlarmTime = now;
    setTimeout(()=>{ softAlarm.pause(); softAlarm.currentTime = 0; }, SOFT_ALARM_ON);
  }
}
function playHard(){
  const now = performance.now();
  if(now - lastHardAlarmTime >= HARD_ALARM_INTERVAL){
    hardAlarm.currentTime = 0;
    hardAlarm.play().catch(()=>{});
    lastHardAlarmTime = now;
  }
}
function stopAlarms(){
  softAlarm.pause(); softAlarm.currentTime=0;
  hardAlarm.pause(); hardAlarm.currentTime=0;
}

// --- 開始/停止 ---
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  toggleBtn.textContent = isRunning ? "■ 停止" : "▶ 開始";
  toggleBtn.className = isRunning ? "stop" : "start";
  statusText.textContent = isRunning ? "🟢 作動中" : "🔴 停止中";
  if(!isRunning) stopAlarms();
};

// --- キャリブ（raw基準）---
calibBtn.onclick = () => {
  yawZeroOffset = latestRawYaw;
  pitchZeroOffset = latestRawPitch;

  baseNoseChin = null;
  baseFaceArea = null;
  baseEyeDist = null;

  alertTimers = {};
  faceMissingStart = null;
  stopAlarms();
};

// --- FaceMesh ---
const faceMesh = new FaceMesh({ locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces:1 });
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// --- カメラ ---
async function startCamera(){
  if(currentStream) currentStream.getTracks().forEach(t=>t.stop());
  currentStream = await navigator.mediaDevices.getUserMedia({
    video:{width:640,height:480,facingMode:currentFacingMode},
    audio:false
  });
  video.srcObject = currentStream;
  await video.play();
}
switchCamBtn.onclick = async ()=>{
  currentFacingMode = currentFacingMode==="user"?"environment":"user";
  await startCamera();
};

// --- ループ ---
async function loop(){
  if(isRunning) await faceMesh.send({image:video});
  requestAnimationFrame(loop);
}
startCamera().then(loop);

// --- 結果処理 ---
faceMesh.onResults(res=>{
  if(!isRunning) return;
  const now = performance.now();

  if(!res.multiFaceLandmarks?.length){
    if(!faceMissingStart) faceMissingStart = now;
    if((now-faceMissingStart)/1000 >= FACE_MISSING_DELAY){
      alertReason.textContent="🚨 顔が見えない（危険）";
      alertReason.className="danger";
      playHard();
    }
    return;
  }

  faceMissingStart = null;
  lastHardAlarmTime = 0;

  const lm=res.multiFaceLandmarks[0];
  const leftEye=lm[33], rightEye=lm[263], nose=lm[1], chin=lm[152];

  latestRawYaw = Math.atan2(rightEye.z-leftEye.z, rightEye.x-leftEye.x)*180/Math.PI;
  const eyeCenterY=(leftEye.y+rightEye.y)/2;
  latestRawPitch=((nose.y-eyeCenterY)/(chin.y-eyeCenterY))*48 + PITCH_FIXED_OFFSET;

  latestYaw = latestRawYaw - yawZeroOffset;
  latestPitch = latestRawPitch - pitchZeroOffset;

  yawText.textContent = latestYaw.toFixed(1);
  pitchText.textContent = latestPitch.toFixed(1);

  const noseChin=dist(nose,chin);
  const faceArea=dist(leftEye,rightEye)*noseChin;
  const eyeDist=dist(lm[133],lm[33]);

  if(!baseNoseChin){
    baseNoseChin=noseChin;
    baseFaceArea=faceArea;
    baseEyeDist=eyeDist;
  }

  const noseRatio=noseChin/baseNoseChin;
  const areaRatio=faceArea/baseFaceArea;
  const eyeRatio=eyeDist/baseEyeDist;

  noseValue.textContent=noseRatio.toFixed(2);
  areaValue.textContent=areaRatio.toFixed(2);
  eyeValue.textContent=eyeRatio.toFixed(2);

  const conditions={
    yaw:Math.abs(latestYaw)>MAX_YAW,
    pitch:Math.abs(latestPitch)>MAX_PITCH_DEG,
    nose:noseRatio<NOSE_CHIN_RATIO_THRESHOLD,
    area:areaRatio<FACE_AREA_RATIO_THRESHOLD,
    eye:eyeRatio<EYE_VISIBILITY_THRESHOLD
  };

  const labels={
    yaw:"Yaw角度超過",
    pitch:"Pitch角度超過",
    nose:"鼻‐顎距離低下",
    area:"顔面積低下",
    eye:"目の可視率低下"
  };

  const reasons=[];
  for(const k of alarmKeys){
    if(conditions[k]){
      if(!alertTimers[k]) alertTimers[k]=now;
      if((now-alertTimers[k])/1000>=ALARM_DELAY) reasons.push(labels[k]);
    } else delete alertTimers[k];
  }

  if(reasons.length){
    alertReason.textContent="⚠️ "+reasons.join(" / ");
    alertReason.className="warning";
    playSoft();
  } else {
    alertReason.textContent="異常なし";
    alertReason.className="safe";
  }
});
