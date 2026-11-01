import { formatMoney, pnlClass } from "@/lib/format";

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

/** The demo's latest closed trades as they arrive from Delta, set as a ruled ledger, newest first. */
export function TradeFeed({ trades }: { trades: FeedTrade[] }) {
  const net = trades.reduce((sum, t) => sum + t.pnl, 0);
  const won = trades.filter((t) => t.pnl > 0).length;
  const th = "px-3 py-3 text-sm font-medium whitespace-nowrap text-muted first:pl-0 last:pr-0";
  const td = "px-3 py-4 first:pl-0 last:pr-0";

  return (
    <div className="overflow-x-auto border-t-4 border-ink">
      <table className="face-label w-full text-base">
        <caption className="visually-hidden">The demo account&apos;s latest closed trades, newest first</caption>
        <thead className="border-b border-rule-2 text-left">
          <tr>
            <th className={th}>Symbol</th>
            <th className={th}>Side</th>
            <th className={`${th} max-sm:hidden`}>Held</th>
            <th className={th}>Habit</th>
            <th className={`${th} text-right`}>Net P&L</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {[...trades].reverse().map((t) => (
            <tr key={t.id}>
              <td className={`${td} text-lg text-ink`}>{t.symbol}</td>
              <td className={`${td} text-ink-2`}>{t.direction}</td>
              <td className={`${td} text-ink-2 max-sm:hidden`}>{t.held}</td>
              <td className={td}>
                {t.tag && <span className={`inline-block border px-1.5 py-0.5 text-sm ${t.warning ? "border-transparent bg-warn-soft text-warn" : "border-rule text-ink-2"}`}>{t.tag}</span>}
              </td>
              <td className={`${td} figure-display text-right text-2xl ${pnlClass(t.pnl)}`}>{t.pnlText}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-ink">
          <tr>
            <th scope="row" className={`${td} text-left text-sm font-medium text-muted`} colSpan={2}>
              Won {won} of {trades.length}
            </th>
            <td className={`${td} max-sm:hidden`} />
            <td className={`${td} text-right text-sm text-muted`}>Net</td>
            <td className={`${td} figure-display text-right text-2xl ${pnlClass(net)}`}>{formatMoney(net, { sign: true })}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
