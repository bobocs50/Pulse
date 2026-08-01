// Stolen from Rehabify — OneEuroFilter smoothing at 30fps
// Params tuned for pose data; beta may need increasing for fast CPR movement
import { OneEuroFilter } from "1eurofilter";
import type { Landmark } from "@/types/vision";

const CFG = { freq: 30, mincutoff: 1.0, beta: 0.02, dcutoff: 1.0 };

export interface FilterState {
  filters: OneEuroFilter[][];
}

export function createFilter(count = 33): FilterState {
  return {
    filters: Array.from({ length: count }, () => [
      new OneEuroFilter(CFG.freq, CFG.mincutoff, CFG.beta, CFG.dcutoff),
      new OneEuroFilter(CFG.freq, CFG.mincutoff, CFG.beta, CFG.dcutoff),
      new OneEuroFilter(CFG.freq, CFG.mincutoff, CFG.beta, CFG.dcutoff),
    ]),
  };
}

export function filterLandmarks(state: FilterState, lm: Landmark[], ts?: number): Landmark[] {
  const t = (ts ?? performance.now()) / 1000;
  return lm.map((p, i) => {
    if (!state.filters[i]) return p;
    return {
      x: state.filters[i][0].filter(p.x, t),
      y: state.filters[i][1].filter(p.y, t),
      z: state.filters[i][2].filter(p.z, t),
      visibility: p.visibility,
    };
  });
}
