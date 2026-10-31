import Link from "next/link";
import { connection } from "next/server";
import { FilterBar } from "@/components/filter-bar";
import { TagChip } from "@/components/tag-chip";
import { card, link } from "@/components/ui";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { journaledTradeIds, listSymbols, listTrades, type TradeWithTags } from "@/lib/queries";
import { filterHref, rangeStart, readFilters, type Filters } from "@/lib/range";
import { requireUserId } from "@/lib/session";
import { computeStats } from "@/lib/stats";
import { topTags } from "@/lib/tags";

export default async function TradesPage({ searchParams }: PageProps<"/trades">) {
  await connection();
  const userId = await requireUserId();
  const filters = readFilters(await searchParams);
  const [trades, symbols, journaled] = await Promise.all([
    listTrades(userId, { symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(userId),
    journaledTradeIds(userId),
  ]);
  const stats = computeStats(trades);
  const href = (t: TradeWithTags) => `/trades/${encodeURIComponent(t.id)}`;

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6">
      <FilterBar path="/trades" filters={filters} symbols={symbols} />
      <p className="text-sm text-zinc-500">
        {trades.length} trades · {stats.wins}W / {stats.losses}L ({formatPercent(stats.winRate)}) · net{" "}
        <span className={pnlClass(stats.netPnl)}>{formatMoney(stats.netPnl, { sign: true })}</span>
      </p>

      {trades.length === 0 && (
        <p className={`${card} p-6 text-center text-sm text-zinc-500`}>No trades match these filters.</p>
      )}

      {/* Phones: one card per trade. */}
      <ul className="space-y-2 md:hidden">
        {trades.map((t) => (
          <li key={t.id}>
            <Link href={href(t)} className={`${card} block p-3 active:bg-zinc-800`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {t.symbol} <Side direction={t.direction} />
                </span>
                <span className={`font-semibold tabular-nums ${pnlClass(t.netPnl)}`}>
                  {t.status === "open" ? "open" : formatMoney(t.netPnl, { sign: true })}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between gap-3 text-xs text-zinc-500">
                <span>
                  {formatDateTime(t.openedTs)} · held {formatDuration(t.holdSeconds)}
                </span>
                <span>{journaled.has(t.id) ? "Journaled" : t.status === "closed" ? <span className="text-brand">Journal</span> : null}</span>
              </div>
              <Tags trade={t} filters={filters} n={3} linked={false} />
            </Link>
          </li>
        ))}
      </ul>

      {/* Larger screens: the full table. */}
      {trades.length > 0 && (
        <div className={`${card} hidden overflow-x-auto md:block`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-zinc-500">
              <tr className="border-b border-zinc-800">
                <th className="px-3 py-2.5">Opened (IST)</th>
                <th className="px-3 py-2.5">Symbol</th>
                <th className="px-3 py-2.5">Side</th>
                <th className="px-3 py-2.5 text-right">Size</th>
                <th className="px-3 py-2.5 text-right">Entry</th>
                <th className="px-3 py-2.5 text-right">Exit</th>
                <th className="px-3 py-2.5 text-right">Held</th>
                <th className="px-3 py-2.5 text-right">Lev</th>
                <th className="px-3 py-2.5 text-right">Net P&L</th>
                <th className="px-3 py-2.5 text-right">R</th>
                <th className="px-3 py-2.5">Journal</th>
                <th className="px-3 py-2.5">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {trades.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-800/40">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={href(t)} className="hover:underline">
                      {formatDateTime(t.openedTs)}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{t.symbol}</td>
                  <td className="px-3 py-2">
                    <Side direction={t.direction} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.maxQty.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatPrice(t.avgEntry)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.status === "open" ? "open" : formatPrice(t.avgExit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatDuration(t.holdSeconds)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.leverage ? `${t.leverage}x` : "–"}</td>
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${pnlClass(t.netPnl)}`}>
                    {t.status === "open" ? "–" : formatMoney(t.netPnl, { sign: true })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatR(t.rMultiple)}</td>
                  <td className="px-3 py-2">
                    {journaled.has(t.id) ? (
                      <span className="text-zinc-500">Done</span>
                    ) : t.status === "closed" ? (
                      <Link href={href(t)} className={link}>
                        Add
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
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

function Side({ direction }: { direction: string }) {
  return <span className={direction === "long" ? "text-emerald-400" : "text-rose-400"}>{direction}</span>;
}

/** The few tags that matter most, with a count of the rest (all of them are on the trade's page). */
function Tags({ trade, filters, n, linked }: { trade: TradeWithTags; filters: Filters; n: number; linked: boolean }) {
  const { shown, more } = topTags(trade.tags, n);
  if (!shown.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${linked ? "" : "mt-2"}`}>
      {shown.map((g) => (
        <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={linked ? filterHref("/trades", filters, { tag: g.tag }) : undefined} />
      ))}
      {more > 0 && <span className="text-xs text-zinc-500">+{more}</span>}
    </div>
  );
}
