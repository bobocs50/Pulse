# Demo Script — CPR Coach (~90 seconds on stage)

## Setup (do before presenting)
- Phone propped upright, rear camera facing you
- Shoulders and hands clearly in frame
- Tunnel running: `npx cloudflared tunnel --url http://localhost:3000`
- Launched from **home screen icon** (not Safari tab)
- `npm run dev` running with env vars loaded (restart if you changed .env.local)

---

## Step 1 — Call 112 screen

**Press Start on the home screen**

You see: "Call 112 right now" with a pulsing red phone button.

> For the demo: just tap "Done — continue" (you already called)

---

## Step 2 — Clara intro (voice agent, ~37s total)

Blob appears. Clara speaks immediately — no button to press.

**Clara says:** *"Hi, I'm Clara. I'm here to help you with CPR. What I need you to do first — tap their shoulders firmly and ask: are you okay?"*

**You say:** "They're not responding."

**Clara says:** *"Tilt their head back gently... Is there any breathing?"*

**You say:** "No, they're not breathing."  
→ Boxes tick: **Person unresponsive** ✓ · **Not breathing** ✓

**Clara says:** *"Tell me — is this an adult, a child, or an infant?"*

**You say:** "Adult."  
→ Box ticks: **Victim type noted** ✓

**Clara says:** *"Is someone getting an AED?"*

**You say:** "Yes."  
→ Box ticks: **AED status** ✓

**Clara says:** *"Kneel beside them... Tell me when you are in position."*

**You say:** "I'm in position."

**Clara says:** *"Good. Start pushing."*  
→ Box ticks: **In position** ✓ → coaching screen opens automatically

---

## Step 3 — Compressions (~50s)

- Skeleton appears on camera, arm lines visible
- Metronome starts at 95 BPM, count spoken on each beat
- **Do it wrong first** — bend your elbows → arm lines go **red**, Clara says "Straighten your arms"
- Fix your form → lines go **green**, score climbs on screen
- Point at the big score number climbing toward 100
- Count hits **30** → metronome pauses, breath prompt appears on screen

---

## Mute button (for explaining to judges)
Tap "Mic on" at the bottom of the Clara screen to mute yourself while talking to the audience. Tap again to unmute when answering Clara.

---

## What judges see
1. You talk to Clara — she walks you through the scene in ~37s, boxes tick off live
2. Camera picks up your pose the moment coaching starts
3. Score number visibly climbs as form improves
4. Count hits 30 → automated breath prompt

---

## If Clara doesn't connect
- Check browser console for errors — most likely the dev server needs a restart (`npm run dev`) to pick up `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`
- If mic permission is denied: tap "Skip — go straight to CPR" on the 112 screen

## If camera is slow
- Flip to front camera (top-right button on coach screen)
- Angle so shoulders and hands are clearly in frame
