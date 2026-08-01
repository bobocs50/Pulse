# CPR Coach — Product, Pitch & Build Playbook
**8x × Bella&Bona Mobile Hack, Berlin, 1 Aug 2026 · solo/duo · full build day**

> **Platform decision: PWA — Next.js, installed to the home screen, launched from the icon.**
> The brief says "a mobile app." That does not mean native, App Store, or a binary — it means
> something on the phone that opens with a tap and uses the camera. A PWA does all of that.
> Capacitor is a 45-minute wrap that turns the same Next.js build into a signed iOS app if an
> organizer insists on a binary (see appendix). Ask tonight, then stop thinking about it.
> Rehabify won 1st of 169 as a browser app with a webcam.

---

## 0. The five rules everything below obeys

From judges who score these (JetBrains × Codex panel, AngelHack, McKinsey judges):

1. **Lead with the problem, not the tech.** Every judge said this unprompted.
2. **Something working on screen inside 90 seconds.** The demo is the pitch.
3. **One thing done well beats five things halfway.** Demo runs long = scope problem. Cut.
4. **Be direct about what doesn't work.** Stating a limitation reads as confidence.
5. **Remove every place the demo can stall.** Pre-render, pre-cache, nothing loads live.

Do not open with "hi we're team X, no sleep, lots of coffee." Open inside the problem.

---

## 1. Product

### One line
A phone propped on the floor watches you do CPR and coaches you through it out loud, like a dispatcher who can actually see you.

### The problem, as a table (steal this format, it reads fast)

| The reality of cardiac arrest in Germany |
|---|
| **~45%** of bystanders do nothing at all |
| The ambulance takes **6.19 minutes** on average |
| **68.4%** of arrests happen at home, with no equipment and no training nearby |
| Median time from emergency call to first compression: **3 min 24 s** |
| Feedback devices are now recommended for CPR training, and they're €2,000 manikins in training centres |

### The solution
Real-time computer vision plus voice AI, on a phone that's already in the room. Talk to it while you're frozen, it walks you into position, then counts every compression out loud and corrects your form the moment it slips. No hardware, no app store, no training centre.

### Features — for the bystander

- **Conversational intake** — you're panicking, you talk, it answers in two calm sentences and walks you into position. Then it hands off to the coaching loop automatically.
- **Live quality score** — a percentage that updates every single compression, with the reason attached. `41% — straighten your arms` → `88% — good, keep that pace`. Not a report at the end. A number that moves while you fix yourself.
- **Real-time form correction** — arms locked, shoulders stacked, full recoil, all measured from the camera and corrected by voice within one compression.
- **Counted out loud** — every pump, one to thirty, on a 110bpm metronome that leads you rather than following you.
- **Guided cycles** — at 30 it stops you, tells you to tilt the head back and pinch the nose, watches the clock, tells you to look for chest rise, then puts you back on compressions.
- **Fatigue detection** — compression quality collapses within two minutes, which is why the guidelines say swap rescuers. It tells you when yours is fading.
- **Privacy-first** — video never leaves the device. All pose detection runs locally in the browser via WebAssembly. A camera pointed at a dying person in their living room should not be uploading anything.

### Features — for training providers

- **Objective session data** — first-aid courses currently end with a certificate and no measurement. This produces five scored dimensions per session.
- **Practice continues after the course** — the course is one day, the skill decays in months. This is the between-days.
- **Refresher compliance** — German employers are obliged to maintain trained first aiders with periodic refresher training (DGUV Vorschrift 1, verify the exact interval before you cite it). Today that's a room and an instructor.

### Safety design (name it, don't apologise for it)

- **Emergency escalation first** — the agent confirms 112 has been called before anything else, every time.
- **Scope stops** — child, infant, drowning, choking, trauma, or an unclear situation and it stops coaching, tells you to stay on the line with the dispatcher, and gets out of the way.
- **No false confidence on depth** — absolute compression depth is not measurable from a monocular camera without calibration, so it is never reported as a green tick. It's tracked relative to your own compressions instead. This is the one number where a false positive would be actively harmful.

### Scenario tiers (this is the trick that makes one scenario look like a library)

| Tier | Scenarios | Capability |
|---|---|---|
| **Tier 1** | Adult, hands-only | Full CV form detection, live scoring, real-time voice correction |
| **Tier 2** | Adult 30:2, child, infant, AED-assisted | Voice-guided protocol, no CV |

Tier 2 is scripted voice flows. They cost you 20 minutes each and they multiply perceived scope enormously. Rehabify shipped 5 exercises with detection and 47 voice-guided and presented it as a tier system rather than an incomplete feature.

### What it is not
A medical device, a replacement for calling 112, or a substitute for a dispatcher. Say this before a judge says it for you.

---

## 2. The numbers (verify the morning of, all public)

**Germany — Deutsches Reanimationsregister, Jahresbericht 2024 (published Aug 2025):**
- Bystander CPR rate: **55.4%** · Telephone-guided CPR: **40.4%**
- Average EMS arrival: **6.19 minutes** (±3.21)
- **68.4% in the home**, 15.8% in public. Average patient 69.5 years, a third working age.
- Germany trails NL and Sweden at ~70–80%

**Clinical:**
- **100–120/min**, **5–6 cm**, full recoil, minimal interruption (AHA 2025 Guidelines, 22 Oct 2025)
- **Chest compression fraction ≥60%, target >80%.** Ventilation pause ≤10s for two breaths.
- Dispatcher-assisted bystander CPR: roughly **50% better odds of survival** vs no CPR before EMS arrival (Circulation)
- North Carolina cohort (~2,400 arrests, CARES registry): a **majority of bystander CPR happened with dispatcher assistance**; median call-to-first-compression **3 min 24 s**. Verify the exact share against the CARES paper before quoting it on stage.
- The **2025 AHA guidelines expand the real-time feedback device recommendation to all CPR training equipment**, including lay-rescuer training

### Slide 1

> Feedback devices are now recommended for CPR training. Today they are €2,000 manikins in training centres.
> 68% of arrests happen at home. The ambulance takes 6 minutes. It takes 3.5 minutes from the call before the first compression happens.
> The feedback device needs to be in the room. The only device in the room is a phone.

---

## 3. The pitch, 3 minutes, timed

Rehearse out loud with a stopwatch. Twice.

**0:00–0:25 — Problem as a scene.** "Someone collapses in front of you. The ambulance is six minutes away. In Germany roughly half of people do nothing at all, and the ones who act mostly do it wrong: too slow, arms bent, leaning on the chest between compressions."

**0:25–0:40 — The gap.** "Dispatchers already coach people through this by phone. It works, roughly 50% better odds of survival. But they're blind. They're guessing from what a panicking caller tells them."

**0:40–0:45 — Reveal.** "So we built the dispatcher that can see." Put the phone down.

**0:45–2:15 — Live demo.** 90 seconds. Most important part of the pitch.

**2:15–2:40 — What's real and what isn't.** "Rate, arm position and recoil are measured live. Depth we deliberately don't claim, because you can't get centimetres from a monocular camera without calibration. We track it relative to your own compressions and flag when you fade. Video never leaves the phone."

**2:40–3:00 — Where it goes.** "Feedback devices are recommended for CPR training and they're locked in training centres. This is one on every phone. Next is 112 handoff: dial, pass the quality data to the dispatcher, point at the nearest AED."

No market-size slide. No thanking at the start. One thank you at the end.

---

## 4. Demo choreography

**Props:** firm couch cushion or rolled hoodie. Phone stand. Test on the exact surface beforehand, a softer one changes amplitude range and can break peak detection.

1. Phone propped, app open, **launched from the home screen icon**. Zero setup on stage.
2. **Start frozen.** Talk to it: "someone's collapsed, they're not breathing, I don't know what to do." Agent walks you into position and hands off.
3. Count starts. **Do it wrong deliberately.** Bent arms, slow. Score reads 40-something. It says "straighten your arms."
4. Fix it. **Point at the number climbing.** That's your money shot. "Ninety-one." Then silence.
5. Let it hit 30. Stop, tilt the head back, pinch the nose. **Proves coach, not rep counter.**
6. Skip the 10s window.
7. Score card. Headline is the **final rolling score**, not lifetime average — you spent the demo climbing to 91, end on 91. Underneath: one plain sentence naming the one thing you fixed. "I have done a first-aid course."

**Stall-proofing:**
- All audio pre-rendered local files. No TTS API calls during the demo.
- **Demo mode** replaying a recorded landmark sequence if camera or lighting fails.
- `navigator.wakeLock` on. Do Not Disturb. Brightness up. Charged. Own adapter.

---

## 5. Spec

### 5.1 Screens

1. **Ready** — one giant Start button. Scenario picker (Tier 1 default). "Prop your phone so it can see you and the person."
2. **Talk** — the agent. Waveform, nothing else. Skippable.
3. **Coaching** — camera feed, skeleton overlay, **live quality percentage as the largest element on screen**, compression counter, rate bar showing the 100–120 window. Readable from a metre away by someone panicking.
4. **Score card** — five named subscores, headline number, one plain sentence.

### 5.2 State machine

```
TALK → SETUP → COMPRESS(n=1..30) → BREATH_PROMPT → BREATH_WINDOW(10s) → CHECK_RISE → COMPRESS
                ↕ STALLED (no compression for 1.5s)
after 5 cycles (~2 min) → SWAP_PROMPT (fires once, non-blocking)
```

Hands-only skips BREATH_PROMPT → CHECK_RISE and counts in blocks of 30.

### 5.3 What is measured

Everything from **one number: vertical position of the rescuer's near shoulder.**

| Signal | Method | Reliable? |
|---|---|---|
| Compression detected | Peak detection on shoulder-y, 350ms refractory | Yes |
| Rate | 60 / inter-peak interval, smoothed over last 3 | Yes |
| Arms straight | Elbow angle (shoulder-elbow-wrist), locked >160° | Yes |
| Shoulders stacked | Horizontal offset wrist→shoulder | Yes |
| Full recoil | Did this cycle's peak return to established baseline | Yes, relative |
| Fatigue | Rolling amplitude vs first 10 compressions | Yes, relative |
| Hands-off time | Stopwatch on non-COMPRESS states | Yes |
| **Absolute depth in cm** | **Not measurable without calibration** | **No. Don't claim it.** |

### 5.4 The live score (build this, it's the demo)

Recompute every compression over a rolling window of the last 5:

```
score = 0.4 × pace + 0.3 × arms + 0.3 × release
```

Display it huge, colour-graded, with the single highest-priority failing component as a caption underneath. `41% — straighten your arms`. When everything passes, caption goes to `good, keep that pace` and stays quiet.

Rolling window of 5, not lifetime average, or it stops responding once you're 60 compressions in and the demo dies.

### 5.5 Score card: five named subscores

1. **Pace** — % inside 100–120/min
2. **Arms** — % of frames with elbows locked
3. **Release** — % with full recoil
4. **Hands-on time** — compression fraction, target >80%
5. **Rhythm** — alignment to the metronome

Headline = average. One plain sentence: "You were too slow and you were leaning on the chest. Both fixable."

---

## 6. Voice design

### 6.1 Model choice
**Eleven v3 for everything pre-rendered**, not Flash. Flash is for text composed live at speaking time. Your cues are fixed and known tonight, so pre-render and play from local files: zero latency, zero network risk, plus v3's audio tags for a calm register. Flash only powers the live agent.

### 6.2 Casting
Dispatcher register. Low, slow, steady, flat intonation, no rising ends, no enthusiasm. This is clinical, not aesthetic: panic degrades compression quality, which is why dispatcher scripts are deliberately calm and repetitive. **Say this in the pitch.** It turns your voice choice from decoration into a design decision.

### 6.3 The counting problem
**Don't count reactively.** Drive the count from a fixed 110bpm metronome and have the user follow you:
- reactive counting jitters, detection lands a frame or two after the pump
- counting at their pace silently endorses a wrong pace. The count *is* the pace instruction
- one missed detection desynchronises the whole cycle

Detection runs alongside purely to score and catch a stall. No compression for 1.5s → pause, "keep going, stay with me," resume. Bonus: phase offset between their peaks and your ticks is your too-fast / too-slow signal, free.

### 6.4 Audio priority
1. Phase instructions — interrupt everything
2. The count — continuous baseline
3. Form corrections — only in the gap between two numbers

Correction slot every 5 compressions. Single highest-priority active violation, otherwise silence. **Never stack two.** Silence reads as "you're doing fine."

### 6.5 Script — render tonight

**Numbers:** one to thirty, clipped tight to fit a 545ms slot at 110bpm.

**Phase:** "Stop compressions." / "Tilt the head back. Pinch the nose." / "Two breaths." / "Watch for the chest to rise." / "Resume compressions." / "Swap with someone if you can."

**Corrections:** "Straighten your arms." / "Shoulders over your hands." / "Push harder." / "Let the chest come all the way up." / "Slow down." / "A little faster."

**State:** "Keep going, stay with me." / "Good. Keep that pace."

**Plus:** metronome click.

**Rules:** imperative, 2–5 words, name the corrective action only. "Straighten your arms," never "your arms are bent." Never use wrong, error, bad, incorrect. You are removing panic, not adding it.

---

## 7. The conversational agent

**Hard rule: never live during compressions.** The mic would pick up your own metronome and cues and the agent would talk to itself. And clinically, someone doing compressions should not be holding a conversation.

**Intake (before) — build this.** Someone opens the app frozen. "My dad collapsed, he's not breathing." Two sentences back: check responsiveness, confirm 112, get them kneeling with the heel of the hand on the centre of the chest. Then it hands off.

**Debrief (after) — cut candidate.** "Why was my rhythm bad?"

### The handoff (your best technical moment)

```js
useConversationClientTool("start_compressions", async () => {
  await endSession();        // release the mic
  setPhase("SETUP");         // geometry loop takes over
  return { success: true };
});
```

Agent decides the person is ready → calls the tool → its session ends → camera loop starts → metronome begins. Conversation becomes execution.

### Stack notes
- `@elevenlabs/react`. `ConversationProvider`, `useConversationControls`, `useConversationClientTool`.
- v1.0 rearchitecture landed March 2026. Make sure your coding agent isn't pulling the old `@11labs/react` API.
- **Declare the tool in the ElevenLabs dashboard too**, not just client-side. Must match. Set blocking if the agent should await the result.
- `connectionType: "websocket"`. Known LiveKit version issue can stall WebRTC handshakes.
- Reference docs: `github.com/elevenlabs/skills`

### Agent system prompt constraints
- Max two sentences per turn
- Always confirm 112 has been called
- Never diagnose or speculate about the patient
- Default to hands-only
- **Scope stop:** child, infant, drowning, choking, trauma, or unclear → tell them to stay on the line with the dispatcher and stop coaching
- No exclamation marks, calm register
- Call `start_compressions` as soon as the person is in position

**Test it by talking to it tonight.** A chatty agent kills the calm-dispatcher framing.

---

## 8. Architecture

### Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind | What you already use, no new unknowns |
| Computer vision | MediaPipe Tasks Vision, `lite` model + GPU delegate, in a Web Worker | On-device skeleton tracking, nothing uploaded |
| Audio | Web Audio API, raw | Pre-decoded AudioBuffers, lookahead scheduler, sample-accurate metronome |
| Voice | ElevenLabs v3 (pre-rendered cues) + ElevenLabs Agents (intake) | Calm dispatcher register, zero runtime latency |
| LLM | OpenAI, one server-side call | End-of-session debrief |
| State | `useRef` for the hot loop, `useState` for display only | See below |
| Persistence | None (`localStorage` at most) | |
| Deployment | Vercel | |

**Deliberately not used, and say so if asked:** no database (a three-minute session with no second user doesn't need Postgres), no auth, no Vapi (ElevenLabs Agents does it natively and it's the sponsor), no Tone.js (one scheduler, not a synthesis library), no component library (four screens, three of them full-bleed camera).

### Pose library: considered and rejected

MediaPipe Tasks Vision is current and maintained (docs updated May 2026 under Google AI Edge). BlazePose + GHUM, 33 3D landmarks, explicitly optimized for on-device real-time fitness. It is the right call.

| Alternative | Why not |
|---|---|
| TF.js MoveNet | Faster, but 17 keypoints and no visibility scores. You need visibility to pick the near arm from a side view |
| ONNX Runtime Web + RTMPose / YOLO-pose | Higher accuracy ceiling, but you hand-roll pre and post-processing. Hours you don't have |
| transformers.js + WebGPU | Right tool for transformers, no strong real-time pose model |
| Apple Vision `VNDetectHumanBodyPose` | Best quality on iOS, but native only |
| WebGPU backend | WebGPU shipped everywhere in Jan 2026 (Safari 26 on iOS/iPadOS/macOS), but MediaPipe's web GPU delegate runs on WebGL. Not a flag you flip, and BlazePose lite doesn't need the headroom |

**Why-now pitch line:** real-time pose inference running entirely on-device in a mobile browser, nothing uploaded, is recent. Two years ago this was a native app or a server round trip.

### Two upgrades worth taking

- **`requestVideoFrameCallback`**, not `requestAnimationFrame`, for the capture loop. Fires once per actual decoded video frame, so you stop burning GPU on duplicates when the camera runs below display refresh.
- **Verify `visibility` is populated** on the landmarks in the web build tonight. There's a long-standing MediaPipe issue where the Android SDK returns only x, y, z despite the docs. Web should be fine, but your near-arm selection depends on it.

### The one real architectural decision

**Do not put the 30fps loop in React state.** Landmarks, the y-trace buffer, peak timestamps and the audio clock all live in `useRef`. Only what's rendered (score, count, BPM) goes into `useState`, throttled to ~10fps. Push 30fps of landmark updates through `setState` and the re-render storm jitters your audio scheduler. Your entire product is a metronome.

```
phone browser (launched from home screen icon)
├─ getUserMedia → <video>
├─ Web Worker: MediaPipe Tasks Vision PoseLandmarker (lite model, GPU delegate)
│    └─ landmarks → angle math + peak detection      [on-device, nothing uploaded]
├─ main thread: <canvas> overlay + Web Audio scheduler
├─ ElevenLabs Agent (intake only, mic released on handoff)
└─ Next.js API routes: signed URLs, optional OpenAI debrief   [keys server-side]
```

**Run MediaPipe in a Web Worker.** Rehabify does this and the reason matters more for you than for them: pose inference on the main thread will jitter your Web Audio scheduler, and your entire product is a metronome. Off-thread inference, `postMessage` the landmarks back.

**Keys:** never `NEXT_PUBLIC_*`. You have API routes, use them. Note Capacitor requires a static export, which kills API routes and forces you to deploy the API separately. Another argument for staying PWA.

**No VLM in the hot loop, but one place it's load-bearing.** A vision-model round trip is 1–3 seconds, so it can never drive pace or arm correction. But **hand placement on the chest** is a real CPR quality dimension that pose geometry fundamentally cannot get: the patient is occluded under the rescuer and you'll never reliably land their sternum from landmarks. A VLM on a single still frame can.

**Fire once at compression 3.** Async, non-blocking, resolves by compression 6.

```
canvas grab at compression 3 → 512px JPEG, quality 0.6
→ /api/placement  (server-side key, OpenAI vision)
→ { "placement": "correct" | "too_high" | "too_low" | "unclear" }
→ too_low: play "move your hands to the centre of the chest"
→ unclear: say nothing
```

JSON only, no prose. **Treat `unclear` as silence, never a guess** — wrong placement means compressing the abdomen, so a confident wrong answer is worse than none.

Optional second call on the setup screen ("is there a person on the ground, is the rescuer's upper body visible?"), better than a landmark-count heuristic which can't tell a person from a coat.

**Pitch line:** deterministic geometry for everything that has to be instant, a vision model for the one thing geometry can't see.

**`lite` pose model with GPU delegate.** `heavy` thermally throttles a phone in about three minutes, which is the length of your demo.

### Skeleton rendering

Don't hand-roll the connector graph, MediaPipe ships `DrawingUtils`. Three layers:

```js
import { DrawingUtils, PoseLandmarker } from "@mediapipe/tasks-vision";
const du = new DrawingUtils(ctx);

// layer 1 — full skeleton, dim. The "CV is working" texture.
du.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS,
  { color: "rgba(255,255,255,0.22)", lineWidth: 2 });
du.drawLandmarks(lm, { color: "rgba(255,255,255,0.3)", radius: 2 });

// layer 2 — the arm chain. The actual signal.
const [sh, el, wr] = [lm[11], lm[13], lm[15]];
ctx.strokeStyle = elbowLocked ? "#22c55e" : "#ef4444";
ctx.lineWidth = 6;
ctx.beginPath();
ctx.moveTo(sh.x*w, sh.y*h); ctx.lineTo(el.x*w, el.y*h); ctx.lineTo(wr.x*w, wr.y*h);
ctx.stroke();

// layer 3 — the reference. Where the arm should be.
ctx.setLineDash([8,8]);
ctx.strokeStyle = "rgba(34,197,94,0.55)";
ctx.beginPath();
ctx.moveTo(sh.x*w, sh.y*h); ctx.lineTo(sh.x*w, wr.y*h);
ctx.stroke();
ctx.setLineDash([]);
```

**Design decision:** Rehabify draws the full skeleton bright because they check whole-body exercises. You shouldn't. Dim full skeleton = proof the vision works, which is what judges want to see. Thick colour-coded arm chain = what the user actually reads. If everything is bright, nothing is legible.

Landmark indices: 11/12 shoulders, 13/14 elbows, 15/16 wrists. Pick the near arm by comparing `visibility` on 13 and 14.

### The two bugs that will eat your time:
1. **Canvas/video misalignment.** Set canvas `width`/`height` from `videoWidth`/`videoHeight`, not CSS pixels. Mirror x on the front camera. Get a skeleton sitting correctly on your body before writing any rep logic.
2. **Two people in frame.** The patient lies under the rescuer and default single-pose detection flickers between them. `numPoses: 2`, select the rescuer by whichever pose is more vertical, or frame tight enough to crop the patient out. From a side view the far arm is occluded, so check `visibility` on both elbows and use the higher one.

### Making it read as an app (20 minutes, do it late)
- `manifest.json`, `"display": "standalone"`, theme color, 192 and 512 icons
- `apple-touch-icon` 180×180, `apple-mobile-web-app-status-bar-style`
- `viewport-fit=cover` + `env(safe-area-inset-*)` padding
- `overscroll-behavior: none`, `-webkit-touch-callout: none`, `user-select: none`, `touch-action: manipulation`. Rubber-band scrolling is the biggest tell.
- `navigator.vibrate()` on every compression peak. Haptics feel native and here they're functional.
- `navigator.wakeLock`

**Add to home screen before you present and launch from the icon.** Never say "web app" during the pitch.

---

## 9. Dev environment (you've never done mobile web)

Nothing in your toolchain changes. Next.js in VS Code. Six differences, all iOS PWA gotchas:

1. **HTTPS mandatory.** iOS Safari refuses `getUserMedia` over plain http.
2. **Tunnel, don't push-to-deploy.** 40s per Vercel deploy while tuning peak detection will destroy you. `next dev` + ngrok or cloudflared, open the tunnel URL on your phone, instant hot reload on device. Vercel stays as the stable demo URL.
3. **Remote debugging or you're blind.** Mac Safari → Develop → your iPhone → inspect. Android: `chrome://inspect`.
4. **Home-screen PWAs run in a separate context from Safari.** Camera and mic permissions do not carry over. Test from the icon.
5. **`AudioContext` must be resumed on every user gesture path, not just the first.** iOS suspends it on tab hide, on backgrounding, and — critically for you — after the ElevenLabs Agent releases the mic on handoff. Wrap the SETUP transition with `if (ctx.state !== "running") await ctx.resume()`. A silent metronome kills the demo faster than a wrong number.
6. **Mic-in-PWA on iOS is the flakier permission**, worse than camera. If the intake agent doesn't get mic access from the home-screen icon, fall back to a tap-to-skip on the Talk screen — never let mic permission block the coaching loop.

### Working method
Rehabify has a `plan/` directory with numbered spec folders (`00-architecture`, `03-vision`, `04-voice-ai`, `05-contingencies`) and 143 commits in a weekend. Solo with a coding agent, a structured spec directory is worth the 15 minutes: drop this playbook in as `plan/00-spec.md` and point the agent at it instead of re-explaining the state machine every prompt.

---

## 10. Build timeline (4 hours, and 25 min of that is pitch)

| Time | Task |
|---|---|
| 0:00–0:20 | Scaffold **from last night's verified base**, deploy, tunnel up |
| 0:20–1:00 | PoseLandmarker in a Web Worker + skeleton overlay aligned |
| 1:00–1:40 | Shoulder-y trace drawn on screen, peak detection, live BPM |
| 1:40–2:40 | Audio engine: buffers, lookahead scheduler, metronome, counting, priority ladder, one correction cue |
| 2:40–3:00 | State machine: 30 count, breath phase, skip, stall gate |
| 3:00–3:20 | **Live quality score + record a landmark stream from a clean take → demo-mode replay toggle.** Insurance against every stage failure |
| 3:20–3:45 | **VLM hand-placement check.** One async call at compression 3, one cue |
| **3:45–4:00** | **Pitch + manifest/icons/wake lock. Two timed run-throughs out loud.** |

**Hard checkpoint at 2:40.** If the audio engine isn't done, cut the breath phase and go straight to the score.

**The agent intake is out at 4 hours.** It's a separate integration with its own failure modes (mic permissions, WebSocket, agent config) and adding integration risk at hour 3 is what kills demos. It's the first thing you add if you're ahead at 3:00. The pre-rendered v3 voice already carries the ElevenLabs hook.

**Also out:** recoil, fatigue, Tier 2 scenarios, the five-subscore card, demo mode. Live score covers the scoring story on its own.

**Build the on-screen y-trace plot in the first hour.** Not optional. Tuning peak detection blind costs 40 minutes of guessing, and the same canvas draws the skeleton, so it's one task.

Audio gets the biggest block on purpose. It's the real risk and it's what judges hear.

---

## 11. Cut list

Cut from the top when you slip.

1. Fatigue detection
2. Tier 2 scenarios
3. Recoil
4. Score card down to one number
5. Post-session debrief conversation
6. Shoulders-stacked line

**Never cut:** the count, the metronome, the live score, one form correction, the live overlay, the breath phase, **demo mode** (record a landmark JSON stream from a good take in hour 3 and wire a "replay" toggle — five minutes of insurance that survives every lighting, permission, or thermal failure on stage).

---

## 12. Q&A backup answers

**"Isn't this dangerous if it's wrong?"** Training and drill tool. In a real arrest you call 112 first and the dispatcher takes over. We never claim depth, which is the one number where a false green would be harmful, and we say so on screen. The agent stops coaching entirely on anything outside adult scope.

**"Why not just a metronome app?"** Those exist and they're free. They can't see you. Pace is the easy half. Bent arms and leaning between compressions are what nobody can self-detect, and that's what a feedback device catches.

**"How do you know your thresholds are right?"** They're not ours. 100–120/min, full recoil, compression fraction above 80%, ventilation pauses under 10 seconds are published guideline values. We implemented a protocol rather than inventing one.

**"What about depth?"** Not measurable in centimetres from one camera without a scale reference. We track it relative to your own compressions and flag when you fade, which maps to the guideline that says swap rescuers every two minutes. Absolute depth needs a calibration step with a known object in frame. That's the roadmap.

**"What about privacy?"** Video never leaves the device. Pose detection runs locally in WebAssembly. Nothing is uploaded, ever.

**"Business model?"** First-aid training providers (DRK, ASB, Johanniter, Malteser) sell courses that end on the day. This is the between-days. Employer refresher obligations under DGUV are a second channel. Schools are a third, and CPR in schools is an active policy push here.

**"Is this a web app?"** It's on your phone, launches from the home screen icon, uses the camera and speaker. The delivery mechanism is a browser engine — same as a lot of the apps you use every day. What matters is that the feedback device is now in the room instead of a training centre. (Move on.)

**"What's next?"** 112 handoff: dial, transmit quality data to the dispatcher, surface the nearest registered AED.

---

## 13. Public README / Devpost description

Judges read this. Rehabify's README is a large part of why it reads as a company rather than a hack. Write it during the pitch hour, not at 3am.

**Structure to copy:**
1. Title, one-line subtitle, hero screenshot
2. Badges (built at, framework, MediaPipe)
3. **The Problem** — first person, specific, with the reality table
4. **The Solution** — two sentences
5. **Demo** — three side-by-side screenshots of bad / correcting / good form with the score under each. This is the single highest-value asset in the whole README. Take them during your build.
6. **Features** — split by audience: bystander, training provider, safety
7. **How It Works** — the ASCII pipeline diagram. Cheap, and it makes the architecture legible in three seconds.
8. **Tech Stack** — paste-ready:

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind | Single-screen coaching UI, readable from a metre away |
| **Computer Vision** | MediaPipe Tasks Vision (WASM + Web Workers) | Real-time skeleton tracking, on-device |
| **Signal Processing** | Peak detection on shoulder displacement | Compression rate, recoil, rhythm |
| **Voice** | ElevenLabs v3 (pre-rendered) + Web Audio scheduler | Sample-accurate metronome and spoken count |
| **Vision AI** | OpenAI vision, one async call | Hand placement, the one signal geometry can't see |
| **Deployment** | Vercel | Edge-hosted, installable to home screen |

No database row, and that's a feature. Three-minute session, no second user.

9. **Scenario tiers** table
10. **What's Next** — be specific. Named integrations and real regulation beat "improve accuracy."

**Take the three screenshots during the build**, around hour 5 when the score works. You will not have time or a working app to photograph at hour 7.

---

## 14. Tonight — the base layer (90 minutes, then sleep)

Check your event rules on pre-work. Scaffolding and dependency setup are universally fine; feature logic usually isn't. **Everything here is scaffold and verification. No coach logic.**

### Install

```bash
npx create-next-app@latest cpr-coach --ts --tailwind --app
cd cpr-coach
npm i @mediapipe/tasks-vision
npm i -D @types/dom-mediacapture-transform     # optional, better rVFC types
```

Deploy it empty to Vercel now. Then for the dev loop:

```bash
npm run dev
npx cloudflared tunnel --url http://localhost:3000   # or ngrok http 3000
```

Open the tunnel URL on your phone. That's your working loop tomorrow, not push-to-deploy.

### Folder skeleton (stubs only, no logic)

```
app/
  page.tsx                    Ready screen, one Start button
  coach/page.tsx              empty, tomorrow's screen
  api/placement/route.ts      returns { placement: "unclear" } — stub
lib/
  pose/worker.ts              Web Worker: MediaPipe init + postMessage landmarks
  pose/usePose.ts             hook wrapping the worker, returns a ref
  audio/engine.ts             AudioContext, buffer loader, lookahead scheduler
  audio/cues.ts               map of cue name → /audio/*.mp3 path
  coach/detect.ts             empty export — peak detection goes here
  coach/state.ts              empty export — state machine goes here
  coach/score.ts              empty export — scoring goes here
public/
  audio/                      tonight's rendered mp3s
  manifest.json, icon-192.png, icon-512.png, apple-touch-icon.png
```

Writing `manifest.json` and the icons tonight is scaffold, and it means tomorrow's home-screen test is already wired.

### The three verifications that actually matter

Build one throwaway page that does these and nothing else. If any fails, you find out now instead of at hour two.

- [ ] `getUserMedia` shows the camera feed **on your phone**
- [ ] MediaPipe Tasks Vision loads **inside the Web Worker** and logs 33 landmarks on your phone
- [ ] A decoded `AudioBuffer` plays on a button tap

Then, and this is the one people skip:

- [ ] **Add to home screen, launch from the icon, confirm the camera still works.** Home-screen PWAs run in a separate permission context from Safari.

Also confirm:
- [ ] Remote debugging connected (Mac Safari → Develop → your iPhone), console visible
- [ ] `visibility` is actually populated on the landmark objects

### Assets (do first, it's passive time while you set up)

- [ ] Render in ElevenLabs v3, calm voice: numbers **one to thirty**, clipped to fit 545ms
- [ ] Phase cues, correction cues, state cues (full list in §6.5)
- [ ] **"Move your hands to the centre of the chest."** (the VLM placement cue)
- [ ] A metronome click
- [ ] Drop them all in `public/audio/`

### Pitch prep

- [ ] 2024 Reanimationsregister figures + the AHA feedback-device line into three slides
- [ ] Write the 25-second problem opening, say it out loud once

### Two admin things

- [ ] Message an organizer: does a PWA count, or do they want a native build?
- [ ] On a Mac, start the Xcode download before bed as free insurance. Configure nothing.

**Do not write tonight:** peak detection, the state machine, scoring, the audio scheduler logic. Stubs and verification only.

---

## Appendix: Capacitor fallback (only if an organizer demands a binary)

Needs a Mac, Xcode installed, and a physical iPhone. The simulator has no camera. Free Apple ID signing is enough, you don't need the $99 account.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init && npx cap add ios
npm run build && npx cap sync
npx cap open ios
```

In Xcode you touch exactly two things:
1. `Info.plist` → add `NSCameraUsageDescription` and `NSMicrophoneUsageDescription`. Without these the camera fails silently with no error.
2. Signing & Capabilities → pick your Apple ID. Then press Run with the phone plugged in.

**Catch:** Capacitor needs a static export, which kills Next.js API routes. Your `/api/placement` route would have to stay deployed on Vercel with the wrapped app calling it over the network. One more thing to break on venue wifi, which is the main argument for staying PWA.

Budget 45 minutes and expect surprises. Decide at 3pm, not at 3:45.

---

Build the demo you want to give, then work backwards to it. That's the whole method.