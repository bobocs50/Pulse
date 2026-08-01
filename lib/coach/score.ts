// Live score: rolling window of last 5 compressions
// score = 0.4 * pace + 0.3 * arms + 0.3 * recoil
// Each component 0–1. Result 0–100.
import type { Landmark } from "@/types/vision";
import { LM, angleBetween, nearArm } from "@/lib/vision/geometry";

const BPM_TARGET = 110;
const BPM_WINDOW = [100, 120] as const;
const ELBOW_LOCK_DEG = 160;   // arms straight threshold
const WINDOW = 5;              // rolling window size

export interface CompressionSample {
  bpm: number;
  elbowAngle: number;   // degrees at time of peak
  recoilOk: boolean;    // did shoulder return to baseline?
}

export interface ScoreState {
  samples: CompressionSample[];
  score: number;         // 0–100, last computed
  topIssue: string | null;
}

export function createScoreState(): ScoreState {
  return { samples: [], score: 0, topIssue: null };
}

export function addSample(state: ScoreState, sample: CompressionSample): ScoreState {
  const samples = [...state.samples, sample].slice(-WINDOW);
  return { ...computeScore({ ...state, samples }), samples };
}

function computeScore(state: ScoreState): ScoreState {
  const { samples } = state;
  if (!samples.length) return { ...state, score: 0, topIssue: null };

  const pace = samples.filter(s => s.bpm >= BPM_WINDOW[0] && s.bpm <= BPM_WINDOW[1]).length / samples.length;
  const arms = samples.filter(s => s.elbowAngle >= ELBOW_LOCK_DEG).length / samples.length;
  const recoil = samples.filter(s => s.recoilOk).length / samples.length;

  const score = Math.round((0.4 * pace + 0.3 * arms + 0.3 * recoil) * 100);

  let topIssue: string | null = null;
  if (arms < 0.6)   topIssue = "Straighten your arms";
  else if (pace < 0.6) topIssue = pace < 0.5 ? "A little faster" : "Slow down";
  else if (recoil < 0.6) topIssue = "Let it rise";

  return { ...state, score, topIssue };
}

// Measure elbow angle from current landmarks (call at peak time)
export function measureElbow(lm: Landmark[]): number {
  const { shoulder, elbow, wrist } = nearArm(lm);
  if (!shoulder || !elbow || !wrist) return 180;
  return angleBetween(shoulder, elbow, wrist);
}
