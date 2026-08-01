// Session state machine. 20:2 cycle (shortened from the clinical 30:2 for demo pacing):
//   IDLE → COMPRESS (on first PEAK) → BREATHS (at compression 20) → DONE
//                 ↕ STALLED (no compression for 1.5s)
// DONE is terminal — real CPR loops 20:2 until help arrives, but the demo stops after
// one round so it ends on the breath instructions instead of counting forever.
// Pre-CPR setup is handled by the coach page's UI state, not this machine.

export type Phase = "IDLE" | "COMPRESS" | "BREATHS" | "STALLED" | "DONE";

export interface SessionState {
  phase: Phase;
  compressCount: number;   // compressions in current cycle (0 after a breath phase)
  cycleCount: number;      // completed 20-compression cycles
  lastCompressAt: number;  // ms timestamp of last detected compression
  breathStartedAt: number; // ms timestamp BREATHS was entered
}

export function createSessionState(): SessionState {
  return { phase: "IDLE", compressCount: 0, cycleCount: 0, lastCompressAt: 0, breathStartedAt: 0 };
}

const STALL_MS = 1500;
const BREATH_MS = 10000;

export function transition(
  state: SessionState,
  event: "PEAK" | "TICK",
  nowMs: number,
): SessionState {
  if (state.phase === "DONE") return state;

  if (state.phase === "BREATHS") {
    const elapsed = nowMs - state.breathStartedAt;
    // Peaks are ignored on purpose. Leaning over to give breaths moves the shoulders,
    // and treating that as a compression kicked us back to COMPRESS mid-sentence —
    // then those same stray peaks counted to 20 again and replayed the whole prompt.
    // The only ways out are the timer below and the tap (which backdates breathStartedAt).
    if (elapsed > BREATH_MS) {
      return {
        phase: "DONE",
        compressCount: 20,
        cycleCount: state.cycleCount,
        lastCompressAt: nowMs,
        breathStartedAt: 0,
      };
    }
    return state;
  }

  if (event === "PEAK") {
    const count = state.compressCount + 1;
    if (count >= 20) {
      return {
        phase: "BREATHS",
        compressCount: 20,
        cycleCount: state.cycleCount + 1,
        lastCompressAt: nowMs,
        breathStartedAt: nowMs,
      };
    }
    return { ...state, phase: "COMPRESS", compressCount: count, lastCompressAt: nowMs };
  }

  // TICK
  if (state.phase === "COMPRESS" && nowMs - state.lastCompressAt > STALL_MS) {
    return { ...state, phase: "STALLED" };
  }
  return state;
}
