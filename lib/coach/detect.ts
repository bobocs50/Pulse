// Peak detection on shoulder-y. One peak = one compression.
// Y increases downward in MediaPipe (0 = top, 1 = bottom).
// A compression = shoulder drops (y increases) then returns.
import type { Landmark } from "@/types/vision";
import { LM } from "@/lib/vision/geometry";

const REFRACTORY_MS = 350;   // minimum ms between peaks
const MIN_AMPLITUDE = 0.01;  // minimum y-excursion to count (tune with y-trace plot)
const TRACE_LEN = 90;        // 3s at 30fps

export interface DetectState {
  yTrace: number[];           // circular buffer of shoulder-y values (for on-screen plot)
  baseline: number;           // rolling average of recent peak-high values
  lastPeakAt: number;         // timestamp of last accepted peak
  lastPeakY: number;          // y value at last peak (low point = fully compressed)
  peakCount: number;          // total accepted compressions this cycle
}

export function createDetectState(): DetectState {
  return { yTrace: [], baseline: 0, lastPeakAt: 0, lastPeakY: 0, peakCount: 0 };
}

// Returns the shoulder-y of the near arm (lower index = more visible)
export function shoulderY(lm: Landmark[]): number {
  const lv = lm[LM.leftShoulder]?.visibility ?? 0;
  const rv = lm[LM.rightShoulder]?.visibility ?? 0;
  return lv >= rv ? (lm[LM.leftShoulder]?.y ?? 0) : (lm[LM.rightShoulder]?.y ?? 0);
}

// Call once per frame. Returns true if this frame is a compression peak.
// TODO: implement proper peak detection (local max with refractory).
// Stub: always returns false — wire this up first thing tomorrow.
export function detectPeak(
  _state: DetectState,
  _lm: Landmark[],
  _nowMs: number,
): boolean {
  return false;
}
