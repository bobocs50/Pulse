# Clio — Patterns Worth Stealing
# Source: github.com/inin-zou/Clio (Berlin Hack 2026, insurance voice agent)
#
# Their stack: PersonaPlex 7B (Moshi fork) on Modal A100, Python FastAPI, LiveKit.
# Our stack: ElevenLabs Agents, Next.js. NO code to steal — wrong language + SDK.
# What IS useful: three agent design patterns documented below.

---

## 1. Hallucination prevention rule

**Their rule (from agent system prompt):**
> "NEVER guess or invent identifiers such as policy numbers or licence plates. ASK for it."

**CPR equivalent — put this in your ElevenLabs agent system prompt:**
> "NEVER claim to know compression depth in centimetres. You cannot measure it from the camera.
>  NEVER diagnose the patient. NEVER speculate about cause of collapse.
>  If you are unsure, stay silent or say 'keep going'."

**Why it matters:** Their agent was hallucinating policy numbers when given no input.
Our agent could hallucinate confident-sounding medical claims. Same failure mode, same fix.

---

## 2. Slot tier system for intake

Clio classifies what the agent must collect into tiers. Apply to CPR intake:

| Tier | CPR equivalent | Examples |
|------|---------------|---------|
| CRITICAL | Must confirm before starting compressions | 112 called, person unresponsive/not breathing, rescuer kneeling beside them |
| EXPECTED | Collect if possible, don't block on | Approx patient age, alone or others nearby |
| CONDITIONAL | Only if triggered by context | Child/infant → scope stop. Trauma/drowning → scope stop. |
| PASSIVE | Never ask, infer from conversation | Panic level (affects how calm/slow the agent speaks) |

**Implementation:** agent system prompt should say:
> "Before calling start_compressions, confirm three things:
>  1. 112 has been called (or someone is calling)
>  2. The person is unresponsive and not breathing normally
>  3. The rescuer is kneeling beside them with hands on the chest
>  If any CONDITIONAL triggers apply (child, infant, drowning, choking, trauma),
>  stop coaching and tell them to stay on the line with the dispatcher."

---

## 3. Readback confirmation before handoff

**Their pattern:** Sarah reads back captured data before committing.
> "Just to confirm: your policy number is [X], the incident happened on [date] at [location]?"
> Caller confirms → data is locked → next phase begins.

**CPR equivalent — agent says before calling start_compressions:**
> "112 is called, you're kneeling beside them, heel of your hand on the centre of their chest.
>  Starting compressions now."

This serves two purposes:
- Confirms the rescuer is actually in position (not just saying they are)
- The final calm sentence before the coaching loop starts settles their panic

**In code (ElevenLabs tool call):**
```js
useConversationClientTool("start_compressions", async () => {
  await endSession();     // release mic
  setPhase("COMPRESS");  // geometry loop takes over
  return { success: true };
});
```
The readback is the agent's last spoken line before the tool fires.

---

## 4. Intervention gate (bonus — already in your architecture)

Clio's intervention gate: behavioral rules sit in Python code, not in the LLM prompt.
The LLM generates speech; the code overrides it when rules trigger.

Your equivalent is already designed: the audio priority ladder.
Phase instructions (stop compressions, tilt head) fire from local pre-rendered audio,
not from the agent. The agent cannot override them. Same pattern, different implementation.

Their gotcha: "Setting text tokens to PAD doesn't mute audio output."
Translation: you can't rely on prompting alone to silence an LLM mid-speech.
Use your local Web Audio for timing-critical cues. Let the agent handle context-aware speech.

---

## What Clio confirmed about your architecture

- Their co-location insight (audio never crosses the backend boundary) validates your Worker design.
  Landmark data never leaves the device. Corrections play from local files. Same principle.

- Their 80-second cold start problem (solved with keep_warm) is a Vercel concern for you too.
  Vercel serverless functions cold-start on first request. Pre-warm your API routes or use
  edge functions for the placement check. Not critical for the demo if you load the page first.

- Their "never let the LLM drive timing" rule matches your architecture exactly.
  Count and metronome are local. Agent speaks around them, never drives them.
