"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "@/lib/pose/useCamera";
import { usePose } from "@/lib/pose/usePose";
import { getCameraFeedback } from "@/lib/vision/camera-feedback";
import type { CameraFeedback } from "@/types/vision";
import { LM, angleBetween } from "@/lib/vision/geometry";
import { ELBOW_LOCK_DEG } from "@/lib/coach/score";
import { createDetectState, detectPeak, currentBpm, TRACE_LEN } from "@/lib/coach/detect";
import { createSessionState, transition } from "@/lib/coach/state";
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

  // Detection + session state live in refs — 30fps loop never touches React state
  const detectRef  = useRef(createDetectState());
  const sessionRef = useRef(createSessionState());

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
      navigator.vibrate?.(40);
      setCount(next.compressCount);
      setBpm(currentBpm(detectRef.current));
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
        for (const [s, e, wIdx] of ARMS) {
          const sh = lm[s], el = lm[e], wr = lm[wIdx];
          if (!sh) continue;
          const bent = el && wr ? angleBetween(sh, el, wr) < ELBOW_LOCK_DEG : false;
          const color = bent ? "#ef4444" : "rgba(255,255,255,0.95)";

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
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(x(claspX), y(claspY), 10, 0, Math.PI * 2);
        ctx.fill();
        refX = claspX;
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

    const lm = landmarksRef.current;
    // Hands tracked = signal is fine; suppress body-framing nags entirely
    // (close stance keeps a partial pose that fails the completeness checks)
    setFeedback(
      handsRef.current?.length ? null
        : lm ? getCameraFeedback(lm)
        : { message: "No person detected", type: "warning" }
    );
    // TODO: wire real score from score.ts
  }

  return (
    <div className="h-full w-full bg-black flex flex-col overflow-hidden">

      {/* 1. Instruction banner — phase-driven, never overlaps video */}
      <div className="bg-sky-600 text-white text-center px-4 pt-12 pb-3 safe-top">
        <p className="text-sky-200 text-[11px] font-bold tracking-widest">{INSTRUCTIONS[phase].step}</p>
        <p className="font-bold text-xl leading-tight">{INSTRUCTIONS[phase].title}</p>
        <p className="text-sky-100 text-sm mt-0.5">{INSTRUCTIONS[phase].hint}</p>
      </div>

      {/* 2. Camera card — object-cover on BOTH fills the portrait card and keeps
          the overlay aligned (identical crop). Landscape streams get center-cropped. */}
      <div className="relative flex-1 m-2 rounded-2xl overflow-hidden bg-zinc-900">
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
}
