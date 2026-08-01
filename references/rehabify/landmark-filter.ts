// SOURCE: github.com/obro79/Rehabify/src/lib/vision/landmark-filter.ts
// OneEuroFilter smoothing for landmarks — steal directly
// Requires: npm i 1eurofilter
// These params are tuned for 30fps pose data — don't change without testing

import { OneEuroFilter } from "1eurofilter";
import type { Landmark } from "@/types/vision";

const LANDMARK_COUNT = 33;

// From OneEuroFilter research: https://gery.casiez.net/1euro/
const CONFIG = {
  freq: 30,        // ~30fps video
  mincutoff: 1.0,  // Lower = less jitter, more lag
  beta: 0.007,     // Higher = more responsive to fast movement
  dcutoff: 1.0,
};

export interface LandmarkFilterState {
  filters: OneEuroFilter[][];
}

export function createLandmarkFilter(): LandmarkFilterState {
  const filters: OneEuroFilter[][] = [];
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    filters[i] = [
      new OneEuroFilter(CONFIG.freq, CONFIG.mincutoff, CONFIG.beta, CONFIG.dcutoff),
      new OneEuroFilter(CONFIG.freq, CONFIG.mincutoff, CONFIG.beta, CONFIG.dcutoff),
      new OneEuroFilter(CONFIG.freq, CONFIG.mincutoff, CONFIG.beta, CONFIG.dcutoff),
    ];
  }
  return { filters };
}

export function filterLandmarks(
  state: LandmarkFilterState,
  landmarks: Landmark[],
  timestamp?: number
): Landmark[] {
  const ts = timestamp ?? performance.now() / 1000;

  return landmarks.map((lm, i) => {
    if (!state.filters[i]) return lm;
    return {
      x: state.filters[i][0].filter(lm.x, ts),
      y: state.filters[i][1].filter(lm.y, ts),
      z: state.filters[i][2].filter(lm.z, ts),
      visibility: lm.visibility, // Don't filter visibility
    };
  });
}
