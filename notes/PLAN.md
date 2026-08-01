# Build Plan — Hackathon Day

## What needs tuning vs. what's just typing

**Needs tuning (write fast, dial in on phone):**
- Peak detection — `MIN_AMPLITUDE` and refractory window must be tuned with real compressions on real phone. The y-trace plot is the tuning interface. No plot = guessing blind.
- OneEuroFilter beta — their value (0.007) is for slow rehab moves. CPR is faster. Bump if peaks look smeared on the trace.

**Just write it (no tuning needed):**
- State machine (`state.ts`) — pure logic, either transitions or it doesn't
- Score (`score.ts`) — fixed formula, 10 lines
- Audio wiring — engine already written
- Skeleton overlay — steal draw-skeleton.ts, fix canvas sizing bug

---

## Order of work

- [ ] **Skeleton on screen** — steal `references/rehabify/draw-skeleton.ts`, fix canvas bug (use `videoWidth`/`videoHeight` not CSS pixels), mirror x for front camera. ~30 min
- [ ] **Y-trace plot on screen** — draw shoulder-y over time on a canvas strip. Non-optional. ~20 min
- [ ] **Peak detection** — write the local-max + refractory logic in `lib/coach/detect.ts`. ~20 min
- [ ] **Tune on phone** — do real compressions, watch the trace, adjust `MIN_AMPLITUDE` until every pump = one clean peak and nothing else
- [ ] **State machine** (`lib/coach/state.ts`) — vibe-code
- [ ] **Score** (`lib/coach/score.ts`) — vibe-code
- [ ] **Wire audio** — connect peaks to `COUNT_CUES[n]`, corrections to `playCorrection()`
- [ ] **Breath phase** — at count 30, fire phase cues, wait 10s, resume
- [ ] **Generate audio files** — ElevenLabs v3, all cues from `lib/audio/cues.ts`, drop in `public/audio/`
- [ ] **PWA polish** — icons, manifest, wakeLock, vibrate on peak. ~20 min
- [ ] **Two timed pitch run-throughs out loud**

---

## What to steal from references/rehabify

| File | Use | Changes |
|---|---|---|
| `geometry.ts` | `lib/vision/geometry.ts` | Paste as-is |
| `landmark-filter.ts` | `lib/vision/landmark-filter.ts` | Paste as-is |
| `vision-types.ts` | `types/` | Paste as-is |
| `camera-feedback.ts` | `lib/vision/camera-feedback.ts` | Add side-view orientation check |
| `pose-constants.ts` | referenced in worker | Add arm chain lines 11-13-15 |
| `tutorial-carousel.tsx` | onboarding screen | Replace 3 slides with 11 CPR steps |

## What to build from scratch

- Peak detection, BPM calc (`lib/coach/detect.ts`)
- State machine (`lib/coach/state.ts`)
- Score (`lib/coach/score.ts`)
- ElevenLabs audio generation script

---

## Hard checkpoints

- **Skeleton visible on phone** before writing any rep logic
- **Y-trace visible** before tuning peak detection
- **Audio playing** before wiring to peaks
- **If behind at 2:40** — cut breath phase, ship score only
- **If behind at 3:00** — cut ElevenLabs agent intake entirely
