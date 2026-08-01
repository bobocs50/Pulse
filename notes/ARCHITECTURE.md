# ARCHITECTURE

## Folder structure

```
app/                        screens (what the user sees)
  page.tsx                    Ready screen — big Start button
  coach/page.tsx              Coaching screen — camera + score
  api/placement/route.ts      Server: checks hand placement via OpenAI

lib/                        logic (no UI)
  pose/
    worker.ts                 MediaPipe runs here (off main thread)
    usePose.ts                Hook: connects screen to the worker
    useCamera.ts              Hook: turns on the camera
  audio/
    engine.ts                 Plays MP3s + runs the metronome
    cues.ts                   List of all audio file paths
  coach/
    detect.ts                 ← MOST IMPORTANT: detects each compression
    state.ts                  Tracks phase (compressing / breathing / stalled)
    score.ts                  Calculates the live quality %
  vision/
    geometry.ts               Math: elbow angle, shoulder position
    landmark-filter.ts        Cleans up noisy pose data
    camera-feedback.ts        Detects if you're out of frame

public/
  audio/                    MP3s (ElevenLabs v3 pre-rendered)
  manifest.json               Makes it installable as a PWA
```

## Pipeline

```
phone browser (launched from home screen icon, PWA)
├─ getUserMedia → <video>
├─ Web Worker: MediaPipe Tasks Vision PoseLandmarker (lite, GPU delegate)
│    └─ landmarks → postMessage → main thread
├─ main thread
│    ├─ angle math + peak detection on shoulder-y (in useRef, not useState)
│    ├─ <canvas> overlay: dim skeleton + colored arm chain + reference line
│    ├─ Web Audio scheduler (lookahead, sample-accurate)
│    └─ React display layer (score, count, BPM) — throttled to ~10fps setState
├─ ElevenLabs Agent (intake only, mic released on handoff)  [optional, cut first]
└─ Next.js API routes (server-side keys)
     ├─ /api/placement → OpenAI vision, one shot at compression 3
     └─ /api/debrief   → OpenAI text, end of session  [cut candidate]
```

## The one architectural rule
**The 30fps hot loop does not touch React state.** Landmarks, y-trace buffer, peak timestamps, and the audio clock live in `useRef`. Only rendered values (score number, count, BPM) go through `useState`, throttled. Push 30fps of landmarks through setState and the re-render storm jitters the audio scheduler. The entire product is a metronome.

## Stack

| Layer | Tech | Why |
|---|---|---|
| Framework | Next.js 15, React 19, TS, Tailwind | Known; API routes for keys |
| Vision | `@mediapipe/tasks-vision` PoseLandmarker, lite model, GPU delegate | 33 landmarks, visibility scores, maintained |
| Vision runtime | Web Worker + `requestVideoFrameCallback` | Off main thread; fires per decoded frame, not per rAF |
| Audio | Web Audio API, raw. Pre-decoded AudioBuffers, lookahead scheduler | Sample-accurate; no TTS at runtime |
| Voice cues | ElevenLabs v3, pre-rendered to local files | Zero latency, zero network risk |
| Voice agent | ElevenLabs Agents (intake only) | Sponsor; native tool-calling |
| VLM | OpenAI vision, one async call | Hand placement (geometry can't see it) |
| Deploy | Vercel + PWA manifest | Installable; static + serverless |

## Deliberately not used
- Database — a 3-min single-user session doesn't need Postgres
- Auth
- Vapi — ElevenLabs Agents covers it and is the sponsor
- Tone.js — one scheduler, not a synth library
- Component library — 4 screens, 3 full-bleed camera
- WebGPU — MediaPipe's web delegate is WebGL; BlazePose lite doesn't need it
- TF.js MoveNet — 17 keypoints, no visibility, can't pick the near arm

## Signals (all from one number: shoulder-y)

| Signal | Method | Trustworthy? |
|---|---|---|
| Compression peak | Peak detection, 350ms refractory | Yes |
| Rate (BPM) | 60 / inter-peak interval, smoothed over 3 | Yes |
| Arms straight | Elbow angle shoulder→elbow→wrist, locked >160° | Yes |
| Shoulders stacked | Horizontal offset wrist→shoulder | Yes |
| Full recoil | Cycle peak returns to baseline | Yes, relative only |
| Fatigue | Rolling amplitude vs first 10 compressions | Yes, relative only |
| Hands-off time | Stopwatch on non-COMPRESS states | Yes |
| **Absolute depth (cm)** | **Not possible without calibration** | **No. Never claim.** |

## State machine
```
TALK → SETUP → COMPRESS(n=1..30) → BREATH_PROMPT → BREATH_WINDOW(10s) → CHECK_RISE → COMPRESS
                ↕ STALLED (no compression for 1.5s)
after 5 cycles (~2 min) → SWAP_PROMPT (once, non-blocking)
```
Hands-only mode skips BREATH_PROMPT → CHECK_RISE, counts in 30-blocks continuously.

## Audio priority ladder
1. Phase instructions — interrupt anything
2. The count — continuous baseline at 110 BPM
3. Form corrections — only between two numbers, one every 5 compressions max, highest-priority violation only, never stack

## Live score
```
score = 0.4 * pace + 0.3 * arms + 0.3 * release
```
Rolling window of last 5 compressions (not lifetime, or it stops responding). Display huge, color-graded, one-line caption for the highest-priority failing component. When clean → `good, keep that pace` and stays quiet.

## Landmark indices (MediaPipe BlazePose)
- 11/12 shoulders, 13/14 elbows, 15/16 wrists
- Pick near arm by comparing `visibility` on 13 vs 14
- Verify `visibility` is populated in the web build — Android SDK has had a bug returning only x/y/z

## Two bugs that will eat time
1. **Canvas/video misalignment.** Set canvas `width`/`height` from `videoWidth`/`videoHeight`, not CSS pixels. Mirror x on front camera.
2. **Two poses in frame.** Patient lies under rescuer; single-pose flickers between them. Use `numPoses: 2`, select the more vertical pose, or frame tight to crop patient.

## Keys
Never `NEXT_PUBLIC_*`. All API keys behind Next.js API routes. If Capacitor ever enters the picture, that kills API routes (static export), which is another argument for staying PWA.

## PWA polish (do late, ~20 min)
- `manifest.json`, `display: standalone`, theme color, 192/512 icons
- `apple-touch-icon` 180×180, status-bar style
- `viewport-fit=cover` + `env(safe-area-inset-*)`
- `overscroll-behavior: none`, disable callout/select, `touch-action: manipulation`
- `navigator.vibrate()` on every compression peak (haptics feel native + functional)
- `navigator.wakeLock`
- Add to home screen before presenting; launch from icon
