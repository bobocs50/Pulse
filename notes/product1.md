# product1.md — CPR Coach Full Flow Spec


inspo: https://github.com/obro79/Rehabify#demo

---

## Phase 0: Scene Assessment (ElevenLabs Agent — voice intake)

The agent speaks first — no greeting, straight into the scene:
> "Check the scene is safe. Tap their shoulders firmly and ask: are you okay?"

Agent walks through:
1. Is the person unresponsive?
2. Check the mouth (visible obstruction?)
3. Hold ear to mouth — are they breathing?

User speaks answers. Agent collects via client tool calls:
- Victim type: adult / child (+ age) / infant
- Responsive: yes / no
- Breathing: yes / no
- Any visible obstruction

**Scope stops** (agent stops and defers to 112 dispatcher):
- Infant (under 1 year)
- Drowning, choking, trauma
- Any unclear or unsafe situation

**Fallback if voice intake fails** (mic permission denied, noisy room):
Show tap-to-answer buttons for each question. Same client tool calls fire either way.
Never let mic permission block the coaching loop.

**See:** `notes/agent-prompt.md` for the full ElevenLabs system prompt and tool definitions.

---

## Phase 1: Hand Placement Introduction

Pre-recorded ElevenLabs v3 clip tailored to victim type. Play immediately after handoff.

**Adult:**
> "Place the heel of your hand on the center of their chest. Other hand on top, fingers interlaced. Arms straight, shoulders directly above your hands."

**Child:**
> "Use one hand only. Heel of your hand on the center of their chest. Keep your arm straight."

Then:
> "When you're ready, begin."

---

## Phase 2: Compressions (30:2 cycle)

### Rate
- Target: **95 BPM** (slightly slower than 110 for demo legibility — easier to track and keep up)
- Metronome click leads the user; count follows the metronome, not the detected peaks
- Detection runs alongside to score and catch stalls

### Count
- Spoken aloud on each metronome beat: 1, 2, 3 … 30
- Pre-recorded ElevenLabs v3 files, clipped tight to fit the beat slot

### VLM hand placement check
- At compression 3: async snapshot → `/api/placement` (OpenAI vision, server-side key)
- Returns: `"correct"` | `"too_high"` | `"too_low"` | `"unclear"`
- `too_low`: play "Move your hands to the center of the chest."
- `unclear`: silence — never guess
- Resolves by compression 6, non-blocking

### Form feedback (calm, never stacking)
- One correction at a time, minimum 5 compressions apart
- Imperative only — name the corrective action, never the error
- Pre-recorded ElevenLabs v3 cues:
  - "Straighten your arms."
  - "Shoulders over your hands."
  - "Push a little deeper."
  - "Let the chest come all the way up."
  - "Good. Keep that pace."
- Never say: wrong, bad, incorrect, mistake

### Stall detection
- No compression for 1.5s → pause metronome, play: "Keep going, stay with me."
- Resume metronome immediately after

### Visual overlay
- Live skeleton — dim full body (proof CV works) + thick color-coded arm chain (what user reads)
- Green arm = elbows locked (≥160°), red = bent
- Y-trace plot showing compression rhythm
- Live score (largest element on screen) + BPM bar

---

## Phase 3: Rescue Breaths (after 30 compressions)

**Trigger:** count reaches 30

Metronome pauses. Play pre-recorded audio cue (required — not optional):
> "Stop compressions. Tilt the head back. Pinch the nose. Two breaths — breathe in until the chest rises."

Display on screen simultaneously (large, readable from 1m):
> Tilt head back · Pinch nose · Breathe until chest rises · One… Two

After 2 breaths, user taps **"Resume"** or starts pressing — cycle restarts from 1.

**Hands-only path:** skip rescue breath phase entirely. Count in blocks of 30, no pause.

---

## Phase 4: EMS Handoff

When EMS arrives (user taps "EMS here"):
- Session ends
- Display: "Hand off to the medics. Good work."
- Show detial : all the necessary infos from cpr, and infos i talked to you before displaiyng in stats showing for med!

---

## Voice & Tone Rules

- Dispatcher register — calm, low, flat. Not warm. Not enthusiastic.
- Silence during compressions = "you're doing fine." Don't fill it.
- Corrections: 2–5 words, imperative, corrective action only
- Maximum one correction in any 5-compression window
- All cues pre-recorded ElevenLabs v3 before demo — zero live TTS during session
- AudioContext must be resumed after agent mic release before metronome starts

---

## Demo Timing Budget (~90 seconds on stage)

| Phase | Max time |
|---|---|
| Agent intake (phases 0–1) | ~37s |
| Compressions — do wrong, get corrected | ~25s |
| Score climbs to 90+ | (visible during above) |
| Count hits 30, breath prompt | ~10s |
| Resume compressions | ~10s |
| **Total** | **~82s** |

Start the demo frozen: talk to the agent. Let it walk you into position. Do compressions wrong deliberately. Fix them. Point at the number climbing. Let it hit 30. That's the demo.
