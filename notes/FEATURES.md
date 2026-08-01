# CPR Coach — Full Feature Spec

## Screen 1: Ready Screen
- Single large "Start" button, launched from home screen icon (standalone PWA)
- Scenario picker defaulting to Tier 1 (adult, hands-only)
- "Prop your phone so it can see you and the person" instruction
- No setup visible on open — zero friction to demo

---

## Screen 2: Intake Agent (TALK phase)
Voice agent (ElevenLabs Agents) — mic open, camera off.

**What the agent does:**
- Greets in two calm sentences, dispatcher register — flat intonation, no rising ends, no enthusiasm
- Asks: "Are they responsive? Tap their shoulders, shout their name."
- Asks: "Are they breathing normally?"
- Confirms 112 has been called — never skips this, every time
- Scope stops immediately if: child, infant, drowning, choking, trauma, unclear situation
  → "Stay on the line with the dispatcher. I can't help with this." — stops coaching
- For adult, not breathing: walks rescuer into kneeling position beside the chest
- Instructs hand placement verbally: "Heel of your hand on the centre of the chest, two fingers above the bottom of the breastbone. Second hand on top, fingers interlaced."
- Instructs arm position: "Lock your arms straight, shoulders above your hands."
- Instructs phone placement: "Prop your phone so the camera can see you from the side."
- Calls `start_compressions` tool when rescuer is in position → handoff

**Handoff mechanism:**
```
agent calls start_compressions tool
→ endSession() releases the mic
→ AudioContext resumed (iOS requires this after mic release)
→ phase transitions to SETUP
→ camera loop starts
→ metronome begins
```

**Agent constraints:**
- Max two sentences per turn
- Imperative phrasing, no wrong/bad/error language
- No exclamation marks
- Never diagnose or speculate about the patient
- Default to hands-only protocol
- Skippable: tap-to-skip button always visible (mic permission may fail in home-screen PWA)

---

## Screen 3: Coaching Screen (COMPRESS / BREATH phases)

### Camera + Skeleton Overlay
- Rear camera (`facingMode: "environment"`) via `getUserMedia`
- MediaPipe PoseLandmarker lite model in a Web Worker (off main thread — required, else audio jitters)
- `requestVideoFrameCallback` for the capture loop (fires per decoded frame, not per rAF — no wasted GPU)
- Canvas overlay on the video feed, sized from `videoWidth`/`videoHeight` (not CSS pixels — this is a known bug)
- Three rendering layers:
  1. Full dim skeleton (white, 22% opacity) — proof the vision is working
  2. Thick colour-coded arm chain (shoulder → elbow → wrist): green if elbow ≥ 160°, red if bent
  3. Dashed vertical reference line showing where the arm should be
- Near arm selected by comparing `visibility` on landmarks 13 and 14 (elbows)
- If two poses in frame (rescuer + patient on floor): `numPoses: 2`, pick the more vertical pose

### Y-Trace Plot
- Real-time strip chart of shoulder-y displacement over time
- Drawn on a canvas strip below or overlaid on the coaching screen
- Required for tuning peak detection — do not cut this
- Peaks marked as they are detected

### Out-of-Frame Detection
- Checks landmark visibility scores each frame
- If rescuer drops below threshold: immediately plays "I can't see you — move the phone back" from local audio
- No agent latency — pre-rendered local file

### VLM Hand Placement Check
- At compression 3: grab a still frame from the canvas (512px JPEG, quality 0.6)
- POST to `/api/placement` (server-side OpenAI key, never `NEXT_PUBLIC_*`)
- Response: `{ "placement": "correct" | "too_high" | "too_low" | "unclear" }`
- `too_low` → plays "Move your hands to the centre of the chest"
- `unclear` → silence (wrong confident answer is worse than none)
- Async and non-blocking — resolves by compression 6, does not interrupt the count

### Metronome
- 110 BPM click, continuous, plays from pre-decoded local AudioBuffer
- Web Audio lookahead scheduler (sample-accurate — not `setInterval`)
- AudioContext resumed on every user gesture path (iOS suspends it after mic release and tab hide)
- Metronome leads the rescuer; detection follows to score and catch stalls
- Never driven by detected peaks (reactive counting jitters and endorses wrong pace)

### Spoken Count
- Pre-rendered ElevenLabs v3 MP3s: "one" through "thirty", each clipped tight to fit a 545ms slot at 110 BPM
- Played from the metronome scheduler on each beat, not on detected peaks
- Phase offset between their peaks and the metronome tick = too-fast / too-slow signal (free)

### Peak Detection (compression detection)
- Input: shoulder-y from OneEuroFilter-smoothed landmarks (beta=0.02 for CPR speed, not Rehabify's 0.007)
- Local maximum detection on smoothed shoulder-y
- 350ms refractory window between peaks (prevents double-counting)
- Minimum amplitude: 0.01 (tune with real compressions on real phone via y-trace)
- Stall: no compression for 1500ms → plays "Keep going, stay with me"

### Live Quality Score
- Updates every compression, rolling window of last 5 (not lifetime average)
- Formula: `score = 0.4 × pace + 0.3 × arms + 0.3 × release`
- Displayed huge, colour-graded (red → yellow → green)
- Single caption underneath: highest-priority failing component
  - "Straighten your arms." / "Slow down." / "A little faster." / "Let the chest come all the way up."
  - When all pass: "Good. Keep that pace." then silence
- Never stacks two corrections; silence = everything is fine

### Form Corrections (voice)
- Pre-rendered ElevenLabs v3 MP3s, played from local files
- Available cues: "Straighten your arms." / "Shoulders over your hands." / "Push harder." / "Let the chest come all the way up." / "Slow down." / "A little faster."
- Correction slot every 5 compressions minimum
- Only the single highest-priority active violation fires
- Played only in the gap between two metronome beats — never over a count cue
- Never stacked — silence between corrections reads as "you're doing fine"

### BPM Display
- Rate bar showing the 100–120 BPM target window
- Current BPM: 60 / inter-peak interval, smoothed over last 3 peaks

### Haptics
- `navigator.vibrate()` on every detected compression peak
- Functional (confirms detection) and feels native

### Wake Lock
- `navigator.wakeLock` held for the coaching session — screen never dims during demo

### State Machine
```
TALK → SETUP → COMPRESS(n=1..30) → BREATH_PROMPT → BREATH_WINDOW(10s) → CHECK_RISE → COMPRESS
                     ↕ STALLED (no compression for 1500ms)
after 5 cycles (~2 min) → SWAP_PROMPT (fires once, non-blocking)
```
- Hands-only mode: skips BREATH_PROMPT → CHECK_RISE, counts in 30-blocks continuously
- Stall: plays "Keep going, stay with me", resumes COMPRESS
- Swap prompt: "Swap with someone if you can" — plays once, does not interrupt count

### Breath Phase (at count 30)
- Plays: "Stop compressions."
- Plays: "Tilt the head back. Pinch the nose."
- Plays: "Two breaths."
- Plays: "Watch for the chest to rise."
- 10-second window (BREATH_WINDOW) — stopwatch running
- Plays: "Resume compressions." → returns to COMPRESS

### Fatigue Detection
- Rolling compression amplitude vs. first 10 compressions baseline
- If amplitude drops significantly → "Push harder." queued as next correction slot
- Tracks hands-off time (stopwatch on non-COMPRESS states)

---

## Screen 4: AED Transition (AED phase)
Triggered when rescuer taps "AED has arrived" button during the coaching loop.
This is a handoff screen — not an AED usage guide. The AED device itself instructs the rescuer from this point.

**What it does:**
- Stops the metronome and count immediately
- Plays: "Stop compressions. The AED will take over — follow its instructions."
- Displays one clear message: "Follow the AED voice instructions."
- "Resume CPR" button visible at all times — tapping it returns to the COMPRESS phase instantly

**What it does not do:**
- Does not walk through pad placement (the AED device does this with its own voice)
- Does not instruct on shocking (the AED device handles this)
- Does not replace AED guidance — gets out of the way and lets the device speak

---

## Screen 5: Score Card (end of session)
- Headline: final rolling score (the score at the moment coaching ended — reflects what they fixed, not lifetime average)
- Five named subscores:
  1. Pace — % of compressions inside 100–120 BPM
  2. Arms — % of frames with elbows locked (≥ 160°)
  3. Release — % of compressions with full recoil
  4. Hands-on time — compression fraction, target > 80%
  5. Rhythm — alignment to the 110 BPM metronome
- One plain sentence: highest-priority thing to improve. "You were too slow and leaning on the chest. Both fixable."
- Session length and compression count

---

## What is never claimed
- Absolute compression depth in centimetres — not measurable from a monocular camera without calibration
- Diagnosis of the patient's condition
- A replacement for calling 112
- A substitute for a trained dispatcher

---

## What is always present ("never cut" list)
- Spoken count (1–30)
- Metronome (110 BPM)
- Live quality score (updates every compression)
- At least one form correction
- Skeleton overlay
- Y-trace plot
- Breath phase at count 30
- Demo mode: recorded landmark JSON stream from a clean take, replay toggle (5 min of insurance against stage failure)
