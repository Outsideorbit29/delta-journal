import Link from "next/link";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { DEMO_USER } from "@/lib/demo";
import { formatMoney, formatPercent, pnlClass } from "@/lib/format";
import { biggestLeaks, TAG_HINTS } from "@/lib/insights";
import { listTrades } from "@/lib/queries";
import { computeStats, equityCurve } from "@/lib/stats";
import { tagLabel } from "@/lib/tags";

/** The home page for visitors who are not signed in. */
export async function Landing() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-20 px-4 py-12 sm:py-20">
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <p className="text-sm font-medium text-brand">Trading journal for Delta Exchange India</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Your trades already show why you lose. Edgebook reads them.
          </h1>
          <p className="text-lg text-pretty text-zinc-400">
            Edgebook syncs every fill from your Delta account, rebuilds each trade to the cent with fees and funding, tags your habits and
            shows exactly what each one costs you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/demo" className={`${buttonPrimary} px-5 py-2.5`}>
              Try the demo
            </Link>
            <Link href="/waitlist" className={`${buttonSecondary} px-5 py-2.5`}>
              Join the waitlist
            </Link>
          </div>
          <p className="text-sm text-zinc-500">
            Already invited?{" "}
            <Link href="/sign-in" className="text-zinc-300 underline hover:text-zinc-100">
              Sign in
            </Link>
            .
          </p>
        </div>
        <Preview />
      </section>

      <section className="space-y-8">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <Step n={1} title="Connect a read-only key">
            Create a Delta API key with only the Read Data permission and paste it in. Edgebook never places orders.
          </Step>
          <Step n={2} title="Every trade, rebuilt">
            Fills become round-trip trades, checked against Delta&apos;s own P&L, with every fee, funding payment and stop.
          </Step>
          <Step n={3} title="See what your habits cost">
            Each trade is tagged: scalps, trades after a loss, stops moved while losing. Journal in a few taps on the web or Telegram, and
            get a weekly AI review of your process.
          </Step>
        </div>
      </section>

      <section className={`${card} grid gap-6 p-6 sm:grid-cols-3`}>
        <Fact title="Read-only">Edgebook only reads your trades. Use a key without Trading permission.</Fact>
        <Fact title="Keys locked on arrival">Your key is locked the moment you save it. The website cannot unlock it; only our sync server can.</Fact>
        <Fact title="Built for Indian traders">Times in IST, synced every minute from Mumbai.</Fact>
      </section>

      <footer className="space-y-1 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
        <p>Edgebook is a journal, not investment advice. It never tells you what to trade.</p>
        <p>Edgebook is independent and not affiliated with Delta Exchange.</p>
      </footer>
    </main>
  );
}

/** A live peek at the demo account: what a visitor gets once their own trades are in. */
async function Preview() {
  const trades = await listTrades(DEMO_USER);
  if (!trades.length) return null;
  const stats = computeStats(trades);
  const curve = equityCurve(trades);
  const leaks = biggestLeaks(trades, 2);

  return (
    <Link href="/demo" aria-label="Open the demo dashboard" className={`${card} group block overflow-hidden shadow-2xl shadow-black/40`}>
      <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-zinc-700" />
        <span className="size-2.5 rounded-full bg-zinc-700" />
        <span className="size-2.5 rounded-full bg-zinc-700" />
        <span className="ml-2 text-xs text-zinc-500">Demo dashboard</span>
      </div>
      <div className="space-y-4 p-5">
        <div>
          <div className="text-xs text-zinc-500">Net P&L, last 90 days</div>
          <div className={`text-3xl font-semibold tabular-nums ${pnlClass(stats.netPnl)}`}>{formatMoney(stats.netPnl, { sign: true })}</div>
          <div className="text-xs text-zinc-500">
            {stats.trades} trades · {formatMoney(stats.fees)} of it in fees
          </div>
        </div>
        <Sparkline values={curve.map((p) => p.equity)} />
        <div>
          <div className="text-xs font-medium text-zinc-400">Biggest leaks</div>
          <ul className="mt-1 divide-y divide-zinc-800">
            {leaks.map((r) => (
              <li key={r.tag} className="flex items-start justify-between gap-4 py-2 text-sm">
                <span>
                  {tagLabel(r.tag)}
                  {TAG_HINTS[r.tag] && <span className="block text-xs text-zinc-500">{TAG_HINTS[r.tag]}</span>}
                </span>
                <span className="text-right">
                  <span className={`block font-medium tabular-nums ${pnlClass(r.netPnl)}`}>{formatMoney(r.netPnl, { sign: true })}</span>
                  <span className="block text-xs text-zinc-500">{formatPercent(r.winRate)} won</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="text-sm text-brand group-hover:underline">Explore the demo →</div>
      </div>
    </Link>
  );
}

/** A tiny equity line, no axes: just the shape. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * 100;
  const y = (v: number) => 30 - ((v - min) / span) * 28 - 1;
  const line = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Equity curve of the demo account">
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--viz-grid)" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
      <polyline points={line} fill="none" stroke="var(--viz-profit)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{n}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-zinc-400">{children}</p>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-zinc-400">{children}</p>
    </div>
  );
}
