// SOURCE: github.com/obro79/Rehabify/src/hooks/use-form-event-bridge.ts
// This is THE most important voice file to steal from.
//
// WHAT IT DOES:
// Watches the exercise store (reps, errors) and injects structured context
// to the LLM when form issues are detected or reps complete.
//
// FOR CPR — adapt this as follows:
//   - Instead of watching exerciseStore, watch landmarksRef + scoreState
//   - Instead of injectContext (Vapi), use ElevenLabs equivalent
//   - Replace form error types with CPR ones: arms_bent, rate_too_slow, recoil_poor
//   - Keep: cooldown timer, pending queue, per-rep error accumulation
//
// THE PENDING QUEUE PATTERN (most important):
//   if (isSpeaking) { pendingContextRef.current = context; return; }
//   // then in useEffect watching isSpeaking:
//   if (!isSpeaking && pendingContextRef.current) {
//     injectContext(pendingContextRef.current); pendingContextRef.current = null;
//   }
//   → Never interrupt the agent mid-sentence with a correction
//
// THE COOLDOWN PATTERN:
//   const FEEDBACK_COOLDOWN = 3000; // ms
//   if (now - lastFeedbackTimeRef.current < FEEDBACK_COOLDOWN) return;
//   lastFeedbackTimeRef.current = now;
//   → For CPR: use 5-compression gap instead of time (see audio priority ladder)
//
// THE STRUCTURED CONTEXT FORMAT (what you send to the LLM):
//   [FORM FEEDBACK NEEDED]
//   Issue: arms_bent
//   Cue: "Straighten your arms"
//   Rep: 14 of 30
//   → LLM decides whether/how to say it. You don't script the exact words.
//
// CPR EVENTS TO SEND:
//   [COMPRESSION_PEAK]         → agent confirms "good"
//   [FORM_ISSUE] arms_bent     → agent says correction
//   [FORM_ISSUE] rate_too_slow → agent says correction
//   [STALLED]                  → agent says "keep going, stay with me"
//   [BREATH_PHASE]             → agent guides breath sequence
//   [CYCLE_COMPLETE] n         → agent acknowledges milestone
//   [SESSION_END]              → agent debriefs

// Approximate reconstruction (raw code not fully retrieved — summarised version):
"use client";
import * as React from "react";
import { useExerciseStore } from "@/stores/exercise-store";

const FEEDBACK_COOLDOWN = 3000;

const CORRECTION_CUES: Record<string, string[]> = {
  forward_lean:        ["Keep chest up", "Lift your chest"],
  insufficient_depth:  ["Go a little deeper", "Lower your hips more"],
  knee_forward:        ["Sit back more", "Keep knees behind toes"],
  hands_on_legs:       ["Hands off your legs", "Keep hands free"],
  upper_back_round:    ["Chest up, shoulders back"],
  // CPR equivalents:
  arms_bent:           ["Straighten your arms", "Lock your elbows"],
  rate_too_slow:       ["A little faster", "Speed up slightly"],
  rate_too_fast:       ["Slow down a little"],
  recoil_poor:         ["Let the chest rise", "Full release between pumps"],
};

export function useFormEventBridge({
  injectContext, isConnected, isSpeaking, isAnalyzing,
  exerciseName, targetReps, nextExercise, planName, commonMistakes, exerciseInstructions,
}: any) {
  const repCount     = useExerciseStore(s => s.repCount);
  const errors       = useExerciseStore(s => s.errors);
  const prevRepCountRef    = React.useRef(0);
  const repErrorsRef       = React.useRef<string[]>([]);
  const lastFeedbackTimeRef = React.useRef(0);
  const pendingContextRef  = React.useRef<string | null>(null);

  // Flush pending context when agent finishes speaking
  React.useEffect(() => {
    if (!isSpeaking && pendingContextRef.current && isConnected) {
      injectContext(pendingContextRef.current);
      pendingContextRef.current = null;
    }
  }, [isSpeaking, isConnected, injectContext]);

  // Watch form errors — inject correction context
  React.useEffect(() => {
    if (!isAnalyzing || !isConnected) return;

    const warningErrors = errors.filter(e => e.severity === "warning");
    if (warningErrors.length === 0) return;

    const now = Date.now();
    if (now - lastFeedbackTimeRef.current < FEEDBACK_COOLDOWN) return;

    const topError = warningErrors[0];
    repErrorsRef.current.push(topError.type);

    const cues = CORRECTION_CUES[topError.type] || [topError.message];
    const cue  = cues[Math.floor(Math.random() * cues.length)];

    const context = `[FORM FEEDBACK NEEDED]
Issue: ${topError.type}
Suggested cue: "${cue}"
Keep response under 10 words. Focus on what TO do.`;

    if (isSpeaking) {
      pendingContextRef.current = context; // queue — don't interrupt
    } else {
      injectContext(context);
      lastFeedbackTimeRef.current = now;
    }
  }, [errors, isAnalyzing, isConnected, isSpeaking, injectContext]);

  // Watch rep count — inject completion context
  React.useEffect(() => {
    if (!isAnalyzing || !isConnected) return;
    if (repCount <= prevRepCountRef.current) return;

    prevRepCountRef.current = repCount;
    const errorsThisRep = repErrorsRef.current;
    repErrorsRef.current = [];

    const isHalfway  = targetReps > 0 && repCount === Math.floor(targetReps / 2);
    const isComplete  = targetReps > 0 && repCount >= targetReps;

    let context: string;
    if (isComplete) {
      context = `[SESSION END]
Reps: ${repCount}/${targetReps}
${nextExercise ? `Next exercise: ${nextExercise.name}` : "Session complete"}
Briefly celebrate and transition.`;
    } else if (isHalfway) {
      context = `[HALFWAY POINT]
Reps: ${repCount}/${targetReps}
${errorsThisRep.length === 0 ? "Form has been great." : `Issues seen: ${errorsThisRep.join(", ")}`}
Brief encouragement, keep going.`;
    } else if (errorsThisRep.length === 0) {
      context = `[REP COMPLETED] ${repCount}/${targetReps} — Good form. Brief encouragement (3-5 words max).`;
    } else {
      return; // skip — form issue already called out
    }

    if (isSpeaking) {
      pendingContextRef.current = context;
    } else {
      injectContext(context);
      lastFeedbackTimeRef.current = Date.now();
    }
  }, [repCount, isAnalyzing, isConnected, isSpeaking, targetReps, nextExercise, injectContext]);
}
