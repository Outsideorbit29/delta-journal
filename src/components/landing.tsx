import Link from "next/link";
import { Steps } from "@/components/landing/steps";
import { TradeFeed, WindowBar, type FeedTrade } from "@/components/landing/trade-feed";
import { ScoreCard } from "@/components/score-card";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { DEMO_USER } from "@/lib/demo";
import { formatDuration, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { biggestLeaks, TAG_HINTS, whatWorks } from "@/lib/insights";
import { journaledTradeIds, listTrades } from "@/lib/queries";
import { behaviourScore } from "@/lib/score";
import { computeStats, equityCurve, tagPerformance } from "@/lib/stats";
import { isWarningTag, tagLabel, topTags } from "@/lib/tags";
import { LEGAL } from "@/lib/legal";

// The home page for visitors. Every number on it comes from the demo account
// (lib/demo.ts), so it always shows what the product really computes.

/** The landing page's buttons are pills. */
const pillPrimary = buttonPrimary.replace("rounded-md", "rounded-full");
const pillSecondary = buttonSecondary.replace("rounded-md", "rounded-full");

const SESSIONS = ["session:asia", "session:london", "session:new_york"];

export async function Landing() {
  const [trades, journaled] = await Promise.all([listTrades(DEMO_USER), journaledTradeIds(DEMO_USER)]);
  const closed = trades.filter((t) => t.status === "closed");
  const stats = computeStats(trades);
  const curve = equityCurve(trades).map((p) => p.equity);
  const leaks = biggestLeaks(trades, 3);
  const works = whatWorks(trades, 1);
  const score = behaviourScore(trades, journaled);
  const sessions = tagPerformance(trades).filter((r) => SESSIONS.includes(r.tag));
  const recent = [...closed].sort((a, b) => (a.closedTs ?? 0) - (b.closedTs ?? 0)).slice(-7);
  const feed: FeedTrade[] = recent.map((t) => {
    const tag = topTags(t.tags, 1).shown[0]?.tag ?? null;
    return {
      id: t.id,
      symbol: t.symbol,
      direction: t.direction,
      held: formatDuration(t.holdSeconds),
      pnl: t.netPnl,
      pnlText: formatMoney(t.netPnl, { sign: true }),
      tag: tag && tagLabel(tag),
      warning: !!tag && isWarningTag(tag),
    };
  });
  const topLeak = leaks[0];

  return (
    <div className="bg-grid">
      <div className="scroll-progress fixed inset-x-0 top-0 z-50 h-0.5 bg-brand" aria-hidden="true" />
      <main className="mx-auto w-full max-w-6xl px-4">
        {/* Hero */}
        <section className="pt-16 pb-12 text-center sm:pt-24">
          <Eyebrow>Trading journal for Delta Exchange India</Eyebrow>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            See the habits that are <span className="text-gradient">costing you money.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-zinc-400">
            Edgebook syncs every trade from Delta, rebuilds it to the cent with fees and funding, and shows which habits drain your account:
            moved stops, revenge trades, fee-heavy scalps.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/demo" className={`${pillPrimary} px-6 py-3`}>
              Try the live demo →
            </Link>
            <Link href="/waitlist" className={`${pillSecondary} px-6 py-3`}>
              Join the waitlist
            </Link>
          </div>
          <p className="mt-4 text-sm text-zinc-500">Free for founding members · read-only keys · times in IST</p>
        </section>

        {/* The app, live */}
        {stats.trades > 0 && (
          <section className="reveal pb-24">
            <Link href="/demo" aria-label="Open the demo dashboard" className="group block overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 shadow-2xl shadow-brand/5">
              <WindowBar url="edgebook/dashboard" />
              <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className={`${card} space-y-3 p-5`}>
                  <div className="text-sm text-zinc-400">Good evening, demo trader</div>
                  <div>
                    <div className="text-xs text-zinc-500">Net P&L, last 90 days</div>
                    <div className={`text-4xl font-semibold tabular-nums ${pnlClass(stats.netPnl)}`}>{formatMoney(stats.netPnl, { sign: true })}</div>
                    <div className="text-xs text-zinc-500">
                      {stats.trades} trades · {formatMoney(stats.fees)} of it in fees
                    </div>
                  </div>
                  <Sparkline values={curve} className="h-20" />
                </div>
                <div className={`${card} p-5`}>
                  <div className="font-semibold">Your biggest leaks</div>
                  <ul className="mt-2 divide-y divide-zinc-800">
                    {leaks.map((r) => (
                      <li key={r.tag} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                        <span>
                          <span className="font-medium">{tagLabel(r.tag)}</span>
                          {TAG_HINTS[r.tag] && <span className="block text-xs text-zinc-500">{TAG_HINTS[r.tag]}</span>}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums text-rose-400">{formatMoney(r.netPnl, { sign: true })}</span>
                          <span className="block text-xs text-zinc-500">
                            {r.trades} trades · {formatPercent(r.winRate)} won
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="border-t border-zinc-800 px-6 py-3 text-center text-sm text-brand group-hover:underline">Open the full demo dashboard →</div>
            </Link>
          </section>
        )}

        {/* Everything in one place */}
        <section id="features" className="scroll-mt-20 pb-24">
          <Heading eyebrow="Features" title={<>Everything about your trading, <span className="text-gradient">in one place</span></>}>
            Not another spreadsheet. Edgebook works out the numbers you would never have time to calculate by hand.
          </Heading>
          <div className="reveal mt-10 grid gap-4 lg:grid-cols-3">
            <div className={`${card} flex flex-col p-5 lg:col-span-2`}>
              <CardLabel>Equity curve</CardLabel>
              <p className="text-sm text-zinc-400">Every closed trade after fees and funding, so the line shows what really reached your wallet.</p>
              <Sparkline values={curve} className="mt-4 h-40 flex-1" />
            </div>
            {score && <ScoreCard score={score} compact />}
            <div className={`${card} grid gap-5 p-5 sm:grid-cols-3 lg:col-span-2`}>
              <div>
                <CardLabel>Rebuilt to the cent</CardLabel>
                <div className="text-4xl font-semibold tabular-nums">{stats.trades}</div>
                <div className="text-xs text-zinc-500">trades, each checked against Delta</div>
              </div>
              <div className="space-y-2.5 sm:col-span-2">
                <CardLabel>P&L by session</CardLabel>
                {sessions.map((s) => (
                  <div key={s.tag} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-300">{tagLabel(s.tag)}</span>
                      <span className={`tabular-nums ${pnlClass(s.netPnl)}`}>{formatMoney(s.netPnl, { sign: true })}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-800">
                      <div className="h-1.5 rounded-full bg-brand/70" style={{ width: `${Math.round((s.trades / Math.max(1, stats.trades)) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} flex flex-col items-center justify-center gap-2 p-5 text-center`}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="motion-safe:animate-spin [animation-duration:6s]" aria-hidden="true">
                <path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6M18.5 3v4.4h-4.4M5.5 21v-4.4h4.4" />
              </svg>
              <div className="font-semibold">Synced every minute</div>
              <div className="text-xs text-zinc-500">Fills, orders, stops, fees and funding, straight from Delta</div>
            </div>
            <div className={`${card} p-5 lg:col-span-3`}>
              <div className="flex items-center justify-between">
                <CardLabel>AI review</CardLabel>
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-400" /> Weekly
                </span>
              </div>
              <p className="text-sm text-zinc-400">Reads your trades, tags and journal notes, and coaches your process. It never tells you what to trade.</p>
              <svg viewBox="0 0 400 40" preserveAspectRatio="none" className="mt-3 h-10 w-full" aria-hidden="true">
                <path className="wave" d="M0 20 Q 25 5 50 20 T 100 20 T 150 20 T 200 20 T 250 20 T 300 20 T 350 20 T 400 20" fill="none" stroke="var(--brand)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                <path className="wave" d="M0 22 Q 25 35 50 22 T 100 22 T 150 22 T 200 22 T 250 22 T 300 22 T 350 22 T 400 22" fill="none" stroke="#22d3ee" strokeOpacity="0.5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          </div>
        </section>

        {/* Feature rows */}
        <section className="space-y-20 pb-24">
          <FeatureRow
            eyebrow="Dashboard"
            title="Your biggest leaks, first"
            body="The dashboard opens with what matters: your net P&L after costs, the habits that lose the most, and what works for you. Every number links to the trades behind it."
          >
            <div className="space-y-3 p-5">
              {[...leaks.slice(0, 2), ...works].map((r) => (
                <div key={r.tag} className="flex items-center justify-between rounded-lg border border-zinc-800 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{tagLabel(r.tag)}</span>
                    <span className="block text-xs text-zinc-500">
                      {r.trades} trades · {formatPercent(r.winRate)} won
                    </span>
                  </span>
                  <span className={`font-semibold tabular-nums ${pnlClass(r.netPnl)}`}>{formatMoney(r.netPnl, { sign: true })}</span>
                </div>
              ))}
            </div>
          </FeatureRow>
          <FeatureRow
            flip
            eyebrow="Trades"
            title="Every trade, rebuilt and tagged"
            body="Partial fills, adds and flips become clean round trips. Each one is tagged automatically: session, hold time, stop placement, sizing after a loss, overtrading."
          >
            <ul className="divide-y divide-zinc-800/70">
              {recent
                .slice(-5)
                .reverse()
                .map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-20 font-medium">{t.symbol}</span>
                    <span className="flex flex-1 flex-wrap gap-1">
                      {topTags(t.tags, 2).shown.map((g) => (
                        <span key={g.tag} className={`rounded px-1.5 py-0.5 text-xs ${isWarningTag(g.tag) ? "bg-amber-950 text-amber-200" : "bg-zinc-800 text-zinc-300"}`}>
                          {tagLabel(g.tag)}
                        </span>
                      ))}
                    </span>
                    <span className={`font-semibold tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true })}</span>
                  </li>
                ))}
            </ul>
          </FeatureRow>
          <FeatureRow
            eyebrow="Journal"
            title="Journal a trade in a few taps"
            body="When a trade closes, Edgebook sends it to Telegram and your phone. Tap your setup, how you felt and what went wrong. Voice notes are transcribed for you."
          >
            <div className="space-y-3 p-5 text-sm">
              <div className="rounded-lg bg-zinc-800/60 p-3">
                <div className="font-medium">XAUTUSD short · closed −$4.75</div>
                <div className="text-xs text-zinc-500">Held 7 min · after a loss · overtrading</div>
              </div>
              <div className="text-xs text-zinc-500">How did you feel?</div>
              <div className="flex flex-wrap gap-1.5">
                {["Calm", "FOMO", "Revenge", "Bored"].map((e) => (
                  <span key={e} className={`rounded-full border px-3 py-1 text-xs ${e === "Revenge" ? "border-amber-500 bg-amber-950 text-amber-100" : "border-zinc-700 text-zinc-300"}`}>
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </FeatureRow>
          <FeatureRow
            flip
            eyebrow="AI review"
            title="A weekly coach that has read every trade"
            body="Each Sunday evening you get a short review: your costliest habits with their real cost, what helped, and three rules for next week. About process only, never trade calls."
          >
            <div className="space-y-3 p-5 text-sm">
              <div className="font-semibold">{topLeak ? `${tagLabel(topLeak.tag)} is your costliest habit.` : "Your week, reviewed."}</div>
              {topLeak && (
                <div className="flex justify-between rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2">
                  <span>
                    {tagLabel(topLeak.tag)} on {topLeak.trades} trades
                  </span>
                  <span className="font-semibold text-rose-400">{formatMoney(topLeak.netPnl, { sign: true })}</span>
                </div>
              )}
              <div className="rounded-lg bg-brand-soft px-3 py-2 text-zinc-200">
                <span className="font-medium text-brand">Rule for next week:</span> set the stop when you enter and leave it there.
              </div>
            </div>
          </FeatureRow>
        </section>

        {/* How it works */}
        <section id="how" className="reveal scroll-mt-20 pb-24">
          <Heading eyebrow="How it works" title={<>From Delta to insight <span className="text-gradient">in minutes</span></>}>
            No spreadsheets, no CSV exports, no typing in trades.
          </Heading>
          <div className="mt-10">
            <Steps leak={topLeak ? { label: tagLabel(topLeak.tag), amount: formatMoney(topLeak.netPnl, { sign: true }) } : null} />
          </div>
        </section>

        {/* Live feed */}
        {feed.length > 0 && (
          <section className="reveal pb-24">
            <Heading eyebrow="Live" title={<>Trades arrive <span className="text-gradient">on their own</span></>}>
              Close a trade on Delta and it shows up here within a minute, already tagged.
            </Heading>
            <div className="mx-auto mt-10 max-w-3xl">
              <TradeFeed trades={feed} />
            </div>
          </section>
        )}
      </main>

      {/* Feature strip */}
      <section aria-label="What Edgebook does" className="overflow-hidden border-y border-zinc-800/80 py-4">
        <div className="marquee flex w-max gap-3">
          {[...MARQUEE, ...MARQUEE].map((m, i) => (
            <span key={i} className="rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-sm whitespace-nowrap text-zinc-300" aria-hidden={i >= MARQUEE.length}>
              {m}
            </span>
          ))}
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl px-4">
        {/* Pricing */}
        <section id="pricing" className="reveal scroll-mt-20 py-24">
          <Heading eyebrow="Pricing" title={<>Free while we are in <span className="text-gradient">beta</span></>}>
            The first ten traders join as founding members.
          </Heading>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="relative rounded-2xl border border-brand/40 bg-brand-soft p-6">
              <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-semibold text-brand-ink">Founding member</span>
              <div className="text-sm text-zinc-300">Beta</div>
              <div className="mt-1 text-4xl font-semibold">
                ₹0 <span className="text-base font-normal text-zinc-400">for 3 months</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-zinc-300">
                {["Full history synced from Delta", "Dashboard, leaks and behaviour score", "Journal on the web and Telegram", "Weekly AI review", "Phone notifications"].map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/waitlist" className={`${pillPrimary} mt-6 w-full py-2.5`}>
                Join the waitlist
              </Link>
            </div>
            <div className={`${card} p-6`}>
              <div className="text-sm text-zinc-400">After the beta</div>
              <div className="mt-1 text-2xl font-semibold">Paid plans</div>
              <p className="mt-3 text-sm text-zinc-400">
                Plans for every level of trader, with prices set together with our first users. Founding members hear first.
              </p>
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="reveal pb-24">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 px-6 py-14 text-center">
            <div className="pointer-events-none absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-brand/20 blur-3xl" aria-hidden="true" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
              Trade less like your worst habits. <span className="text-gradient">Start with the data.</span>
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-zinc-400">Look around the demo, then join the waitlist for a founding spot.</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/demo" className={`${pillPrimary} px-6 py-3`}>
                Try the live demo →
              </Link>
              <Link href="/waitlist" className={`${pillSecondary} px-6 py-3`}>
                Join the waitlist
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/80">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
          <div className="space-y-2">
            <div className="font-semibold">Edgebook</div>
            <p className="text-zinc-500">A trading journal that shows the habits behind your P&L. Made for traders in India.</p>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">Product</div>
            <ul className="space-y-1.5 text-zinc-400">
              <li>
                <Link href="/demo" className="hover:text-zinc-100">Live demo</Link>
              </li>
              <li>
                <Link href="/waitlist" className="hover:text-zinc-100">Join the waitlist</Link>
              </li>
              <li>
                <Link href="/sign-in" className="hover:text-zinc-100">Sign in</Link>
              </li>
            </ul>
          </div>
          <div className="space-y-2">
            <div className="font-semibold">Good to know</div>
            <ul className="space-y-1.5 text-zinc-500">
              <li>Edgebook is a journal, not investment advice.</li>
              <li>Independent, not affiliated with Delta Exchange.</li>
              <li>Read-only: Edgebook never places orders.</li>
            </ul>
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/60 px-4 py-5 text-xs text-zinc-500">
          <Link href="/privacy" className="hover:text-zinc-300">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-zinc-300">Terms of Service</Link>
          <a href={`mailto:${LEGAL.contactEmail}`} className="hover:text-zinc-300">{LEGAL.contactEmail}</a>
        </div>
      </footer>
    </div>
  );
}

const MARQUEE = [
  "Synced from Delta every minute",
  "P&L checked to the cent",
  "Fees and funding included",
  "Moved-stop detection",
  "Revenge-trade tags",
  "Behaviour score",
  "Telegram journaling",
  "Voice notes",
  "Weekly AI review",
  "Phone notifications",
  "Times in IST",
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-xs font-medium tracking-wide text-brand uppercase">
      {children}
    </span>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      <p className="mt-3 text-pretty text-zinc-400">{children}</p>
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs font-semibold tracking-wide text-brand uppercase">{children}</div>;
}

function FeatureRow({ eyebrow, title, body, flip = false, children }: { eyebrow: string; title: string; body: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="reveal grid items-center gap-8 lg:grid-cols-2">
      <div className={flip ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h3>
        <p className="mt-3 text-zinc-400">{body}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        <WindowBar url={`edgebook/${eyebrow.toLowerCase().replace(" ", "-")}`} />
        {children}
      </div>
    </div>
  );
}

/** A small equity line without axes: just the shape. */
function Sparkline({ values, className }: { values: number[]; className: string }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 30 - ((v - min) / span) * 28 - 1;
  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={`w-full ${className}`} role="img" aria-label="Equity curve of the demo account">
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--viz-grid)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
      <polyline points={`0,30 ${line} 100,30`} fill="var(--viz-profit)" fillOpacity="0.08" stroke="none" />
      <polyline points={line} fill="none" stroke="var(--viz-profit)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
