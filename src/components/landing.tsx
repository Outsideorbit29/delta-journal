import Link from "next/link";

const primary =
  "rounded-md bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
const secondary = "rounded-md border border-zinc-300 px-5 py-2.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";

/** The home page for visitors who are not signed in. */
export function Landing() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-16 px-4 py-12 sm:py-20">
      <section className="max-w-3xl space-y-6">
        <p className="text-sm font-medium text-[var(--viz-profit)]">Trading journal for Delta Exchange India</p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Your trades already show why you lose. Edgebook reads them.</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          Edgebook syncs every fill from your Delta account, rebuilds each trade to the cent with fees and funding, tags your habits (moved
          stops, revenge trades, fee-heavy scalps) and shows exactly what each habit costs you.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/demo" className={primary}>
            Try the demo
          </Link>
          <Link href="/waitlist" className={secondary}>
            Join the waitlist
          </Link>
        </div>
        <p className="text-sm text-zinc-500">
          Already invited?{" "}
          <Link href="/sign-in" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
            Sign in
          </Link>
          .
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <Step n={1} title="Connect a read-only key">
          Create a Delta API key with only the Read Data permission and paste it in. Edgebook never places orders.
        </Step>
        <Step n={2} title="Every trade, rebuilt">
          Fills become round-trip trades, checked against Delta&apos;s own P&L, with every fee, funding payment and stop.
        </Step>
        <Step n={3} title="See what your habits cost">
          Each trade is tagged: scalps, trades after a loss, stops moved while losing. Journal in a few taps on the web or Telegram, and get a
          weekly AI review of your process.
        </Step>
      </section>

      <section className="grid gap-6 rounded-lg border border-zinc-200 p-6 sm:grid-cols-3 dark:border-zinc-800">
        <Fact title="Read-only">Edgebook only reads your trades. Use a key without Trading permission.</Fact>
        <Fact title="Keys locked on arrival">Your key is locked the moment you save it. The website cannot unlock it; only our sync server can.</Fact>
        <Fact title="Built for Indian traders">Times in IST, synced every minute from Mumbai.</Fact>
      </section>

      <footer className="space-y-1 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800">
        <p>Edgebook is a journal, not investment advice. It never tells you what to trade.</p>
        <p>Edgebook is independent and not affiliated with Delta Exchange.</p>
      </footer>
    </main>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex size-7 items-center justify-center rounded-full border border-zinc-300 text-sm font-medium dark:border-zinc-700">{n}</div>
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}

function Fact({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{children}</p>
    </div>
  );
}
