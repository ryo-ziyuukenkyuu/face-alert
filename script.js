const video = document.getElementById("video");
const softAlarm = document.getElementById("softAlarm");
const hardAlarm = document.getElementById("hardAlarm");

let isRunning = false;

/* ===== 閾値 ===== */
let MAX_YAW = 80;
let MAX_PITCH_DEG = 25;
let ALARM_DELAY = 0;
let FACE_MISSING_DELAY = 3.0;
let NOSE_CHIN_RATIO_THRESHOLD = 0.55;
let FACE_AREA_RATIO_THRESHOLD = 0.6;
let EYE_VISIBILITY_THRESHOLD = 0.4;
const PITCH_FIXED_OFFSET = -18;

/* ===== キャリブ ===== */
let yawZeroOffset = 0;
let pitchZeroOffset = 0;
let latestYaw = 0;
let latestPitch = 0;

/* ===== 比率基準 ===== */
let baseNoseChin = null;
let baseFaceArea = null;
let baseEyeDist = null;
let needRatioCalib = true;

/* ===== アラーム ===== */
const alarmKeys = ["yaw","pitch","nose","area","eye"];
let alertTimers = {};
let softAlarmActive = false;
let lastSoftAlarmTime = 0;
const SOFT_ALARM_INTERVAL = 1000;
const SOFT_ALARM_ON = 500;

let faceMissingStart = null;
let lastHardAlarmTime = 0;
const HARD_ALARM_INTERVAL = 500;

/* ===== カメラ ===== */
let currentFacingMode = "user";
let currentStream = null;

/* ===== UI ===== */
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

/* ===== スライダー ===== */
yawSlider.oninput = () => { MAX_YAW = +yawSlider.value; yawLimit.textContent = MAX_YAW; };
pitchSlider.oninput = () => { MAX_PITCH_DEG = +pitchSlider.value; pitchLimit.textContent = MAX_PITCH_DEG; };
timeSlider.oninput = () => { ALARM_DELAY = +timeSlider.value; timeLimit.textContent = ALARM_DELAY.toFixed(1); };
faceMissingSlider.oninput = () => { FACE_MISSING_DELAY = +faceMissingSlider.value; faceMissingLimit.textContent = FACE_MISSING_DELAY.toFixed(1); };
noseSlider.oninput = () => { NOSE_CHIN_RATIO_THRESHOLD = +noseSlider.value; noseLimit.textContent = NOSE_CHIN_RATIO_THRESHOLD.toFixed(2); };
areaSlider.oninput = () => { FACE_AREA_RATIO_THRESHOLD = +areaSlider.value; areaLimit.textContent = FACE_AREA_RATIO_THRESHOLD.toFixed(2); };
eyeSlider.oninput = () => { EYE_VISIBILITY_THRESHOLD = +eyeSlider.value; eyeLimit.textContent = EYE_VISIBILITY_THRESHOLD.toFixed(2); };

/* ===== アラーム ===== */
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
  softAlarm.pause(); hardAlarm.pause();
  softAlarm.currentTime = 0; hardAlarm.currentTime = 0;
  softAlarmActive = false;
}

/* ===== 開始停止 ===== */
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  statusText.textContent = isRunning ? "🟢 作動中" : "🔴 停止中";
  toggleBtn.textContent = isRunning ? "■ 停止" : "▶ 開始";
  if(!isRunning) stopAlarms();
};

/* ===== キャリブ ===== */
calibBtn.onclick = () => {
  yawZeroOffset += latestYaw;
  pitchZeroOffset += latestPitch;

  needRatioCalib = true;
  alertTimers = {};
  faceMissingStart = null;
  stopAlarms();

  noseValue.textContent = "1.00";
  areaValue.textContent = "1.00";
  eyeValue.textContent = "1.00";
};

/* ===== FaceMesh ===== */
const faceMesh = new FaceMesh({
  locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`
});
faceMesh.setOptions({ maxNumFaces: 1 });

const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

/* ===== カメラ ===== */
async function startCamera(){
  if(currentStream) currentStream.getTracks().forEach(t=>t.stop());
  currentStream = await navigator.mediaDevices.getUserMedia({
    video:{width:640,height:480,facingMode:currentFacingMode},audio:false
  });
  video.srcObject = currentStream;
  await video.play();
}

switchCamBtn.onclick = async ()=>{
  currentFacingMode = currentFacingMode==="user"?"environment":"user";
  await startCamera();
};

async function loop(){
  if(isRunning) await faceMesh.send({image:video});
  requestAnimationFrame(loop);
}

startCamera().then(loop);

/* ===== 結果 ===== */
faceMesh.onResults(res=>{
  if(!isRunning) return;
  const now = performance.now();

  if(!res.multiFaceLandmarks?.length){
    if(!faceMissingStart) faceMissingStart = now;
    if((now-faceMissingStart)/1000 >= FACE_MISSING_DELAY){
      alertReason.textContent="🚨 顔が見えない（危険）";
      playHard();
    }
    return;
  } else faceMissingStart=null;

  const lm=res.multiFaceLandmarks[0];
  const l=lm[33], r=lm[263], n=lm[1], c=lm[152];

  const rawYaw=Math.atan2(r.z-l.z,r.x-l.x)*180/Math.PI;
  const eyeCY=(l.y+r.y)/2;
  const rawPitch=((n.y-eyeCY)/(c.y-eyeCY))*48+PITCH_FIXED_OFFSET;

  latestYaw=rawYaw-yawZeroOffset;
  latestPitch=rawPitch-pitchZeroOffset;

  yawText.textContent=latestYaw.toFixed(1);
  pitchText.textContent=latestPitch.toFixed(1);

  const noseChin=dist(n,c);
  const faceArea=dist(l,r)*noseChin;
  const eyeDist=dist(lm[133],lm[33]);

  if(needRatioCalib){
    baseNoseChin=noseChin;
    baseFaceArea=faceArea;
    baseEyeDist=eyeDist;
    needRatioCalib=false;
  }

  const noseRatio=noseChin/baseNoseChin;
  const areaRatio=faceArea/baseFaceArea;
  const eyeRatio=eyeDist/baseEyeDist;

  noseValue.textContent=noseRatio.toFixed(2);
  areaValue.textContent=areaRatio.toFixed(2);
  eyeValue.textContent=eyeRatio.toFixed(2);

  let reasons=[];
  const cond={
    yaw:Math.abs(latestYaw)>MAX_YAW,
    pitch:Math.abs(latestPitch)>MAX_PITCH_DEG,
    nose:noseRatio<NOSE_CHIN_RATIO_THRESHOLD,
    area:areaRatio<FACE_AREA_RATIO_THRESHOLD,
    eye:eyeRatio<EYE_VISIBILITY_THRESHOLD
  };

  for(let k of alarmKeys){
    if(cond[k]){
      if(!alertTimers[k]) alertTimers[k]=now;
      if((now-alertTimers[k])/1000>=ALARM_DELAY)
        reasons.push(k);
    } else alertTimers[k]=null;
  }

  if(reasons.length){
    alertReason.textContent="⚠️ "+reasons.join(" / ");
    playSoft();
  } else {
    alertReason.textContent="異常なし";
  }
});
