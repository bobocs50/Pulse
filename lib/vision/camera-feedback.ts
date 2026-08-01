// Framing check for the CPR position: phone on the floor, rescuer kneeling over the
// chest. Hips and legs are out of frame almost always — only shoulders, arms and
// hands matter, so nothing here may require the lower body.
import type { Landmark, CameraFeedback } from "@/types/vision";
import { LM } from "./geometry";

// Shoulder separation in normalised frame units — the only usable distance proxy
// when the rest of the body is cropped.
const SPAN_TOO_CLOSE = 0.55;
const SPAN_TOO_FAR   = 0.10;

export function getCameraFeedback(lm: Landmark[]): CameraFeedback {
  if (!lm || lm.length === 0) return { message: "Can't see you — step into view", type: "warning", cue: "cantSeeYou" };

  const vis = (l: Landmark) => (l?.visibility ?? 0) > 0.6;

  const lsh = lm[LM.leftShoulder];
  const rsh = lm[LM.rightShoulder];
  if (!vis(lsh) && !vis(rsh)) return { message: "Can't see you — step into view", type: "warning", cue: "cantSeeYou" };
  if (!vis(lsh) || !vis(rsh)) return { message: "Turn towards the camera", type: "warning", cue: "turnToCamera" };

  const span = Math.hypot(lsh.x - rsh.x, lsh.y - rsh.y);
  if (span > SPAN_TOO_CLOSE) return { message: "Too close — move the phone back", type: "warning", cue: "tooClose" };
  if (span < SPAN_TOO_FAR)   return { message: "Too far — move closer", type: "warning", cue: "tooFar" };

  if (!vis(lm[LM.leftWrist]) && !vis(lm[LM.rightWrist]))
    return { message: "Keep your hands in view", type: "warning", cue: "handsInView" };

  const cx = (lsh.x + rsh.x) / 2;
  if (cx < 0.12 || cx > 0.88) return { message: "Move to the centre", type: "warning", cue: "moveToCentre" };

  return null;
}
