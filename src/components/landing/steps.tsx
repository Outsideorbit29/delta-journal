"use client";

import { useEffect, useState } from "react";

const STEPS = [
  {
    title: "Connect a read-only key",
    body: "Create a Delta API key with only the Read Data permission, whitelist our server, paste it in. Edgebook can never trade.",
    panel: "connect",
  },
  {
    title: "Every trade, rebuilt",
    body: "Fills become round-trip trades, checked against Delta's own P&L to the cent, with every fee, funding payment and stop.",
    panel: "rebuild",
  },
  {
    title: "See what your habits cost",
    body: "Each trade is tagged, your costliest habits rise to the top, and a weekly AI review tells you what to change.",
    panel: "insight",
  },
] as const;

/** "How it works": three steps that advance on their own, each with its own picture. Tapping a step selects it. */
export function Steps({ leak }: { leak: { label: string; amount: string } | null }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4500);
    return () => clearInterval(timer);
  }, [paused]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => {
                setActive(i);
                setPaused(true);
              }}
              className={`flex w-full gap-4 rounded-xl border p-4 text-left transition-colors ${
                active === i ? "border-brand/40 bg-brand-soft" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
              }`}
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                  active === i ? "bg-brand text-brand-ink" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {i + 1}
              </span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="mt-1 block text-sm text-zinc-400">{s.body}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        {STEPS[active].panel === "connect" && (
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="text-xs text-zinc-500">Delta API key</div>
            <div className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-zinc-400">••••••••••••••••a7Kq</div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5">Read Data</span> only · whitelisted to our server
            </div>
            <div className="flex items-center gap-2 pt-2 text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400" /> Locked and connected
            </div>
          </div>
        )}
        {STEPS[active].panel === "rebuild" && (
          <div className="w-full max-w-xs space-y-2 font-mono text-xs">
            {["fill  buy  500 @ 4012.50", "fill  sell 500 @ 4031.20", "fee   -0.40   funding +0.02"].map((l) => (
              <div key={l} className="rounded border border-zinc-800 px-2 py-1.5 text-zinc-400">
                {l}
              </div>
            ))}
            <div className="rounded border border-brand/40 bg-brand-soft px-2 py-1.5 text-zinc-200">trade  long  +$9.33 · matches Delta ✓</div>
          </div>
        )}
        {STEPS[active].panel === "insight" && (
          <div className="w-full max-w-xs space-y-2 text-sm">
            <div className="text-xs text-zinc-500">Your biggest leak</div>
            <div className="flex justify-between rounded-md border border-zinc-800 px-3 py-2">
              <span>{leak?.label ?? "Moved stop"}</span>
              <span className="font-semibold text-rose-400">{leak?.amount ?? "-$359.88"}</span>
            </div>
            <div className="rounded-md bg-brand-soft px-3 py-2 text-zinc-200">
              <span className="font-medium text-brand">Coach:</span> keep your stop where you set it. Moved stops lost on nearly every trade.
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-zinc-800">
          <div className="h-0.5 bg-brand transition-all duration-500" style={{ width: `${((active + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
