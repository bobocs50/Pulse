// Runs off main thread — keeps Web Audio scheduler jitter-free
// MediaPipe CPU mode here; GPU delegate requires OffscreenCanvas WebGL (test on phone)
import { FilesetResolver, PoseLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, WorkerInMessage, WorkerOutMessage } from "@/types/vision";

// Vendored locally — venue Wi-Fi must not be able to kill the demo
const WASM_URL = "/mediapipe/wasm";
const MODEL_URL = "/models/pose_landmarker_lite.task";
const HAND_MODEL_URL = "/models/hand_landmarker.task";

let landmarker: PoseLandmarker | null = null;
let handLandmarker: HandLandmarker | null = null;
let lastTs = 0;

async function init() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 1, // single rescuer — the patient on the floor isn't part of the frame
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  // Hands: precise anchors on the clasped hands — the compression signal
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: HAND_MODEL_URL },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const msg: WorkerOutMessage = { type: "ready" };
  self.postMessage(msg);
}

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const { type, bitmap, timestamp } = e.data;

  if (type === "init") {
    try {
      await init();
    } catch (err) {
      const msg: WorkerOutMessage = { type: "error", error: String(err) };
      self.postMessage(msg);
    }
    return;
  }

  if (type === "frame" && landmarker && bitmap) {
    // Monotonically increasing timestamp — MediaPipe requirement
    const ts = Math.max(timestamp ?? performance.now(), lastTs + 1);
    lastTs = ts;

    let landmarks: Landmark[] | null = null;
    let hands: Landmark[][] | null = null;
    try {
      const result = landmarker.detectForVideo(bitmap, ts);
      landmarks = (result.landmarks[0] as Landmark[] | undefined) ?? null;
    } catch {
      // skip bad frame
    }
    try {
      if (handLandmarker) {
        const hr = handLandmarker.detectForVideo(bitmap, ts);
        // Hand model has no visibility score — normalize to our Landmark shape
        hands = hr.landmarks.map(h => h.map(p => ({ x: p.x, y: p.y, z: p.z, visibility: 1 })));
      }
    } catch {
      // skip bad frame
    }
    bitmap.close();

    const msg: WorkerOutMessage = { type: "landmarks", landmarks, hands, timestamp: ts };
    self.postMessage(msg);
  }
};
