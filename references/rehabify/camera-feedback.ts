// SOURCE: github.com/obro79/Rehabify/src/lib/vision/camera-feedback.ts
// Out-of-frame detection — adapt for side-view CPR setup
// Key changes needed:
//   - Side view: we check shoulder+elbow visibility, not head+hips
//   - Remove knee/ankle checks (patient is on floor, landmarks will be occluded)
//   - Add "turn sideways" check using checkOrientation(landmarks, "side")

import type { Landmark } from "@/types/vision";

export type CameraFeedback = {
  message: string;
  type: "warning" | "info" | "success";
} | null;

export function getCameraFeedback(landmarks: Landmark[]): CameraFeedback {
  if (!landmarks || landmarks.length === 0) {
    return { message: "No person detected", type: "warning" };
  }

  const nose = landmarks[0];
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];

  const isVisible = (lm: Landmark) => (lm.visibility ?? 0) > 0.6;

  let minX = 1, maxX = 0;
  let minY = 1, maxY = 0;
  let hasVisibleLandmarks = false;

  landmarks.forEach(lm => {
    if (isVisible(lm)) {
      hasVisibleLandmarks = true;
      minX = Math.min(minX, lm.x);
      maxX = Math.max(maxX, lm.x);
      minY = Math.min(minY, lm.y);
      maxY = Math.max(maxY, lm.y);
    }
  });

  if (!hasVisibleLandmarks) {
    return { message: "No person detected", type: "warning" };
  }

  const height = maxY - minY;
  const width = maxX - minX;
  const maxDimension = Math.max(height, width);

  const isHeadVisible = isVisible(nose) || (isVisible(leftShoulder) && isVisible(rightShoulder));
  const isLowerBodyVisible = isVisible(leftHip) || isVisible(rightHip);
  const areKneesVisible = isVisible(leftKnee) || isVisible(rightKnee);

  if (isHeadVisible && !isLowerBodyVisible) {
    return { message: "Move back to show body", type: "warning" };
  }

  if (!isLowerBodyVisible) {
    return { message: "Cannot see body", type: "warning" };
  }

  if (!isHeadVisible) {
    return { message: "Cannot see head", type: "warning" };
  }

  if (maxDimension < 0.4) {
    return { message: "Too far, move closer", type: "warning" };
  }

  const margin = 0.02;
  const isTouchingTop = nose && nose.y < margin;
  const isTouchingBottom = (leftAnkle && leftAnkle.y > 1 - margin) || (rightAnkle && rightAnkle.y > 1 - margin);
  const isTouchingLeft = landmarks.some(lm => isVisible(lm) && lm.x < margin);
  const isTouchingRight = landmarks.some(lm => isVisible(lm) && lm.x > 1 - margin);

  if (isTouchingTop) return { message: "Too close to top", type: "warning" };
  if (isTouchingBottom) {
    if (!areKneesVisible) return { message: "Cannot see knees", type: "warning" };
    return { message: "Too close to bottom", type: "warning" };
  }
  if (isTouchingLeft || isTouchingRight) return { message: "Too close to edge", type: "warning" };
  if (height > 0.9) return { message: "Too close, move back", type: "warning" };
  if (!areKneesVisible && height > 0.6) return { message: "Cannot see knees", type: "warning" };

  return null;
}
