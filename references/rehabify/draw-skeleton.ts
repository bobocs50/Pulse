// SOURCE: github.com/obro79/Rehabify/src/components/workout/draw-skeleton.ts
//
// BUG IN THEIR CODE (line 8-11): They size the canvas from getBoundingClientRect()
// CSS pixels. DO NOT copy this. Use videoWidth/videoHeight instead.
// Their bug: canvas.width = cssWidth ≠ video pixel width → skeleton misaligns.
// Our fix: canvas.width = video.videoWidth; canvas.height = video.videoHeight
// Also: mirror x on front camera (x = 1 - landmark.x before multiplying by width)
//
// Their skeleton connections are torso+legs only (11-23-25-27, 12-24-26-28).
// For CPR we also need arm chain: shoulder→elbow→wrist (11-13-15 or 12-14-16).

import type { Landmark } from "@/types/vision";
import { POSE_CONNECTIONS, LANDMARKS_TO_SHOW } from "./pose-constants";

export function drawSkeleton(canvas: HTMLCanvasElement, landmarks: Landmark[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // BUG: getBoundingClientRect gives CSS pixels, not video pixels
  // Replace with: canvas.width = video.videoWidth; canvas.height = video.videoHeight
  const { width, height } = canvas.getBoundingClientRect();
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";

  for (const [start, end] of POSE_CONNECTIONS) {
    const from = landmarks[start];
    const to = landmarks[end];
    if (!from || !to) continue;
    ctx.beginPath();
    ctx.moveTo(from.x * canvas.width, from.y * canvas.height);
    ctx.lineTo(to.x * canvas.width, to.y * canvas.height);
    ctx.stroke();
  }

  for (const index of LANDMARKS_TO_SHOW) {
    const landmark = landmarks[index];
    if (!landmark) continue;
    ctx.beginPath();
    ctx.arc(landmark.x * canvas.width, landmark.y * canvas.height, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
