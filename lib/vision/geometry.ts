// Stolen from Rehabify — pure math, no changes needed
import type { Landmark } from "@/types/vision";

export const LM = {
  nose: 0,
  leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13,    rightElbow: 14,
  leftWrist: 15,    rightWrist: 16,
  leftHip: 23,      rightHip: 24,
  leftKnee: 25,     rightKnee: 26,
  leftAnkle: 27,    rightAnkle: 28,
} as const;

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function distance2D(a: Landmark, b: Landmark) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: (a.visibility + b.visibility) / 2,
  };
}

// Angle at vertex b, formed by points a–b–c. Returns degrees.
export function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.sqrt(abx ** 2 + aby ** 2) * Math.sqrt(cbx ** 2 + cby ** 2);
  if (mag === 0) return 0;
  return Math.acos(clamp(dot / mag, -1, 1)) * (180 / Math.PI);
}

// 3D variant — uses z so foreshortened limbs (pointing at the camera) don't
// read as bent the way the 2D projection does.
export function angleBetween3D(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x, aby = a.y - b.y, abz = a.z - b.z;
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = c.z - b.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const mag = Math.hypot(abx, aby, abz) * Math.hypot(cbx, cby, cbz);
  if (mag === 0) return 0;
  return Math.acos(clamp(dot / mag, -1, 1)) * (180 / Math.PI);
}

export function averageVisibility(lm: Landmark[], indices: number[]) {
  return indices.reduce((s, i) => s + (lm[i]?.visibility ?? 0), 0) / indices.length;
}

// Returns true if shoulder-width/torso-height ratio indicates side view
export function isSideView(lm: Landmark[]): boolean {
  const sw = distance2D(lm[LM.leftShoulder], lm[LM.rightShoulder]);
  const mid_sh = midpoint(lm[LM.leftShoulder], lm[LM.rightShoulder]);
  const mid_hip = midpoint(lm[LM.leftHip], lm[LM.rightHip]);
  const th = distance2D(mid_sh, mid_hip) || 1;
  return sw / th < 0.6;
}

// Pick the near arm (the one the camera can see better) by elbow visibility
export function nearArm(lm: Landmark[]): { shoulder: Landmark; elbow: Landmark; wrist: Landmark } {
  const useLeft = (lm[LM.leftElbow]?.visibility ?? 0) >= (lm[LM.rightElbow]?.visibility ?? 0);
  return useLeft
    ? { shoulder: lm[LM.leftShoulder], elbow: lm[LM.leftElbow], wrist: lm[LM.leftWrist] }
    : { shoulder: lm[LM.rightShoulder], elbow: lm[LM.rightElbow], wrist: lm[LM.rightWrist] };
}
