import Link from "next/link";
import { CostBreakdown } from "@/components/charts/cost-breakdown";
import { EquityChart } from "@/components/charts/equity-chart";
import { PnlCalendar } from "@/components/charts/pnl-calendar";
import { FilterBar } from "@/components/filter-bar";
import { ScoreCard, type ScoreAction } from "@/components/score-card";
import { TodayStrip } from "@/components/today-strip";
import { TagChip } from "@/components/tag-chip";
import { getDb } from "@/db";
import type { Currency } from "@/db/schema";
import { chooseAccount, listAccounts } from "@/lib/accounts";
import { listReviews } from "@/lib/ai/review";
import { formatDateTime, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { biggestLeaks, TAG_HINTS, whatWorks } from "@/lib/insights";
import { behaviourScore, weakest, type BehaviourScore } from "@/lib/score";
import { summarySince, todaySummary, type TodaySummary } from "@/lib/today";
import { journaledTradeIds, listSegments, listSymbols, listTrades } from "@/lib/queries";
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
  /** "Good evening, Anish": the page's title. */
  greeting?: string;
}) {
  const path = demo ? "/demo" : "/";
  const db = await getDb();
  // One account at a time: its trades, in its currency.
  const accounts = await listAccounts(db, userId);
  const account = chooseAccount(accounts, filters.account);
  const accountId = account?.id;
  const currency: Currency = account?.currency ?? "USD";
  const [trades, symbols, journaled, [latestReview], recentTrades, segments] = await Promise.all([
    listTrades(userId, { accountId, segment: filters.segment, symbol: filters.symbol, tag: filters.tag, sinceTs: rangeStart(filters.range) }),
    listSymbols(userId, accountId),
    journaledTradeIds(userId),
    listReviews(db, userId, 1, accountId ?? "none"),
    demo ? Promise.resolve([]) : listTrades(userId, { accountId, sinceTs: summarySince() }),
    listSegments(userId, accountId),
  ]);
  const summary = demo ? null : todaySummary(recentTrades, journaled);
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
    <main id="main" className="container space-y-16 pt-10 pb-24">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        {greeting ? (
          <h1 className="text-3xl leading-none">{greeting}</h1>
        ) : (
          <h1 className="text-3xl leading-none">{demo ? "The demo trader's dashboard" : "Dashboard"}</h1>
        )}
        <div className="space-y-2">
          <FilterBar path={path} filters={filters} symbols={symbols} accounts={accounts} account={account} segments={segments} />
          {!demo && mismatches > 0 && <p className="face-label text-sm text-warn">{mismatches} trades don&apos;t match Delta&apos;s P&L</p>}
        </div>
      </div>

      {summary && summary.recent.trades > 0 && <TodayStrip summary={summary} currency={currency} />}

      {stats.trades === 0 ? (
        <section className="opens max-w-2xl">
          <h2 className="text-xl">No closed trades in this view yet</h2>
          <p className="mt-3 text-ink-2">Try a wider date range. New trades appear here within minutes of closing.</p>
        </section>
      ) : (
        <>
          {/* The lead: the net result, then what each habit cost. */}
          <section className="opens grid gap-x-8 gap-y-10 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-4">
              <h2 className="face-label text-sm font-medium text-muted">Net P&L, {rangeLabel}</h2>
              <p className={`figure-display mt-3 text-[clamp(3.5rem,6vw,5.5rem)] ${pnlClass(stats.netPnl)}`}>{formatMoney(stats.netPnl, { sign: true, currency })}</p>
              <p className="mt-4 max-w-xs text-lg text-ink">
                {stats.trades} closed trades, after {formatMoney(stats.fees + stats.liquidationFees, { currency })} of fees.
              </p>
              <p className="face-label mt-3 text-sm text-muted">
                {journaledHere} of {stats.trades} journaled
                {!demo && journaledHere < stats.trades && (
                  <>
                    {", "}
                    <Link href="/journal" className="link">
                      journal the rest
                    </Link>
                  </>
                )}
              </p>
            </div>
            <Insights leaks={leaks} works={works} href={(tag) => filterHref(tagPath, filters, { tag })} currency={currency} />
          </section>

          <section className={`grid gap-x-8 gap-y-12 ${score ? "lg:grid-cols-12" : ""}`}>
            {score && (
              <div className="min-w-0 lg:col-span-7">
                <ScoreCard score={score} action={summary ? scoreAction(score, summary, (tag) => filterHref("/trades", filters, { tag })) : undefined} />
              </div>
            )}
            <div className={`min-w-0 ${score ? "lg:col-span-5" : ""}`}>
              <h2 className="opens text-xl">The figures</h2>
              <dl className={`mt-2 grid grid-cols-2 ${score ? "" : "sm:grid-cols-3 lg:grid-cols-6"}`}>
                <Figure label="Win rate" value={formatPercent(stats.winRate)} hint={`${stats.wins} won, ${stats.losses} lost`} />
                <Figure label="Profit factor" value={stats.profitFactor === null ? "–" : stats.profitFactor.toFixed(2)} hint="gross wins ÷ gross losses" />
                <Figure label="Expectancy" value={formatMoney(stats.expectancy, { sign: true, currency })} hint="average per trade" />
                <Figure label="Average win" value={formatMoney(stats.avgWin, { currency })} hint={`average loss ${formatMoney(stats.avgLoss, { currency })}`} />
                <Figure label="Max drawdown" value={formatMoney(stats.maxDrawdown, { currency })} hint="from the highest point" />
                <Figure label="Trading costs" value={formatMoney(stats.fees + stats.liquidationFees, { currency })} hint="fees and liquidation fees" />
              </dl>
            </div>
          </section>

          {!demo && latestReview && (
            <Link href="/review" className="group block bg-paper-2 border-t border-rule-2 px-6 py-5 no-underline">
              <span className="face-label block text-sm text-muted">
                Latest AI review, <time dateTime={new Date(latestReview.createdAt).toISOString()}>{formatDateTime(latestReview.createdAt)} IST</time>
              </span>
              <span className="mt-1 block text-xl text-ink underline decoration-rule-2 decoration-1 underline-offset-4 group-hover:decoration-accent">
                {latestReview.review.headline}
              </span>
            </Link>
          )}

          <Section title="Equity curve" subtitle="Cumulative net P&L after each closed trade, oldest to newest.">
            <EquityChart points={curve} currency={currency} />
          </Section>

          <div className="grid gap-x-8 gap-y-16 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
              <Section title="Daily P&L" subtitle="Net P&L by the day a trade closed, in IST.">
                <PnlCalendar days={days} currency={currency} />
              </Section>
            </div>
            <div className="min-w-0 space-y-16 lg:col-span-5">
              <Section title="Where your P&L went" subtitle="The trading result before costs, then each cost.">
                <CostBreakdown stats={stats} currency={currency} />
              </Section>
              <Section title="By symbol">
                <GroupTable groups={groupStats(trades, (t) => t.symbol)} label="Symbol" currency={currency} />
              </Section>
              <Section title="Long and short">
                <GroupTable groups={groupStats(trades, (t) => t.direction)} label="Side" currency={currency} />
              </Section>
            </div>
          </div>

          <Section title="How tagged trades performed" subtitle="Worst first. Select a tag to see its trades.">
            <TagTable trades={trades} filters={filters} path={demo ? "/demo" : "/trades"} currency={currency} />
          </Section>

          <details className="group border-t border-rule-2 pt-4">
            <summary className="face-label flex min-h-11 cursor-pointer items-center text-base text-ink">Daily P&L as a table</summary>
            <DailyTable days={days} currency={currency} />
          </details>
        </>
      )}
    </main>
  );
}

/** The next step for the weakest habit: journal what is waiting, or look at the trades that have the habit. */
function scoreAction(score: BehaviourScore, summary: TodaySummary, tradesWith: (tag: string) => string): ScoreAction | undefined {
  const focus = weakest(score);
  if (focus.key === "journal") {
    if (!summary.toJournal) return undefined;
    const n = summary.toJournal;
    return { message: `Journal your ${n} ${n === 1 ? "trade" : "trades"} from the last week to start lifting it.`, href: "/journal", label: "Journal now" };
  }
  if (!focus.tag) return undefined;
  return { message: focus.tip, href: tradesWith(focus.tag), label: "See these trades" };
}

/** The signature: the costliest habits set like a market table, each linking to its trades. */
function Insights({ leaks, works, href, currency }: { leaks: TagPerformance[]; works: TagPerformance[]; href: (tag: string) => string; currency: Currency }) {
  if (!leaks.length && !works.length) return null;
  return (
    <div className="min-w-0 space-y-10 lg:col-span-8">
      {leaks.length > 0 && (
        <div>
          <h2 className="text-2xl">Your biggest leaks</h2>
          <ul className="mt-4 divide-y divide-rule border-y border-rule-2">
            {leaks.map((r) => (
              <InsightRow key={r.tag} row={r} href={href(r.tag)} currency={currency} />
            ))}
          </ul>
        </div>
      )}
      {works.length > 0 && (
        <div>
          <h2 className="text-xl">What works for you</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule-2">
            {works.map((r) => (
              <InsightRow key={r.tag} row={r} href={href(r.tag)} currency={currency} small />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InsightRow({ row, href, currency, small = false }: { row: TagPerformance; href: string; currency: Currency; small?: boolean }) {
  return (
    <li>
      <Link href={href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 py-4 no-underline">
        <span className="min-w-0">
          <span className={`face-label block text-ink underline decoration-transparent decoration-1 underline-offset-4 group-hover:decoration-accent ${small ? "text-lg" : "text-xl"}`}>
            {tagLabel(row.tag)}
          </span>
          {TAG_HINTS[row.tag] && <span className="mt-1 block text-base text-muted">{TAG_HINTS[row.tag]}</span>}
        </span>
        <span className="text-right">
          <span className={`figure-display block ${small ? "text-3xl" : "text-4xl"} ${pnlClass(row.netPnl)}`}>{formatMoney(row.netPnl, { sign: true, currency })}</span>
          <span className="face-label mt-1 block text-sm text-muted">
            {row.trades} trades, {formatPercent(row.winRate)} won
          </span>
        </span>
      </Link>
    </li>
  );
}

/** A dashboard section: opened by the heavy ink rule, the head flush under it. */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="opens">
      <h2 className="text-xl">{title}</h2>
      {subtitle && <p className="mt-1 text-base text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** One figure in a ruled grid: the label, the value in the condensed face, a qualifier. */
function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-rule py-4 odd:pr-6 even:border-l even:pl-6">
      <dt className="face-label text-sm text-muted">{label}</dt>
      <dd className="figure-display mt-1 text-3xl text-ink">{value}</dd>
      {hint && <dd className="face-label mt-1 text-sm text-muted">{hint}</dd>}
    </div>
  );
}

const th = "face-label px-3 py-3 text-sm font-medium whitespace-nowrap text-muted first:pl-0 last:pr-0";
const td = "face-label px-3 py-2.5 text-base tabular-nums first:pl-0 last:pr-0";

function GroupTable({ groups, label, currency }: { groups: GroupStats[]; label: string; currency: Currency }) {
  return (
    <div className="overflow-x-auto">
    <table className="w-full">
      <thead className="border-b border-rule-2 text-left">
        <tr>
          <th className={th}>{label}</th>
          <th className={`${th} text-right`}>Trades</th>
          <th className={`${th} text-right`}>Win rate</th>
          <th className={`${th} text-right`}>Net P&L</th>
          <th className={`${th} text-right`}>Per trade</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule">
        {groups.map((g) => (
          <tr key={g.key}>
            <td className={`${td} font-medium text-ink capitalize`}>{g.key}</td>
            <td className={`${td} text-right`}>{g.trades}</td>
            <td className={`${td} text-right`}>{formatPercent(g.winRate)}</td>
            <td className={`${td} text-right ${pnlClass(g.netPnl)}`}>{formatMoney(g.netPnl, { sign: true, currency })}</td>
            <td className={`${td} text-right ${pnlClass(g.expectancy)}`}>{formatMoney(g.expectancy, { sign: true, currency })}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function TagTable({ trades, filters, path, currency }: { trades: Parameters<typeof tagPerformance>[0]; filters: Filters; path: string; currency: Currency }) {
  const rows = tagPerformance(trades);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-rule-2 text-left">
          <tr>
            <th className={th}>Tag</th>
            <th className={`${th} text-right`}>Trades</th>
            <th className={`${th} text-right`}>Win rate</th>
            <th className={`${th} text-right`}>Net P&L</th>
            <th className={`${th} text-right`}>Per trade</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((r) => (
            <tr key={r.tag}>
              <td className={td}>
                <TagChip tag={r.tag} href={filterHref(path, filters, { tag: r.tag })} />
              </td>
              <td className={`${td} text-right`}>{r.trades}</td>
              <td className={`${td} text-right`}>{formatPercent(r.winRate)}</td>
              <td className={`${td} text-right ${pnlClass(r.netPnl)}`}>{formatMoney(r.netPnl, { sign: true, currency })}</td>
              <td className={`${td} text-right ${pnlClass(r.avgPnl)}`}>{formatMoney(r.avgPnl, { sign: true, currency })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ days, currency }: { days: ReturnType<typeof dailyPnl>; currency: Currency }) {
  const rows = [...days].reverse();
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-rule-2 text-left">
          <tr>
            <th className={th}>Date (IST)</th>
            <th className={`${th} text-right`}>Trades</th>
            <th className={`${th} text-right`}>Won</th>
            <th className={`${th} text-right`}>Net P&L</th>
            <th className={`${th} text-right`}>Cumulative</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {rows.map((d) => (
            <tr key={d.date}>
              <td className={td}>{d.date}</td>
              <td className={`${td} text-right`}>{d.trades}</td>
              <td className={`${td} text-right`}>{d.wins}</td>
              <td className={`${td} text-right ${pnlClass(d.netPnl)}`}>{formatMoney(d.netPnl, { sign: true, currency })}</td>
              <td className={`${td} text-right`}>{formatMoney(d.cumulative, { sign: true, currency })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
