// SOURCE: github.com/obro79/Rehabify/src/components/workout/pose-constants.ts
// Skeleton connections and visible landmark indices
// They only draw torso+legs. For CPR add arm chain (11-13-15, 12-14-16).

export const POSE_CONNECTIONS: Array<[number, number]> = [
  // Left side
  [11, 23], // left shoulder to left hip
  [23, 25], // left hip to left knee
  [25, 27], // left knee to left ankle
  // Right side
  [12, 24], // right shoulder to right hip
  [24, 26], // right hip to right knee
  [26, 28], // right knee to right ankle
  // Arms (not in Rehabify — add for CPR)
  // [11, 13], [13, 15], // left arm chain
  // [12, 14], [14, 16], // right arm chain
];

export const LANDMARKS_TO_SHOW = [11, 23, 25, 27, 12, 24, 26, 28];
