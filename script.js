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

// カメラ切替
let currentFacingMode = "user";
let cameraInstance = null;

// UI
const toggleBtn = document.getElementById("toggleBtn");
const calibBtn = document.getElementById("calibBtn");
const switchCamBtn = document.getElementById("switchCamBtn");
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

// --- ログ用 ---
const logContainer = document.createElement("div");
logContainer.style.textAlign = "left";
logContainer.style.marginTop = "10px";
document.body.appendChild(logContainer);

let lastCaptureTime = 0;

// --- スライダー連動 ---
yawSlider.oninput = () => { MAX_YAW = +yawSlider.value; yawLimit.textContent = MAX_YAW; };
pitchSlider.oninput = () => { MAX_PITCH_DEG = +pitchSlider.value; pitchLimit.textContent = MAX_PITCH_DEG; };
timeSlider.oninput = () => { ALARM_DELAY = +timeSlider.value; timeLimit.textContent = ALARM_DELAY.toFixed(1); };
faceMissingSlider.oninput = () => { FACE_MISSING_DELAY = +faceMissingSlider.value; faceMissingLimit.textContent = FACE_MISSING_DELAY.toFixed(1); };
noseSlider.oninput = () => { NOSE_CHIN_RATIO_THRESHOLD = +noseSlider.value; noseLimit.textContent = NOSE_CHIN_RATIO_THRESHOLD.toFixed(2); };
areaSlider.oninput = () => { FACE_AREA_RATIO_THRESHOLD = +areaSlider.value; areaLimit.textContent = FACE_AREA_RATIO_THRESHOLD.toFixed(2); };
eyeSlider.oninput = () => { EYE_VISIBILITY_THRESHOLD = +eyeSlider.value; eyeLimit.textContent = EYE_VISIBILITY_THRESHOLD.toFixed(2); };

// --- アラーム制御 ---
function playSoft(){
  const now = performance.now();
  if(now - lastSoftAlarmTime >= SOFT_ALARM_INTERVAL){
    softAlarmActive = true;
    softAlarm.currentTime = 0;
    softAlarm.play();
    lastSoftAlarmTime = now;
    setTimeout(()=>{ softAlarm.pause(); softAlarm.currentTime=0; softAlarmActive=false; }, SOFT_ALARM_ON);
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
  softAlarm.pause(); softAlarm.currentTime=0; softAlarmActive=false;
  hardAlarm.pause(); hardAlarm.currentTime=0;
  lastSoftAlarmTime=0; lastHardAlarmTime=0;
}

// --- 開始/停止 ---
toggleBtn.onclick = () => {
  isRunning = !isRunning;
  if(isRunning){
    toggleBtn.textContent = "■ 停止"; toggleBtn.className="stop"; statusText.textContent="🟢 作動中";
  } else {
    toggleBtn.textContent = "▶ 開始"; toggleBtn.className="start"; statusText.textContent="🔴 停止中";
    stopAlarms();
  }
};

// --- キャリブ ---
// 角度＋各比率初期化
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

// --- カメラ切替 ---
switchCamBtn.onclick = async () => {
  currentFacingMode = (currentFacingMode==="user"?"environment":"user");
  if(cameraInstance){ cameraInstance.stop(); video.srcObject=null; }
  await startCamera();
};

// --- FaceMesh ---
const faceMesh = new FaceMesh({ locateFile: f=>`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}` });
faceMesh.setOptions({ maxNumFaces:1 });
function dist(a,b){return Math.hypot(a.x-b.x, a.y-b.y);}

// --- カメラ取得 ---
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width:640, height:480, facingMode: currentFacingMode },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    if(cameraInstance) cameraInstance.stop();
    cameraInstance = new Camera(video,{ onFrame: async()=>await faceMesh.send({image:video}), width:640, height:480 });
    cameraInstance.start();
  } catch(err){ console.error("カメラ取得失敗:", err); }
}
startCamera();

// --- 顔検出結果処理 ---
faceMesh.onResults(res=>{
  if(!isRunning) return;
  const now = performance.now();
  try{
    // 顔未検出
    if(!res.multiFaceLandmarks || res.multiFaceLandmarks.length===0){
      if(!faceMissingStart) faceMissingStart=now;
      const elapsed=(now-faceMissingStart)/1000;
      if(elapsed>=FACE_MISSING_DELAY){
        alertReason.textContent="🚨 顔が見えない（危険）"; alertReason.className="danger"; playHard();
        captureLog(elapsed,true);
      } else {
        alertReason.textContent="⚠️ 顔未検出（待機中）"; alertReason.className="warning";
      }
      return;
    } else { faceMissingStart=null; }

    // 顔ランドマーク
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

    // 軽度アラーム判定
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
        if((now-alertTimers[key])/1000 >= ALARM_DELAY)
          reasons.push(key==="yaw"?"Yaw角度異常":
                       key==="pitch"?"Pitch角度異常":
                       key==="nose"?"鼻‐顎距離異常":
                       key==="area"?"顔面積異常":"目の可視率異常");
      } else { alertTimers[key]=null; }
    }

    if(reasons.length>0){
      alertReason.textContent="⚠️ "+reasons.join(" / "); alertReason.className="warning";
      playSoft();
      captureLog(ALARM_DELAY,false,reasons,{yaw,pitch:pitchAdj,noseRatio,areaRatio,eyeRatio});
    } else {
      alertReason.textContent="異常なし"; alertReason.className="safe";
    }

  } catch(err){
    console.error("処理エラー:", err);
  }
});

// --- ログキャプチャ ---
function captureLog(duration,force=false,reasonList=[],values={}){
  const now = performance.now();
  if(!force && now - lastCaptureTime < 3000) return;
  lastCaptureTime = now;

  if(video.videoWidth ===0 || video.videoHeight===0) return;

  try{
    const canvas=document.createElement("canvas");
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const imageData=canvas.toDataURL("image/png");

    const logEntry=document.createElement("div");
    logEntry.style.borderTop="1px solid #888";
    logEntry.style.padding="4px";
    logEntry.innerHTML = `<strong>${new Date().toLocaleTimeString()}</strong> - ${force ? "顔未検出" : reasonList.join(" / ")}
<br>継続秒数: ${duration.toFixed(1)}
<br>Yaw: ${values.yaw?.toFixed(1)||latestYaw.toFixed(1)}, Pitch: ${values.pitch?.toFixed(1)||latestPitch.toFixed(1)}
<br>Nose: ${values.noseRatio?.toFixed(2)||noseValue.textContent}, Area: ${values.areaRatio?.toFixed(2)||areaValue.textContent}, Eye: ${values.eyeRatio?.toFixed(2)||eyeValue.textContent}
<br>設定値 Yaw:${MAX_YAW}, Pitch:${MAX_PITCH_DEG}, Nose:${NOSE_CHIN_RATIO_THRESHOLD}, Area:${FACE_AREA_RATIO_THRESHOLD}, Eye:${EYE_VISIBILITY_THRESHOLD}, ALARM_DELAY:${ALARM_DELAY}, FACE_MISSING_DELAY:${FACE_MISSING_DELAY}
<br><img src="${imageData}" style="width:160px;">`;

    logContainer.prepend(logEntry);

  } catch(err){
    console.error("ログキャプチャ失敗:",err);
  }
}

// --- Camera開始 ---
const camera=new Camera(video,{onFrame: async()=>await faceMesh.send({image:video})});
camera.start();
