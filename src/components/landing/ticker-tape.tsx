import type { FeedTrade } from "@/components/landing/trade-feed";

/**
 * B5: the demo's latest closed trades running past like a market tape. Pure CSS (globals.css → Motion): it pauses
 * under the pointer or keyboard focus, and holds still (and scrolls by hand) for reduced motion. The second copy only
 * closes the loop, so screen readers skip it.
 */
export function TickerTape({ trades }: { trades: FeedTrade[] }) {
  if (!trades.length) return null;
  const items = (hidden: boolean) =>
    trades.map((t) => (
      <li key={`${hidden ? "b" : "a"}-${t.id}`} className="flex shrink-0 items-baseline gap-2 pr-12" aria-hidden={hidden || undefined}>
        <span className="text-ink">{t.symbol}</span>
        <span className="text-muted">{t.direction}</span>
        <span className={`tabular-nums ${t.pnl > 0 ? "text-gain" : t.pnl < 0 ? "text-loss" : "text-muted"}`}>{t.pnlText}</span>
        {t.tag && <span className={t.warning ? "text-warn" : "text-muted"}>{t.tag}</span>}
      </li>
    ));
  return (
    <div className="tape face-label overflow-hidden border-y border-ink py-3 text-base" aria-label="The demo account's latest closed trades" role="region" tabIndex={0}>
      <ul className="tape-run m-0 flex w-max list-none p-0">
        {items(false)}
        {items(true)}
      </ul>
    </div>
  );
}
