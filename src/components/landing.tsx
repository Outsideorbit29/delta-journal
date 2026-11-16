import Link from "next/link";
import { LeakStory } from "@/components/landing/leak-story";
import { Pinned } from "@/components/landing/pinned";
import { Steps } from "@/components/landing/steps";
import { TickerTape } from "@/components/landing/ticker-tape";
import { TradeFeed, type FeedTrade } from "@/components/landing/trade-feed";
import { CountUp } from "@/components/motion/count-up";
import { buttonPrimaryLarge, buttonSecondaryLarge } from "@/components/ui";
import { DEMO_USER } from "@/lib/demo";
import { formatDuration, formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { biggestLeaks, LEAK_FIXES, TAG_HINTS, whatWorks } from "@/lib/insights";
import { LEGAL } from "@/lib/legal";
import { journaledTradeIds, listTrades } from "@/lib/queries";
import { behaviourScore, weakest } from "@/lib/score";
import { computeStats, equityCurve, tagPerformance } from "@/lib/stats";
import { isWarningTag, tagLabel, topTags } from "@/lib/tags";

// The home page for visitors. Every number on it comes from the demo account
// (lib/demo.ts), so it always shows what the product really computes.

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
  const byClose = [...closed].sort((a, b) => (a.closedTs ?? 0) - (b.closedTs ?? 0));
  const recent = byClose.slice(-7);
  const toFeed = (t: (typeof closed)[number]): FeedTrade => {
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
  };
  const feed = recent.map(toFeed);
  // B5: a longer run of the latest trades for the ticker tape, newest first.
  const tape = byClose.slice(-16).reverse().map(toFeed);
  // A4: the leaks as a pinned story, each with its fix and its size against the biggest.
  const worstLeak = Math.abs(leaks[0]?.netPnl ?? 0) || 1;
  const story = leaks.map((r) => ({
    label: tagLabel(r.tag),
    amount: formatMoney(r.netPnl, { sign: true }),
    detail: `${r.trades} trades, ${formatPercent(r.winRate)} won`,
    fix: LEAK_FIXES[r.tag] ?? null,
    share: Math.abs(r.netPnl) / worstLeak,
  }));
  const leakTotal = formatMoney(leaks.reduce((sum, r) => sum + r.netPnl, 0), { sign: false }).replace("-", "");
  const topLeak = leaks[0];
  const heroAlt = `The demo dashboard: net P&L ${formatMoney(stats.netPnl, { sign: true })}, and its biggest leaks led by ${
    topLeak ? `${tagLabel(topLeak.tag).toLowerCase()} at ${formatMoney(topLeak.netPnl, { sign: true })}` : "moved stops"
  }.`;

  return (
    <>
      <main id="main">
        {/* Hero (Counter): the head and the actions beside the product itself, captured from the live demo. */}
        <section className="container grid min-h-[calc(100svh-4.25rem)] items-center gap-x-8 gap-y-12 py-12 lg:grid-cols-12 lg:py-16">
          <div className="lg:col-span-5">
            <h1 className="max-w-[11ch] text-[clamp(3rem,5.6vw+1rem,6rem)] leading-[0.9]">See the habits that cost you money.</h1>
            <p className="mt-6 max-w-[30ch] text-[clamp(1.25rem,1.4vw+0.5rem,1.625rem)] leading-snug text-ink">
              Hardwon rebuilds every trade from Delta Exchange or Dhan and shows what each habit cost.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/demo" className={buttonPrimaryLarge}>
                Try the live demo
              </Link>
              <Link href="/waitlist" className={buttonSecondaryLarge}>
                Join the waitlist
              </Link>
            </div>
            <p className="face-label mt-5 text-sm text-muted">Free for founding members. Read-only keys. Times in IST.</p>
          </div>
          {stats.trades > 0 && (
            <figure className="m-0 lg:col-span-7">
              <Link href="/demo" aria-label="Open the demo dashboard" className="block">
                <div
                  data-slot="hero"
                  data-kind="product"
                  data-alt="The dashboard's first screen: net P&L and the biggest leaks"
                  className="aspect-[960/779] outline-1 -outline-offset-1 outline-ink/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a fixed product capture in a swappable slot */}
                  <img src="/screens/demo-ledger.png" width={1920} height={1558} alt={heroAlt} fetchPriority="high" className="for-light" />
                  {/* eslint-disable-next-line @next/next/no-img-element -- the same capture in dark mode */}
                  <img src="/screens/demo-ledger-dark.png" width={1920} height={1558} alt={heroAlt} loading="lazy" className="for-dark" />
                </div>
              </Link>
              <figcaption className="face-label mt-3 text-sm text-muted">The demo account&apos;s dashboard, captured from the live demo.</figcaption>
            </figure>
          )}
        </section>

        {/* B5: the demo's latest trades, running past like a market tape. */}
        <TickerTape trades={tape} />

        {/* Bento: what the dashboard works out, in the demo's own figures. */}
        <section id="features" className="scroll-mt-24 border-t-4 border-ink py-(--section-gap)">
          <div className="container">
            <h2 className="max-w-[16ch]">Every number, worked out for you</h2>
            <div className="mt-16 grid grid-cols-1 gap-(--gap-columns) md:grid-cols-12">
              <Tile className="md:col-span-8" title="Equity curve" note="Every closed trade after fees and funding: what really reached your wallet.">
                <p className={`figure-display mt-4 text-5xl ${pnlClass(stats.netPnl)}`}>
                  <CountUp value={stats.netPnl} sign />
                </p>
                <p className="face-label mt-2 text-sm text-muted">
                  {stats.trades} trades, {formatMoney(stats.fees)} of it in fees
                </p>
                <Sparkline values={curve} className="reveal-right mt-6 h-44" />
              </Tile>
              {score && (
                <Tile className="md:col-span-4" title="Behaviour score" note={`How often trades avoid each costly habit, over ${score.trades} trades.`}>
                  <p className="figure-display mt-4 text-[5.5rem] text-ink">
                    <CountUp value={score.overall} kind="int" />
                  </p>
                  <p className="face-label mt-2 text-base text-ink">{score.label}</p>
                  <p className="face-label mt-1 text-sm text-muted">Weakest: {weakest(score).label.toLowerCase()}</p>
                </Tile>
              )}
              <Tile className="md:col-span-4" title="Rebuilt to the cent">
                <p className="figure-display mt-4 text-[5.5rem] text-ink">
                  <CountUp value={stats.trades} kind="int" />
                </p>
                <p className="face-label mt-2 text-base text-ink-2">trades, each checked against Delta</p>
              </Tile>
              <Tile className="md:col-span-8" title="P&L by session">
                <ul className="face-label mt-5 divide-y divide-rule border-t border-rule-2">
                  {sessions.map((s) => (
                    <li key={s.tag} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-4 py-3">
                      <span className="text-base text-ink">{tagLabel(s.tag)}</span>
                      <span className="h-2 bg-paper-3" aria-hidden="true">
                        <span className="block h-2 bg-ink-2" style={{ width: `${Math.round((s.trades / Math.max(1, stats.trades)) * 100)}%` }} />
                      </span>
                      <span className={`text-right text-lg tabular-nums ${pnlClass(s.netPnl)}`}>{formatMoney(s.netPnl, { sign: true })}</span>
                    </li>
                  ))}
                </ul>
                <p className="face-label mt-3 text-sm text-muted">Bars show each session&apos;s share of trades.</p>
              </Tile>
              <Tile className="md:col-span-6" title="Synced on its own">
                <p className="mt-3 max-w-[34ch] text-xl leading-snug text-ink">
                  Every fill and every charge, straight from your broker: Delta Exchange for crypto, Dhan for stocks and F&amp;O.
                </p>
              </Tile>
              <Tile className="md:col-span-6" title="AI review, weekly">
                <p className="mt-3 max-w-[40ch] text-xl leading-snug text-ink">
                  Reads your trades, tags and journal notes, and coaches your process. It never tells you what to trade.
                </p>
              </Tile>
            </div>
          </div>
        </section>

        {/* A4: the leaks, one at a time, as the reader scrolls. */}
        {story.length > 0 && (
          <section className="border-t-4 border-ink py-(--section-gap) lg:py-0">
            <div className="container">
              <LeakStory leaks={story} total={leakTotal} />
            </div>
          </section>
        )}

        {/* The product at work: four screens, pinned beside their story. */}
        <section className="py-(--section-gap-l)">
          <div className="container">
            <h2 className="max-w-[16ch]">From a closed trade to a lesson</h2>
            <div className="mt-16">
              <Pinned
                panels={[
                  {
                    title: "Your biggest leaks, first",
                    body: "The dashboard opens with your net P&L after costs, the habits that lose the most, and what works for you. Every number links to its trades.",
                    visual: (
                      <ul className="face-label divide-y divide-rule border-y border-rule-2">
                        {[...leaks, ...works].map((r) => (
                          <li key={r.tag} className="flex items-baseline justify-between gap-6 py-4">
                            <span>
                              <span className="block text-xl text-ink">{tagLabel(r.tag)}</span>
                              {TAG_HINTS[r.tag] && <span className="block font-serif text-base text-muted">{TAG_HINTS[r.tag]}</span>}
                            </span>
                            <span className="text-right">
                              <span className={`figure-display block text-4xl ${pnlClass(r.netPnl)}`}>{formatMoney(r.netPnl, { sign: true })}</span>
                              <span className="block text-sm text-muted">
                                {r.trades} trades, {formatPercent(r.winRate)} won
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                  {
                    title: "Every trade, rebuilt and tagged",
                    body: "Partial fills, adds and flips become clean round trips, each tagged on its own: session, hold time, stop placement, sizing after a loss, overtrading.",
                    visual: (
                      <ul className="face-label divide-y divide-rule border-y border-rule-2">
                        {recent
                          .slice(-5)
                          .reverse()
                          .map((t) => (
                            <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
                              <span className="w-24 text-lg text-ink">{t.symbol}</span>
                              <span className="flex flex-1 flex-wrap gap-1">
                                {topTags(t.tags, 2).shown.map((g) => (
                                  <span key={g.tag} className={`border px-1.5 py-0.5 text-sm ${isWarningTag(g.tag) ? "border-transparent bg-warn-soft text-warn" : "border-rule text-ink-2"}`}>
                                    {tagLabel(g.tag)}
                                  </span>
                                ))}
                              </span>
                              <span className={`text-lg tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true })}</span>
                            </li>
                          ))}
                      </ul>
                    ),
                  },
                  {
                    title: "Journal a trade in a few taps",
                    body: "When a trade closes, Hardwon sends it to Telegram and your phone. Tap your setup, how you felt and what went wrong. Voice notes are transcribed for you.",
                    visual: (
                      <div className="face-label space-y-5">
                        <div className="border-b border-rule-2 pb-4">
                          <p className="text-xl text-ink">XAUTUSD short, closed -$4.75</p>
                          <p className="text-sm text-muted">Held 7 min, after a loss, overtrading</p>
                        </div>
                        <p className="text-base text-ink">How did you feel?</p>
                        <div className="flex flex-wrap gap-1.5">
                          {["Calm", "FOMO", "Revenge", "Bored"].map((e) => (
                            <span key={e} className={`flex min-h-10 items-center border px-3.5 text-sm ${e === "Revenge" ? "border-warn bg-warn text-paper" : "border-rule-2 text-ink-2"}`}>
                              {e}
                            </span>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    title: "A weekly coach that has read every trade",
                    body: "Each Sunday evening: your costliest habits with their real cost, what helped, and three rules for next week. About process only, never trade calls.",
                    visual: (
                      <div className="space-y-5">
                        <p className="figure-display text-4xl text-ink">{topLeak ? `${tagLabel(topLeak.tag)} is your costliest habit.` : "Your week, reviewed."}</p>
                        {topLeak && (
                          <p className="face-label flex justify-between gap-4 border-y border-rule-2 py-3 text-lg">
                            <span className="text-ink">
                              {tagLabel(topLeak.tag)} on {topLeak.trades} trades
                            </span>
                            <span className="text-loss tabular-nums">{formatMoney(topLeak.netPnl, { sign: true })}</span>
                          </p>
                        )}
                        <p className="text-lg text-ink">
                          <strong className="face-label font-medium">Rule for next week:</strong> set the stop when you enter and leave it there.
                        </p>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </section>

        {/* How it works: three numbered rows beside the head. */}
        <section id="how" className="scroll-mt-24 bg-paper-2 py-(--section-gap-s)">
          <div className="container grid gap-x-8 gap-y-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <h2 className="max-w-[12ch]">From your broker to insight in minutes</h2>
              <p className="lead mt-5 text-ink-2">No spreadsheets, no CSV exports, no typing in trades.</p>
            </div>
            <div className="lg:col-span-8">
              <Steps />
            </div>
          </div>
        </section>

        {/* The ledger: the demo's latest trades, as they arrive. */}
        {feed.length > 0 && (
          <section className="py-(--section-gap)">
            <div className="container">
              <div className="grid gap-x-8 gap-y-4 lg:grid-cols-12 lg:items-end">
                <h2 className="lg:col-span-6">Trades arrive on their own</h2>
                <p className="lead text-ink-2 lg:col-span-5 lg:col-start-8">Close a trade and it shows up here within minutes, already tagged.</p>
              </div>
              <div className="mt-12">
                <TradeFeed trades={feed} />
              </div>
            </div>
          </section>
        )}

        {/* Pricing: the founding offer as a ruled spec, the plans after it beside. */}
        <section id="pricing" className="scroll-mt-24 border-t-4 border-ink py-(--section-gap)">
          <div className="container grid gap-x-8 gap-y-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2>Free while we&apos;re in beta</h2>
              <p className="lead mt-4 text-ink-2">The first ten traders join as founding members.</p>
              <div className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div>
                  <h3 className="text-2xl">Founding member</h3>
                  <p className="face-label text-base text-muted">Beta</p>
                  <p className="figure-display mt-4 text-[clamp(5rem,9vw,8rem)] text-ink">₹0</p>
                  <p className="face-label text-lg text-ink">for 3 months</p>
                </div>
                <div>
                  <ul className="face-label divide-y divide-rule border-y border-rule-2 text-lg text-ink">
                    {["Full history synced from Delta or Dhan", "Dashboard, leaks and behaviour score", "Journal on the web and Telegram", "Weekly AI review", "Phone notifications"].map((f) => (
                      <li key={f} className="py-3">
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/waitlist" className={`${buttonSecondaryLarge} mt-6 w-full sm:w-auto`}>
                    Join the waitlist
                  </Link>
                </div>
              </div>
            </div>
            <div className="lg:col-span-4 lg:col-start-9 lg:border-l lg:border-rule-2 lg:pl-8">
              <h3 className="text-2xl">After the beta</h3>
              <p className="figure-display mt-4 text-5xl text-ink">Paid plans</p>
              <p className="mt-4 text-lg text-ink-2">
                Plans for every level of trader, with prices set together with our first users. Founding members hear first.
              </p>
            </div>
          </div>
        </section>

        {/* The close: the hero's actions again, on the one ink band. */}
        <section className="bg-ink py-(--section-gap-s) text-paper">
          <div className="container grid gap-x-8 gap-y-8 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-8">
              <h2 className="text-paper">Trade less like your worst habits.</h2>
              <p className="lead mt-5 text-paper">Start with the data: look around the demo, then join the waitlist for a founding spot.</p>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
              <Link href="/demo" className="face-label inline-flex min-h-12 items-center border border-paper bg-paper px-6 text-sm text-ink no-underline transition-colors duration-(--dur-short) hover:bg-paper-2 focus-visible:outline-paper">
                Try the live demo
              </Link>
              <Link href="/waitlist" className="face-label inline-flex min-h-12 items-center border border-paper px-6 text-sm text-paper no-underline transition-colors duration-(--dur-short) hover:bg-ink-2 focus-visible:outline-paper">
                Join the waitlist
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer: the wordmark large over index columns. */}
      <footer className="border-t border-rule-2 pt-(--space-3xl) pb-(--space-2xl)">
        <div className="container">
          <p className="figure-display text-[clamp(4rem,12vw,10rem)] leading-none text-ink">Hardwon</p>
          <div className="mt-12 grid gap-x-8 gap-y-10 border-t border-rule-2 pt-10 sm:grid-cols-2 lg:grid-cols-12">
            <p className="max-w-[30ch] text-lg text-ink-2 lg:col-span-4">A trading journal that shows the habits behind your P&L. Made for traders in India.</p>
            <nav aria-label="Product" className="lg:col-span-2">
              <h2 className="face-label text-sm font-medium text-muted">Product</h2>
              <ul className="face-label mt-3 space-y-2 text-base">
                <li>
                  <Link href="/demo" className="link">
                    Live demo
                  </Link>
                </li>
                <li>
                  <Link href="/waitlist" className="link">
                    Join the waitlist
                  </Link>
                </li>
                <li>
                  <Link href="/sign-in" className="link">
                    Sign in
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="lg:col-span-3">
              <h2 className="face-label text-sm font-medium text-muted">Good to know</h2>
              <ul className="mt-3 space-y-2 text-base text-ink-2">
                <li>Hardwon is a journal, not investment advice.</li>
                <li>Independent, not affiliated with Delta Exchange or Dhan.</li>
                <li>Read-only: Hardwon never places orders.</li>
              </ul>
            </div>
            <nav aria-label="Legal" className="lg:col-span-3">
              <h2 className="face-label text-sm font-medium text-muted">Legal</h2>
              <ul className="face-label mt-3 space-y-2 text-base">
                <li>
                  <Link href="/privacy" className="link">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="link">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <a href={`mailto:${LEGAL.contactEmail}`} className="link whitespace-nowrap">
                    {LEGAL.contactEmail}
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </footer>
      <script dangerouslySetInnerHTML={{ __html: SLOT_SCRIPT }} />
    </>
  );
}

/** Hallmark's slot helper: lets a replacement picture be dropped into a slot, and removes a picture that fails to load. */
const SLOT_SCRIPT = `window.hallmarkSlots=(m)=>{for(const[k,v]of Object.entries(m)){const s=document.querySelector('[data-slot="'+k+'"]');if(!s)continue;const im=new Image();im.src=typeof v==='string'?v:v.src;im.alt=(typeof v==='object'&&v.alt)||s.dataset.alt||'';s.querySelectorAll(':scope > img').forEach((o)=>o.remove());s.prepend(im)}};document.querySelectorAll('[data-slot] img').forEach((i)=>{if(i.complete&&!i.naturalWidth)i.remove();else i.addEventListener('error',()=>i.remove(),{once:true})});`;

/** One bento tile: a paper well under a hairline, its title, then its figure or line. */
function Tile({ className, title, note, children }: { className: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-72 flex-col bg-paper-2 border-t border-rule-2 p-8 ${className}`}>
      <h3 className="text-2xl">{title}</h3>
      {note && <p className="mt-1 max-w-[46ch] text-base text-muted">{note}</p>}
      {children}
    </div>
  );
}

/** The equity line without axes: just its shape, profit-blue as in the dashboard's chart. */
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
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--viz-axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" stroke="var(--viz-profit)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
