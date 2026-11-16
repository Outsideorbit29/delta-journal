import Link from "next/link";
import { connection } from "next/server";
import { FilterBar } from "@/components/filter-bar";
import { getDb } from "@/db";
import { chooseAccount, listAccounts } from "@/lib/accounts";
import { TagChip } from "@/components/tag-chip";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { journaledTradeIds, listSegments, listSymbols, listTrades, type TradeWithTags } from "@/lib/queries";
import { filterHref, rangeStart, readFilters, type Filters } from "@/lib/range";
import { requireUserId } from "@/lib/session";
import { computeStats, istDate } from "@/lib/stats";
import { topTags } from "@/lib/tags";

export default async function TradesPage({ searchParams }: PageProps<"/trades">) {
  await connection();
  const userId = await requireUserId();
  const filters = readFilters(await searchParams);
  const accounts = await listAccounts(await getDb(), userId);
  const account = chooseAccount(accounts, filters.account);
  const accountId = account?.id;
  const currency = account?.currency ?? "USD";
  const [trades, symbols, journaled, segments] = await Promise.all([
    listTrades(userId, { accountId, segment: filters.segment, symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(userId, accountId),
    journaledTradeIds(userId),
    listSegments(userId, accountId),
  ]);
  const stats = computeStats(trades);
  const href = (t: TradeWithTags) => `/trades/${encodeURIComponent(t.id)}`;

  return (
    <main id="main" className="container space-y-8 pt-10 pb-24">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl leading-none">Trades</h1>
          <p className="face-label mt-2 text-base text-ink-2">
            {trades.length} trades, {stats.wins} won and {stats.losses} lost ({formatPercent(stats.winRate)}), net{" "}
            <span className={pnlClass(stats.netPnl)}>{formatMoney(stats.netPnl, { sign: true, currency })}</span>
          </p>
        </div>
        <FilterBar path="/trades" filters={filters} symbols={symbols} accounts={accounts} account={account} segments={segments} />
      </div>

      {trades.length === 0 && (
        <section className="opens max-w-2xl">
          <h2 className="text-xl">No trades match these filters</h2>
          <p className="mt-2 text-ink-2">Choose a wider date range or another symbol above.</p>
        </section>
      )}

      {/* Phones: one ruled row per trade, grouped under each day (IST) with that day's net result. */}
      {trades.length > 0 && (
        <div className="border-t border-ink md:hidden">
          {byDay(trades).map((day) => (
            <section key={day.date} aria-label={day.label}>
              <h2 className="face-label -mx-(--gutter) flex justify-between gap-3 bg-paper-2 px-(--gutter) py-1.5 text-sm text-muted">
                <span>{day.label}</span>
                <span>
                  {day.closed ? <span className={pnlClass(day.netPnl)}>{formatMoney(day.netPnl, { sign: true, currency })}</span> : null}
                  {day.closed ? " · " : ""}
                  {day.trades.length} {day.trades.length === 1 ? "trade" : "trades"}
                </span>
              </h2>
        <ul className="divide-y divide-rule border-b border-rule">
          {day.trades.map((t) => (
            <li key={t.id}>
              <Link href={href(t)} className="block py-4 no-underline active:bg-paper-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="face-label text-lg text-ink">
                    {t.symbol} <span className="text-ink-2">{t.direction}</span>
                  </span>
                  <span className={`figure-display text-2xl ${pnlClass(t.netPnl)}`}>{t.status === "open" ? "open" : formatMoney(t.netPnl, { sign: true, currency: t.currency })}</span>
                </div>
                <div className="face-label mt-1 flex justify-between gap-3 text-sm text-muted">
                  <span>
                    {formatDateTime(t.openedTs)}, held {formatDuration(t.holdSeconds)}
                  </span>
                  <span>{journaled.has(t.id) ? "Journaled" : t.status === "closed" ? <span className="text-ink underline decoration-accent">Journal it</span> : null}</span>
                </div>
                <Tags trade={t} filters={filters} n={3} linked={false} />
              </Link>
            </li>
          ))}
        </ul>
            </section>
          ))}
        </div>
      )}

      {/* Larger screens: the full table, opened by the heavy rule. */}
      {trades.length > 0 && (
        <div className="hidden overflow-x-auto border-t-4 border-ink md:block">
          <table className="face-label w-full text-base">
            <thead className="border-b border-rule-2 text-left">
              <tr>
                <th className={th}>Opened (IST)</th>
                <th className={th}>Symbol</th>
                <th className={th}>Side</th>
                <th className={`${th} text-right`}>Size</th>
                <th className={`${th} text-right`}>Entry</th>
                <th className={`${th} text-right`}>Exit</th>
                <th className={`${th} text-right`}>Held</th>
                <th className={`${th} text-right`}>Leverage</th>
                <th className={`${th} text-right`}>Net P&L</th>
                <th className={`${th} text-right`}>R</th>
                <th className={th}>Journal</th>
                <th className={th}>Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {trades.map((t) => (
                <tr key={t.id} className="transition-colors duration-(--dur-micro) hover:bg-paper-2">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={href(t)} className="link">
                      {formatDateTime(t.openedTs)}
                    </Link>
                  </td>
                  <td className={`${td} font-medium text-ink`}>{t.symbol}</td>
                  <td className={td}>{t.direction}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.maxQty.toLocaleString()}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatPrice(t.avgEntry)}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.status === "open" ? "open" : formatPrice(t.avgExit)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatDuration(t.holdSeconds)}</td>
                  <td className={`${td} text-right tabular-nums`}>{t.leverage ? `${t.leverage}x` : "–"}</td>
                  <td className={`${td} text-right font-medium tabular-nums ${pnlClass(t.netPnl)}`}>{t.status === "open" ? "–" : formatMoney(t.netPnl, { sign: true, currency: t.currency })}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatR(t.rMultiple)}</td>
                  <td className={td}>
                    {journaled.has(t.id) ? (
                      <span className="text-muted">Done</span>
                    ) : t.status === "closed" ? (
                      <Link href={href(t)} className="link">
                        Add
                      </Link>
                    ) : null}
                  </td>
                  <td className={td}>
                    <Tags trade={t} filters={filters} n={3} linked />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

const th = "px-3 py-3 text-sm font-medium whitespace-nowrap text-muted first:pl-0";
const td = "px-3 py-3 text-ink-2 first:pl-0";

/** The few tags that matter most, with a count of the rest (all of them are on the trade's page). */
function Tags({ trade, filters, n, linked }: { trade: TradeWithTags; filters: Filters; n: number; linked: boolean }) {
  const { shown, more } = topTags(trade.tags, n);
  if (!shown.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${linked ? "" : "mt-2"}`}>
      {shown.map((g) => (
        <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={linked ? filterHref("/trades", filters, { tag: g.tag }) : undefined} />
      ))}
      {more > 0 && <span className="face-label text-sm text-muted">and {more} more</span>}
    </div>
  );
}

const dayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric" });

/** Trades grouped by the IST day they opened, newest day first, with each day's closed net result. */
function byDay(trades: TradeWithTags[]) {
  const days = new Map<string, { date: string; label: string; trades: TradeWithTags[]; netPnl: number; closed: number }>();
  for (const t of trades) {
    const date = istDate(t.openedTs);
    const day = days.get(date) ?? { date, label: dayLabel.format(t.openedTs), trades: [], netPnl: 0, closed: 0 };
    day.trades.push(t);
    if (t.status === "closed") {
      day.netPnl += t.netPnl;
      day.closed++;
    }
    days.set(date, day);
  }
  return [...days.values()];
}
