"use client";

import { useEffect, useState } from "react";

export interface FeedTrade {
  id: string;
  symbol: string;
  direction: string;
  held: string;
  pnl: number;
  pnlText: string;
  tag: string | null;
  warning: boolean;
}

/** Demo trades arriving one by one, as they would from Delta, then starting over. */
export function TradeFeed({ trades }: { trades: FeedTrade[] }) {
  const [shown, setShown] = useState(trades.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Starts with every trade shown (also what reduced motion and no-JS get); the first tick restarts from one.
    const timer = setInterval(() => setShown((n) => (n >= trades.length ? 1 : n + 1)), 1600);
    return () => clearInterval(timer);
  }, [trades.length]);

  const visible = trades.slice(0, shown);
  const net = visible.reduce((sum, t) => sum + t.pnl, 0);
  const won = visible.filter((t) => t.pnl > 0).length;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <WindowBar url="edgebook/trades" />
      <ul className="min-h-80 divide-y divide-zinc-800/70">
        {[...visible].reverse().map((t, i) => (
          <li key={t.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i === 0 ? "bg-brand-soft/40" : ""}`}>
            <span className={`size-1.5 shrink-0 rounded-full ${t.pnl > 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
            <span className="w-20 font-medium">{t.symbol}</span>
            <span className={`w-12 text-xs ${t.direction === "long" ? "text-emerald-400" : "text-rose-400"}`}>{t.direction}</span>
            <span className="hidden w-16 text-xs text-zinc-500 sm:inline">{t.held}</span>
            <span className="flex-1">
              {t.tag && (
                <span className={`rounded px-1.5 py-0.5 text-xs ${t.warning ? "bg-amber-950 text-amber-200" : "bg-zinc-800 text-zinc-300"}`}>{t.tag}</span>
              )}
            </span>
            <span className={`font-semibold tabular-nums ${t.pnl > 0 ? "text-emerald-400" : "text-rose-400"}`}>{t.pnlText}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-6 border-t border-zinc-800 px-4 py-3 text-xs">
        <span>
          <span className="block text-zinc-500">Net</span>
          <span className={`font-semibold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {net >= 0 ? "+" : "-"}${Math.abs(net).toFixed(2)}
          </span>
        </span>
        <span>
          <span className="block text-zinc-500">Won</span>
          <span className="font-semibold">
            {won} of {visible.length}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400" /> Synced every minute
        </span>
      </div>
    </div>
  );
}

/** The three dots and address bar that make a panel look like an app window. */
export function WindowBar({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5">
      <span className="size-2.5 rounded-full bg-zinc-700" />
      <span className="size-2.5 rounded-full bg-zinc-700" />
      <span className="size-2.5 rounded-full bg-zinc-700" />
      <span className="mx-auto rounded bg-zinc-800/80 px-3 py-0.5 font-mono text-[11px] text-zinc-500">{url}</span>
    </div>
  );
}
