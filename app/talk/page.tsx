"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationClientTool,
} from "@elevenlabs/react";

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

type Age = "adult" | "child" | "infant";

const HAND_PLACEMENT: Record<Age, { hands: string; position: string; depth: string; note: string }> = {
  adult: {
    hands:    "Both hands interlocked",
    position: "Center of chest, between the nipples",
    depth:    "Push down 2 inches (5 cm)",
    note:     "Heel of hand only — fingers lifted off the chest",
  },
  child: {
    hands:    "One hand",
    position: "Center of chest, between the nipples",
    depth:    "Push down 2 inches (5 cm)",
    note:     "Use your dominant hand, keep arm straight",
  },
  infant: {
    hands:    "Two fingers only",
    position: "Just below the nipple line, center of chest",
    depth:    "Push down 1.5 inches (4 cm)",
    note:     "Index and middle finger — gentle but firm",
  },
};

function TriageInner() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [age, setAge]   = useState<Age | null>(null);
  const [mounted, setMounted] = useState(false);

  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();

  useConversationClientTool("start_compressions", () => {
    endSession();
    router.push(`/coach?age=${age ?? "adult"}`);
    return "ok";
  });

  useEffect(() => { setMounted(true); }, []);

  function selectAge(a: Age) { setAge(a); setStep(2); }
  function notBreathing()    { setStep(3); }
  function goCoach()         { endSession(); router.push(`/coach?age=${age ?? "adult"}`); }
  function breathingNormally(){ endSession(); router.push(`/coach?age=${age ?? "adult"}&breathing=true`); }
  function openDispatcher()  { if (AGENT_ID) startSession({ agentId: AGENT_ID, connectionType: "websocket" }); }

  const AGE_OPTIONS = [
    { key: "adult"  as Age, label: "Adult",  sub: "12 years+" },
    { key: "child"  as Age, label: "Child",  sub: "1–12 years" },
    { key: "infant" as Age, label: "Infant", sub: "Under 1 year" },
  ];

  const placement = age ? HAND_PLACEMENT[age] : null;

  return (
    <main
      className="relative h-full w-full flex flex-col bg-[#F0EEE9] overflow-hidden"
      style={{ paddingTop: "max(48px, env(safe-area-inset-top))" }}
    >
      <style>{`
        @keyframes ageIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .age-btn { opacity: 0; animation: ageIn 260ms ease-out forwards; }
        .age-btn[data-mounted="false"] { animation: none; opacity: 1; }
        .age-btn:nth-child(1) { animation-delay: 0ms; }
        .age-btn:nth-child(2) { animation-delay: 60ms; }
        .age-btn:nth-child(3) { animation-delay: 120ms; }
        .sheet {
          position: fixed; bottom: 0; left: 0; right: 0;
          background: #F0EEE9;
          border-radius: 24px 24px 0 0;
          padding: 28px 24px max(40px, env(safe-area-inset-bottom));
          transform: translateY(100%);
          transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
          will-change: transform;
          box-shadow: 0 -4px 32px rgba(0,0,0,0.08);
          max-height: 92vh;
          overflow-y: auto;
        }
        .sheet[data-open="true"] { transform: translateY(0); }
        .tap-btn {
          transition: transform 150ms ease-out, background 150ms ease-out,
                      color 150ms ease-out, outline-color 150ms ease-out;
          -webkit-tap-highlight-color: transparent;
        }
        .tap-btn:active { transform: scale(0.97); }
      `}</style>

      {/* Step 1 — Who needs help? */}
      <div className="flex flex-col flex-1 px-6" style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
        <h1 className="text-3xl font-black text-zinc-900 leading-tight mb-2">Who needs help?</h1>
        <p className="text-zinc-500 text-sm mb-8">112 called · person unresponsive</p>

        <div className="flex flex-col gap-3">
          {AGE_OPTIONS.map(({ key, label, sub }) => (
            <button
              key={key}
              data-mounted={String(mounted)}
              onClick={() => selectAge(key)}
              className={`age-btn tap-btn w-full flex items-center justify-between px-6 rounded-2xl text-left ${
                age === key
                  ? "bg-[#E86B47] text-white outline outline-2 outline-[#E86B47]"
                  : "bg-white text-zinc-900 outline outline-2 outline-transparent"
              }`}
              style={{ minHeight: 72 }}
            >
              <span className="text-2xl font-black">{label}</span>
              <span className={`text-sm font-medium ${age === key ? "text-white/70" : "text-zinc-400"}`}>{sub}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-10 flex flex-col items-center gap-3">
          <button
            onClick={openDispatcher}
            disabled={!AGENT_ID || status === "connecting" || status === "connected"}
            className="tap-btn text-sm text-zinc-400 font-medium underline underline-offset-4 disabled:opacity-40"
          >
            {status === "connected" ? "Dispatcher connected…" : status === "connecting" ? "Connecting…" : "Talk to dispatcher instead"}
          </button>
        </div>
      </div>

      {/* Step 2 — Breathing check with detailed instructions */}
      <div className="sheet" data-open={step === 2 ? "true" : "false"}>
        <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-6" />

        <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-1">
          {age ? age.charAt(0).toUpperCase() + age.slice(1) + " · " : ""}Step 2 of 3
        </p>
        <h2 className="text-2xl font-black text-zinc-900 leading-tight mb-5">
          Check if they&apos;re breathing
        </h2>

        {/* How to check — Look Listen Feel */}
        <div className="bg-white rounded-2xl px-5 py-4 mb-5 flex flex-col gap-4">
          <p className="text-xs font-bold tracking-widest text-[#E86B47] uppercase">
            Tilt head back · lift chin · open airway
          </p>

          <div className="flex gap-4 items-start">
            <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">1</span>
            <div>
              <p className="font-black text-zinc-900">LOOK</p>
              <p className="text-sm text-zinc-500 leading-snug">
                Watch the chest. Is it rising and falling?
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">2</span>
            <div>
              <p className="font-black text-zinc-900">LISTEN</p>
              <p className="text-sm text-zinc-500 leading-snug">
                Lean your ear over their mouth and nose. Do you hear any breath sounds?
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-start">
            <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">3</span>
            <div>
              <p className="font-black text-zinc-900">FEEL</p>
              <p className="text-sm text-zinc-500 leading-snug">
                Can you feel any air movement on your cheek?
              </p>
            </div>
          </div>

          <div className="border-t border-zinc-100 pt-3 mt-1">
            <p className="text-xs font-bold text-rose-500 uppercase tracking-wide">
              ⚠ Check for no more than 10 seconds
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Occasional gasps are NOT normal breathing — treat as not breathing.
            </p>
          </div>
        </div>

        <button
          onClick={notBreathing}
          className="tap-btn w-full rounded-2xl bg-zinc-900 text-white text-xl font-black text-center"
          style={{ minHeight: 80, paddingInline: 24 }}
        >
          Not breathing — continue
        </button>

        <button
          onClick={breathingNormally}
          className="tap-btn w-full mt-5 text-sm font-medium text-zinc-400 text-center"
          style={{ minHeight: 44 }}
        >
          Breathing normally — no CPR needed
        </button>
      </div>

      {/* Step 3 — Hand placement for selected age */}
      <div className="sheet" data-open={step === 3 ? "true" : "false"}>
        <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mb-6" />

        <p className="text-xs font-bold tracking-widest text-zinc-400 uppercase mb-1">
          {age ? age.charAt(0).toUpperCase() + age.slice(1) + " · " : ""}Step 3 of 3
        </p>
        <h2 className="text-2xl font-black text-zinc-900 leading-tight mb-5">
          Hand placement
        </h2>

        {placement && (
          <div className="bg-white rounded-2xl px-5 py-4 mb-5 flex flex-col gap-4">
            <div className="flex gap-4 items-start">
              <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">1</span>
              <div>
                <p className="font-black text-zinc-900">{placement.hands}</p>
                <p className="text-sm text-zinc-500 leading-snug">{placement.position}</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">2</span>
              <div>
                <p className="font-black text-zinc-900">{placement.depth}</p>
                <p className="text-sm text-zinc-500 leading-snug">Let the chest fully recoil between each push — don&apos;t lean on it</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <span className="text-2xl font-black text-zinc-200 w-8 shrink-0">3</span>
              <div>
                <p className="font-black text-zinc-900">Straight arms, lock elbows</p>
                <p className="text-sm text-zinc-500 leading-snug">{placement.note}</p>
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-3 mt-1">
              <p className="text-xs font-bold text-[#E86B47] uppercase tracking-wide">
                30 compressions → 2 rescue breaths · repeat
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">100–120 per minute — the app will guide you</p>
            </div>
          </div>
        )}

        <button
          onClick={goCoach}
          className="tap-btn w-full rounded-2xl bg-[#E86B47] text-white text-xl font-black text-center"
          style={{ minHeight: 80, paddingInline: 24 }}
        >
          I&apos;m in position — start CPR
        </button>
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
