"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "@/lib/pose/useCamera";
import { usePose } from "@/lib/pose/usePose";
import { getCameraFeedback } from "@/lib/vision/camera-feedback";
import type { CameraFeedback } from "@/types/vision";
import { LM, nearArm } from "@/lib/vision/geometry";

// Offscreen canvas dimensions sent to worker (downscaled for speed)
const WORKER_W = 320;
const WORKER_H = 240;

// Skeleton connections for overlay: dim full body + bright arm chain
const BODY_CONNECTIONS: [number, number][] = [
  [11, 23], [23, 25], [25, 27], // left torso+leg
  [12, 24], [24, 26], [26, 28], // right torso+leg
  [11, 12], // shoulders
  [23, 24], // hips
];

export default function CoachPage() {
  const { videoRef, status } = useCamera();
  const { workerRef, landmarksRef, readyRef } = usePose();

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const traceRef   = useRef<HTMLCanvasElement>(null); // y-trace plot
  const offscreen  = useRef<OffscreenCanvas | null>(null);
  const rafRef     = useRef<number>(0);

  const [feedback, setFeedback] = useState<CameraFeedback>(null);
  const [score, setScore]       = useState<number | null>(null);
  const [count, setCount]       = useState(0);

  // Throttle ref for React state updates (~10fps)
  const lastStateUpdate = useRef(0);

  // Create offscreen canvas for zero-copy frame transfer to worker
  useEffect(() => {
    offscreen.current = new OffscreenCanvas(WORKER_W, WORKER_H);
  }, []);

  // Send video frames to worker via transferable ImageBitmap
  const sendFrame = useCallback(() => {
    const video  = videoRef.current;
    const worker = workerRef.current;
    const os     = offscreen.current;
    if (!video || !worker || !os || !readyRef.current || video.readyState < 2) return;

    const ctx = os.getContext("2d")!;
    ctx.drawImage(video, 0, 0, WORKER_W, WORKER_H);
    const bitmap = os.transferToImageBitmap();
    worker.postMessage({ type: "frame", bitmap, timestamp: performance.now() }, [bitmap]);
  }, [videoRef, workerRef, readyRef]);

  // Main loop: rVFC → fallback rAF
  useEffect(() => {
    if (status !== "ready") return;
    const video = videoRef.current;
    if (!video) return;

    let active = true;

    const tick = () => {
      if (!active) return;
      sendFrame();
      drawOverlay();
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

    if (!lm || lm.length < 17) return;

    // No mirror in draw coords — rear camera is not mirrored, and canvas has no CSS scaleX
    const x = (lx: number) => lx * w;
    const y = (ly: number) => ly * h;

    // Layer 1: dim full skeleton
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for (const [a, b] of BODY_CONNECTIONS) {
      if (!lm[a] || !lm[b]) continue;
      ctx.beginPath();
      ctx.moveTo(x(lm[a].x), y(lm[a].y));
      ctx.lineTo(x(lm[b].x), y(lm[b].y));
      ctx.stroke();
    }

    // Layer 2: near arm chain (pick by elbow visibility) — red placeholder until score wired
    const arm = nearArm(lm);
    if (arm.shoulder && arm.elbow && arm.wrist) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x(arm.shoulder.x), y(arm.shoulder.y));
      ctx.lineTo(x(arm.elbow.x),    y(arm.elbow.y));
      ctx.lineTo(x(arm.wrist.x),    y(arm.wrist.y));
      ctx.stroke();
    }

    // Y-trace: use near shoulder (same arm as we track)
    const shY = arm.shoulder?.y ?? lm[LM.leftShoulder]?.y ?? lm[LM.rightShoulder]?.y ?? 0;
    drawYTrace(shY);
  }

  // Rolling y-trace buffer for plot
  const yTraceBuffer = useRef<number[]>([]);
  function drawYTrace(yVal: number) {
    const canvas = traceRef.current;
    if (!canvas) return;
    const TRACE_W = canvas.width || 300;
    const TRACE_H = canvas.height || 80;

    yTraceBuffer.current.push(yVal);
    if (yTraceBuffer.current.length > TRACE_W) yTraceBuffer.current.shift();

    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0, 0, TRACE_W, TRACE_H);

    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    yTraceBuffer.current.forEach((v, i) => {
      const px = i;
      const py = v * TRACE_H;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  function updateStateThrottled() {
    const now = performance.now();
    if (now - lastStateUpdate.current < 100) return; // ~10fps
    lastStateUpdate.current = now;

    const lm = landmarksRef.current;
    setFeedback(lm ? getCameraFeedback(lm) : { message: "No person detected", type: "warning" });
    // TODO: wire real score from score.ts
  }

  return (
    <div className="relative h-full w-full bg-black overflow-hidden">

      {/* Camera feed — no CSS mirror, rear camera is already correct orientation */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      {/* Pose skeleton overlay — no CSS mirror, draw coords match video */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Camera feedback — top */}
      {feedback && (
        <div className="absolute top-0 inset-x-0 flex justify-center pt-12 safe-top pointer-events-none z-20">
          <div className="bg-amber-500/90 backdrop-blur-sm rounded-xl px-4 py-2">
            <p className="text-black font-semibold text-base">{feedback.message}</p>
          </div>
        </div>
      )}

      {/* Score — centre top */}
      <div className="absolute top-1/4 inset-x-0 flex flex-col items-center gap-1 z-10 pointer-events-none">
        <span className="text-8xl font-black tabular-nums leading-none" style={{
          color: score === null ? "#71717a"
               : score >= 80 ? "#22c55e"
               : score >= 50 ? "#f59e0b"
               : "#ef4444"
        }}>
          {score ?? "—"}
        </span>
        <span className="text-zinc-400 text-sm font-medium">quality score</span>
      </div>

      {/* Count — centre */}
      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <span className="text-6xl font-bold tabular-nums text-white/80">{count} / 30</span>
      </div>

      {/* Y-trace plot — bottom strip (required for peak detection tuning) */}
      <div className="absolute bottom-16 inset-x-0 safe-bottom px-2 z-20">
        <canvas
          ref={traceRef}
          width={390}
          height={80}
          className="w-full h-20 rounded-lg opacity-80"
        />
      </div>

      {/* Camera status */}
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
          <p className="text-zinc-400 text-lg">Starting camera…</p>
        </div>
      )}
      {status === "blocked" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-30 px-8 text-center">
          <p className="text-zinc-300 text-lg">Camera permission denied. Allow camera access and reload.</p>
        </div>
      )}
    </div>
  );
}
