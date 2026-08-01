# Build Plan — Hour by Hour

Total: 4 hours. Pitch starts at 3:45. Hard stop.

---

## Hour 1 (0:00–1:00) — Vision foundation

**Goal: skeleton visible and aligned on the phone. Y-trace drawing. MediaPipe confirmed in worker.**

### 0:00–0:20 — Scaffold check + deploy
- [ ] Confirm tunnel is up (`npx cloudflared tunnel --url http://localhost:3000`)
- [ ] Open tunnel URL on phone, remote debug connected (Mac Safari → Develop → iPhone)
- [ ] Verify `getUserMedia` shows camera feed on phone
- [ ] Verify MediaPipe worker logs 33 landmarks on phone
- [ ] Verify `visibility` is populated (not just x/y/z — Android SDK bug, web should be fine)
- [ ] Verify decoded `AudioBuffer` plays on button tap
- [ ] Add to home screen, launch from icon, confirm camera works in standalone context

### 0:20–0:50 — Skeleton overlay
- [ ] Canvas sized from `videoWidth`/`videoHeight` (not CSS pixels — common bug)
- [ ] Mirror x for front camera if needed
- [ ] Layer 1: dim full skeleton (white, 22% opacity) — DrawingUtils from MediaPipe
- [ ] Layer 2: thick arm chain (shoulder → elbow → wrist), green if angle ≥ 160°, red if bent
- [ ] Layer 3: dashed vertical reference line
- [ ] Near arm: compare `visibility` on LM 13 vs 14, use the higher one
- [ ] Two poses: `numPoses: 2`, select the more vertical pose (rescuer, not patient)
- [ ] Skeleton sitting correctly on your body before writing any rep logic

### 0:50–1:00 — Y-trace plot
- [ ] Canvas strip drawing shoulder-y over time (ring buffer, last ~5s)
- [ ] Drawn on coaching screen — small strip, below or overlaid
- [ ] Non-optional. Tuning peak detection blind costs 40 minutes.

---

## Hour 2 (1:00–2:00) — Detection + audio

**Goal: peaks detected, metronome running, spoken count playing.**

### 1:00–1:30 — Peak detection
- [ ] `lib/coach/detect.ts` → `shoulderY()` returns filtered landmark 11 y
- [ ] `detectPeak()` → local max + refractory (350ms) + min amplitude (0.01 start)
- [ ] **Tune on phone: do real compressions, watch y-trace, adjust `MIN_AMPLITUDE` until every pump = one clean peak and nothing else**
- [ ] Mark peaks on the y-trace as visual confirmation
- [ ] BPM: 60 / inter-peak interval, smoothed over last 3 peaks
- [ ] Stall: no compression for 1500ms → `isStalled = true`

### 1:30–2:00 — Audio engine + metronome
- [ ] `lib/audio/engine.ts` → `loadBuffer()` preloads all MP3s on app start
- [ ] Web Audio lookahead scheduler — 110 BPM metronome click running
- [ ] `playNow(COUNT_CUES[n])` on each metronome beat (driven by scheduler, not peaks)
- [ ] `playCorrection(cue)` — queued for the gap between two beats, never over a count
- [ ] `ensureRunning()` called before metronome starts (AudioContext resumes after mic release on iOS)
- [ ] Confirm metronome audible on phone at demo volume — this is the whole product

---

## Hour 3 (2:00–3:00) — State machine + score + UI

**Goal: full CPR loop working. Score updating. One correction firing.**

### 2:00–2:20 — State machine
- [ ] `lib/coach/state.ts` → `Phase` enum: TALK, SETUP, COMPRESS, BREATH_PROMPT, BREATH_WINDOW, CHECK_RISE, STALLED, SWAP_PROMPT, AED, DONE
- [ ] `transition()` logic:
  - COMPRESS → BREATH_PROMPT at count 30
  - BREATH_WINDOW → CHECK_RISE after 10s
  - CHECK_RISE → COMPRESS (count resets to 1)
  - COMPRESS → STALLED after 1500ms no peak
  - STALLED → COMPRESS on next peak
  - SWAP_PROMPT fires once after 5 cycles (~2 min), non-blocking
- [ ] Wire phase cues to state transitions (pre-rendered audio)

### 2:20–2:40 — Score
- [ ] `lib/coach/score.ts` → `addSample()` on each peak
- [ ] `score = 0.4 × pace + 0.3 × arms + 0.3 × release` rolling window of last 5
- [ ] `topIssue()` → highest-priority failing component string
- [ ] Wire `score` + `topIssue` to `useState` (throttled to ~10fps, not raw 30fps)

### 2:40–3:00 — UI wiring + form correction
- [ ] Score displayed huge, colour-graded (red/yellow/green) — largest element on screen
- [ ] Caption under score: `topIssue` string or "Good. Keep that pace."
- [ ] Arm chain colour from real `elbowAngle >= 160` (not placeholder)
- [ ] One correction cue wired: fire `playCorrection()` every 5 compressions for `topIssue`
- [ ] BPM bar showing 100–120 window
- [ ] Haptics: `navigator.vibrate()` on each detected peak

---

## Hour 3:00–3:25 — AED screen + VLM + demo mode

**Goal: AED guidance screen. Hand placement check. Insurance recorded.**

### 3:00–3:10 — VLM hand placement check
- [ ] At compression 3: `canvas.toBlob()` → 512px JPEG, quality 0.6
- [ ] POST to `/api/placement` — wire OpenAI vision call server-side
- [ ] Response: `correct | too_high | too_low | unclear`
- [ ] `too_low` → `playCorrection("move-hands-centre")`
- [ ] `unclear` → silence

### 3:10–3:20 — AED transition screen
- [ ] "AED has arrived" button on coaching screen
- [ ] Stops metronome and count immediately
- [ ] Plays: "Stop compressions. The AED will take over — follow its instructions."
- [ ] Screen shows: "Follow the AED voice instructions."
- [ ] "Resume CPR" button → COMPRESS phase restarts instantly

### 3:20–3:25 — Demo mode (insurance)
- [ ] Record a clean landmark JSON stream (good take, good score) → save to `public/demo-landmarks.json`
- [ ] Toggle in dev UI: "Demo mode" → replays recorded landmarks instead of live camera
- [ ] 5 minutes of work. Survives every lighting, permission, and thermal failure on stage.

---

## Hour 3:25–3:45 — Intake agent + PWA polish

**Only if ahead of schedule. Cut intake agent first if behind.**

### 3:25–3:35 — ElevenLabs intake agent (cut if behind)
- [ ] `@elevenlabs/react` ConversationProvider on Talk screen
- [ ] `connectionType: "websocket"` (not WebRTC — known LiveKit handshake issue)
- [ ] System prompt: dispatcher register, max 2 sentences/turn, confirm 112, scope stops
- [ ] `useConversationClientTool("start_compressions")` → `endSession()` → `ensureRunning()` → setPhase("SETUP")
- [ ] Tool declared in ElevenLabs dashboard (must match client-side declaration)
- [ ] Tap-to-skip always visible (mic permission may fail in home-screen PWA)

### 3:35–3:45 — PWA polish
- [ ] `manifest.json`: `display: standalone`, theme color, icon paths
- [ ] 192px and 512px icons, apple-touch-icon 180×180
- [ ] `viewport-fit=cover`, `env(safe-area-inset-*)` padding
- [ ] `overscroll-behavior: none`, `-webkit-touch-callout: none`, `user-select: none`, `touch-action: manipulation`
- [ ] `navigator.wakeLock` for coaching session
- [ ] Add to home screen fresh, launch from icon, camera confirmed

---

## Hour 3:45–4:00 — Pitch

- [ ] Two timed run-throughs out loud with a stopwatch
- [ ] Do it wrong first (bent arms, slow) — score climbs when you fix it — that's the money shot
- [ ] Hit 30, breath phase, proves it's a coach not a rep counter
- [ ] Do Not Disturb on, brightness up, charged, own adapter

---

## Hard checkpoints

| Time | Must have | If not → cut |
|---|---|---|
| 1:00 | Skeleton on phone | Debug canvas sizing before writing any rep logic |
| 1:30 | Y-trace visible + peaks detected | Do not tune blind |
| 2:00 | Metronome audible on phone | Entire product depends on this |
| 2:40 | Score updating on screen | Cut breath phase, ship score only |
| 3:00 | Demo mode recorded | Do this before anything else in hour 3 |
| 3:25 | AED screen done | Cut intake agent completely |
| 3:45 | Pitch starts | Stop building |

---

## Cut list (in order)

1. Fatigue detection
2. ElevenLabs intake agent
3. Breath phase (cut if audio not done by 2:40)
4. AED screen
5. Score card down to one headline number (cut subscores)
6. Shoulders-stacked correction
7. Post-session debrief

**Never cut:**
- Spoken count
- Metronome
- Live score
- One form correction
- Skeleton overlay
- Y-trace
- Breath phase (cut score card before this)
- Demo mode

---

## What needs tuning vs. what's just typing

**Needs tuning — write fast, dial in on real phone with real compressions:**
- `MIN_AMPLITUDE` in `detect.ts` — start at 0.01, adjust on the y-trace until every pump = one peak
- OneEuroFilter `beta` — using 0.02 (faster than Rehabify's 0.007 for CPR speed). Bump if peaks look smeared.

**Just write it — no tuning required:**
- State machine (`state.ts`) — pure logic
- Score formula (`score.ts`) — 10 lines
- Audio wiring — engine already scaffolded
- AED screen — static image + audio sequence
