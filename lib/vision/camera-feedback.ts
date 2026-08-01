// Adapted from Rehabify camera-feedback.ts
// Front-view checks: demo position faces the camera (standing at a table)
import type { Landmark, CameraFeedback } from "@/types/vision";
import { LM } from "./geometry";

export function getCameraFeedback(lm: Landmark[]): CameraFeedback {
  if (!lm || lm.length === 0) return { message: "No person detected", type: "warning" };

  const vis = (l: Landmark) => (l?.visibility ?? 0) > 0.6;

  let minX = 1, maxX = 0, minY = 1, maxY = 0, hasAny = false;
  lm.forEach(l => {
    if (vis(l)) {
      hasAny = true;
      minX = Math.min(minX, l.x); maxX = Math.max(maxX, l.x);
      minY = Math.min(minY, l.y); maxY = Math.max(maxY, l.y);
    }
  });
  if (!hasAny) return { message: "No person detected", type: "warning" };

  const h = maxY - minY, w = maxX - minX;
  const maxDim = Math.max(h, w);

  const headOk = vis(lm[LM.nose]) || (vis(lm[LM.leftShoulder]) && vis(lm[LM.rightShoulder]));
  const hipsOk = vis(lm[LM.leftHip]) || vis(lm[LM.rightHip]);

  if (headOk && !hipsOk) return { message: "Move back — can't see body", type: "warning" };
  if (!hipsOk)           return { message: "Can't see body", type: "warning" };
  if (!headOk)           return { message: "Can't see head", type: "warning" };
  if (maxDim < 0.35)     return { message: "Too far — move closer", type: "warning" };

  const m = 0.02;
  if (lm[LM.nose]?.y < m)  return { message: "Too close to top", type: "warning" };
  if (h > 0.9)              return { message: "Too close — move back", type: "warning" };
  if (lm.some(l => vis(l) && l.x < m)) return { message: "Too close to edge", type: "warning" };
  if (lm.some(l => vis(l) && l.x > 1 - m)) return { message: "Too close to edge", type: "warning" };

  // Front view: shoulders square to the camera, hands trackable, roughly centred
  const lsh = lm[LM.leftShoulder];
  const rsh = lm[LM.rightShoulder];
  if (!vis(lsh) || !vis(rsh)) return { message: "Face the camera", type: "warning" };
  if (!vis(lm[LM.leftWrist]) && !vis(lm[LM.rightWrist]))
    return { message: "Keep your hands in view", type: "warning" };
  const cx = (lsh.x + rsh.x) / 2;
  if (cx < 0.2 || cx > 0.8) return { message: "Step to the centre", type: "warning" };

  return null;
}
