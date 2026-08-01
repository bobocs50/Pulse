# Front-view compression detection — design

Date: 2026-08-01
Status: approved (approach A + dual y-trace)

## Context

The demo position changed: the rescuer stands at a table, facing the phone's **front camera**,
full body in frame, compressing a pillow/mannequin at waist height. The screen stays visible
to the rescuer.

Counting has never worked because `detectPeak()` in `lib/coach/detect.ts` is a stub that
always returns `false` — not because of the video architecture. The worker pipeline,
landmark refs, y-trace, and audio design are position-agnostic and stay unchanged.
This design retargets the **signal layer** for the front view and implements real detection.

## 1. Compression signal — `lib/coach/detect.ts`

- New `midWristY(lm)`: average of LM 15/16 y where visibility ≥ 0.5.
  - One wrist bad → use the other alone.
  - Both bad → fall back to existing `shoulderY(lm)`.
  - Fallback is per-frame and automatic.
- Rationale: from the front, the clasped hands are the compression stroke — the
  highest-amplitude vertical signal available.
- `DetectState` holds two ring buffers (wrist trace + shoulder trace, ~5 s) so the
  plot can draw both during tuning. Detection consumes only the active signal.

## 2. Peak detection — same file

MediaPipe y increases downward; the bottom of a compression is a local **max**.

- Turning-point detector: track the running max since the last valley; when y has
  decreased (hands rising) by ≥ `MIN_AMPLITUDE` from that max AND ≥ `REFRACTORY_MS`
  since the last accepted peak → accept peak, reset running max.
- Constants unchanged: `REFRACTORY_MS = 350`, `MIN_AMPLITUDE = 0.01` (starting point;
  tuned live on the y-trace with real compressions — the plot is the tuning interface).
- Each accepted peak is recorded so the y-trace can mark it (dot).
- BPM = 60 / mean inter-peak interval over last 3 peaks.

## 3. Count wiring + minimal state — `lib/coach/state.ts`, `app/coach/page.tsx`

- 30 fps loop calls `detectPeak()` off `landmarksRef` each frame (refs only, per the
  one architectural rule).
- On peak: `transition(state, "PEAK", now)` + `navigator.vibrate()`.
- `transition()` minimal real implementation:
  - First PEAK (from SETUP/IDLE) → COMPRESS.
  - PEAK in COMPRESS → `compressCount++`; at 30 → wrap to 1, `cycleCount++`
    (breath phases remain stubbed — Hour 3 scope with audio, unchanged).
  - TICK with no peak for 1500 ms → STALLED; next PEAK → COMPRESS.
- Count/BPM → `useState` on peak (~2 Hz, within the state-update rules).
- Score stays Hour 3.

## 4. Camera + overlay

- Default camera flips to front (`"user"`); flip button retained.
- `lib/vision/camera-feedback.ts`: remove the side-view prompt; add front-view checks —
  shoulders + wrists visible, shoulder-midpoint x within 0.2–0.8. Keep out-of-frame check.
- Skeleton layers unchanged. Dashed reference line stays through the wrists.
- Elbow-angle arm coloring stays but must be validated on the phone (foreshortened from
  the front). If it flickers, swapping the form signal is a contained change to one function.
- Y-trace: wrist line (green, primary) + shoulder line (dim), peak dots on accepted peaks.

## 5. Screen layout — guidance UI (layout "A1", user-selected via mockups)

The coach screen changes from full-bleed camera to a vertical stack (portrait):

1. **Instruction banner** (top, fixed): phase-driven guidance, always readable,
   never overlapping video. `STEP n · <title>` plus a one-line hint. Copy per phase:
   - SETUP/IDLE: "Get ready — Stand over the pillow, clasp hands, lock elbows"
   - COMPRESS: "Push hard & fast — follow the beat"
   - STALLED: "Keep going — don't stop compressions"
   (breath-phase copy added in Hour 3 with those phases)
2. **Camera card**: video + skeleton canvas in a contained rounded card
   (`object-contain`, both mirrored on front camera). Count badge overlaid
   top-left of the card ("12 / 30", green). Flip-camera as a small icon button
   top-right of the card. Camera-feedback messages appear as a toast over this card.
3. **Chip row** (slim): `score` and `bpm` pills. (Score chip replaces the old
   huge center score at the user's direction; can be enlarged later if the demo
   needs it.)
4. **Y-trace strip** (bottom): unchanged role — dual-line wrist + shoulder, peak dots.

Mockups saved under `.superpowers/brainstorm/74203-1785579360/content/` (gitignored).

## Error handling

- Wrist occlusion → automatic per-frame fallback to shoulder signal.
- No person / worker failure → existing "No person detected" feedback path.

## Acceptance test (on phone, real pillow compressions)

- 10 compressions → count reads exactly 10, zero double counts.
- Peak dots align with pumps on the y-trace.
- BPM within ±10 of the actual tempo (count against a stopwatch).
- Stall: stopping for 1.5 s flags STALLED; resuming resumes the count.

## Out of scope

- Breath phases, audio cues, score wiring (Hours 2–3 of PLAN.md, order unchanged).
- Any absolute depth claims (never — per CLAUDE.md).
