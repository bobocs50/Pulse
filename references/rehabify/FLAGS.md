# Rehabify — Crawl Findings & Flags

## What to steal directly (no changes)
- `geometry.ts` — pure math, angleBetween/distance2D/LANDMARKS map. Paste as-is.
- `landmark-filter.ts` — OneEuroFilter at 30fps, params already tuned. Requires `npm i 1eurofilter`.
- `vision-types.ts` — Landmark, FormError, VisionWorkerMessage interfaces. Clean.
- `camera-feedback.ts` — visibility + bounding-box framing check. Adapt for side-view (see below).
- `pose-constants.ts` — POSE_CONNECTIONS array. Add arm chain lines (11-13-15, 12-14-16).
- `tutorial-carousel.tsx` — onboarding carousel pattern. Replace their 3 slides with our 11 CPR steps.

## What to adapt
- `pose-landmarker.ts` — change `numPoses: 1` → `numPoses: 2` (patient on floor + rescuer)
- `camera-feedback.ts` — add `checkOrientation(landmarks, "side")` check at the top.
  From side view, shoulder width ÷ torso height ratio drops (<0.3). Use that to detect
  if user forgot to turn sideways and prompt "Turn to face the side."
- `draw-skeleton.ts` — has a bug (see below). Don't copy the canvas-sizing lines.
- `use-pose-detection.ts` — move detection into Web Worker (they run on main thread).

---

## Critical flags

### 1. They run MediaPipe on the main thread — we must not
Their `use-pose-detection.ts` calls `landmarker.detectForVideo()` directly in a
`requestAnimationFrame` loop on the main thread. For a rehab app this is fine.
For us it's fatal: main-thread inference at 30fps will jitter the Web Audio scheduler,
and our whole product is a metronome. **Run MediaPipe in a Web Worker, postMessage
landmarks back.** Their `VisionWorkerMessage` types (in vision-types.ts) show they
planned this but never built it.

### 2. Canvas sizing bug in draw-skeleton.ts
```ts
// Their code (BUG):
const { width, height } = canvas.getBoundingClientRect(); // CSS pixels
canvas.width = width;

// Correct:
canvas.width = video.videoWidth;   // actual video pixels
canvas.height = video.videoHeight;
```
CSS pixels ≠ video pixel dimensions, especially on retina displays and when the
canvas is CSS-scaled. Their skeleton probably misaligns on high-DPI screens.
Also: mirror x on rear/front camera. `x_drawn = (1 - landmark.x) * canvas.width`
for front camera mirroring.

### 3. They use requestAnimationFrame — we should use requestVideoFrameCallback
`rVFC` fires once per decoded video frame, not per display refresh. Prevents burning
GPU on duplicate frames when camera runs at 30fps but display is 60/120fps.
Falls back to `rAF` if not supported (Firefox).

### 4. Camera facing mode
Their `useCamera` hook uses `facingMode: "user"` (front/selfie camera).
CPR from the side with phone on the ground → user needs to point the rear camera.
Use `facingMode: "environment"` or let user toggle. Test on actual phone.

### 5. Monotonically increasing timestamp — required by MediaPipe
```ts
// Their solution (steal this):
const timestamp = Math.max(now, lastTimestampRef.current + 1);
lastTimestampRef.current = timestamp;
```
If you pass the same timestamp twice, MediaPipe throws. This pattern prevents it.

### 6. OneEuroFilter adds latency — tune for CPR
Their params (beta: 0.007) are tuned for slow rehab movements.
CPR compressions are faster (~110 BPM = ~550ms cycle). May need higher beta
(more responsive to fast movement) to avoid filtering out the actual peak.
Test with the y-trace plot on screen (the plot is your tuning interface).

### 7. No worker implemented despite having the types
`VisionWorkerMessage` and `VisionWorkerCommand` in vision.ts prove they planned a
worker architecture but shipped without it. We start with the worker from day one.

### 8. Their dep `1eurofilter` — confirm it works in a Web Worker context
Workers don't have DOM access but OneEuroFilter is pure math, should be fine.
Verify the import doesn't pull anything browser-only.

### 9. Package versions (from their package.json)
- `@mediapipe/tasks-vision`: `^0.10.14` — pin this exact version
- `1eurofilter`: `^1.2.2`
- `next`: `16.1.3` (they're on Next 16, we scaffold with `create-next-app` latest)
- `framer-motion`: `^12.28.1` — don't install, we don't need animation lib
- `zustand`: `^5.0.0` — don't install, our state is useRef + minimal useState
- `lucide-react`: `^0.460.0` — ok if we need icons

### 10. checkOrientation() is already in geometry.ts
Rehabify's `checkOrientation(landmarks, "side")` checks if shoulder-width/torso-height
ratio is low enough to confirm side view. Use this in camera-feedback.ts to prompt
"Turn to face the side" before the coaching loop starts.
Threshold: ratio > 0.6 means they're facing the camera (warning), ratio ≤ 0.6 is side-on.

---

## What they don't have that we need
- Web Worker for pose inference (they planned it, never built it)
- Web Audio scheduler / metronome
- Peak detection on shoulder-y
- BPM calculation
- State machine (COMPRESS → BREATH → COMPRESS)
- Score computation
- Pre-rendered audio cue playback
- PWA manifest / home screen install
- `requestVideoFrameCallback` loop
