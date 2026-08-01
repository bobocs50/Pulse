"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "@/lib/pose/useCamera";
import { usePose } from "@/lib/pose/usePose";
import { getCameraFeedback } from "@/lib/vision/camera-feedback";
import type { CameraFeedback } from "@/types/vision";
import { LM, angleBetween3D } from "@/lib/vision/geometry";

// Elbow color thresholds on the SMOOTHED 3D angle, with hysteresis so the
// V doesn't flicker at the boundary: red below 150°, back to green above 158°.
const BEND_TRIP_DEG  = 150;
const BEND_CLEAR_DEG = 158;
import { createDetectState, detectPeak, currentBpm, TRACE_LEN } from "@/lib/coach/detect";
import { createSessionState, transition } from "@/lib/coach/state";
import type { Phase } from "@/lib/coach/state";
import { ensureRunning, loadBuffer, startMetronome, stopMetronome, setOnBeat, getAudioContext, preloadAll, playNow, playCorrection } from "@/lib/audio/engine";
import { COUNT_CUES } from "@/lib/audio/cues";

const INSTRUCTIONS: Record<Phase, { step: string; title: string; hint: string }> = {
  IDLE:          { step: "STEP 1", title: "Get ready",          hint: "Stand over the pillow · clasp hands · lock elbows" },
  SETUP:         { step: "STEP 1", title: "Get ready",          hint: "Stand over the pillow · clasp hands · lock elbows" },
  COMPRESS:      { step: "STEP 2", title: "Push hard & fast",   hint: "Follow the beat — let it rise fully between pushes" },
  STALLED:       { step: "KEEP GOING", title: "Don't stop!",    hint: "Keep pushing — hard and fast" },
  BREATH_PROMPT: { step: "STEP 3", title: "Give 2 breaths",     hint: "Tilt the head back, lift the chin" },
  BREATH_WINDOW: { step: "STEP 3", title: "Give 2 breaths",     hint: "Tilt the head back, lift the chin" },
  CHECK_RISE:    { step: "STEP 3", title: "Watch the chest",    hint: "Then straight back on the chest" },
};

// Long side of frames sent to worker, aspect PRESERVED. Rehabify (reference)
// feeds full-res video — MediaPipe crops landmark ROIs from the input frame,
// so starving it below ~720 turns wrist/hand crops into upscaled mush.
const WORKER_LONG_SIDE = 720;

// Skeleton connections for overlay: dim full body + bright arm chain
// Arm chains drawn bright: shoulder anchor → elbow → line ends at wrist
const ARMS: [number, number, number][] = [
  [11, 13, 15], // left: shoulder, elbow, wrist
  [12, 14, 16], // right
];

const BODY_CONNECTIONS: [number, number][] = [
  [11, 23], [23, 25], [25, 27], // left torso+leg
  [12, 24], [24, 26], [26, 28], // right torso+leg
  [11, 12], // shoulders
  [23, 24], // hips
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
];

export default function CoachPage() {
  const { videoRef, status, facing, flip } = useCamera();
  const { workerRef, landmarksRef, handsRef, readyRef, pendingRef } = usePose();

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const traceRef   = useRef<HTMLCanvasElement>(null); // y-trace plot
  const offscreen  = useRef<OffscreenCanvas | null>(null);
  const rafRef     = useRef<number>(0);

  const [feedback, setFeedback] = useState<CameraFeedback>(null);
  const [score, setScore]       = useState<number | null>(null);
  const [count, setCount]       = useState(0);
  const [bpm, setBpm]           = useState<number | null>(null);
  const [phase, setPhase]       = useState<Phase>("IDLE");
  const [metroOn, setMetroOn]   = useState(false);
  const [beatCount, setBeatCount] = useState(0); // 1..30, manual metronome
  const [rounds, setRounds]     = useState(0);
  const [elapsed, setElapsed]   = useState(0); // seconds since first compression
  const sessionStartRef         = useRef<number | null>(null); // ms timestamp of first peak


  // Manual metronome: beat callback drives the count display; cleanup stops audio
  useEffect(() => {
    setOnBeat(b => {
      setBeatCount((b % 30) + 1);
    });
    return () => {
      setOnBeat(null);
      stopMetronome();
    };
  }, []);

  // Voice: decode all cues up front; unlock audio on the first tap anywhere (iOS)
  useEffect(() => {
    preloadAll().catch(() => {});
    const unlock = () => { ensureRunning(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  async function toggleMetronome() {
    if (metroOn) {
      stopMetronome();
      setMetroOn(false);
      return;
    }
    await ensureRunning(); // iOS: resume on every gesture path
    loadBuffer("click").catch(() => {}); // real click.mp3 if present, synth otherwise
    startMetronome();
    setMetroOn(true);
  }

  // Detection + session state live in refs — 30fps loop never touches React state
  const detectRef  = useRef(createDetectState());
  const sessionRef = useRef(createSessionState());
  const bentRef    = useRef({ left: false, right: false }); // per-arm bent state (set by drawOverlay)
  const armAngleRef = useRef({ left: 180, right: 180 });     // smoothed 3D elbow angles

  // Throttle ref for React state updates (~10fps)
  const lastStateUpdate = useRef(0);

  // Send video frames to worker via transferable ImageBitmap.
  // Offscreen canvas sized lazily from the real video dims, aspect preserved.
  const sendFrame = useCallback(() => {
    const video  = videoRef.current;
    const worker = workerRef.current;
    if (!video || !worker || !readyRef.current || video.readyState < 2) return;
    // Backpressure: never queue frames behind a busy worker — latency snowballs
    if (pendingRef.current) return;

    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const scale = WORKER_LONG_SIDE / Math.max(vw, vh);
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    if (!offscreen.current || offscreen.current.width !== w || offscreen.current.height !== h) {
      offscreen.current = new OffscreenCanvas(w, h);
    }

    const os = offscreen.current;
    const ctx = os.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);
    const bitmap = os.transferToImageBitmap();
    pendingRef.current = true;
    worker.postMessage({ type: "frame", bitmap, timestamp: performance.now() }, [bitmap]);
  }, [videoRef, workerRef, readyRef, pendingRef]);

  // Main loop: rVFC → fallback rAF
  useEffect(() => {
    if (status !== "ready") return;
    const video = videoRef.current;
    if (!video) return;

    let active = true;

    const tick = () => {
      if (!active) return;
      sendFrame();
      runDetection();
      drawOverlay();
      drawYTrace();
      updateStateThrottled();
    };

    if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
      const onFrame = () => {
        tick();
        if (active) (video as any).requestVideoFrameCallback(onFrame);
      };
      (video as any).requestVideoFrameCallback(onFrame);
    } else {
      const loop = () => {
        tick();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [status, sendFrame]); // eslint-disable-line

  function runDetection() {
    const lm = landmarksRef.current;
    const hands = handsRef.current;
    const now = performance.now();

    // TICK must run even with no tracking — stall detection can't freeze
    const isPeak = ((lm && lm.length >= 17) || hands?.length)
      ? detectPeak(detectRef.current, lm, hands ?? null, now)
      : false;
    const prev = sessionRef.current;
    const next = transition(prev, isPeak ? "PEAK" : "TICK", now);
    sessionRef.current = next;

    // React state only on actual change (~2Hz on peaks, rare on phase flips)
    if (isPeak) {
      if (sessionStartRef.current === null) sessionStartRef.current = now;
      navigator.vibrate?.(40);
      playNow(COUNT_CUES[(next.compressCount - 1) % 30]); // spoken count on the peak
      setCount(next.compressCount);
      setBpm(currentBpm(detectRef.current));
      if (next.cycleCount !== prev.cycleCount) setRounds(next.cycleCount);
    }
    if (next.phase !== prev.phase) setPhase(next.phase);
  }

  function drawOverlay() {
    const canvas  = canvasRef.current;
    const video   = videoRef.current;
    const lm      = landmarksRef.current;
    if (!canvas || !video) return;

    // IMPORTANT: size from video pixels, not CSS — avoids Rehabify's skeleton misalign bug
    if (canvas.width !== video.videoWidth)   canvas.width  = video.videoWidth  || 720;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight || 1280;

    const ctx = canvas.getContext("2d")!;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const hands = handsRef.current;
    if ((!lm || lm.length < 17) && !hands?.length) return;

    // No mirror in draw coords — rear camera is not mirrored, and canvas has no CSS scaleX
    const x = (lx: number) => lx * w;
    const y = (ly: number) => ly * h;

    let refX: number | null = null; // dashed reference line anchor

    if (lm && lm.length >= 17) {
      // Layer 1: dim full skeleton
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 2;
      for (const [a, b] of BODY_CONNECTIONS) {
        if (!lm[a] || !lm[b]) continue;
        ctx.beginPath();
        ctx.moveTo(x(lm[a].x), y(lm[a].y));
        ctx.lineTo(x(lm[b].x), y(lm[b].y));
        ctx.stroke();
      }

      // Layer 2: the "V" — one line from each shoulder to the clasped-palms
      // point. Three anchor dots: both shoulders + the clasp vertex.
      // Red is the error state only (that arm's elbow bent).
      let claspX: number | null = null, claspY: number | null = null;
      if (hands && hands.length) {
        let sx = 0, sy = 0, sn = 0;
        for (const hd of hands) for (const p of hd) { sx += p.x; sy += p.y; sn++; }
        if (sn) { claspX = sx / sn; claspY = sy / sn; }
      }
      if (claspX === null && lm[LM.leftWrist] && lm[LM.rightWrist]) {
        claspX = (lm[LM.leftWrist].x + lm[LM.rightWrist].x) / 2;
        claspY = (lm[LM.leftWrist].y + lm[LM.rightWrist].y) / 2;
      }

      if (claspX !== null && claspY !== null) {
        ctx.lineCap = "round";
        const bentNow = { left: false, right: false };
        for (const [s, e, wIdx] of ARMS) {
          const sh = lm[s], el = lm[e], wr = lm[wIdx];
          if (!sh) continue;
          const key = s === LM.leftShoulder ? "left" : "right";
          // 3D pose angle (shoulder→elbow→wrist): z removes the foreshortening
          // that made straight arms read ~150° in 2D when leaning at the camera
          let bent = bentRef.current[key];
          if (el && wr) {
            const raw = angleBetween3D(sh, el, wr);
            const sm = armAngleRef.current[key] * 0.7 + raw * 0.3;
            armAngleRef.current[key] = sm;
            bent = bent ? sm < BEND_CLEAR_DEG : sm < BEND_TRIP_DEG;
          }
          bentNow[key] = bent;
          const color = bent ? "#ef4444" : "#4ade80";

          ctx.strokeStyle = color;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(x(sh.x), y(sh.y));
          if (el) ctx.lineTo(x(el.x), y(el.y));
          ctx.lineTo(x(claspX), y(claspY));
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x(sh.x), y(sh.y), 10, 0, Math.PI * 2);
          ctx.fill();
          if (el) {
            ctx.beginPath();
            ctx.arc(x(el.x), y(el.y), 7, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Clasp vertex anchor
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.arc(x(claspX), y(claspY), 10, 0, Math.PI * 2);
        ctx.fill();
        refX = claspX;
        bentRef.current = bentNow;
      } else {
        bentRef.current = { left: false, right: false };
      }
    }

    // Layer 4: dashed vertical reference — shoulders should stack over the hands
    if (refX != null) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(x(refX), 0);
      ctx.lineTo(x(refX), h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

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

  function updateStateThrottled() {
    const now = performance.now();
    if (now - lastStateUpdate.current < 100) return; // ~10fps
    lastStateUpdate.current = now;

    if (sessionStartRef.current !== null) {
      setElapsed(Math.floor((now - sessionStartRef.current) / 1000));
    }

    const lm = landmarksRef.current;
    const { left, right } = bentRef.current;
    // Spoken correction, self-throttled by playCorrection's minimum gap
    if (left || right) {
      playCorrection(left && right ? "straightenArms" : left ? "straightenLeftArm" : "straightenRightArm");
    }
    // Posture correction outranks framing nags; hands tracked = framing is fine
    setFeedback(
      left && right ? { message: "Fix your posture — straighten your arms", type: "warning" }
        : left  ? { message: "Straighten your left arm", type: "warning" }
        : right ? { message: "Straighten your right arm", type: "warning" }
        : handsRef.current?.length ? null
        : lm ? getCameraFeedback(lm)
        : { message: "No person detected", type: "warning" }
    );
    // TODO: wire real score from score.ts
  }

  return (
    <div className="h-full w-full bg-[#F0EEE9] text-zinc-900 flex flex-col overflow-hidden">
      <style>{`
        @keyframes blobRest {
          0%,100% { border-radius:50%; transform:scale(1); }
          50%      { border-radius:55% 45% 52% 48% / 48% 55% 45% 52%; transform:scale(1.04); }
        }
        @keyframes blobTalk {
          0%   { border-radius:50%;                                transform:scale(1);    }
          20%  { border-radius:58% 42% 62% 38% / 52% 60% 40% 48%; transform:scale(1.11); }
          40%  { border-radius:38% 62% 44% 56% / 60% 40% 58% 42%; transform:scale(1.07); }
          60%  { border-radius:62% 38% 54% 46% / 42% 58% 42% 58%; transform:scale(1.13); }
          80%  { border-radius:44% 56% 46% 54% / 58% 42% 60% 40%; transform:scale(1.09); }
          100% { border-radius:50%;                                transform:scale(1);    }
        }
        @keyframes wbar1 { 0%,100%{height:5px}  25%{height:20px} 75%{height:10px} }
        @keyframes wbar2 { 0%,100%{height:18px} 40%{height:6px}  70%{height:22px} }
        @keyframes wbar3 { 0%,100%{height:24px} 50%{height:5px}             }
        @keyframes wbar4 { 0%,100%{height:12px} 35%{height:22px} 65%{height:6px}  }
        @keyframes wbar5 { 0%,100%{height:6px}  20%{height:18px} 60%{height:8px}  }
        .wbar { width:4px; border-radius:3px; background:rgba(255,255,255,0.88); }
        .wbar-1 { animation: wbar1 0.9s ease-in-out infinite; }
        .wbar-2 { animation: wbar2 0.75s ease-in-out infinite 0.12s; }
        .wbar-3 { animation: wbar3 0.82s ease-in-out infinite 0.06s; }
        .wbar-4 { animation: wbar4 0.68s ease-in-out infinite 0.18s; }
        .wbar-5 { animation: wbar5 0.95s ease-in-out infinite 0.09s; }
        .pb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
      `}</style>

      {/* ---- Main panel ---- */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Camera — fills all available height */}
        <div className="relative flex-1 overflow-hidden bg-zinc-900">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          />

          {/* Flip — top right */}
          <button
            onClick={flip}
            className="absolute top-3 right-3 z-10 bg-black/30 backdrop-blur-md rounded-full px-3 py-1.5 text-white/90 text-xs font-semibold"
            style={{ transition: "transform 150ms cubic-bezier(0.23,1,0.32,1)" }}
            onPointerDown={e => (e.currentTarget.style.transform = "scale(0.94)")}
            onPointerUp={e => (e.currentTarget.style.transform = "")}
            onPointerLeave={e => (e.currentTarget.style.transform = "")}
          >
            Flip
          </button>

          {/* Feedback toast — top center, inset from flip button */}
          {feedback && (
            <div className="absolute top-3 left-3 right-16 z-10 flex justify-center pointer-events-none">
              <div className="bg-amber-200/95 backdrop-blur-sm rounded-full px-4 py-2">
                <p className="text-amber-950 font-semibold text-xs">{feedback.message}</p>
              </div>
            </div>
          )}

          {status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20">
              <p className="text-zinc-400 text-lg">Starting camera…</p>
            </div>
          )}
          {status === "blocked" && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 z-20 px-8 text-center">
              <p className="text-zinc-300 text-lg">Camera permission denied. Allow camera access and reload.</p>
            </div>
          )}

          {/* Stats HUD — frosted pill overlaid on bottom of camera, all edges rounded */}
          {(() => {
            const PHASE_DOT: Record<Phase, string> = {
              IDLE: "bg-zinc-400", SETUP: "bg-zinc-400",
              COMPRESS: "bg-emerald-400", STALLED: "bg-amber-400",
              BREATH_PROMPT: "bg-sky-400", BREATH_WINDOW: "bg-sky-400", CHECK_RISE: "bg-sky-400",
            };
            const PHASE_LABEL: Record<Phase, string> = {
              IDLE: "READY", SETUP: "READY",
              COMPRESS: "PUSH", STALLED: "DON'T STOP",
              BREATH_PROMPT: "BREATHE", BREATH_WINDOW: "BREATHE", CHECK_RISE: "WATCH",
            };
            const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
            const ss = String(elapsed % 60).padStart(2, "0");
            return (
              <div
                className="absolute bottom-4 inset-x-4 z-10 rounded-2xl flex items-center px-4 py-3 gap-3"
                style={{
                  background: "rgba(255,255,255,0.82)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  boxShadow: "0 2px 20px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)",
                }}
              >
                {/* Phase indicator */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={`w-[7px] h-[7px] rounded-full ${PHASE_DOT[phase]}`} />
                  <span className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">{PHASE_LABEL[phase]}</span>
                </div>

                {/* Count — dominant */}
                <div className="flex items-baseline gap-[3px]">
                  <span className="text-[2.6rem] font-black tabular-nums leading-none tracking-tight text-zinc-900">{count}</span>
                  <span className="text-sm font-bold text-zinc-300 leading-none">/30</span>
                </div>

                <div className="flex-1" />

                {/* Time */}
                <div className="flex flex-col items-center gap-[3px]">
                  <span className="text-[8px] font-bold tracking-widest text-zinc-400 uppercase leading-none">TIME</span>
                  <span className="text-[1.05rem] font-bold tabular-nums text-zinc-700 leading-none">{`${mm}:${ss}`}</span>
                </div>

                <div className="w-px h-6 bg-zinc-200 shrink-0" />

                {/* Rounds */}
                <div className="flex flex-col items-center gap-[3px]">
                  <span className="text-[8px] font-bold tracking-widest text-zinc-400 uppercase leading-none">ROUNDS</span>
                  <span className="text-[1.05rem] font-bold tabular-nums text-zinc-700 leading-none">{rounds}</span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Blob strip — just enough space, camera gets everything else */}
        <div className="flex justify-center items-center pt-4 pb-safe bg-[#F0EEE9]">
          <div
            className="rounded-full"
            style={{ transition: "transform 150ms cubic-bezier(0.23,1,0.32,1)" }}
            onPointerDown={e => (e.currentTarget.style.transform = "scale(0.96)")}
            onPointerUp={e => (e.currentTarget.style.transform = "")}
            onPointerLeave={e => (e.currentTarget.style.transform = "")}
          >
            <button
              onClick={toggleMetronome}
              className="w-[4.5rem] h-[4.5rem] rounded-full focus:outline-none flex items-center justify-center gap-[4px]"
              style={{
                background: "radial-gradient(ellipse at 38% 30%, #F9AE72 0%, #E86B47 32%, #C44728 62%, #8C2410 100%)",
                animation: metroOn ? "blobTalk 0.545s ease-in-out infinite" : "blobRest 3s ease-in-out infinite",
                boxShadow: metroOn
                  ? "0 0 32px rgba(232,99,74,0.55), 0 0 10px rgba(200,70,40,0.35)"
                  : "0 4px 16px rgba(200,70,40,0.22)",
              }}
            >
              <span className="wbar wbar-1" style={{ height: 4 }} />
              <span className="wbar wbar-2" style={{ height: 15 }} />
              <span className="wbar wbar-3" style={{ height: 20 }} />
              <span className="wbar wbar-4" style={{ height: 10 }} />
              <span className="wbar wbar-5" style={{ height: 5 }} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
