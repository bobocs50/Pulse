# CLAUDE.md — Agent instructions for this repo

You are helping ship a CPR-coach PWA for a 4-hour hackathon on 2026-08-01.
Read `notes/ARCHITECTURE.md` before writing code. `notes/PRODUCT.md` has the full spec.
`mygoals.md` has the simplified product vision.

## Prime directive
Ship the demo. Not the framework. Not the abstraction. If a shortcut works for 90 seconds
on stage without lying to a judge, take the shortcut.

## Rules of engagement
1. **Do not touch React state from the 30fps loop.** Landmarks, y-trace, peaks, audio clock → `useRef`. Only score/count/BPM → `useState`, throttled to ~10fps. Violating this jitters the metronome.
2. **Pre-render every voice cue.** No live TTS during the demo. Play from `public/audio/` with the Web Audio scheduler.
3. **Never claim absolute compression depth in cm.** Talk about it relative to the user's own compressions only.
4. **API keys stay server-side.** No `NEXT_PUBLIC_*` for anything sensitive.
5. **Never cut:** count, metronome, live score, one form correction, live overlay, y-trace plot.
6. **The y-trace plot is not optional.** Tuning peak detection blind wastes 40 minutes.
7. **MediaPipe runs in a Web Worker.** Main-thread inference jitters Web Audio. Worker is at `lib/pose/worker.ts`.

## Style
- No new abstractions. Three similar lines is better than a helper.
- No comments explaining WHAT. Only WHY, and only if non-obvious.
- No new dependencies without asking.
- No documentation files unless asked.
- No mock data. If it's not built, say so.

## Verify before recommending
Grep or read to confirm a function/file exists before telling the user to use it.

## When to ask vs. proceed
- Reversible local edit → proceed.
- Adding a dependency, changing the state machine, changing audio priority, deleting from "Never cut" list → ask.
- Deploy, push, commit → ask.

---

## Codebase map

```
app/
  page.tsx              Ready screen — Start button → /coach
  coach/page.tsx        Coaching screen — camera + skeleton + score + y-trace
  api/placement/route.ts  VLM stub (returns "unclear")

lib/
  pose/
    worker.ts           MediaPipe Web Worker — detectForVideo, postMessage landmarks
    usePose.ts          Hook: spawns worker, returns landmarksRef (useRef, NOT useState)
    useCamera.ts        Hook: getUserMedia, facingMode "environment" (rear camera)
  vision/
    geometry.ts         Pure math — angleBetween, nearArm, isSideView, LM indices
    landmark-filter.ts  OneEuroFilter smoothing (beta=0.02 — may need higher for CPR speed)
    camera-feedback.ts  Out-of-frame + side-view check → CameraFeedback | null
  audio/
    engine.ts           AudioContext, loadBuffer, playNow, playCorrection, metronome scheduler
    cues.ts             CUE map: cue name → /audio/*.mp3 path + COUNT_CUES array
  coach/
    detect.ts           Peak detection stub — shoulderY(), detectPeak() → bool
    state.ts            State machine stub — Phase enum, SessionState, transition()
    score.ts            Score computation — addSample(), measureElbow(), topIssue

types/
  vision.ts             Landmark, FormError, WorkerInMessage, WorkerOutMessage, CameraFeedback

public/
  audio/                Pre-rendered ElevenLabs v3 mp3 files (render before hackathon)
  manifest.json         PWA manifest
  icon-192.png          } Generate these — required for home screen install
  icon-512.png          }
  apple-touch-icon.png  }
```

## Key constants (don't change without testing)
- BPM: 110
- Elbow lock threshold: 160°
- Refractory: 350ms between peaks
- Min amplitude: 0.01 (tune via y-trace)
- Score window: last 5 compressions
- Stall timeout: 1500ms
- Correction gap: 5 compressions minimum

## What's a stub (wire up tomorrow in this order)
1. `lib/coach/detect.ts` → `detectPeak()` — this unlocks everything
2. `lib/audio/engine.ts` → `startMetronome()` already wired; `playNow(COUNT_CUES[n])` on peak
3. `lib/coach/score.ts` → `addSample()` on peak, wire `score` + `topIssue` to UI state
4. `lib/coach/state.ts` → `transition()` for COMPRESS → BREATH_PROMPT at count 30
5. `app/coach/page.tsx` → replace placeholder arm color with `elbowAngle >= 160` from score

## Reference files (from Rehabify — the winning hackathon project)
Source: https://github.com/obro79/Rehabify
`references/rehabify/FLAGS.md` — READ THIS FIRST before touching any vision code.

Key bugs to avoid (documented in FLAGS.md):
- Canvas sizing: use `video.videoWidth/videoHeight`, NOT `getBoundingClientRect()` (done correctly in coach/page.tsx)
- Worker: MediaPipe on main thread jitters audio (we run in worker — already done)
- Camera: `facingMode: "environment"` not "user" (already done in useCamera.ts)
- Timestamp: monotonically increasing required by MediaPipe (done in worker.ts)
- OneEuroFilter `beta`: Rehabify uses 0.007 (tuned for slow rehab). CPR is faster — using 0.02; test on phone.

## Dev workflow
```bash
npm run dev
# On phone: use cloudflared or ngrok for HTTPS (getUserMedia requires it)
npx cloudflared tunnel --url http://localhost:3000
```

Remote debug: Mac Safari → Develop → [your iPhone] → inspect

Test from home-screen icon (separate permission context from Safari — camera permissions do NOT carry over).

## iOS PWA gotchas
- `AudioContext` must be resumed on EVERY user gesture path, not just the first
- After agent mic release, call `ensureRunning()` before metronome starts
- Camera + mic permissions do not carry over from Safari to home-screen PWA
- `getUserMedia` requires HTTPS — use tunnel for dev

## Audio priority ladder
1. Phase instructions — interrupt everything
2. Metronome click — continuous baseline
3. Spoken count — on detected peak
4. Form correction — only between two numbers, one every 5 compressions max, never stack
