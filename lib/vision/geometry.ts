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

// 3D angle at vertex b, formed by a–b–c. Returns degrees.
// z included so foreshortened limbs pointing at the camera don't read as bent.
export function angleBetween3D(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x, aby = a.y - b.y, abz = a.z - b.z;
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = c.z - b.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const mag = Math.hypot(abx, aby, abz) * Math.hypot(cbx, cby, cbz);
  if (mag === 0) return 0;
  return Math.acos(clamp(dot / mag, -1, 1)) * (180 / Math.PI);
}
