import Link from "next/link";
import { connection } from "next/server";
import { CostBreakdown } from "@/components/charts/cost-breakdown";
import { EquityChart } from "@/components/charts/equity-chart";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { FilterBar } from "@/components/filter-bar";
import { TagChip } from "@/components/tag-chip";
import { getDb } from "@/db";
import { listReviews } from "@/lib/ai/review";
import { formatDateTime, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { getSyncStatus, journaledTradeIds, listSymbols, listTrades } from "@/lib/queries";
import { filterHref, RANGES, rangeStart, readFilters } from "@/lib/range";
import { computeStats, dailyPnl, equityCurve, groupStats, tagPerformance, type GroupStats } from "@/lib/stats";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  await connection();
  const filters = readFilters(await searchParams);
  const [trades, symbols, syncStatus, journaled, [latestReview]] = await Promise.all([
    listTrades({ symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(),
    getSyncStatus(),
    journaledTradeIds(),
    getDb().then((db) => listReviews(db, 1)),
  ]);
  const journaledHere = trades.filter((t) => t.status === "closed" && journaled.has(t.id)).length;

  const stats = computeStats(trades);
  const curve = equityCurve(trades);
  const days = dailyPnl(trades);
  const lastRun = Math.max(0, ...syncStatus.map((s) => s.lastRunAt ?? 0));
  const syncError = syncStatus.find((s) => s.lastError)?.lastError;
  const mismatches = trades.filter((t) => t.pnlMatchesDelta === false).length;
  const rangeLabel = RANGES.find((r) => r.key === filters.range)!.label.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <div className="space-y-2">
        <FilterBar path="/" filters={filters} symbols={symbols} />
        <p className="text-xs text-zinc-500">
          {lastRun ? `Last synced ${formatDateTime(lastRun)} IST` : "Not synced yet"}
          {syncError && <span className="text-rose-600 dark:text-rose-400"> · last sync failed: {syncError}</span>}
          {mismatches > 0 && <span className="text-amber-700 dark:text-amber-300"> · {mismatches} trades don&apos;t match Delta&apos;s P&L</span>}
        </p>
      </div>

      {stats.trades === 0 ? (
        <section className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No closed trades in this view. Try a wider date range, or press <strong>Sync from Delta</strong>.
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-end gap-x-12 gap-y-6">
            <div>
              <div className="text-sm text-zinc-500">Net P&L, {rangeLabel}</div>
              <div className={`text-5xl font-semibold tracking-tight ${pnlClass(stats.netPnl)}`}>{formatMoney(stats.netPnl, { sign: true })}</div>
              <div className="mt-1 text-sm text-zinc-500">
                {stats.trades} closed trades, after fees and funding
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                {journaledHere} of {stats.trades} journaled
                {journaledHere < stats.trades && (
                  <>
                    {" · "}
                    <Link href="/journal" className="text-[var(--viz-profit)] hover:underline">
                      Journal the rest
                    </Link>
                  </>
                )}
              </div>
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Win rate" value={formatPercent(stats.winRate)} hint={`${stats.wins} won, ${stats.losses} lost`} />
              <Tile label="Profit factor" value={stats.profitFactor === null ? "–" : stats.profitFactor.toFixed(2)} hint="gross wins ÷ gross losses" />
              <Tile label="Expectancy" value={formatMoney(stats.expectancy, { sign: true })} hint="average per trade" />
              <Tile label="Average win" value={formatMoney(stats.avgWin)} hint={`average loss ${formatMoney(stats.avgLoss)}`} />
              <Tile label="Max drawdown" value={formatMoney(stats.maxDrawdown)} hint="from the highest point" />
              <Tile label="Trading costs" value={formatMoney(stats.fees + stats.liquidationFees)} hint="fees and liquidation fees" />
            </dl>
          </section>

          {latestReview && (
            <Link
              href="/review"
              className="block rounded-lg border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="text-xs text-zinc-500">Latest AI review · {formatDateTime(latestReview.createdAt)} IST</span>
              <span className="mt-0.5 block font-medium">{latestReview.review.headline}</span>
            </Link>
          )}

          <Card title="Equity curve" subtitle="Cumulative net P&L after each closed trade, oldest to newest">
            <EquityChart points={curve} />
          </Card>

          <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
            <Card title="Daily P&L" subtitle="Net P&L by day closed (IST)">
              <PnlCalendar days={days} />
            </Card>
            <div className="space-y-8">
              <Card title="Where your P&L went" subtitle="Trading result before costs, then each cost">
                <CostBreakdown stats={stats} />
              </Card>
              <Card title="By symbol">
                <GroupTable groups={groupStats(trades, (t) => t.symbol)} label="Symbol" />
              </Card>
              <Card title="Long vs short">
                <GroupTable groups={groupStats(trades, (t) => t.direction)} label="Side" />
              </Card>
            </div>
          </div>

          <Card title="How tagged trades performed" subtitle="Worst first. Select a tag to see its trades.">
            <TagTable trades={trades} filters={filters} />
          </Card>

          <details className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-medium">Daily P&L table</summary>
            <DailyTable days={days} />
          </details>
        </>
      )}
    </main>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-black/10 bg-[var(--viz-surface)] p-4 dark:border-white/10">
      <h2 className="font-semibold text-[var(--viz-ink)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--viz-ink-2)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-zinc-500">{hint}</dd>}
    </div>
  );
}

const th = "px-3 py-2";
const td = "px-3 py-1.5 tabular-nums";

function GroupTable({ groups, label }: { groups: GroupStats[]; label: string }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-zinc-500">
        <tr>
          <th className={th}>{label}</th>
          <th className={`${th} text-right`}>Trades</th>
          <th className={`${th} text-right`}>Win rate</th>
          <th className={`${th} text-right`}>Net P&L</th>
          <th className={`${th} text-right`}>Per trade</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {groups.map((g) => (
          <tr key={g.key}>
            <td className="px-3 py-1.5 capitalize">{g.key}</td>
            <td className={`${td} text-right`}>{g.trades}</td>
            <td className={`${td} text-right`}>{formatPercent(g.winRate)}</td>
            <td className={`${td} text-right ${pnlClass(g.netPnl)}`}>{formatMoney(g.netPnl, { sign: true })}</td>
            <td className={`${td} text-right ${pnlClass(g.expectancy)}`}>{formatMoney(g.expectancy, { sign: true })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TagTable({ trades, filters }: { trades: Parameters<typeof tagPerformance>[0]; filters: ReturnType<typeof readFilters> }) {
  const rows = tagPerformance(trades);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className={th}>Tag</th>
            <th className={`${th} text-right`}>Trades</th>
            <th className={`${th} text-right`}>Win rate</th>
            <th className={`${th} text-right`}>Net P&L</th>
            <th className={`${th} text-right`}>Per trade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.map((r) => (
            <tr key={r.tag}>
              <td className="px-3 py-1.5">
                <TagChip tag={r.tag} href={filterHref("/trades", filters, { tag: r.tag })} />
              </td>
              <td className={`${td} text-right`}>{r.trades}</td>
              <td className={`${td} text-right`}>{formatPercent(r.winRate)}</td>
              <td className={`${td} text-right ${pnlClass(r.netPnl)}`}>{formatMoney(r.netPnl, { sign: true })}</td>
              <td className={`${td} text-right ${pnlClass(r.avgPnl)}`}>{formatMoney(r.avgPnl, { sign: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ days }: { days: ReturnType<typeof dailyPnl> }) {
  const rows = [...days].reverse();
  return (
    <table className="mt-3 w-full text-sm">
      <thead className="text-left text-xs uppercase text-zinc-500">
        <tr>
          <th className={th}>Date (IST)</th>
          <th className={`${th} text-right`}>Trades</th>
          <th className={`${th} text-right`}>Won</th>
          <th className={`${th} text-right`}>Net P&L</th>
          <th className={`${th} text-right`}>Cumulative</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((d) => (
          <tr key={d.date}>
            <td className={td}>{d.date}</td>
            <td className={`${td} text-right`}>{d.trades}</td>
            <td className={`${td} text-right`}>{d.wins}</td>
            <td className={`${td} text-right ${pnlClass(d.netPnl)}`}>{formatMoney(d.netPnl, { sign: true })}</td>
            <td className={`${td} text-right`}>{formatMoney(d.cumulative, { sign: true })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
