// SOURCE: github.com/obro79/Rehabify/src/hooks/use-vapi.ts
// FULL SOURCE — Vapi SDK lifecycle hook
//
// THEY USE VAPI. WE USE ELEVENLABS AGENTS. Different SDK, same pattern:
//
//   Vapi                          ElevenLabs (@elevenlabs/react)
//   ─────────────────────────     ──────────────────────────────
//   new Vapi(publicKey)           useConversation()
//   vapi.start(assistantId)       conversation.startSession({ agentId })
//   vapi.stop()                   conversation.endSession()
//   vapi.say(text)                no direct equivalent (use pre-rendered audio)
//   vapi.send({ add-message })    useConversationClientTool() for tool calls
//   on('speech-start')            onConnect / onMessage callbacks
//   on('call-end')                onDisconnect callback
//
// KEY PATTERNS TO STEAL:
//
// 1. Store callbacks in refs to prevent useEffect from re-running when they change:
//    const onErrorRef = useRef(onError)
//    onErrorRef.current = onError  // update each render without re-subscribing
//
// 2. isInitializedRef to prevent double-init in React StrictMode:
//    if (isInitializedRef.current) return
//
// 3. beforeunload cleanup:
//    window.addEventListener('beforeunload', () => vapi.stop())
//
// 4. injectContext() — send structured data to the LLM mid-session:
//    vapi.send({ type: 'add-message', message: { role: 'user', content: context }, triggerResponseEnabled: true })
//    ElevenLabs equivalent: conversation.sendContextualUpdate(context) or via tool call result

'use client';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import Vapi from '@vapi-ai/web';
import { useVoiceStore } from '@/stores/voice-store';

export function useVapi(options: {
  assistantId?: string;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: Error) => void;
  onUserReady?: () => void;
  onFunctionCall?: (name: string, args: Record<string, unknown>) => void;
} = {}) {
  const { assistantId, onConnectionChange, onError, onUserReady, onFunctionCall } = options;

  const READY_PHRASES = ['ready','yes',"let's go",'start','begin','ok','okay','yep','sure','go ahead'];

  const { setConnectionState, setSpeakingStatus, setVolumeLevel, addTranscript, setMuted: setStoreMuted, setError, reset } = useVoiceStore();

  const vapiRef = useRef<Vapi | null>(null);
  const isInitializedRef = useRef(false);

  // Store callbacks in refs — prevents useEffect re-running when callbacks change
  const onConnectionChangeRef = useRef(onConnectionChange);
  const onErrorRef = useRef(onError);
  const onUserReadyRef = useRef(onUserReady);
  const onFunctionCallRef = useRef(onFunctionCall);
  onConnectionChangeRef.current = onConnectionChange;
  onErrorRef.current = onError;
  onUserReadyRef.current = onUserReady;
  onFunctionCallRef.current = onFunctionCall;

  useEffect(() => {
    if (isInitializedRef.current) return; // prevent double-init in StrictMode

    const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
    vapiRef.current = vapi;
    isInitializedRef.current = true;

    vapi.on('call-start', () => { setConnectionState('connected'); setSpeakingStatus('listening'); onConnectionChangeRef.current?.(true); });
    vapi.on('call-end',   () => { setConnectionState('disconnected'); setSpeakingStatus('idle'); onConnectionChangeRef.current?.(false); });
    vapi.on('speech-start', () => setSpeakingStatus('speaking'));
    vapi.on('speech-end',   () => setSpeakingStatus('listening'));
    vapi.on('volume-level', (level: number) => setVolumeLevel(level));

    vapi.on('message', (message: any) => {
      if (message.type === 'transcript') {
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        addTranscript({ role, content: message.transcript || '', timestamp: Date.now() });

        // Detect user saying "ready" / "yes" → trigger phase transition
        if (role === 'user' && message.transcript) {
          const text = message.transcript.toLowerCase();
          if (READY_PHRASES.some(p => text.includes(p))) onUserReadyRef.current?.();
        }
      }
      // Tool / function call from LLM
      if (message.type === 'function-call') {
        onFunctionCallRef.current?.(message.functionCall?.name, message.functionCall?.parameters || {});
      }
    });

    vapi.on('error', (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Unknown Vapi error';
      setConnectionState('error'); setError(msg);
      onErrorRef.current?.(error instanceof Error ? error : new Error(msg));
    });

    const cleanup = () => { vapi.stop(); vapiRef.current = null; isInitializedRef.current = false; reset(); };
    window.addEventListener('beforeunload', cleanup);
    return () => { window.removeEventListener('beforeunload', cleanup); cleanup(); };
  }, [setConnectionState, setSpeakingStatus, setVolumeLevel, addTranscript, setError, reset]);

  const start = useCallback(async (assistantIdOrConfig?: string | Record<string, unknown>, metadata?: Record<string, unknown>) => {
    if (!vapiRef.current) return;
    try {
      setConnectionState('connecting');
      await vapiRef.current.start(assistantIdOrConfig || assistantId || process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!, { metadata });
      setConnectionState('connected'); setSpeakingStatus('listening');
    } catch (err) {
      setConnectionState('error'); setError(err instanceof Error ? err.message : 'Failed');
    }
  }, [assistantId, setConnectionState, setSpeakingStatus, setError]);

  const stop = useCallback(() => vapiRef.current?.stop(), []);

  const say = useCallback((text: string) => vapiRef.current?.say(text), []);

  // Inject structured context to the LLM — THIS IS THE KEY PATTERN
  // ElevenLabs equivalent: use conversation.sendContextualUpdate() or tool result
  const injectContext = useCallback((context: string) => {
    vapiRef.current?.send({
      type: 'add-message',
      message: { role: 'user', content: context },
      triggerResponseEnabled: true,
    });
  }, []);

  const setMuted = useCallback((muted: boolean) => { vapiRef.current?.setMuted(muted); setStoreMuted(muted); }, [setStoreMuted]);

  return { start, stop, say, injectContext, setMuted };
}
