import Link from "next/link";
import type { Currency } from "@/db/schema";
import { CountUp } from "@/components/motion/count-up";
import { buttonPrimary } from "@/components/ui";
import { formatMoney, pnlClass } from "@/lib/format";
import { RECENT_DAYS, type TodaySummary } from "@/lib/today";

/**
 * The top of the dashboard: today's result, the last week's, and the trades still to journal,
 * with the one action that matters most. It ignores the page's filters on purpose.
 */
export function TodayStrip({ summary, currency = "USD" }: { summary: TodaySummary; currency?: Currency }) {
  const { today, recent, toJournal } = summary;
  return (
    <section aria-label="Today" className="opens grid grid-cols-2 gap-x-6 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-center">
      <Cell label="Today">
        {today.trades ? (
          <>
            <CountUp value={today.netPnl} sign currency={currency} className={`figure-display text-3xl ${pnlClass(today.netPnl)}`} />
            <span className="face-label text-sm text-muted">
              {today.trades} {today.trades === 1 ? "trade" : "trades"} · {today.wins} won
            </span>
          </>
        ) : (
          <>
            <span className="figure-display text-3xl text-ink">–</span>
            <span className="face-label text-sm text-muted">no trades closed yet</span>
          </>
        )}
      </Cell>
      <Cell label={`Last ${RECENT_DAYS} days`}>
        <span className={`figure-display text-3xl ${recent.trades ? pnlClass(recent.netPnl) : "text-ink"}`}>
          {recent.trades ? <CountUp value={recent.netPnl} sign currency={currency} /> : "–"}
        </span>
        <span className="face-label text-sm text-muted">
          {recent.trades} {recent.trades === 1 ? "trade" : "trades"}
        </span>
      </Cell>
      <Cell label="To journal">
        <CountUp value={toJournal} kind="int" className={`figure-display text-3xl ${toJournal ? "text-warn" : "text-ink"}`} />
        <span className="face-label text-sm text-muted">{toJournal ? `from the last ${RECENT_DAYS} days` : "all caught up"}</span>
      </Cell>
      {toJournal > 0 && (
        <div className="self-center py-4 sm:py-0">
          <Link href="/journal" className={`${buttonPrimary} w-full sm:w-auto`}>
            Journal {toJournal} {toJournal === 1 ? "trade" : "trades"}
          </Link>
        </div>
      )}
    </section>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1 border-b border-rule py-4">
      <span className="face-label text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}
