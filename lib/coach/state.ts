// Session state machine. Simple three-phase loop:
//   IDLE → COMPRESS (on first PEAK) → STALLED (no compression for 1.5s) → COMPRESS
// Pre-CPR setup is handled by the coach page's UI state, not this machine.
// 30-compression cycles are counted; the "give 2 breaths" pause is not
// enforced in code — the user gives breaths whenever they want.

export type Phase = "IDLE" | "COMPRESS" | "STALLED";

export interface SessionState {
  phase: Phase;
  compressCount: number;   // compressions in current cycle (resets at 30)
  cycleCount: number;      // completed 30-compression cycles
  lastCompressAt: number;  // ms timestamp of last detected compression
}

export function createSessionState(): SessionState {
  return { phase: "IDLE", compressCount: 0, cycleCount: 0, lastCompressAt: 0 };
}

const STALL_MS = 1500;

export function transition(
  state: SessionState,
  event: "PEAK" | "TICK",
  nowMs: number,
): SessionState {
  if (event === "PEAK") {
    const wrapped = state.compressCount >= 30;
    return {
      phase: "COMPRESS",
      compressCount: wrapped ? 1 : state.compressCount + 1,
      cycleCount: wrapped ? state.cycleCount + 1 : state.cycleCount,
      lastCompressAt: nowMs,
    };
  }
  // TICK
  if (state.phase === "COMPRESS" && nowMs - state.lastCompressAt > STALL_MS) {
    return { ...state, phase: "STALLED" };
  }
  return state;
}
