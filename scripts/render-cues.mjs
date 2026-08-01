// One-time ElevenLabs render of every voice cue → public/audio/*.mp3
// Usage: node scripts/render-cues.mjs        (key from ELEVENLABS_API_KEY or .env.local)
// Idempotent: skips files that already exist. Delete an mp3 to re-render it.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/audio");

function loadKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  try {
    const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
    const m = env.match(/^ELEVENLABS_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  console.error("No ELEVENLABS_API_KEY in env or .env.local");
  process.exit(1);
}

const KEY = loadKey();
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL"; // Sarah (premade, works on free tier)
const MODEL = process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

// cue name (must match lib/audio/cues.ts) → spoken text
const NUMBERS = ["one","two","three","four","five","six","seven","eight","nine","ten",
  "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen",
  "nineteen","twenty","twenty-one","twenty-two","twenty-three","twenty-four","twenty-five",
  "twenty-six","twenty-seven","twenty-eight","twenty-nine","thirty"];

const TEXTS = {
  ...Object.fromEntries(NUMBERS.map(n => [n, n.replace("-", " ")])),
  // Breath phase — one line per on-screen step, spoken in this order with a pause
  // between each. Head tilt WITHOUT the chin lift does not open the airway, and an
  // unsealed mouth or a hard fast blow puts the air in the stomach — both were
  // missing from the earlier three-line version.
  "stop-compressions":  "Stop compressions.",
  "tilt-and-lift":      "Tilt the head back and lift the chin.",
  "pinch-and-seal":     "Pinch the nose. Seal your mouth over theirs.",
  "blow-one-second":    "Blow steadily for about one second.",
  "watch-then-repeat":  "Watch the chest rise, then give a second breath.",
  "resume-compressions":"Resume compressions now.",
  "swap-if-you-can":    "Swap rescuers if you can.",
  "straighten-arms":    "Straighten your arms.",
  "straighten-left-arm":"Straighten your left arm.",
  "straighten-right-arm":"Straighten your right arm.",
  "shoulders-over":     "Shoulders over your hands.",
  "push-harder":        "Push harder.",
  "let-it-rise":        "Let it rise fully.",
  "slow-down":          "Slow down a little.",
  "a-little-faster":    "A little faster.",
  "move-hands-centre":  "Move your hands to the centre of the chest.",
  "keep-going":         "Keep going.",
  "good-keep-that-pace":"Good. Keep that pace.",
  "cant-see-you":       "I can't see you. Step into view.",
  // Setup — same voice as everything else. Never fall back to browser speechSynthesis.
  "place-phone":        "Put the phone down where it can see your shoulders and hands.",
  // Framing corrections — one per camera-feedback message
  "turn-to-camera":     "Turn towards the camera.",
  "too-close":          "Too close. Move the phone back.",
  "too-far":            "Too far. Move a bit closer.",
  "hands-in-view":      "Keep your hands in view.",
  "move-to-centre":     "Move to the centre of the frame.",
};

mkdirSync(OUT, { recursive: true });

let rendered = 0, skipped = 0, failed = 0;
for (const [file, text] of Object.entries(TEXTS)) {
  const path = resolve(OUT, `${file}.mp3`);
  if (existsSync(path)) { skipped++; continue; }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // calm, even delivery — high stability stops the shouty read
        voice_settings: { stability: 0.85, similarity_boost: 0.75, speed: 1.0 },
      }),
    },
  );
  if (!res.ok) {
    failed++;
    console.error(`FAIL ${file}: ${res.status} ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  rendered++;
  console.log(`ok ${file}.mp3 ("${text}")`);
}
console.log(`\nrendered ${rendered}, skipped ${skipped} existing, failed ${failed}`);
if (failed) process.exit(1);
