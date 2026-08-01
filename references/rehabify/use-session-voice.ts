// SOURCE: github.com/obro79/Rehabify/src/hooks/use-session-voice.ts
// FULL SOURCE — orchestrates voice phases + form event bridge
//
// KEY PATTERN: two-phase session
//   "explaining" → agent talks, user says "ready" → "analyzing" → agent coaches
//
// For CPR:
//   "intake"  → agent asks about situation, confirms 112, gets user in position
//   "coaching" → agent receives form events, speaks corrections
//   (our tool: useConversationClientTool("start_compressions", ...) triggers transition)
//
// KEY: exerciseIntroContext — inject structured prompt on connect (500ms delay)
//   const timer = setTimeout(() => injectContext(context), 500)
//   CPR equivalent: inject patient/scene context once agent connects

"use client";
import * as React from "react";
import { useVapi } from "@/hooks/use-vapi";
import { useFormEventBridge } from "@/hooks/use-form-event-bridge";

export type VoicePhase = "explaining" | "analyzing" | "finished";
export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

export function useSessionVoice({ exercise, sessionId, targetReps, nextExercise, planName }: any) {
  const [voicePhase, setVoicePhase] = React.useState<VoicePhase>("explaining");
  const voicePhaseRef = React.useRef<VoicePhase>("explaining");
  voicePhaseRef.current = voicePhase;

  const handleUserReady = React.useCallback(() => {
    if (voicePhaseRef.current === "explaining") setVoicePhase("analyzing");
  }, []);

  const { start: startVapi, stop: stopVapi, isConnected, isSpeaking, setMuted, injectContext } = useVapi({ onUserReady: handleUserReady });

  // Wire form events to agent — the bridge is the key piece
  useFormEventBridge({ injectContext, isConnected, isSpeaking, isAnalyzing: voicePhase === "analyzing",
    exerciseName: exercise?.name, targetReps, nextExercise, planName,
    commonMistakes: exercise?.common_mistakes, exerciseInstructions: exercise?.instructions });

  // On connect: inject exercise intro context after 500ms (agent needs time to initialise)
  const hasInjectedContext = React.useRef(false);
  React.useEffect(() => {
    if (isConnected && exercise && !hasInjectedContext.current) {
      hasInjectedContext.current = true;
      const timer = setTimeout(() => injectContext(`[EXERCISE INTRO]
Exercise: ${exercise.name}
Key cue: ${exercise.instructions[0]}
Greet briefly, tell them the exercise, give ONE focus point, ask "Ready to start?"`), 500);
      return () => clearTimeout(timer);
    }
    if (!isConnected) { hasInjectedContext.current = false; setVoicePhase("explaining"); }
  }, [isConnected, exercise, injectContext]);

  // When user says ready: inject "start analyzing" context
  React.useEffect(() => {
    if (voicePhase === "analyzing" && isConnected) {
      injectContext(`[EXERCISE STARTING]
Say "Great, let's go - I'm watching your form."
Give brief form corrections when I send [FORM FEEDBACK NEEDED]. Max 5-15 words. Focus on what TO do.`);
    }
  }, [voicePhase, isConnected, injectContext]);

  const startVoice = React.useCallback(() => {
    startVapi(undefined, { sessionId, exerciseId: exercise?.id, exerciseName: exercise?.name, targetReps });
  }, [startVapi, sessionId, exercise, targetReps]);

  return { voicePhase, isConnected, startVoice, stopVoice: stopVapi, toggleMute: () => setMuted(true) };
}
