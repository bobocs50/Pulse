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
import { ensureRunning, loadBuffer, startMetronome, stopMetronome, preloadAll, playNow, playCorrection } from "@/lib/audio/engine";
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

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const traceRef   = useRef<HTMLCanvasElement>(null); // y-trace plot
  const offscreen  = useRef<OffscreenCanvas | null>(null);
  const rafRef     = useRef<number>(0);

  const [count, setCount]       = useState(0);
  const [phase, setPhase]       = useState<Phase>("IDLE");
  const [metroOn, setMetroOn]   = useState(false);
  const [rounds, setRounds]     = useState(0);
  const [elapsed, setElapsed]   = useState(0);
  const sessionStartRef         = useRef<number | null>(null);

  // Pre-start setup overlay
  const [setupDone, setSetupDone] = useState(false);
  const [setupStep, setSetupStep] = useState(0);
  const [victimAge, setVictimAge] = useState<"adult" | "child" | "infant">("adult");
  const setupStartedRef           = useRef(false);
  const setupTimersRef            = useRef<ReturnType<typeof setTimeout>[]>([]);

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

  // Setup sequence: fires once when camera becomes ready
  useEffect(() => {
    if (status !== "ready" || setupStartedRef.current) return;
    setupStartedRef.current = true;
    setSetupStep(0); playNow("moveHandsCentre");
    const t1 = setTimeout(() => { setSetupStep(1); playNow("shouldersOver"); }, 3000);
    const t2 = setTimeout(() => { setSetupStep(2); playNow("straightenArms"); }, 5500);
    const t3 = setTimeout(() => { setSetupDone(true); }, 8000);
    setupTimersRef.current = [t1, t2, t3];
    return () => setupTimersRef.current.forEach(clearTimeout);
  }, [status]); // eslint-disable-line

  function finishSetup() {
    setupTimersRef.current.forEach(clearTimeout);
    setSetupDone(true);
    ensureRunning().then(() => { startMetronome(); setMetroOn(true); });
  }

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
      playNow(COUNT_CUES[(next.compressCount - 1) % 30]); // spoken count on the peak
      setCount(next.compressCount);
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

    const { left, right } = bentRef.current;
    if (left || right) {
      playCorrection(left && right ? "straightenArms" : left ? "straightenLeftArm" : "straightenRightArm");
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
