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
    softAlarmActive = true;
    softAlarm.currentTime = 0;
    softAlarm.play().catch(()=>{});
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
    hardAlarm.play().catch(()=>{});
    lastHardAlarmTime = now;
  }
}

function stopAlarms(){
  softAlarm.pause(); softAlarm.currentTime=0; softAlarmActive=false;
  hardAlarm.pause(); hardAlarm.currentTime=0;
}

// --- 開始/停止 ---
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  if(isRunning){
    hardAlarm.muted = true;
    hardAlarm.play().then(()=>{
      hardAlarm.pause();
      hardAlarm.currentTime = 0;
      hardAlarm.muted = false;
    }).catch(()=>{});

    toggleBtn.textContent = "■ 停止";
    toggleBtn.className="stop";
    statusText.textContent="🟢 作動中";
  } else {
    toggleBtn.textContent = "▶ 開始";
    toggleBtn.className="start";
    statusText.textContent="🔴 停止中";
    stopAlarms();
  }
};

// --- キャリブ ---
calibBtn.onclick = () => {
  yawZeroOffset = latestYaw;
  pitchZeroOffset = latestPitch;
  alertTimers = {};
  faceMissingStart = null;
  stopAlarms();
};

// --- FaceMesh ---
const faceMesh = new FaceMesh({ locateFile: f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces:1 });
function dist(a,b){return Math.hypot(a.x-b.x, a.y-b.y);}

// --- カメラ ---
async function startCamera(){
  if(currentStream) currentStream.getTracks().forEach(t=>t.stop());
  const stream = await navigator.mediaDevices.getUserMedia({
    video:{width:640,height:480,facingMode:currentFacingMode},
    audio:false
  });
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
}

switchCamBtn.onclick = async () => {
  currentFacingMode = currentFacingMode==="user"?"environment":"user";
  await startCamera();
};

// --- 検出ループ ---
async function faceDetectionLoop(){
  if(isRunning) await faceMesh.send({image: video});
  requestAnimationFrame(faceDetectionLoop);
}
startCamera().then(()=>faceDetectionLoop());

// --- 結果処理 ---
faceMesh.onResults(res=>{
  if(!isRunning) return;
  const now = performance.now();

  // 顔未検出
  if(!res.multiFaceLandmarks || res.multiFaceLandmarks.length===0){
    if(!faceMissingStart) faceMissingStart = now;

    if((now-faceMissingStart)/1000 >= FACE_MISSING_DELAY){
      alertReason.textContent="🚨 顔が見えない（危険）";
      alertReason.className="danger";
      playHard();
    }
    return;
  }

  // ← 顔が戻ったら完全復帰
  faceMissingStart = null;
  lastHardAlarmTime = 0;

  const lm=res.multiFaceLandmarks[0];
  const leftEye=lm[33], rightEye=lm[263], nose=lm[1], chin=lm[152];
  const rawYaw=Math.atan2(rightEye.z-leftEye.z, rightEye.x-leftEye.x)*180/Math.PI;
  const eyeCenterY=(leftEye.y+rightEye.y)/2;
  const pitch=((nose.y-eyeCenterY)/(chin.y-eyeCenterY))*48 + PITCH_FIXED_OFFSET;

  const yaw=rawYaw-yawZeroOffset;
  const pitchAdj=pitch-pitchZeroOffset;
  latestYaw=yaw; latestPitch=pitchAdj;

  yawText.textContent=yaw.toFixed(1);
  pitchText.textContent=pitchAdj.toFixed(1);

  const noseChin=dist(nose,chin);
  const faceArea=dist(leftEye,rightEye)*noseChin;
  const eyeDist=dist(lm[133],lm[33]);

  if(!baseNoseChin){ baseNoseChin=noseChin; baseFaceArea=faceArea; baseEyeDist=eyeDist; }

  const noseRatio=noseChin/baseNoseChin;
  const areaRatio=faceArea/baseFaceArea;
  const eyeRatio=eyeDist/baseEyeDist;

  noseValue.textContent=noseRatio.toFixed(2);
  areaValue.textContent=areaRatio.toFixed(2);
  eyeValue.textContent=eyeRatio.toFixed(2);

  let reasons=[];
  const conditions = {
    yaw: Math.abs(yaw)>MAX_YAW,
    pitch: Math.abs(pitchAdj)>MAX_PITCH_DEG,
    nose: noseRatio<NOSE_CHIN_RATIO_THRESHOLD,
    area: areaRatio<FACE_AREA_RATIO_THRESHOLD,
    eye: eyeRatio<EYE_VISIBILITY_THRESHOLD
  };

  for(let key of alarmKeys){
    if(conditions[key]){
      if(!alertTimers[key]) alertTimers[key]=now;
      if((now-alertTimers[key])/1000 >= ALARM_DELAY){
        reasons.push(key);
      }
    } else {
      delete alertTimers[key]; // ← 重要
    }
  }

  if(reasons.length){
    alertReason.textContent="⚠️ 姿勢異常";
    alertReason.className="warning";
    playSoft();
  } else {
    alertReason.textContent="異常なし";
    alertReason.className="safe";
  }
});
