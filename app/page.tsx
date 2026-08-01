import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col h-full items-center justify-center bg-zinc-50 px-6 safe-top safe-bottom">
      <div className="flex flex-col items-center gap-10 text-center max-w-sm w-full">
        {/* Title */}
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900">CPR Coach</h1>
          <p className="text-lg text-zinc-500 leading-snug">
            The dispatcher that can see you
          </p>
        </div>

        {/* Setup hint */}
        <p className="text-sm text-zinc-400 leading-relaxed">
          Prop your phone upright facing you, far enough back that your shoulders
          and hands are in view. Then press Start.
        </p>

        {/* Start button */}
        <Link
          href="/coach"
          className="w-full py-5 rounded-2xl bg-rose-300 text-rose-950 text-2xl font-bold text-center active:scale-95 transition-transform shadow-sm"
        >
          Start
        </Link>

        {/* Reminder */}
        <p className="text-xs text-zinc-400">
          Call 112 first · Video stays on your device
        </p>
      </div>
    </main>
  );
}
