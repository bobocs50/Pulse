import Link from "next/link";

export default function Home() {
  return (
    <>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        @keyframes rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pulse-ring {
          animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        .pulse-ring-2 {
          animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          animation-delay: 0.7s;
        }
        .pulse-dot {
          animation: pulse-dot 2s ease-in-out infinite;
        }
        .r1 { animation: rise 550ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay:   0ms; }
        .r2 { animation: rise 550ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay:  80ms; }
        .r3 { animation: rise 550ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay: 160ms; }
        .r4 { animation: rise 550ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay: 240ms; }
        .r5 { animation: rise 550ms cubic-bezier(0.23, 1, 0.32, 1) both; animation-delay: 320ms; }
        .start-btn {
          -webkit-tap-highlight-color: transparent;
          transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .start-btn:active {
          transform: scale(0.97);
        }
      `}</style>

      <main className="flex flex-col h-full items-center justify-center bg-black px-6 safe-top safe-bottom">
        <div className="flex flex-col items-center gap-9 text-center max-w-sm w-full">

          {/* Live indicator */}
          <div className="r1 relative flex items-center justify-center w-14 h-14">
            <span className="pulse-ring   absolute w-10 h-10 rounded-full bg-red-500" />
            <span className="pulse-ring-2 absolute w-10 h-10 rounded-full bg-red-500" />
            <span className="pulse-dot relative z-10 w-4 h-4 rounded-full bg-red-500" />
          </div>

          {/* Headline */}
          <div className="r2 space-y-2">
            <h1 className="text-[2.75rem] font-bold tracking-tight leading-none text-white">
              CPR Coach
            </h1>
            <p className="text-base text-zinc-400 leading-snug">
              The dispatcher that can see you
            </p>
          </div>

          {/* Setup instruction */}
          <p className="r3 text-sm text-zinc-500 leading-relaxed max-w-[270px]">
            Prop your phone upright facing you, far enough back that your shoulders
            and hands are in view. Then press Start.
          </p>

          {/* CTA */}
          <Link
            href="/talk"
            className="start-btn r4 w-full py-[1.35rem] rounded-2xl bg-white text-zinc-950 text-2xl font-bold text-center"
          >
            Start
          </Link>

          {/* Disclaimer */}
          <p className="r5 text-xs text-zinc-600">
            Call 112 first · Video stays on your device
          </p>
        </div>
      </main>
    </>
  );
}
