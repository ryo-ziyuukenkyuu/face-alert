const video = document.getElementById("video");

// 状態表示用
const status = document.createElement("p");
document.body.appendChild(status);

// ===== アラーム音 =====
let alarmPlaying = false;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playAlarm() {
  if (alarmPlaying) return;
  alarmPlaying = true;

  const osc = audioCtx.createOscillator();
  osc.frequency.value = 1000;
  osc.connect(audioCtx.destination);
  osc.start();

  setTimeout(() => {
    osc.stop();
    alarmPlaying = false;
  }, 400);
}

// ===== FaceMesh =====
const faceMesh = new FaceMesh({
  locateFile: file =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
  maxNumFaces: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

// 顔の向き判定
faceMesh.onResults(results => {
  if (results.multiFaceLandmarks.length === 0) {
    status.textContent = "顔が見つかりません";
    return;
  }

  const lm = results.multiFaceLandmarks[0];

  // 重要ポイント
  const nose = lm[1];
  const leftEye = lm[33];
  const rightEye = lm[263];

  const center = (leftEye.x + rightEye.x) / 2;
  const diff = nose.x - center;

  const THRESHOLD = 0.07;

  if (Math.abs(diff) > THRESHOLD) {
    status.textContent = "そっぽ向いてます！";
    playAlarm();
  } else {
    status.textContent = "正面です";
  }
});

// カメラ起動
const camera = new Camera(video, {
  onFrame: async () => {
    await faceMesh.send({ image: video });
  },
  width: 640,
  height: 480
});

camera.start();
