# Front-View Compression Detection + A1 Guidance UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make compression counting actually work for the new demo position (standing at a table, front camera, full body in frame) and wrap the camera in the approved A1 guidance layout.

**Architecture:** Keep the existing worker → landmarksRef → 30fps loop pipeline untouched. Rewrite the signal layer (`detect.ts`) around mid-wrist y with shoulder fallback, implement the minimal state machine, flip camera feedback to front-view checks, and restructure the coach screen into the A1 vertical stack (instruction banner → camera card → chip row → y-trace).

**Tech Stack:** Next.js 16 / React 19 / TS / Tailwind, `@mediapipe/tasks-vision` in a Web Worker. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-01-front-view-detection-design.md`

## Global Constraints

- **Never touch React state from the 30fps loop** except: count/BPM/phase set only on peak or phase change (~2 Hz), camera feedback throttled to 10 fps. Landmarks, traces, detection state, session state live in `useRef`.
- **No new dependencies.** Verification is manual (typecheck + browser + phone) — user explicitly declined a test runner.
- **Constants (do not change):** `REFRACTORY_MS = 350`, `MIN_AMPLITUDE = 0.01` (starting point, tuned on device), stall = 1500 ms, BPM smoothing over last 3 intervals.
- **Never claim absolute depth in cm.**
- **Do not commit without asking the user first** (repo rule overrides this skill's commit steps — each task ends at "verified", then ask).
- Dev server for verification: `npx next dev --experimental-https`, phone URL `https://10.6.67.129:3000` (LAN IP already in `allowedDevOrigins`).
- MediaPipe y grows **downward**: compression bottom = local **max** of the y signal.

---

### Task 1: Real signal + peak detection in `lib/coach/detect.ts`

**Files:**
- Modify: `lib/coach/detect.ts` (full rewrite of the file)

**Interfaces:**
- Consumes: `Landmark` from `@/types/vision`, `LM` from `@/lib/vision/geometry` (both exist).
- Produces (Task 6 relies on these exact names):
  - `TRACE_LEN: number` (export)
  - `interface DetectState { wristTrace: number[]; shoulderTrace: number[]; peakFlags: boolean[]; runningMax: number; lastPeakAt: number; peakTimes: number[] }`
  - `createDetectState(): DetectState`
  - `detectPeak(state: DetectState, lm: Landmark[], nowMs: number): boolean` — mutates `state`, pushes one sample per call onto all three trace arrays
  - `currentBpm(state: DetectState): number | null`
  - `shoulderY(lm: Landmark[]): number` (kept), `midWristY(lm: Landmark[]): number | null`, `compressionSignal(lm: Landmark[]): number`

- [ ] **Step 1: Replace the entire contents of `lib/coach/detect.ts` with:**

```ts
// Peak detection on the compression signal. One peak = one compression.
// Y increases downward in MediaPipe (0 = top, 1 = bottom), so the bottom
// of a compression is a local MAX. Front view: the clasped wrists are the
// stroke itself — highest-amplitude signal. Shoulder-y is the fallback.
import type { Landmark } from "@/types/vision";
import { LM } from "@/lib/vision/geometry";

export const REFRACTORY_MS = 350;   // minimum ms between peaks
export const MIN_AMPLITUDE = 0.01;  // minimum y-excursion to count (tune with y-trace plot)
export const TRACE_LEN = 150;       // ~5s at 30fps
const VIS_MIN = 0.5;

export interface DetectState {
  wristTrace: number[];     // compression signal ring buffer (for plot + tuning)
  shoulderTrace: number[];  // fallback signal ring buffer (plot only)
  peakFlags: boolean[];     // parallel to wristTrace: true where a peak was accepted
  runningMax: number;       // max signal since last accepted peak (-1 = unseeded)
  lastPeakAt: number;       // ms timestamp of last accepted peak
  peakTimes: number[];      // last 4 accepted peak timestamps (BPM over last 3 intervals)
}

export function createDetectState(): DetectState {
  return {
    wristTrace: [],
    shoulderTrace: [],
    peakFlags: [],
    runningMax: -1,
    lastPeakAt: 0,
    peakTimes: [],
  };
}

export function shoulderY(lm: Landmark[]): number {
  const lv = lm[LM.leftShoulder]?.visibility ?? 0;
  const rv = lm[LM.rightShoulder]?.visibility ?? 0;
  return lv >= rv ? (lm[LM.leftShoulder]?.y ?? 0) : (lm[LM.rightShoulder]?.y ?? 0);
}

export function midWristY(lm: Landmark[]): number | null {
  const l = lm[LM.leftWrist];
  const r = lm[LM.rightWrist];
  const lok = (l?.visibility ?? 0) >= VIS_MIN;
  const rok = (r?.visibility ?? 0) >= VIS_MIN;
  if (lok && rok) return (l.y + r.y) / 2;
  if (lok) return l.y;
  if (rok) return r.y;
  return null;
}

export function compressionSignal(lm: Landmark[]): number {
  return midWristY(lm) ?? shoulderY(lm);
}

// Call once per frame. Pushes one sample onto the traces, returns true if
// this frame completes a compression (signal has risen MIN_AMPLITUDE off
// the running max, outside the refractory window).
export function detectPeak(state: DetectState, lm: Landmark[], nowMs: number): boolean {
  const y = compressionSignal(lm);
  const sy = shoulderY(lm);

  state.wristTrace.push(y);
  state.shoulderTrace.push(sy);
  state.peakFlags.push(false);
  if (state.wristTrace.length > TRACE_LEN) {
    state.wristTrace.shift();
    state.shoulderTrace.shift();
    state.peakFlags.shift();
  }

  if (state.runningMax < 0) {
    state.runningMax = y;
    return false;
  }
  if (y > state.runningMax) {
    state.runningMax = y;
    return false;
  }

  const risen = state.runningMax - y;
  if (risen >= MIN_AMPLITUDE && nowMs - state.lastPeakAt >= REFRACTORY_MS) {
    state.lastPeakAt = nowMs;
    state.peakTimes.push(nowMs);
    if (state.peakTimes.length > 4) state.peakTimes.shift();
    state.peakFlags[state.peakFlags.length - 1] = true;
    state.runningMax = y;
    return true;
  }
  return false;
}

// 60 / mean inter-peak interval, over the last 3 intervals max.
export function currentBpm(state: DetectState): number | null {
  const t = state.peakTimes;
  if (t.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < t.length; i++) sum += t[i] - t[i - 1];
  const meanMs = sum / (t.length - 1);
  return Math.round(60000 / meanMs);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean). `app/coach/page.tsx` does not import `DetectState` yet, so the shape change breaks nothing.

---

### Task 2: Minimal state machine in `lib/coach/state.ts`

**Files:**
- Modify: `lib/coach/state.ts` (replace only the `transition` function; types/constants stay)

**Interfaces:**
- Consumes: existing `SessionState`, `Phase`, `STALL_MS` in the same file.
- Produces (Task 6 relies on): `transition(state: SessionState, event: "PEAK" | "TICK" | "START" | "SKIP_BREATH", nowMs: number): SessionState` — pure, returns new object on change. PEAK → COMPRESS and increments `compressCount` (wraps 30 → 1, bumps `cycleCount`). TICK in COMPRESS after 1500 ms without a peak → STALLED. Breath phases stay unimplemented (Hour 3).

- [ ] **Step 1: Replace the `transition` function (and its TODO comment) with:**

```ts
// Breath phases (BREATH_PROMPT/BREATH_WINDOW/CHECK_RISE) are wired in Hour 3
// with the audio cues. Until then compressions count in continuous 30-blocks.
export function transition(
  state: SessionState,
  event: "PEAK" | "TICK" | "START" | "SKIP_BREATH",
  nowMs: number,
): SessionState {
  switch (event) {
    case "START":
      return { ...state, phase: "SETUP" };

    case "PEAK": {
      const wrapped = state.compressCount >= 30;
      return {
        ...state,
        phase: "COMPRESS",
        compressCount: wrapped ? 1 : state.compressCount + 1,
        cycleCount: wrapped ? state.cycleCount + 1 : state.cycleCount,
        lastCompressAt: nowMs,
      };
    }

    case "TICK":
      if (state.phase === "COMPRESS" && nowMs - state.lastCompressAt > STALL_MS) {
        return { ...state, phase: "STALLED" };
      }
      return state;

    case "SKIP_BREATH":
      return state;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (PEAK from IDLE/SETUP/STALLED lands in COMPRESS with the count continuing — that is the spec behavior for stall recovery, and first-peak start.)

---

### Task 3: Front-view camera feedback in `lib/vision/camera-feedback.ts`

**Files:**
- Modify: `lib/vision/camera-feedback.ts`

**Interfaces:**
- Produces: `getCameraFeedback(lm: Landmark[]): CameraFeedback` — same signature, front-view semantics. No caller changes needed.

- [ ] **Step 1: Update the header comment and imports.** Replace lines 1–4 with:

```ts
// Adapted from Rehabify camera-feedback.ts
// Front-view checks: demo position faces the camera (standing at a table)
import type { Landmark, CameraFeedback } from "@/types/vision";
import { LM } from "./geometry";
```

(`distance2D`, `midpoint`, `isSideView` are no longer used here — `isSideView` stays in `geometry.ts` for the old side setup.)

- [ ] **Step 2: Replace the side-view block.** Replace:

```ts
  // CPR-specific: require side view
  if (!isSideView(lm)) return { message: "Turn sideways to the camera", type: "warning" };
```

with:

```ts
  // Front view: shoulders square to the camera, hands trackable, roughly centred
  const lsh = lm[LM.leftShoulder];
  const rsh = lm[LM.rightShoulder];
  if (!vis(lsh) || !vis(rsh)) return { message: "Face the camera", type: "warning" };
  if (!vis(lm[LM.leftWrist]) && !vis(lm[LM.rightWrist]))
    return { message: "Keep your hands in view", type: "warning" };
  const cx = (lsh.x + rsh.x) / 2;
  if (cx < 0.2 || cx > 0.8) return { message: "Step to the centre", type: "warning" };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (watch for unused-import errors if Step 1 was skipped).

---

### Task 4: Front camera by default in `lib/pose/useCamera.ts`

**Files:**
- Modify: `lib/pose/useCamera.ts:9` (the `useState` initial value)

**Interfaces:**
- Produces: unchanged hook API `{ videoRef, status, facing, flip }`; initial `facing` is now `"user"`.

- [ ] **Step 1: Change the initial facing state**

```ts
  const [facing, setFacing] = useState<"environment" | "user">("user");
```

Also update the comment above the hook: the demo position is front camera at a table; `"environment"` remains available via flip for the floor/side setup.

- [ ] **Step 2: Verify in desktop browser**

Run dev server if not running. Open `https://localhost:3000/coach`. Expected: camera starts mirrored (front-camera path), "Flip camera" still switches.

---

### Task 5: A1 layout restructure in `app/coach/page.tsx` (UI only)

**Files:**
- Modify: `app/coach/page.tsx` (JSX return + an `INSTRUCTIONS` map; loop wiring is Task 6)

**Interfaces:**
- Consumes: `Phase` type from `@/lib/coach/state`.
- Produces: `phase` state variable (`useState<Phase>("IDLE")`) and A1 DOM slots that Task 6 fills: count badge shows `count`, chips show `score`/`bpm`, banner shows `INSTRUCTIONS[phase]`.

- [ ] **Step 1: Add imports and the instructions map** (top of file, after existing imports):

```ts
import type { Phase } from "@/lib/coach/state";

const INSTRUCTIONS: Record<Phase, { step: string; title: string; hint: string }> = {
  IDLE:          { step: "STEP 1", title: "Get ready",          hint: "Stand over the pillow · clasp hands · lock elbows" },
  SETUP:         { step: "STEP 1", title: "Get ready",          hint: "Stand over the pillow · clasp hands · lock elbows" },
  COMPRESS:      { step: "STEP 2", title: "Push hard & fast",   hint: "Follow the beat — let it rise fully between pushes" },
  STALLED:       { step: "KEEP GOING", title: "Don't stop!",    hint: "Keep pushing — hard and fast" },
  BREATH_PROMPT: { step: "STEP 3", title: "Give 2 breaths",     hint: "Tilt the head back, lift the chin" },
  BREATH_WINDOW: { step: "STEP 3", title: "Give 2 breaths",     hint: "Tilt the head back, lift the chin" },
  CHECK_RISE:    { step: "STEP 3", title: "Watch the chest",    hint: "Then straight back on the chest" },
};
```

- [ ] **Step 2: Add state hooks** next to the existing `score`/`count` state:

```ts
  const [bpm, setBpm]     = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("IDLE");
```

- [ ] **Step 3: Replace the entire JSX return with the A1 stack** (removes: full-bleed video/canvas, huge center score, center count, old absolute-positioned trace/button):

```tsx
  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">

      {/* 1. Instruction banner — phase-driven, never overlaps video */}
      <div className="bg-sky-600 text-white text-center px-4 pt-12 pb-3 safe-top">
        <p className="text-sky-200 text-[11px] font-bold tracking-widest">{INSTRUCTIONS[phase].step}</p>
        <p className="font-bold text-xl leading-tight">{INSTRUCTIONS[phase].title}</p>
        <p className="text-sky-100 text-sm mt-0.5">{INSTRUCTIONS[phase].hint}</p>
      </div>

      {/* 2. Camera card */}
      <div className="relative flex-1 m-2 rounded-2xl overflow-hidden bg-zinc-900">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
        />

        {/* Count badge */}
        <div className="absolute top-3 left-3 bg-green-500 text-black font-extrabold text-2xl tabular-nums rounded-lg px-3 py-1 z-10">
          {count} / 30
        </div>

        {/* Flip camera */}
        <button
          onClick={flip}
          className="absolute top-3 right-3 z-10 bg-zinc-800/80 backdrop-blur-sm rounded-full px-3 py-2 text-white text-xs font-semibold"
        >
          Flip
        </button>

        {/* Camera feedback toast */}
        {feedback && (
          <div className="absolute bottom-3 inset-x-3 z-10 flex justify-center pointer-events-none">
            <div className="bg-amber-500/90 backdrop-blur-sm rounded-xl px-4 py-2">
              <p className="text-black font-semibold text-sm">{feedback.message}</p>
            </div>
          </div>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20">
            <p className="text-zinc-400 text-lg">Starting camera…</p>
          </div>
        )}
        {status === "blocked" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-20 px-8 text-center">
            <p className="text-zinc-300 text-lg">Camera permission denied. Allow camera access and reload.</p>
          </div>
        )}
      </div>

      {/* 3. Chip row */}
      <div className="flex justify-center gap-2 px-2 pb-1 text-sm text-zinc-300">
        <span className="bg-zinc-800 rounded-full px-4 py-1">
          score <b className="tabular-nums" style={{
            color: score === null ? "#71717a" : score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444"
          }}>{score ?? "—"}</b>
        </span>
        <span className="bg-zinc-800 rounded-full px-4 py-1">
          bpm <b className="tabular-nums text-white">{bpm ?? "—"}</b>
        </span>
      </div>

      {/* 4. Y-trace strip (peak-tuning interface — non-optional) */}
      <div className="px-2 pb-4 safe-bottom">
        <canvas ref={traceRef} width={390} height={80} className="w-full h-20 rounded-lg" />
      </div>
    </div>
  );
```

- [ ] **Step 4: Typecheck + visual check**

Run: `npx tsc --noEmit` → clean (note: `bpm`/`phase` are set in Task 6; if TS flags unused setters, that's acceptable to defer one task, or silence by wiring Task 6 immediately after).
Browser `https://localhost:3000/coach`: banner on top ("STEP 1 · Get ready"), camera in rounded card with `0 / 30` badge and Flip button, chip row, y-trace strip at bottom. Skeleton still aligned on body inside the card (both video and canvas use the same `object-contain` + mirror, so draw coords still match).

---

### Task 6: Wire detection → count/BPM/phase + dual y-trace in `app/coach/page.tsx`

**Files:**
- Modify: `app/coach/page.tsx` (imports, refs, `tick`, `drawYTrace`)

**Interfaces:**
- Consumes: Task 1 (`createDetectState`, `detectPeak`, `currentBpm`, `TRACE_LEN`, `DetectState` fields `wristTrace`, `shoulderTrace`, `peakFlags`), Task 2 (`createSessionState`, `transition`), Task 5 (`setCount`, `setBpm`, `setPhase`).

- [ ] **Step 1: Add imports**

```ts
import { createDetectState, detectPeak, currentBpm, TRACE_LEN } from "@/lib/coach/detect";
import { createSessionState, transition } from "@/lib/coach/state";
```

- [ ] **Step 2: Add refs** (next to the other refs; refs, never state — 30fps loop):

```ts
  const detectRef  = useRef(createDetectState());
  const sessionRef = useRef(createSessionState());
```

- [ ] **Step 3: Add detection to the loop.** Inside `tick` (currently `sendFrame(); drawOverlay(); updateStateThrottled();`), insert a `runDetection()` call after `sendFrame()`, and add the function:

```ts
  function runDetection() {
    const lm = landmarksRef.current;
    if (!lm || lm.length < 17) return;
    const now = performance.now();

    const isPeak = detectPeak(detectRef.current, lm, now);
    const prev = sessionRef.current;
    const next = transition(prev, isPeak ? "PEAK" : "TICK", now);
    sessionRef.current = next;

    // React state only on actual change (~2Hz on peaks, rare on phase flips)
    if (isPeak) {
      navigator.vibrate?.(40);
      setCount(next.compressCount);
      setBpm(currentBpm(detectRef.current));
    }
    if (next.phase !== prev.phase) setPhase(next.phase);
  }
```

- [ ] **Step 4: Replace `drawYTrace` with the dual-line, auto-scaled, peak-dot version.** Delete the `yTraceBuffer` ref and the old `drawYTrace(yVal)` function, remove the `drawYTrace(shY)` call (and the `shY` computation) from `drawOverlay`, and call the new `drawYTrace()` (no argument) from `tick` after `drawOverlay()`:

```ts
  // Dual-line trace: wrist signal (green, drives detection) + shoulder (dim, fallback).
  // Auto-scaled to the window so small normalized motion stays readable while tuning.
  function drawYTrace() {
    const canvas = traceRef.current;
    if (!canvas) return;
    const st = detectRef.current;
    if (st.wristTrace.length < 2) return;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, W, H);

    let lo = Infinity, hi = -Infinity;
    for (const v of st.wristTrace)    { if (v < lo) lo = v; if (v > hi) hi = v; }
    for (const v of st.shoulderTrace) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.1 || 0.005;
    lo -= pad; hi += pad;

    const px = (i: number) => (i / (TRACE_LEN - 1)) * W;
    const py = (v: number) => ((v - lo) / (hi - lo)) * H;

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    st.shoulderTrace.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
    ctx.stroke();

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    st.wristTrace.forEach((v, i) => (i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v))));
    ctx.stroke();

    ctx.fillStyle = "#f59e0b";
    st.peakFlags.forEach((f, i) => {
      if (!f) return;
      ctx.beginPath();
      ctx.arc(px(i), py(st.wristTrace[i]), 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
```

- [ ] **Step 5: Typecheck + desktop verify**

Run: `npx tsc --noEmit` → clean. Also remove the now-unused `LM` import if `shY` was its last use (keep `nearArm`, `angleBetween`).
Browser check: bob up and down toward the camera with clasped hands — count badge increments once per bob, banner flips "Get ready" → "Push hard & fast", stopping 1.5 s flips it to "Don't stop!", orange dots appear on the green trace at each bob, bpm chip shows a number after 2 bobs.

---

### Task 7: On-phone acceptance + `MIN_AMPLITUDE` tuning (manual, with the user)

**Files:** none (tuning may adjust `MIN_AMPLITUDE` in `lib/coach/detect.ts:9`)

- [ ] **Step 1:** Dev server + phone: `npx next dev --experimental-https`, open `https://10.6.67.129:3000/coach` on the iPhone (accept cert), stand at the table over the pillow, full body in frame.
- [ ] **Step 2:** Run the spec's acceptance test: 10 real compressions on the pillow → count reads exactly **10** (no doubles, no misses); orange dots align with pumps; BPM within ±10 of stopwatch tempo; stopping 1.5 s → "Don't stop!" banner; resuming continues the count.
- [ ] **Step 3:** If misses → lower `MIN_AMPLITUDE` (try 0.007); if double-counts → raise it (try 0.015–0.02); re-test. The green line and dots on the trace are the tuning interface. If the wrist line is noisy/jumpy while the dim shoulder line is clean, consider raising OneEuroFilter `beta` in `lib/vision/landmark-filter.ts` — flag to the user before changing it.
- [ ] **Step 4:** Verify front-view feedback: step half out of frame → "Step to the centre"; hide hands below table edge → "Keep your hands in view" (and detection falls back to the shoulder line without crashing).
- [ ] **Step 5:** Ask the user whether to commit the whole feature (repo rule: never commit unasked).

---

## Self-review notes

- **Spec coverage:** §1 signal → Task 1; §2 peaks/BPM → Task 1; §3 count/state/wiring → Tasks 2+6; §4 camera+feedback → Tasks 3+4; §5 A1 layout → Task 5; error handling → Tasks 1 (fallback) + 3; acceptance → Task 7. Elbow-angle arm coloring already exists (kept in Task 5's card).
- **Type consistency:** `DetectState` fields consumed in Task 6's `drawYTrace` (`wristTrace`, `shoulderTrace`, `peakFlags`) match Task 1's interface; `transition` signature in Task 6 matches Task 2; `Phase` keys in `INSTRUCTIONS` match `state.ts`'s union exactly (7 phases).
- **Known judgment call:** peak dot is drawn at the detection frame (start of upstroke), not the exact bottom — visually ~1–2 samples right of the trough. Acceptable for tuning; not worth index bookkeeping in a ring buffer.
