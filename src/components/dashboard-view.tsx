import Link from "next/link";
import { CostBreakdown } from "@/components/charts/cost-breakdown";
import { EquityChart } from "@/components/charts/equity-chart";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { FilterBar } from "@/components/filter-bar";
import { ScoreCard } from "@/components/score-card";
import { TagChip } from "@/components/tag-chip";
import { card, link } from "@/components/ui";
import { getDb } from "@/db";
import { listReviews } from "@/lib/ai/review";
import { formatDateTime, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { biggestLeaks, TAG_HINTS, whatWorks } from "@/lib/insights";
import { behaviourScore } from "@/lib/score";
import { journaledTradeIds, listSymbols, listTrades } from "@/lib/queries";
import { filterHref, RANGES, rangeStart, type readFilters } from "@/lib/range";
import { computeStats, dailyPnl, equityCurve, groupStats, tagPerformance, type GroupStats, type TagPerformance } from "@/lib/stats";
import { tagLabel } from "@/lib/tags";

type Filters = ReturnType<typeof readFilters>;

/**
 * The dashboard for one account. The demo (/demo) shows it read-only: no
 * journal or AI review links, and tag links stay on the demo page.
 */
export async function DashboardView({
  userId,
  filters,
  demo = false,
  greeting,
}: {
  userId: string;
  filters: Filters;
  demo?: boolean;
  /** "Good evening, Anish": shown above the filters. */
  greeting?: string;
}) {
  const path = demo ? "/demo" : "/";
  const [trades, symbols, journaled, [latestReview]] = await Promise.all([
    listTrades(userId, { symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(userId),
    journaledTradeIds(userId),
    getDb().then((db) => listReviews(db, userId, 1)),
  ]);
  const journaledHere = trades.filter((t) => t.status === "closed" && journaled.has(t.id)).length;

  const stats = computeStats(trades);
  const curve = equityCurve(trades);
  const days = dailyPnl(trades);
  const leaks = biggestLeaks(trades);
  const score = behaviourScore(trades, journaled);
  const works = whatWorks(trades);
  const tagPath = demo ? "/demo" : "/trades";
  const mismatches = trades.filter((t) => t.pnlMatchesDelta === false).length;
  const rangeLabel = RANGES.find((r) => r.key === filters.range)!.label.toLowerCase();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      {greeting && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="text-sm text-zinc-500">Here&apos;s how your trading is going.</p>
        </div>
      )}
      <div className="space-y-2">
        <FilterBar path={path} filters={filters} symbols={symbols} />
        {!demo && mismatches > 0 && <p className="text-xs text-amber-300">{mismatches} trades don&apos;t match Delta&apos;s P&L</p>}
      </div>

      {stats.trades === 0 ? (
        <section className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
          No closed trades in this view yet. Try a wider date range; new trades appear here within a minute of closing on Delta.
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <div className={`${card} flex flex-col justify-center p-5`}>
              <div className="text-sm text-zinc-400">Net P&L, {rangeLabel}</div>
              <div className={`mt-1 text-5xl font-semibold tracking-tight tabular-nums ${pnlClass(stats.netPnl)}`}>
                {formatMoney(stats.netPnl, { sign: true })}
              </div>
              <div className="mt-2 text-sm text-zinc-400">
                {stats.trades} closed trades, after {formatMoney(stats.fees + stats.liquidationFees)} of fees
              </div>
              <div className="mt-1 text-sm text-zinc-500">
                {journaledHere} of {stats.trades} journaled
                {!demo && journaledHere < stats.trades && (
                  <>
                    {" · "}
                    <Link href="/journal" className={link}>
                      Journal the rest
                    </Link>
                  </>
                )}
              </div>
            </div>
            <Insights leaks={leaks} works={works} href={(tag) => filterHref(tagPath, filters, { tag })} />
          </section>

          <section className={`grid gap-4 ${score ? "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : ""}`}>
            {score && <ScoreCard score={score} />}
            <dl className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${score ? "lg:grid-cols-2" : "lg:grid-cols-6"}`}>
              <Tile icon={ICONS.target} label="Win rate" value={formatPercent(stats.winRate)} hint={`${stats.wins} won, ${stats.losses} lost`} />
              <Tile icon={ICONS.scale} label="Profit factor" value={stats.profitFactor === null ? "–" : stats.profitFactor.toFixed(2)} hint="gross wins ÷ gross losses" />
              <Tile icon={ICONS.coin} label="Expectancy" value={formatMoney(stats.expectancy, { sign: true })} hint="average per trade" />
              <Tile icon={ICONS.up} label="Average win" value={formatMoney(stats.avgWin)} hint={`average loss ${formatMoney(stats.avgLoss)}`} />
              <Tile icon={ICONS.down} label="Max drawdown" value={formatMoney(stats.maxDrawdown)} hint="from the highest point" />
              <Tile icon={ICONS.receipt} label="Trading costs" value={formatMoney(stats.fees + stats.liquidationFees)} hint="fees and liquidation fees" />
            </dl>
          </section>

          {!demo && latestReview && (
            <Link href="/review" className={`${card} block px-4 py-3 hover:border-zinc-700`}>
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
            <TagTable trades={trades} filters={filters} path={demo ? "/demo" : "/trades"} />
          </Card>

          <details className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
            <summary className="cursor-pointer text-sm font-medium">Daily P&L table</summary>
            <DailyTable days={days} />
          </details>
        </>
      )}
    </main>
  );
}

/** The costliest habits, and what has worked, each linking to its trades. */
function Insights({ leaks, works, href }: { leaks: TagPerformance[]; works: TagPerformance[]; href: (tag: string) => string }) {
  if (!leaks.length && !works.length) return null;
  return (
    <div className={`${card} p-5`}>
      {leaks.length > 0 && (
        <>
          <h2 className="font-semibold">Your biggest leaks</h2>
          <ul className="mt-2 divide-y divide-zinc-800">
            {leaks.map((r) => (
              <InsightRow key={r.tag} row={r} href={href(r.tag)} />
            ))}
          </ul>
        </>
      )}
      {works.length > 0 && (
        <>
          <h2 className={`font-semibold ${leaks.length ? "mt-4" : ""}`}>What works for you</h2>
          <ul className="mt-2 divide-y divide-zinc-800">
            {works.map((r) => (
              <InsightRow key={r.tag} row={r} href={href(r.tag)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function InsightRow({ row, href }: { row: TagPerformance; href: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-start justify-between gap-4 py-2.5">
        <span className="min-w-0">
          <span className="font-medium group-hover:underline">{tagLabel(row.tag)}</span>
          {TAG_HINTS[row.tag] && <span className="block text-xs text-zinc-500">{TAG_HINTS[row.tag]}</span>}
        </span>
        <span className="shrink-0 text-right">
          <span className={`block font-semibold tabular-nums ${pnlClass(row.netPnl)}`}>{formatMoney(row.netPnl, { sign: true })}</span>
          <span className="block text-xs text-zinc-500">
            {row.trades} trades · {formatPercent(row.winRate)} won
          </span>
        </span>
      </Link>
    </li>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-4`}>
      <h2 className="font-semibold text-[var(--viz-ink)]">{title}</h2>
      {subtitle && <p className="text-sm text-[var(--viz-ink-2)]">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Outline icons (24px grid) for the stat tiles. */
const ICONS = {
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-3.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z",
  scale: "M12 4v16M5 20h14M6 8h12M6 8l-3 6a3 3 0 0 0 6 0zm12 0l-3 6a3 3 0 0 0 6 0z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm2.5-12.5h-3.5a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9.5M12 6.5v11",
  up: "M3 17l6-6 4 4 8-8M15 7h6v6",
  down: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zm3 5h6m-6 4h6",
};

function Tile({ icon, label, value, hint }: { icon: string; label: string; value: string; hint?: string }) {
  return (
    <div className={`${card} p-3`}>
      <dt className="flex items-center justify-between gap-2 text-xs text-zinc-500">
        {label}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-brand/80" aria-hidden="true">
          <path d={icon} />
        </svg>
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
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

function TagTable({ trades, filters, path }: { trades: Parameters<typeof tagPerformance>[0]; filters: Filters; path: string }) {
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
                <TagChip tag={r.tag} href={filterHref(path, filters, { tag: r.tag })} />
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
