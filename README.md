# CPR Coach

A phone-camera CPR coach. Prop your phone up, start compressions, and it watches you
through the camera and coaches you out loud — a metronome at 110 BPM, a spoken count,
and a form correction the moment your elbows bend.

Pose detection runs on-device in a Web Worker. Nothing leaves the phone during
compressions, and there are no network calls in the hot loop.

> **This is a hackathon project, not a medical device.** It has not been clinically
> validated. It cannot measure compression depth in centimetres — a single camera
> physically can't — so it only ever talks about your compressions relative to your
> own. If someone is unresponsive and not breathing, call emergency services and
> follow the dispatcher.

---

## The flow

Three screens.

**`/` — Ready.** One Start button.

**`/talk` — Triage.** First a "Call 112" screen with a `tel:` button. Then Clara, an
ElevenLabs voice agent, talks you through the pre-CPR checks — responsive? breathing?
adult, child, or infant? AED coming? in position? Each answer ticks a checkbox via a
client tool, and when you say you're in position she hands off to the coaching screen
and releases the mic.

**`/coach` — Compressions.** Camera goes full-bleed with a skeleton overlay. A short
setup sequence waits until it can actually see your shoulders and hands, counts 3-2-1,
then the metronome starts. From there:

- Every compression is detected from the vertical motion of your clasped hands.
- The count is spoken every 5th compression — every single number gets annoying fast.
- Arm lines turn red when an elbow bends or flares, and Clara says "straighten your arms."
- At 20 compressions it interrupts for the breath phase, then ends the round.

The 20:2 cycle is deliberately shortened from the clinical 30:2 for demo pacing, and
it stops after one round instead of looping. Both live in
[`lib/coach/state.ts`](lib/coach/state.ts) if you want the real thing.

---

## Status

**Working:** camera + pose pipeline, compression detection, 110 BPM metronome, spoken
counts, elbow-flare correction, the 20:2 state machine, breath phase, ElevenLabs
triage agent, PWA manifest and icons.

**Not built:** a numeric quality score, the y-trace debug plot (the canvas ref exists
in `coach/page.tsx` but nothing draws to it), and the `/api/placement` VLM hand-placement
check. `OPENAI_API_KEY` and `OPENAI_VISION_MODEL` in `.env.local` are read by nothing
right now.

The notes under [`notes/`](notes/) describe the intended full product and are ahead of
what's actually in `lib/` — trust the code.

---

## Running it

```bash
npm install
npm run dev
```

That gets you `http://localhost:3000` on a laptop, which is enough for the triage
screen and the UI, but **the camera won't work on your phone over plain HTTP.**
`getUserMedia` requires a secure context.

### On a phone (the part that actually matters)

Two options.

**Local HTTPS**, if your phone is on the same Wi-Fi. Generate a cert with
[mkcert](https://github.com/FiloSottile/mkcert):

```bash
mkcert -install && mkcert -key-file certificates/localhost-key.pem -cert-file certificates/localhost.pem localhost 192.168.1.x
```

Then start the dev server over HTTPS on your LAN:

```bash
npm run dev -- -H 0.0.0.0 --experimental-https --experimental-https-key certificates/localhost-key.pem --experimental-https-cert certificates/localhost.pem
```

and open `https://<your-lan-ip>:3000`. The `certificates/` directory is gitignored.

**Or a tunnel**, which needs no cert and works off Wi-Fi:

```bash
npx cloudflared tunnel --url http://localhost:3000
```

### Install it to the home screen

The app is meant to run as an installed PWA, not a Safari tab. Add to Home Screen,
then launch from the icon.

Camera and mic permissions do **not** carry over from Safari to the home-screen app —
it's a separate permission context, so you'll be asked again on first launch. Test
from the icon, not the tab, or you'll debug the wrong thing.

To inspect a real device: Safari → Develop → *your iPhone*.

---

## Environment

`.env.local`:

```
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=   # required for /talk — the triage agent
ELEVENLABS_API_KEY=                # server-side
OPENAI_API_KEY=                    # unused today (placement route not built)
OPENAI_VISION_MODEL=               # unused today
```

The agent ID is public by design — it's a client-side WebSocket connection. Nothing
else should ever get a `NEXT_PUBLIC_` prefix.

---

## How it works

```
phone browser (PWA)
├─ getUserMedia (front camera, flippable) → <video>
├─ Web Worker: MediaPipe PoseLandmarker + HandLandmarker
│     └─ landmarks → postMessage → main thread
└─ main thread
      ├─ OneEuro filter → peak detection on hand-mean y
      ├─ <canvas> overlay: skeleton + arm chains, red when an elbow is bent
      ├─ Web Audio lookahead scheduler (metronome + cues)
      └─ React display layer — count/phase only, throttled
```

**The one rule: the 30fps loop never touches React state.** Landmarks, the y-trace
buffer, peak timestamps and the audio clock all live in `useRef`. Only rendered values
go through `useState`. Push 30fps of landmarks through `setState` and the re-render
storm jitters the audio scheduler — and this product is, fundamentally, a metronome.

MediaPipe runs in a worker for the same reason: main-thread inference audibly jitters
Web Audio.

### Detecting a compression

MediaPipe's y axis points down, so the bottom of a compression is a local *maximum*.
[`lib/coach/detect.ts`](lib/coach/detect.ts) tracks a running max and fires when the
signal has risen `MIN_AMPLITUDE` off it, outside a 350 ms refractory window.

Signal priority is hand landmarks → pose wrists → shoulders. The clasped hands are the
stroke itself and give the cleanest signal; shoulders are the fallback when hands leave
frame. Because those sources sit at different y offsets, a source switch resets the
detector rather than firing a phantom peak — same for any single-frame jump over 0.06.

After each peak the detector disarms until it sees a fresh downstroke, which is what
kills double-counting at slow tempo.

Simulated against synthetic signals it's exact at 70–150 BPM and holds up at 15fps.
The practical sensitivity floor is about 0.02 peak-to-peak, not the 0.01 that
`MIN_AMPLITUDE` suggests, because re-arming and firing each need their own excursion.

### Audio priority

Cues must never stack — two voices talking over each other is worse than silence.

1. Phase instructions — interrupt everything
2. Metronome click — continuous baseline
3. Spoken count — on a detected peak
4. Form correction — only between numbers, at most one per 5 compressions

All voice lines are pre-rendered ElevenLabs mp3s in `public/audio/`, decoded up front
and played from `AudioBuffer`s. No live TTS at runtime — that's latency and network
risk in the one loop that can't afford either. The metronome click is synthesized, so
`click.mp3` being absent is fine.

On iOS, `AudioContext` has to be resumed on *every* user-gesture path, not just the
first, and again after the agent releases the mic.

---

## Layout

```
app/
  page.tsx              Ready screen
  talk/page.tsx         Call 112 → ElevenLabs triage agent → handoff
  coach/page.tsx        Camera, skeleton overlay, setup sequence, counting

lib/
  pose/
    worker.ts             MediaPipe worker (pose + hands)
    usePose.ts            Spawns the worker, returns landmarks via ref
    useCamera.ts          getUserMedia, front camera by default, flip to rear
  audio/
    engine.ts             AudioContext, buffers, 110 BPM lookahead scheduler
    cues.ts               Cue name → mp3 path, plus COUNT_CUES
  coach/
    detect.ts             Peak detection — the core of the whole thing
    state.ts              Phase machine: IDLE → COMPRESS → BREATHS → DONE
  vision/
    geometry.ts           Landmark indices, 3D angle math
    landmark-filter.ts    OneEuro smoothing
    camera-feedback.ts    Out-of-frame detection

public/
  audio/                Pre-rendered voice cues (counts, corrections, phases)
  models/               MediaPipe .task models (pose lite + hands)
  mediapipe/wasm/       MediaPipe runtime, self-hosted
```

Both model files and the wasm runtime are committed and served locally — a CDN fetch
is a network dependency at the worst possible moment.

## Constants worth knowing

| | | where |
|---|---|---|
| Metronome | 110 BPM | `lib/audio/engine.ts` |
| Refractory | 350 ms between peaks | `lib/coach/detect.ts` |
| Min amplitude | 0.01 (effective floor ~0.02) | `lib/coach/detect.ts` |
| Jump guard | 0.06 single-frame step | `lib/coach/detect.ts` |
| Cycle | 20 compressions, then breaths | `lib/coach/state.ts` |
| Stall timeout | 1500 ms | `lib/coach/state.ts` |
| Breath window | 15 s | `lib/coach/state.ts` |
| OneEuro beta | 0.07 (raised from 0.02 — CPR is ~2 Hz) | `lib/vision/landmark-filter.ts` |

Changing any of these without testing on a phone is how you lose the demo.

## Scripts

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
```

There is no test suite. `references/` and `public/mediapipe/wasm/` are vendored and
account for most of what `npm run lint` complains about.

---

Built at 8x × Bella&Bona Mobile Hack, Berlin.
