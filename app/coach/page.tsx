"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useCamera } from "@/lib/pose/useCamera";
import { usePose } from "@/lib/pose/usePose";
import { LM } from "@/lib/vision/geometry";

// Elbow flare detection — lateral offset of elbow from shoulder→clasp line.
// More robust than angle under compression lean foreshortening.
const FLARE_TRIP  = 0.13; // goes red above this
const FLARE_CLEAR = 0.10; // recovers to green below this
import { createDetectState, detectPeak, TRACE_LEN } from "@/lib/coach/detect";
import { createSessionState, transition } from "@/lib/coach/state";
import type { Phase } from "@/lib/coach/state";
import { ensureRunning, loadBuffer, startMetronome, stopMetronome, preloadAll, playNow, playCorrection, getFrequencyData } from "@/lib/audio/engine";
import { COUNT_CUES } from "@/lib/audio/cues";

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

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const traceRef     = useRef<HTMLCanvasElement>(null); // y-trace plot
  const offscreen    = useRef<OffscreenCanvas | null>(null);
  const rafRef       = useRef<number>(0);
  // Audio-reactive blob refs — driven by rAF loop, never by React state
  const blobRef      = useRef<HTMLButtonElement>(null);
  const barContainer = useRef<HTMLDivElement>(null);

  const [count, setCount]       = useState(0);
  const [phase, setPhase]       = useState<Phase>("IDLE");
  const [metroOn, setMetroOn]   = useState(false);
  const [rounds, setRounds]     = useState(0);
  const [elapsed, setElapsed]   = useState(0);
  const [toast, setToast]       = useState<string | null>(null);
  const sessionStartRef         = useRef<number | null>(null);
  const toastClearRef           = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastToastAt             = useRef(0);

  // Pre-start setup overlay — 3-step tap-through gate before compressions start
  const [setupDone, setSetupDone] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [inFrame, setInFrame]     = useState(false);
  const [victimAge, setVictimAge] = useState<"adult" | "child" | "infant">("adult");
  const setupStartedRef           = useRef(false);
  const setupDoneRef              = useRef(false);
  const setupStepRef              = useRef(0);
  const lastCantSeeAt             = useRef(0);

  useEffect(() => () => stopMetronome(), []);

  // Voice: decode all cues up front; unlock audio on the first tap anywhere (iOS)
  useEffect(() => {
    preloadAll().catch(() => {});
    const unlock = () => { ensureRunning(); };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Read victim age from URL once on mount
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get("age");
    if (a === "child" || a === "infant") setVictimAge(a);
  }, []);

  // Setup: play step 0 audio when camera becomes ready; user taps through the rest
  useEffect(() => {
    if (status !== "ready" || setupStartedRef.current) return;
    setupStartedRef.current = true;
    ensureRunning().then(() => playNow("placePhone"));
  }, [status]); // eslint-disable-line

  function advanceSetup(step: number) {
    setupStepRef.current = step;
    setSetupStep(step);
    if (step === 1) ensureRunning().then(() => playNow("keepUpWithBeats"));
    if (step === 2) ensureRunning().then(() => playNow("areYouReady"));
  }

  function finishSetup() {
    setupDoneRef.current = true;
    setSetupDone(true);
    ensureRunning().then(() => { startMetronome(); setMetroOn(true); });
  }

  // Audio-reactive blob: reads real AnalyserNode output, drives bar heights and
  // blob animation directly via DOM refs — zero React re-renders in this path.
  useEffect(() => {
    // Frequency bins (of 32 total at fftSize=64) mapped to 5 bars:
    // roughly sub-bass, bass, mid, presence, air — covers voice + metronome click
    const BIN_GROUPS = [[1,2],[3,5],[6,9],[10,14],[15,20]] as const;
    const smoothed = [0, 0, 0, 0, 0];
    let rafId: number;

    function frame() {
      rafId = requestAnimationFrame(frame);
      const data = getFrequencyData();
      const bars = barContainer.current?.children;
      let totalLevel = 0;

      for (let i = 0; i < 5; i++) {
        const [lo, hi] = BIN_GROUPS[i];
        let sum = 0;
        const count = hi - lo + 1;
        for (let b = lo; b <= hi; b++) sum += (data[b] ?? 0);
        const raw = sum / count / 255; // 0–1
        smoothed[i] = smoothed[i] * 0.72 + raw * 0.28; // lerp
        totalLevel += smoothed[i];
        if (bars?.[i]) {
          (bars[i] as HTMLElement).style.height = `${3 + smoothed[i] * 23}px`;
        }
      }

      const avg = totalLevel / 5;
      const blob = blobRef.current;
      if (blob) {
        const speaking = avg > 0.025;
        blob.style.animation = speaking
          ? "blobTalk 0.52s ease-in-out infinite"
          : "blobRest 3s ease-in-out infinite";
        blob.style.boxShadow = speaking
          ? `0 0 ${20 + avg * 48}px rgba(232,99,74,${(0.4 + avg * 0.5).toFixed(2)}), 0 0 10px rgba(200,70,40,0.35)`
          : "0 4px 16px rgba(200,70,40,0.22)";
      }
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
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
  const armFlareRef = useRef({ left: 0, right: 0 });         // smoothed elbow flare ratios

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
      const c = next.compressCount;
      // Only count out every 5th — less annoying than 1..30
      if (c % 5 === 0) {
        playNow(COUNT_CUES[(c - 1) % 30]);
      } else if (c === 8) {
        playNow("keepGoing");
      } else if (c === 18) {
        playNow("goodKeepThatPace");
      }
      setCount(c);
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
        for (const [s, e] of ARMS) {
          const sh = lm[s], el = lm[e];
          if (!sh) continue;
          const key = s === LM.leftShoulder ? "left" : "right";
          let bent = bentRef.current[key];
          if (el) {
            // perpendicular distance of elbow from the shoulder→clasp line, / line length
            const vx = claspX - sh.x, vy = claspY - sh.y;
            const len2 = vx * vx + vy * vy || 1;
            const raw = Math.abs(vx * (el.y - sh.y) - vy * (el.x - sh.x)) / len2;
            const sm = armFlareRef.current[key] * 0.7 + raw * 0.3;
            armFlareRef.current[key] = sm;
            bent = bent ? sm > FLARE_CLEAR : sm > FLARE_TRIP;
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
            // Live flare readout — calibration aid; un-mirror text on front camera
            const label = `${Math.round(armFlareRef.current[key] * 100)}`;
            const tx = x(el.x) + 16, ty = y(el.y) - 12;
            ctx.save();
            if (facing === "user") { ctx.scale(-1, 1); ctx.translate(-w, 0); }
            const fx = facing === "user" ? w - tx : tx;
            ctx.font = "700 26px system-ui";
            ctx.lineWidth = 4;
            ctx.strokeStyle = "rgba(0,0,0,0.7)";
            ctx.strokeText(label, fx, ty);
            ctx.fillStyle = "#ffffff";
            ctx.fillText(label, fx, ty);
            ctx.restore();
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

  function updateStateThrottled() {
    const now = performance.now();
    if (now - lastStateUpdate.current < 100) return; // ~10fps
    lastStateUpdate.current = now;

    if (sessionStartRef.current !== null) {
      setElapsed(Math.floor((now - sessionStartRef.current) / 1000));
    }

    // Track whether body is visible — shown on setup step 0
    const lm = landmarksRef.current;
    const visible = !!(lm && lm.length >= 17 && lm[11] && lm[12]);
    setInFrame(visible);
    // Speak "I can't see you" once every 4s while out of frame on step 0
    if (!setupDoneRef.current && setupStepRef.current === 0 && !visible && now - lastCantSeeAt.current > 4000) {
      lastCantSeeAt.current = now;
      playNow("cantSeeYou");
    }

    const { left, right } = bentRef.current;
    if (left || right) {
      const msg = left && right ? "Straighten your arms" : left ? "Straighten left arm" : "Straighten right arm";
      const cue = left && right ? "straightenArms" : left ? "straightenLeftArm" : "straightenRightArm";
      playCorrection(cue);
      // Toast dedupe: don't restart the pill for a still-active same-side warning
      if (now - lastToastAt.current > 2500 || toast !== msg) {
        lastToastAt.current = now;
        setToast(msg);
        if (toastClearRef.current) clearTimeout(toastClearRef.current);
        toastClearRef.current = setTimeout(() => setToast(null), 2500);
      }
    }
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
        .wbar {
          border-radius: 3px;
          background: rgba(255,255,255,0.90);
          transition: height 80ms ease-out;
          will-change: height;
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translate(-50%, -8px) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%,  0)   scale(1);    }
        }
        @keyframes countPop {
          0%   { transform: scale(1.18); }
          100% { transform: scale(1);    }
        }
        .count-pop { animation: countPop 180ms cubic-bezier(0.23,1,0.32,1); }
        .phase-dot { transition: background-color 250ms ease; }
        .pb-safe { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .slide-up { animation: slideUp 280ms cubic-bezier(0.23,1,0.32,1) both; }
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

          {/* Setup overlay — gates the session until user taps "Start CPR" */}
          {!setupDone && status === "ready" && (
            <div className="absolute inset-0 z-20 flex flex-col justify-end pointer-events-none">
              {/* Gradient scrim so card reads over camera */}
              <div
                className="absolute inset-x-0 bottom-0 h-2/3"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)" }}
              />

              {/* Out-of-frame warning — step 0 only */}
              {setupStep === 0 && !inFrame && (
                <div
                  className="absolute top-4 inset-x-4 flex items-center gap-2 rounded-2xl px-4 py-3 pointer-events-auto"
                  style={{ background: "rgba(217,119,6,0.92)", backdropFilter: "blur(12px)" }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                  <span className="text-white text-sm font-semibold leading-tight">
                    Move back — I can't see your shoulders
                  </span>
                </div>
              )}

              {/* Instruction card */}
              <div
                className="relative mx-3 mb-3 rounded-3xl px-5 pt-5 pb-5 pointer-events-auto"
                style={{
                  background: "rgba(240,238,233,0.96)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  boxShadow: "0 -4px 40px rgba(0,0,0,0.18), 0 2px 12px rgba(0,0,0,0.08)",
                }}
              >
                {setupStep === 0 && (
                  <>
                    <p className="text-[10px] font-bold tracking-widest text-[#E86B47] uppercase mb-1">Step 1 of 3 · Position</p>
                    <p className="text-2xl font-black text-zinc-900 leading-tight mb-1">Get in frame</p>
                    <p className="text-[13px] text-zinc-500 leading-snug mb-4">
                      Prop your phone so your shoulders and clasped hands are clearly visible. Kneel beside the person.
                    </p>
                    <button
                      onClick={() => advanceSetup(1)}
                      className="w-full py-[14px] rounded-2xl bg-zinc-900 text-white text-base font-bold"
                      style={{ letterSpacing: "0.01em" }}
                    >
                      I'm in position →
                    </button>
                  </>
                )}

                {setupStep === 1 && (
                  <>
                    <p className="text-[10px] font-bold tracking-widest text-[#E86B47] uppercase mb-1">Step 2 of 3 · Technique</p>
                    <p className="text-2xl font-black text-zinc-900 leading-tight mb-1">Push hard, keep the beat</p>
                    <p className="text-[13px] text-zinc-500 leading-snug mb-4">
                      Lock your elbows straight. Push hard enough to move their chest — and keep up with every click of the metronome. Don't slow down.
                    </p>
                    <button
                      onClick={() => advanceSetup(2)}
                      className="w-full py-[14px] rounded-2xl bg-zinc-900 text-white text-base font-bold"
                      style={{ letterSpacing: "0.01em" }}
                    >
                      Got it →
                    </button>
                  </>
                )}

                {setupStep === 2 && (
                  <>
                    <p className="text-[10px] font-bold tracking-widest text-[#E86B47] uppercase mb-1">Step 3 of 3 · Ready?</p>
                    <p className="text-2xl font-black text-zinc-900 leading-tight mb-1">Let's go</p>
                    <p className="text-[13px] text-zinc-500 leading-snug mb-4">
                      The metronome starts when you tap. Push on every beat — don't stop.
                    </p>
                    <button
                      onClick={finishSetup}
                      className="w-full py-[16px] rounded-2xl text-white text-lg font-black"
                      style={{
                        background: "radial-gradient(ellipse at 38% 30%, #F9AE72 0%, #E86B47 32%, #C44728 62%, #8C2410 100%)",
                        boxShadow: "0 4px 20px rgba(200,70,40,0.35)",
                        letterSpacing: "0.01em",
                      }}
                    >
                      Yes — Start CPR
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Warning toast — amber pill, top center */}
          {toast && (
            <div
              className="absolute top-3 left-1/2 z-20 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-white text-sm font-semibold"
              style={{
                transform: "translateX(-50%)",
                background: "rgba(217, 119, 6, 0.95)",
                boxShadow: "0 6px 20px rgba(180, 83, 9, 0.35)",
                animation: "toastIn 180ms cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              <span aria-hidden style={{ fontSize: 15, lineHeight: 1 }}>⚠</span>
              {toast}
            </div>
          )}

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

          {/* Stats HUD — frosted pill overlaid on bottom of camera */}
          {(() => {
            const PHASE_DOT: Record<Phase, string> = {
              IDLE: "bg-zinc-400", COMPRESS: "bg-emerald-400", STALLED: "bg-amber-400",
            };
            const PHASE_LABEL: Record<Phase, string> = {
              IDLE: "READY", COMPRESS: "PUSH", STALLED: "DON'T STOP",
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
                  <div className={`phase-dot w-[7px] h-[7px] rounded-full ${PHASE_DOT[phase]}`} />
                  <span className="text-[9px] font-bold tracking-widest text-zinc-500 uppercase">{PHASE_LABEL[phase]}</span>
                </div>

                {/* Count — dominant, pops on each compression */}
                <div className="flex items-baseline gap-[3px]">
                  <span key={count} className="count-pop text-[2.6rem] font-black tabular-nums leading-none tracking-tight text-zinc-900">{count}</span>
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

        {/* Blob strip */}
        <div className="flex justify-center items-center pt-5 pb-safe bg-[#F0EEE9]">
          <div
            style={{ transition: "transform 150ms cubic-bezier(0.23,1,0.32,1)" }}
            onPointerDown={e => (e.currentTarget.style.transform = "scale(0.96)")}
            onPointerUp={e => (e.currentTarget.style.transform = "")}
            onPointerLeave={e => (e.currentTarget.style.transform = "")}
          >
            <button
              ref={blobRef}
              onClick={toggleMetronome}
              className="w-[4.5rem] h-[4.5rem] rounded-full focus:outline-none flex items-center justify-center gap-[5px]"
              style={{
                background: "radial-gradient(ellipse at 38% 30%, #F9AE72 0%, #E86B47 32%, #C44728 62%, #8C2410 100%)",
                animation: metroOn ? "blobTalk 0.54s ease-in-out infinite" : "blobRest 3s ease-in-out infinite",
                boxShadow: metroOn
                  ? "0 0 32px rgba(232,107,71,0.55), 0 0 10px rgba(200,70,40,0.35)"
                  : "0 4px 16px rgba(200,70,40,0.22)",
                transition: "box-shadow 300ms ease",
              }}
            >
              {/* Heights start flat (3px). The audio rAF loop drives them via barContainer. */}
              <div ref={barContainer} className="flex items-center gap-[5px]">
                <span className="wbar" style={{ width: 3, height: 3 }} />
                <span className="wbar" style={{ width: 4, height: 3 }} />
                <span className="wbar" style={{ width: 5, height: 3 }} />
                <span className="wbar" style={{ width: 4, height: 3 }} />
                <span className="wbar" style={{ width: 3, height: 3 }} />
              </div>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
