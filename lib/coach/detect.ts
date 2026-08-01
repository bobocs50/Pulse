// Peak detection on the compression signal. One peak = one compression.
// Y increases downward in MediaPipe (0 = top, 1 = bottom), so the bottom
// of a compression is a local MAX. Front view: the clasped wrists are the
// stroke itself — highest-amplitude signal. Shoulder-y is the fallback.
import type { Landmark } from "@/types/vision";
import { LM } from "@/lib/vision/geometry";

export const REFRACTORY_MS = 350;   // minimum ms between peaks
export const MIN_AMPLITUDE = 0.01;  // minimum y-excursion to count (tune with y-trace plot)
export const TRACE_LEN = 300;       // ~5s at 60fps
const VIS_MIN = 0.5;
// Single-frame step this large = wrist↔shoulder source switch or tracking glitch,
// never a real stroke. Reset the detector instead of manufacturing a fake peak.
const JUMP_GUARD = 0.06;

export interface DetectState {
  wristTrace: number[];     // compression signal ring buffer (for plot + tuning)
  shoulderTrace: number[];  // fallback signal ring buffer (plot only)
  peakFlags: boolean[];     // parallel to wristTrace: true where a peak was accepted
  runningMax: number;       // max signal since last accepted peak (-1 = unseeded)
  runningMin: number;       // min signal since last peak — re-arm tracking
  armed: boolean;           // false after a peak until a new downstroke of MIN_AMPLITUDE
  lastY: number;            // previous frame's signal (-1 = unseeded), for the jump guard
  lastSource: "hands" | "pose" | null; // signal source last frame — reset on switch
  lastPeakAt: number;       // ms timestamp of last accepted peak
  peakTimes: number[];      // last 4 accepted peak timestamps (BPM over last 3 intervals)
}

export function createDetectState(): DetectState {
  return {
    wristTrace: [],
    shoulderTrace: [],
    peakFlags: [],
    runningMax: -1,
    runningMin: -1,
    armed: true,
    lastY: -1,
    lastSource: null,
    lastPeakAt: 0,
    peakTimes: [],
  };
}

export function shoulderY(lm: Landmark[]): number {
  const lv = lm[LM.leftShoulder]?.visibility ?? 0;
  const rv = lm[LM.rightShoulder]?.visibility ?? 0;
  return lv >= rv ? (lm[LM.leftShoulder]?.y ?? 0) : (lm[LM.rightShoulder]?.y ?? 0);
}

export function midWristY(lm: Landmark[]): number | null {
  const l = lm[LM.leftWrist];
  const r = lm[LM.rightWrist];
  const lok = (l?.visibility ?? 0) >= VIS_MIN;
  const rok = (r?.visibility ?? 0) >= VIS_MIN;
  if (lok && rok) return (l.y + r.y) / 2;
  if (lok) return l.y;
  if (rok) return r.y;
  return null;
}

// Mean y of all detected hand anchors — most direct compression signal
export function handsMeanY(hands: Landmark[][] | null): number | null {
  if (!hands || !hands.length) return null;
  let s = 0, n = 0;
  for (const h of hands) for (const p of h) { s += p.y; n++; }
  return n ? s / n : null;
}

// Signal priority: hand anchors → pose wrists → shoulder
export function compressionSignal(lm: Landmark[] | null, hands: Landmark[][] | null): number | null {
  const hy = handsMeanY(hands);
  if (hy != null) return hy;
  if (!lm || lm.length < 17) return null;
  return midWristY(lm) ?? shoulderY(lm);
}

// Call once per frame. Pushes one sample onto the traces, returns true if
// this frame completes a compression (signal has risen MIN_AMPLITUDE off
// the running max, outside the refractory window).
export function detectPeak(
  state: DetectState,
  lm: Landmark[] | null,
  hands: Landmark[][] | null,
  nowMs: number,
): boolean {
  const hy = handsMeanY(hands);
  const source: "hands" | "pose" = hy != null ? "hands" : "pose";
  const y = compressionSignal(lm, hands);
  if (y == null) return false;
  const sy = lm && lm.length >= 17 ? shoulderY(lm) : y;

  state.wristTrace.push(y);
  state.shoulderTrace.push(sy);
  state.peakFlags.push(false);
  if (state.wristTrace.length > TRACE_LEN) {
    state.wristTrace.shift();
    state.shoulderTrace.shift();
    state.peakFlags.shift();
  }

  const prevY = state.lastY;
  const prevSource = state.lastSource;
  state.lastY = y;
  state.lastSource = source;

  if (state.runningMax < 0) {
    state.runningMax = y;
    return false;
  }
  // Hands and pose signals sit at different offsets — a source switch is never
  // a real stroke. Reset instead of detecting on the step.
  if (prevSource !== null && source !== prevSource) {
    state.runningMax = y;
    state.runningMin = y;
    state.armed = false;
    return false;
  }
  if (prevY >= 0 && Math.abs(y - prevY) > JUMP_GUARD) {
    state.runningMax = y;
    state.runningMin = y;
    state.armed = false;
    return false;
  }

  // Re-arm: after a peak (or reset), require a fresh downstroke of MIN_AMPLITUDE
  // before another peak is possible — kills double counts at slow tempo.
  if (!state.armed) {
    state.runningMin = state.runningMin < 0 ? y : Math.min(state.runningMin, y);
    if (y - state.runningMin >= MIN_AMPLITUDE) {
      state.armed = true;
      state.runningMax = y;
    }
    return false;
  }

  if (y > state.runningMax) {
    state.runningMax = y;
    return false;
  }

  const risen = state.runningMax - y;
  if (risen >= MIN_AMPLITUDE && nowMs - state.lastPeakAt >= REFRACTORY_MS) {
    state.lastPeakAt = nowMs;
    state.peakTimes.push(nowMs);
    if (state.peakTimes.length > 4) state.peakTimes.shift();
    state.peakFlags[state.peakFlags.length - 1] = true;
    state.armed = false;
    state.runningMin = y;
    state.runningMax = y;
    return true;
  }
  return false;
}

// 60 / mean inter-peak interval, over the last 3 intervals max.
// Intervals spanning a stall (>2s) are discarded — no "bpm 18" after recovery.
export function currentBpm(state: DetectState): number | null {
  const t = state.peakTimes;
  if (t.length < 2) return null;
  let sum = 0, n = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt <= 2000) { sum += dt; n++; }
  }
  if (!n) return null;
  return Math.round(60000 / (sum / n));
}
