"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationClientTool,
  useConversationInput,
} from "@elevenlabs/react";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

type Age = "adult" | "child" | "infant";
type CheckItem = { id: string; label: string; done: boolean };

const STYLES = `
  @keyframes pulse-ring {
    0%   { transform: scale(1);   opacity: 0.35; }
    100% { transform: scale(1.7); opacity: 0; }
  }
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
  @keyframes wbar1 { 0%,100%{height:4px}  25%{height:22px} 75%{height:10px} }
  @keyframes wbar2 { 0%,100%{height:18px} 40%{height:4px}  70%{height:24px} }
  @keyframes wbar3 { 0%,100%{height:26px} 50%{height:4px}             }
  @keyframes wbar4 { 0%,100%{height:12px} 35%{height:24px} 65%{height:4px}  }
  @keyframes wbar5 { 0%,100%{height:4px}  20%{height:20px} 60%{height:8px}  }
  .wbar { width:5px; border-radius:3px; background:rgba(255,255,255,0.88); }
  .wbar-1 { animation: wbar1 0.9s  ease-in-out infinite; }
  .wbar-2 { animation: wbar2 0.75s ease-in-out infinite 0.12s; }
  .wbar-3 { animation: wbar3 0.82s ease-in-out infinite 0.06s; }
  .wbar-4 { animation: wbar4 0.68s ease-in-out infinite 0.18s; }
  .wbar-5 { animation: wbar5 0.95s ease-in-out infinite 0.09s; }
  @keyframes checkPop {
    0%   { transform: scale(0.5); opacity: 0; }
    65%  { transform: scale(1.18); }
    100% { transform: scale(1);   opacity: 1; }
  }
  .check-pop { animation: checkPop 280ms cubic-bezier(0.34,1.56,0.64,1) forwards; }
  @keyframes rowIn {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .row-in { animation: rowIn 320ms cubic-bezier(0.23,1,0.32,1) both; }
  .tap-btn {
    -webkit-tap-highlight-color: transparent;
    transition: transform 160ms cubic-bezier(0.23,1,0.32,1), background 180ms ease, color 180ms ease;
  }
  .tap-btn:active { transform: scale(0.97); }
  .back-btn {
    -webkit-tap-highlight-color: transparent;
    transition: transform 160ms cubic-bezier(0.23,1,0.32,1), opacity 160ms ease;
  }
  .back-btn:active { transform: scale(0.91); opacity: 0.5; }
  .mute-btn {
    -webkit-tap-highlight-color: transparent;
    transition: transform 160ms cubic-bezier(0.23,1,0.32,1), background 200ms ease, color 200ms ease;
  }
  .mute-btn:active { transform: scale(0.95); }
`;

function PlacementCard({ age }: { age: Age }) {
  const info = {
    adult:  { label: "Adult",  hands: "Both hands, interlocked", depth: "5–6 cm",          rate: "30 : 2", detail: "Heel of hand on center of chest. Other hand on top, fingers interlaced." },
    child:  { label: "Child",  hands: "One hand",                depth: "⅓ chest diameter", rate: "15 : 2", detail: "Heel of one hand on center of chest. Keep arm straight." },
    infant: { label: "Infant", hands: "Two fingers",             depth: "⅓ chest diameter", rate: "15 : 2", detail: "Index and middle finger just below the nipple line." },
  }[age];

  const HandSVG = () => {
    // brightness clips the PNGs' off-white backdrop to pure white so it disappears into the card.
    if (age === "adult") return (
      <img
        src="/hand1.png"
        alt="Both hands interlocked"
        style={{ width: 176, height: 176, objectFit: "contain", filter: "brightness(1.08)" }}
      />
    );
    if (age === "child") return (
      // hand2+ has "press down 2 inches" baked in under the drawing — window it out.
      <div style={{ width: 176, height: 118, overflow: "hidden", position: "relative" }}>
        <img
          src="/hand2+.png"
          alt="One hand, heel on center of chest"
          style={{ width: 176, height: "auto", position: "absolute", top: -14, left: 0, filter: "brightness(1.08)" }}
        />
      </div>
    );
    return (
      <svg viewBox="0 0 160 200" width="160" height="200" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="#1a1a1a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M62 165 L62 108 Q62 100 70 100 Q78 100 78 108 L78 165"/>
          <path d="M80 165 L80 106 Q80 98 88 98 Q96 98 96 106 L96 165"/>
          <path d="M96 155 Q104 150 108 155 L106 165"/>
          <path d="M62 152 Q54 148 50 154 L52 165"/>
          <path d="M50 167 Q50 176 70 178 Q88 180 108 172 L106 165 Q90 172 70 172 Q54 170 52 165 Z"/>
        </g>
        <g stroke="#E86B47" strokeWidth="2.5" strokeLinecap="round">
          <line x1="80" y1="182" x2="80" y2="196"/>
          <polyline points="74,190 80,196 86,190"/>
        </g>
      </svg>
    );
  };

  return (
    <div
      className="w-full flex flex-col items-center"
      style={{ animation: "rowIn 380ms cubic-bezier(0.23,1,0.32,1) both" }}
    >
      {/* Label */}
      <p className="text-xs font-bold tracking-widest text-[#E86B47] uppercase mb-2">Hand placement · {info.label}</p>

      {/* Big illustration */}
      <div
        className="rounded-3xl flex items-center justify-center mb-4"
        style={{ background: "white", width: 200, height: 220, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
      >
        <HandSVG />
      </div>

      {/* Title + detail */}
      <p className="text-2xl font-black text-zinc-900 mb-1">{info.hands}</p>
      <p className="text-sm text-zinc-500 text-center leading-snug max-w-[260px] mb-5">{info.detail}</p>

      {/* Depth + rate chips */}
      <div className="flex gap-3">
        <div className="flex flex-col items-center px-5 py-3 rounded-2xl" style={{ background: "white" }}>
          <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-0.5">Depth</span>
          <span className="text-lg font-black text-zinc-900">{info.depth}</span>
        </div>
        <div className="flex flex-col items-center px-5 py-3 rounded-2xl" style={{ background: "white" }}>
          <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase mb-0.5">Rate</span>
          <span className="text-lg font-black text-zinc-900">{info.rate}</span>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Back" className="back-btn flex items-center justify-center w-10 h-10 rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M12.5 15L7.5 10L12.5 5" stroke="#3f3f46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

function TriageInner() {
  const router = useRouter();
  const [age, setAge]                   = useState<Age>("adult");
  const [called112, setCalled112]       = useState(false);
  const [checks, setChecks]             = useState<CheckItem[]>([
    { id: "called",       label: "112 called",               done: false },
    { id: "unresponsive", label: "Person unresponsive",       done: false },
    { id: "breathing",    label: "Not breathing — confirmed", done: false },
    { id: "type",         label: "Victim type noted",         done: false },
    { id: "aed",          label: "AED status",                done: false },
    { id: "position",     label: "In position",               done: false },
  ]);

  const { startSession, endSession, sendContextualUpdate } = useConversationControls();
  const { status } = useConversationStatus();
  const { setMuted } = useConversationInput();
  const [muted, setMutedLocal] = useState(false);
  const [showPlacement, setShowPlacement] = useState(false);
  const ageRef = useRef<Age>("adult");
  const sessionActive = useRef(false);
  const endedByUs = useRef(false);
  const retries = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [scopeStop, setScopeStop] = useState<string | null>(null);
  const checksRef = useRef(checks);
  checksRef.current = checks;
  const reconnectRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      endedByUs.current = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (sessionActive.current) {
        sessionActive.current = false;
        try { endSession(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopSession() {
    endedByUs.current = true;
    sessionActive.current = false;
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    setReconnecting(false);
    try { endSession(); } catch {}
  }

  // Drops are silent otherwise: provider startSession returns void, so a failed
  // connect never rejects — it only surfaces through onError/onDisconnect.
  function scheduleReconnect(reason: string, fatal = false) {
    if (endedByUs.current || retryTimer.current) return;
    sessionActive.current = false;
    setConnError(fatal ? "Microphone blocked — allow mic access, then tap below." : reason);
    if (fatal) { retries.current = 5; setReconnecting(false); return; }
    console.warn("[Clara] connection lost:", reason, `(retry ${retries.current + 1}/5)`);
    if (retries.current >= 5) { setReconnecting(false); return; }
    const delay = Math.min(400 * 2 ** retries.current, 4000);
    retries.current += 1;
    setReconnecting(true);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      reconnectRef.current();
    }, delay);
  }

  function connect(isRetry: boolean) {
    if (!AGENT_ID) {
      setConnError("NEXT_PUBLIC_ELEVENLABS_AGENT_ID is not set");
      return;
    }
    endedByUs.current = false;
    sessionActive.current = true;
    startSession({
      agentId: AGENT_ID,
      connectionType: "websocket",
      onConnect: ({ conversationId }) => {
        console.log("[Clara] connected", conversationId);
        retries.current = 0;
        setReconnecting(false);
        setConnError(null);
        if (!isRetry) return;
        const done = checksRef.current.filter(c => c.done).map(c => c.label);
        try {
          sendContextualUpdate(
            `The connection dropped and just reconnected. Already confirmed: ${done.join(", ") || "nothing yet"}. Pick up from there — do not start over.`
          );
        } catch {}
      },
      onDisconnect: (d) => {
        if (d.reason === "user" || endedByUs.current) return;
        scheduleReconnect(d.reason === "error" ? d.message : "Clara ended the call");
      },
      onError: (msg, ctx) => {
        console.error("[Clara] error:", msg, ctx);
        const denied = ctx instanceof Error
          ? ctx.name === "NotAllowedError" || ctx.name === "NotFoundError"
          : /permission|denied/i.test(msg);
        scheduleReconnect(msg, denied);
      },
    });
  }
  reconnectRef.current = () => connect(true);

  function toggleMute() {
    const next = !muted;
    setMutedLocal(next);
    setMuted(next);
  }

  function tick(id: string) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, done: true } : c));
  }

  useConversationClientTool("recordVictimStatus", (p) => {
    // The agent only reports breathing in Phase 2 — by then unresponsive is established.
    if (p.responsive === false || p.breathing === false) tick("unresponsive");
    if (p.breathing === false) setTimeout(() => tick("breathing"), 380);
    return "ok";
  });
  useConversationClientTool("recordVictimType", (p) => {
    const t = p.type as Age;
    setAge(t); ageRef.current = t;
    tick("type");
    setShowPlacement(true);
    return "ok";
  });
  useConversationClientTool("recordAED", (_p) => { tick("aed"); return "ok"; });
  useConversationClientTool("scopeStop", (p) => {
    // Keep the mic open — Clara scope-stops on "unclear" too, and the user needs
    // to be able to correct her without the screen going dead.
    setScopeStop(typeof p.reason === "string" ? p.reason : "unclear");
    return "ok";
  });
  useConversationClientTool("start_compressions", () => {
    tick("position");
    endedByUs.current = true;
    setTimeout(() => {
      stopSession();
      router.push(`/coach?age=${ageRef.current}`);
    }, 400);
    return "ok";
  });

  const safeTop = "max(48px, env(safe-area-inset-top))";
  const safeBot = "max(40px, env(safe-area-inset-bottom))";

  // ── Call 112 ──
  if (!called112) {
    return (
      <main className="h-full w-full flex flex-col" style={{ background: "#F0EEE9", paddingTop: safeTop, paddingBottom: safeBot }}>
        <style>{STYLES}</style>
        <div className="px-5 mb-2">
          <BackButton onClick={() => router.back()} />
        </div>
        <div className="flex flex-col flex-1 px-6 justify-between">
          <div>
            <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-5">Before CPR</p>
            <h1 className="text-4xl font-black text-zinc-900 leading-tight mb-3">Call 112<br />right now</h1>
            <p className="text-zinc-500 text-base leading-snug">
              Tell them: &ldquo;Someone is unresponsive and not breathing. I&apos;m starting CPR.&rdquo;
            </p>
          </div>

          <div className="flex justify-center items-center my-8">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-32 h-32 rounded-full bg-red-500" style={{ animation: "pulse-ring 1.8s cubic-bezier(0.215,0.61,0.355,1) infinite" }} />
              <div className="absolute w-32 h-32 rounded-full bg-red-500" style={{ animation: "pulse-ring 1.8s cubic-bezier(0.215,0.61,0.355,1) infinite 0.75s" }} />
              <a href="tel:112" className="tap-btn relative w-28 h-28 rounded-full bg-red-600 flex items-center justify-center" style={{ boxShadow: "0 4px 24px rgba(220,38,38,0.28)" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                  <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                </svg>
              </a>
            </div>
          </div>

          <button
            className="tap-btn w-full py-5 rounded-2xl bg-zinc-900 text-white text-xl font-black text-center"
            onClick={() => {
              if (sessionActive.current) return;
              tick("called");
              setCalled112(true);
              retries.current = 0;
              connect(false);
            }}
          >
            Done — continue
          </button>
        </div>
      </main>
    );
  }

  // ── Blob + checklist ──
  const isConnected  = status === "connected";
  const isConnecting = !isConnected && (status === "connecting" || reconnecting);
  const isDown       = !isConnected && !isConnecting;

  return (
    <main className="h-full w-full flex flex-col" style={{ background: "#F0EEE9", paddingTop: safeTop, paddingBottom: safeBot }}>
      <style>{STYLES}</style>

      {/* Back only before mic is live */}
      {isDown && (
        <div className="px-5 mb-2">
          <BackButton onClick={() => { stopSession(); setCalled112(false); }} />
        </div>
      )}

      <div className="flex flex-col items-center flex-1 px-6 justify-center">

        {/* Blob */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div
            className="w-36 h-36 flex items-center justify-center gap-[5px]"
            style={{
              borderRadius: "50%",
              background: "radial-gradient(ellipse at 38% 30%, #F9AE72 0%, #E86B47 32%, #C44728 62%, #8C2410 100%)",
              animation: isConnected ? "blobTalk 0.54s ease-in-out infinite" : isConnecting ? "blobRest 1.5s ease-in-out infinite" : "blobRest 3s ease-in-out infinite",
              boxShadow: isConnected ? "0 0 48px rgba(232,107,71,0.5), 0 0 16px rgba(200,70,40,0.3)" : "0 4px 24px rgba(200,70,40,0.18)",
              transition: "box-shadow 400ms ease",
            }}
          >
            {isConnecting ? (
              <span className="w-7 h-7 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span className="wbar wbar-1" style={{ height: 4 }} />
                <span className="wbar wbar-2" style={{ height: 14 }} />
                <span className="wbar wbar-3" style={{ height: 22 }} />
                <span className="wbar wbar-4" style={{ height: 10 }} />
                <span className="wbar wbar-5" style={{ height: 4 }} />
              </>
            )}
          </div>
          <p
            key={isConnecting ? "c" : isConnected ? "on" : "off"}
            className="text-sm font-semibold text-zinc-500 text-center"
            style={{ animation: "rowIn 200ms cubic-bezier(0.23,1,0.32,1) both" }}
          >
            {reconnecting ? "Reconnecting to Clara…" : isConnecting ? "Connecting…" : isConnected ? "Clara is speaking — answer out loud" : "Clara stopped listening"}
          </p>
          {isDown && connError && (
            <p className="text-xs text-zinc-400 text-center max-w-[280px] leading-snug -mt-1">{connError}</p>
          )}
        </div>

        {/* Scope stop — Clara handed off to the 112 dispatcher */}
        {scopeStop && (
          <div
            className="row-in w-full max-w-sm mb-4 px-4 py-4 rounded-2xl"
            style={{ background: "rgba(220,38,38,0.1)" }}
          >
            <p className="text-sm font-black text-red-700 mb-1">Stay on the line with 112</p>
            <p className="text-xs text-red-700/80 leading-snug mb-3">
              This is outside what Clara can coach ({scopeStop}). Follow the dispatcher&apos;s instructions.
            </p>
            <button
              className="tap-btn text-xs font-bold text-red-700 underline"
              onClick={() => setScopeStop(null)}
            >
              Clara misheard — keep going
            </button>
          </div>
        )}

        {/* Checklist — hidden when placement illustration is showing */}
        {!showPlacement && (
          <div className="w-full max-w-sm flex flex-col gap-2">
            {checks.map((c, i) => (
              <div
                key={c.id}
                className="row-in flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  animationDelay: `${i * 45}ms`,
                  background: c.done ? "rgba(74,222,128,0.13)" : "rgba(0,0,0,0.045)",
                  transition: "background 350ms cubic-bezier(0.23,1,0.32,1)",
                }}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    background: c.done ? "#4ade80" : "rgba(0,0,0,0.08)",
                    transition: "background 300ms cubic-bezier(0.23,1,0.32,1)",
                  }}
                >
                  {c.done && (
                    <svg className="check-pop" width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: c.done ? "#3f3f46" : "#a1a1aa", transition: "color 300ms ease" }}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Big hand placement illustration — replaces checklist at position phase */}
        {showPlacement && <PlacementCard age={age} />}

        {/* Escape hatches — only after auto-reconnect has given up */}
        {isDown && (
          <div className="mt-6 w-full max-w-sm flex flex-col gap-2">
            <button
              className="tap-btn w-full py-4 rounded-2xl text-lg font-black text-center"
              style={{ background: "rgba(0,0,0,0.06)", color: "#3f3f46" }}
              onClick={() => { retries.current = 0; setConnError(null); connect(true); }}
            >
              Talk to Clara again
            </button>
            <button
              className="tap-btn w-full py-4 rounded-2xl bg-zinc-900 text-white text-lg font-black text-center"
              onClick={() => { stopSession(); router.push(`/coach?age=${ageRef.current}`); }}
            >
              Start compressions →
            </button>
          </div>
        )}

        {/* Mute — only when connected */}
        {isConnected && <button
          onClick={toggleMute}
          className="mute-btn mt-6 flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold"
          style={{
            background: muted ? "rgba(220,38,38,0.1)" : "rgba(0,0,0,0.06)",
            color: muted ? "#dc2626" : "#71717a",
          }}
        >
          {muted ? (
            <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>Mic muted</>
          ) : (
            <><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.4 5-5.4 5-2.6 0-4.8-1.84-5.34-4.32L4.6 11A7.012 7.012 0 0011 17.93V21h2v-3.07A7.01 7.01 0 0019 11h-2z"/></svg>Mic on</>
          )}
        </button>}
      </div>
    </main>
  );
}

export default function TalkPage() {
  return (
    <ConversationProvider>
      <TriageInner />
    </ConversationProvider>
  );
}
