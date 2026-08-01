# My Goals — CPR Coach

## What this is

A web app (PWA) that a bystander opens on their phone, props on the floor pointing sideways at them,
and gets coached through CPR in real time. No hardware. No app store. No training required to use it.

The phone camera sees you from the side. It can see your arm position and how fast you pump.
It cannot see exactly where your hands land on the chest — that gets taught in the setup steps.

---

## The camera setup

Phone on the ground, camera pointing sideways at the rescuer.

What the camera can see:
- Whether your arms are straight or bent (elbow angle, shoulder→elbow→wrist)
- Whether you are pumping at the right speed (shoulder-y displacement, peak detection)
- Whether the chest is rising back up between compressions (recoil, same signal)
- Whether you are leaning on the chest between pumps (baseline drift over time)
- Whether you are in frame at all (landmark visibility scores)

What the camera cannot see:
- Exactly where your hands are placed on the chest (patient is under you, side angle)
- Absolute compression depth in centimetres (no calibration reference)

Both of these are handled in the onboarding instructions, not claimed as live detections.

---

## The 11-step onboarding (instruction flow)

Shown before coaching starts. Voice narration on each step. Like Rehabify's exercise onboarding.
Clear enough for someone panicking. Each step: one illustration + one sentence spoken aloud.

1. Make sure the scene is safe — look around before you kneel
2. Call 112 (or have someone else call) — do not skip this
3. Check responsiveness — tap shoulders, shout "are you okay?"
4. Look, listen, feel for breathing — no more than 10 seconds
5. Position yourself — kneel beside the person, level with their chest
6. Find the right spot — heel of your hand on the centre of the chest, two fingers above the bottom of the breastbone
7. Place your second hand on top, fingers interlaced, fingers off the chest
8. Lock your arms straight — elbows locked, shoulders directly above your hands
9. Press down hard and fast — about 5–6 cm, straight down
10. Let the chest come all the way back up — do not lean between compressions
11. Prop your phone so the camera can see you from the side, then tap Start

---

## What the coaching loop does

Once coaching starts:

- **Metronome** — 110 BPM click plays from the phone speaker. You try to match it.
- **Spoken count** — "one… two… three…" triggered by each detected compression. Confirms the pump was seen.
- **Live score** — large number on screen, colour-coded, updates every compression.
  `score = 0.4 × pace + 0.3 × arms + 0.3 × recoil`
  Rolling window of last 5 compressions. Not lifetime average.
- **One caption** — highest-priority failure, one phrase. "Straighten your arms." "Slow down." "Let it rise."
  When everything passes: "Good. Keep that pace." Then silence.
- **Breath phase at 30** — stop, "tilt the head back, pinch the nose, two breaths," watch for chest rise, resume.
  This proves it is a coach, not a rep counter.
- **Out-of-frame warning** — if landmarks drop below visibility threshold: "I can't see you — move the phone back."
  Plays immediately from local audio, no agent latency.

---

## The three things the camera measures live

| Signal | How | Reliable from side view? |
|---|---|---|
| Compression rate (BPM) | Peak detection on shoulder-y displacement | Yes |
| Arms straight | Elbow angle shoulder→elbow→wrist, threshold >160° | Yes — side view is actually better |
| Full recoil | Does shoulder return to baseline each cycle | Yes, relative only |

Everything else (depth, hand placement, hand-off time) is either instructed upfront or not claimed.

---

## Challenges and how to handle them

**Hand placement** — Cannot detect from this camera angle when alone.
Handle it in step 6 of onboarding with a clear illustration. Say it once in the pitch:
"Hand placement we teach in setup. Everything else we measure live."

**Real-time feedback latency** — Metronome click and spoken count are local pre-rendered audio, <20ms.
Form corrections ("straighten your arms") can be 1–2s — still useful, arrives within the next compression.

**Echo / feedback loop** — Agent mic is open while metronome plays. Test this on the actual phone at demo volume
before relying on it. If agent STT picks up the click, use local pre-rendered corrections instead of live agent.

**Two people in frame** — Patient on the floor + rescuer above. From side view they're at different heights.
Use numPoses: 2, pick the pose that is more vertical (rescuer), ignore the horizontal one (patient).

---

## What makes this different from a metronome app

Metronome apps are free. They can't see you. Bent arms and leaning on the chest between compressions
are what nobody can self-detect, and that's what kills survival odds. This catches both, live, and says
something specific before the next pump lands.

---

## What this is not

- A medical device
- A replacement for calling 112
- A substitute for a trained dispatcher
- Able to measure depth in centimetres from one camera

Say this before a judge does.

---

## Win condition

90 seconds on stage:
1. Phone on the floor, app open, launched from the icon. No setup visible.
2. Do it wrong — bent arms, slow. Score reads low. It says "straighten your arms."
3. Fix it. Point at the score climbing.
4. Hit 30. It stops you. Breath phase. Proves it's a coach.
5. Score at the end reflects what they fixed.

If those five moments land cleanly, this is competitive for first.
