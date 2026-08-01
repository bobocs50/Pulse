"use client";
// Intake agent (ElevenLabs) — dispatcher confirms 112/unresponsive/position,
// then calls start_compressions → mic releases → coaching loop takes over.
// Tap-to-skip is always visible: mic permission can fail in home-screen PWA.
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationClientTool,
} from "@elevenlabs/react";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

function TalkInner() {
  const router = useRouter();
  const { startSession, endSession } = useConversationControls();
  const { status, message } = useConversationStatus();

  useConversationClientTool("start_compressions", () => {
    endSession(); // release mic before the coach page needs audio
    router.push("/coach");
    return "ok";
  });

  const begin = () => {
    if (!AGENT_ID) return;
    // websocket, not WebRTC — known LiveKit handshake issue (PLAN.md)
    startSession({ agentId: AGENT_ID, connectionType: "websocket" });
  };

  const live = status === "connected" || status === "connecting";

  return (
    <main className="flex flex-col h-full items-center justify-center bg-zinc-50 px-6 gap-10 safe-top safe-bottom">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-zinc-900">Talk to the dispatcher</h1>
        <p className="text-zinc-500 text-sm max-w-xs">
          She&apos;ll confirm 112 is called and you&apos;re in position, then start the compressions coach.
        </p>
      </div>

      <button
        onClick={live ? endSession : begin}
        disabled={!AGENT_ID}
        className={`w-40 h-40 rounded-full flex items-center justify-center text-lg font-bold active:scale-95 transition-transform shadow-inner ${
          status === "connected"
            ? "bg-sky-200 text-sky-900 animate-pulse"
            : status === "connecting"
            ? "bg-zinc-200 text-zinc-500"
            : "bg-emerald-200 text-emerald-900"
        }`}
      >
        {status === "connected" ? "Listening…" : status === "connecting" ? "Connecting…" : "Tap to talk"}
      </button>

      {status === "error" && (
        <p className="text-rose-500 text-sm text-center max-w-xs">{message ?? "Voice connection failed."}</p>
      )}
      {!AGENT_ID && (
        <p className="text-rose-500 text-sm text-center max-w-xs">
          NEXT_PUBLIC_ELEVENLABS_AGENT_ID missing — restart the dev server after setting it.
        </p>
      )}

      {/* Always-visible escape hatch */}
      <Link
        href="/coach"
        className="w-full max-w-xs py-4 rounded-2xl bg-rose-300 text-rose-950 text-lg font-bold text-center active:scale-95 transition-transform"
      >
        Skip — start compressions
      </Link>
    </main>
  );
}

export default function TalkPage() {
  return (
    <ConversationProvider>
      <TalkInner />
    </ConversationProvider>
  );
}
