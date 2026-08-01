"use client";
// Web Audio engine: buffer loader + lookahead scheduler + metronome
// All pre-rendered files, zero live TTS.
// iOS: AudioContext must be resumed on EVERY user gesture path — not just the first.
// After ElevenLabs agent handoff, call resume() again before the metronome starts.

import { CUE } from "./cues";

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
const buffers = new Map<string, AudioBuffer>();

export function getAudioContext(): AudioContext {
  if (!ctx) {
    // iOS 17+: declare "playback" so the hardware silent switch doesn't mute
    // Web Audio (default treats it as sound effects, silenced by the switch)
    try {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch { /* older iOS — silent switch must be off */ }
    ctx = new AudioContext();
  }
  return ctx;
}

// All audio routes through this analyser so getFrequencyData() reflects real output.
function getAnalyser(): AnalyserNode {
  const c = getAudioContext();
  if (!analyser) {
    analyser = c.createAnalyser();
    analyser.fftSize = 64;               // 32 bins — enough for 5 bar groups
    analyser.smoothingTimeConstant = 0.8; // built-in temporal smoothing
    analyser.connect(c.destination);
  }
  return analyser;
}

// Returns frequency magnitude data (0-255 per bin). Returns empty array before
// AudioContext exists (no user gesture yet — bars stay flat until first tap).
export function getFrequencyData(): Uint8Array {
  if (!ctx || !analyser) return new Uint8Array(0);
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data;
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

// Single voice channel: a new cue stops the previous one — never two voices at once.
// (Metronome clicks are a separate rhythm layer, unaffected.)
let voiceSrc: AudioBufferSourceNode | null = null;

export function playNow(name: string, onEnded?: () => void): void {
  const buf = buffers.get(name);
  if (!buf || !ctx) { onEnded?.(); return; }
  try { voiceSrc?.stop(); } catch {}
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(getAnalyser());
  src.onended = () => {
    // If a newer cue replaced us, voiceSrc has moved on — we were interrupted, so
    // don't run the callback (it would resume a sequence the interruption cancelled).
    if (voiceSrc !== src) return;
    voiceSrc = null;
    onEnded?.();
  };
  src.start();
  voiceSrc = src;
}

// Chain cues on the single voice channel. Each waits for the previous to end, so the
// breath prompt never talks over itself. gapMs is the silence between lines — running
// them back-to-back reads as rushed when someone is trying to follow along.
// onStep fires with the index about to be spoken, then -1 when the chain finishes.
export function playSequence(names: string[], gapMs = 0, onStep?: (index: number) => void): void {
  let i = 0;
  const step = () => {
    if (i >= names.length) { onStep?.(-1); return; }
    const idx = i++;
    onStep?.(idx);
    // An interrupted cue never calls back (playNow drops it), so the chain stops too.
    playNow(names[idx], () => setTimeout(step, gapMs));
  };
  step();
}

export function playCorrection(name: string): void {
  if (voiceSrc) return; // never talk over a count — wait for a free slot
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
      src.connect(getAnalyser()); // routes through analyser → destination
      src.start(t);
    } else {
      // click.mp3 not rendered yet — synthesized tick keeps the metronome real
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(gain);
      gain.connect(getAnalyser()); // routes through analyser → destination
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
