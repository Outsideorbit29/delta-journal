import Link from "next/link";
import { connection } from "next/server";
import { FilterBar } from "@/components/filter-bar";
import { TagChip } from "@/components/tag-chip";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { journaledTradeIds, listSymbols, listTrades } from "@/lib/queries";
import { filterHref, rangeStart, readFilters } from "@/lib/range";
import { computeStats } from "@/lib/stats";

export default async function TradesPage({ searchParams }: PageProps<"/trades">) {
  await connection();
  const filters = readFilters(await searchParams);
  const [trades, symbols, journaled] = await Promise.all([
    listTrades({ symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(),
    journaledTradeIds(),
  ]);
  const stats = computeStats(trades);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-4 px-4 py-6">
      <FilterBar path="/trades" filters={filters} symbols={symbols} />
      <p className="text-sm text-zinc-500">
        {trades.length} trades · {stats.wins}W / {stats.losses}L ({formatPercent(stats.winRate)}) · net{" "}
        <span className={pnlClass(stats.netPnl)}>{formatMoney(stats.netPnl, { sign: true })}</span>
      </p>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Opened (IST)</th>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Side</th>
              <th className="px-3 py-2 text-right">Size</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Held</th>
              <th className="px-3 py-2 text-right">Lev</th>
              <th className="px-3 py-2 text-right">Net P&L</th>
              <th className="px-3 py-2 text-right">R</th>
              <th className="px-3 py-2">Journal</th>
              <th className="px-3 py-2">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {trades.map((t) => (
              <tr key={t.id} className="align-top hover:bg-zinc-50 dark:hover:bg-zinc-900">
                <td className="whitespace-nowrap px-3 py-2">
                  <Link href={`/trades/${encodeURIComponent(t.id)}`} className="hover:underline">
                    {formatDateTime(t.openedTs)}
                  </Link>
                </td>
                <td className="px-3 py-2">{t.symbol}</td>
                <td className={`px-3 py-2 ${t.direction === "long" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {t.direction}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.maxQty.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPrice(t.avgEntry)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.status === "open" ? "open" : formatPrice(t.avgExit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatDuration(t.holdSeconds)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.leverage ? `${t.leverage}x` : "–"}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${pnlClass(t.netPnl)}`}>
                  {t.status === "open" ? "–" : formatMoney(t.netPnl, { sign: true })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatR(t.rMultiple)}</td>
                <td className="px-3 py-2">
                  {journaled.has(t.id) ? (
                    <span className="text-zinc-500">Done</span>
                  ) : t.status === "closed" ? (
                    <Link href={`/trades/${encodeURIComponent(t.id)}`} className="text-[var(--viz-profit)] hover:underline">
                      Add
                    </Link>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="flex max-w-md flex-wrap gap-1">
                    {t.tags.map((g) => (
                      <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={filterHref("/trades", filters, { tag: g.tag })} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No trades match these filters.</p>}
      </div>
    </main>
  );
}
