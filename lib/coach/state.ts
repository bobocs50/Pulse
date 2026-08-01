// State machine for the coaching loop
// TALK → SETUP → COMPRESS(n=1..30) → BREATH_PROMPT → BREATH_WINDOW → CHECK_RISE → COMPRESS
//              ↕ STALLED (no compression 1.5s)

export type Phase =
  | "IDLE"
  | "SETUP"
  | "COMPRESS"
  | "STALLED"
  | "BREATH_PROMPT"
  | "BREATH_WINDOW"
  | "CHECK_RISE";

export interface SessionState {
  phase: Phase;
  compressCount: number;   // compressions in current cycle (resets at 30)
  cycleCount: number;      // how many 30-compression cycles completed
  lastCompressAt: number;  // ms timestamp of last detected compression
  breathWindowStart: number;
}

export function createSessionState(): SessionState {
  return {
    phase: "IDLE",
    compressCount: 0,
    cycleCount: 0,
    lastCompressAt: 0,
    breathWindowStart: 0,
  };
}

const STALL_MS = 1500;
const BREATH_WINDOW_MS = 10000;

// Breath phases (BREATH_PROMPT/BREATH_WINDOW/CHECK_RISE) are wired in Hour 3
// with the audio cues. Until then compressions count in continuous 30-blocks.
export function transition(
  state: SessionState,
  event: "PEAK" | "TICK" | "START" | "SKIP_BREATH",
  nowMs: number,
): SessionState {
  switch (event) {
    case "START":
      return { ...state, phase: "SETUP" };

    case "PEAK": {
      const wrapped = state.compressCount >= 30;
      return {
        ...state,
        phase: "COMPRESS",
        compressCount: wrapped ? 1 : state.compressCount + 1,
        cycleCount: wrapped ? state.cycleCount + 1 : state.cycleCount,
        lastCompressAt: nowMs,
      };
    }

    case "TICK":
      if (state.phase === "COMPRESS" && nowMs - state.lastCompressAt > STALL_MS) {
        return { ...state, phase: "STALLED" };
      }
      return state;

    case "SKIP_BREATH":
      return state;
  }
}
