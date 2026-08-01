"use client";
// Web Audio engine: buffer loader + lookahead scheduler + metronome
// All pre-rendered files, zero live TTS.
// iOS: AudioContext must be resumed on EVERY user gesture path — not just the first.
// After ElevenLabs agent handoff, call resume() again before the metronome starts.

import { CUE } from "./cues";

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// Call on every user gesture that starts a new audio phase (iOS requirement)
export async function ensureRunning(): Promise<void> {
  const c = getAudioContext();
  if (c.state !== "running") await c.resume();
}

export async function loadBuffer(name: string): Promise<AudioBuffer> {
  const cached = buffers.get(name);
  if (cached) return cached;

  const path = CUE[name];
  if (!path) throw new Error(`Unknown cue: ${name}`);

  const c = getAudioContext();
  const res = await fetch(path);
  const raw = await res.arrayBuffer();
  const buf = await c.decodeAudioData(raw);
  buffers.set(name, buf);
  return buf;
}

export async function preloadAll(): Promise<void> {
  await Promise.all(Object.keys(CUE).map(name => loadBuffer(name).catch(() => {})));
}

// Play a buffer immediately (fire and forget)
// priority: phase > count > correction. Never stack two corrections.
let lastCorrectionAt = 0;
const CORRECTION_MIN_GAP_MS = 5 * (60000 / 110); // every 5 compressions

export function playNow(name: string): void {
  const buf = buffers.get(name);
  if (!buf || !ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}

export function playCorrection(name: string): void {
  const now = performance.now();
  if (now - lastCorrectionAt < CORRECTION_MIN_GAP_MS) return;
  lastCorrectionAt = now;
  playNow(name);
}

// --- Metronome scheduler ---
// Drives the 110 BPM click. Spoken count is triggered by peak detection, not the scheduler.
// See lib/coach/detect.ts for peak → playNow(COUNT_CUES[n]) wiring.

const BPM = 110;
const BEAT_SEC = 60 / BPM;           // ~0.545s
const LOOKAHEAD_SEC = 0.1;           // schedule 100ms ahead
const SCHEDULE_INTERVAL_MS = 25;     // check every 25ms

let metronomeTick = 0;               // next beat index
let metronomeNextAt = 0;             // AudioContext time of next beat
let metronomeTimer: ReturnType<typeof setInterval> | null = null;

// UI hook: fires (via setTimeout aligned to the scheduled beat) once per beat
let onBeat: ((beat: number) => void) | null = null;
export function setOnBeat(cb: ((beat: number) => void) | null): void {
  onBeat = cb;
}

function scheduleTick() {
  if (!ctx) return;
  while (metronomeNextAt < ctx.currentTime + LOOKAHEAD_SEC) {
    const t = metronomeNextAt;
    const buf = buffers.get("click");
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(t);
    } else {
      // click.mp3 not rendered yet — synthesized tick keeps the metronome real
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    }
    if (onBeat) {
      const beatIndex = metronomeTick;
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      setTimeout(() => onBeat?.(beatIndex), delayMs);
    }
    metronomeTick++;
    metronomeNextAt += BEAT_SEC;
  }
}

export function startMetronome(): void {
  if (metronomeTimer) return;
  const c = getAudioContext();
  metronomeNextAt = c.currentTime + 0.05;
  metronomeTick = 0;
  metronomeTimer = setInterval(scheduleTick, SCHEDULE_INTERVAL_MS);
}

export function stopMetronome(): void {
  if (metronomeTimer) { clearInterval(metronomeTimer); metronomeTimer = null; }
}
