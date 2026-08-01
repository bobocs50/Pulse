// Runs off main thread — keeps Web Audio scheduler jitter-free
// MediaPipe CPU mode here; GPU delegate requires OffscreenCanvas WebGL (test on phone)
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark, WorkerInMessage, WorkerOutMessage } from "@/types/vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let landmarker: PoseLandmarker | null = null;
let lastTs = 0;

async function init() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numPoses: 2, // rescuer + patient on floor — pick more vertical pose below
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const msg: WorkerOutMessage = { type: "ready" };
  self.postMessage(msg);
}

// Pick the rescuer: compare average y-span of the two poses; larger span = more vertical = rescuer
function selectRescuer(allLandmarks: Landmark[][]): Landmark[] | null {
  if (!allLandmarks.length) return null;
  if (allLandmarks.length === 1) return allLandmarks[0];
  const span = (lm: Landmark[]) => {
    const ys = lm.map(l => l.y);
    return Math.max(...ys) - Math.min(...ys);
  };
  return allLandmarks[0] && allLandmarks[1]
    ? span(allLandmarks[0]) >= span(allLandmarks[1]) ? allLandmarks[0] : allLandmarks[1]
    : allLandmarks[0] ?? null;
}

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const { type, bitmap, timestamp } = e.data;

  if (type === "init") {
    await init();
    return;
  }

  if (type === "frame" && landmarker && bitmap) {
    // Monotonically increasing timestamp — MediaPipe requirement
    const ts = Math.max(timestamp ?? performance.now(), lastTs + 1);
    lastTs = ts;

    let landmarks: Landmark[] | null = null;
    try {
      const result = landmarker.detectForVideo(bitmap, ts);
      landmarks = selectRescuer(result.landmarks as Landmark[][]);
    } catch {
      // skip bad frame
    }
    bitmap.close();

    const msg: WorkerOutMessage = { type: "landmarks", landmarks, timestamp: ts };
    self.postMessage(msg);
  }
};
