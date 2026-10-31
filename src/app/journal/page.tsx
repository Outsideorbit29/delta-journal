import Link from "next/link";
import { connection } from "next/server";
import { requireUserId } from "@/lib/session";
import { JournalSection } from "@/components/journal-section";
import { TagChip } from "@/components/tag-chip";
import { TradePriceChart } from "@/components/trade-price-chart";
import { formatDateTime, formatDuration, formatMoney, pnlClass } from "@/lib/format";
import { getTrade, journaledTradeIds, listUnjournaled } from "@/lib/queries";

/** Work through closed trades that have no journal entry yet, newest first. */
export default async function JournalQueue({ searchParams }: PageProps<"/journal">) {
  await connection();
  const userId = await requireUserId();
  const params = await searchParams;
  const [queue, journaled] = await Promise.all([listUnjournaled(userId), journaledTradeIds(userId)]);
  const skip = Math.min(Math.max(0, Number(params.skip) || 0), Math.max(0, queue.length - 1));
  const current = queue[skip] ? await getTrade(userId, queue[skip].id) : null;
  const total = queue.length + journaled.size;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-zinc-500">
            {journaled.size} of {total} closed trades journaled · {queue.length} to go
          </p>
        </div>
        <div className="h-1.5 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden>
          <div className="h-full rounded-full bg-[var(--viz-profit)]" style={{ width: `${total ? (journaled.size / total) * 100 : 0}%` }} />
        </div>
      </header>

      {!current ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {total === 0
            ? "No closed trades yet. Each trade you close on Delta shows up here, ready to journal, within a minute."
            : "Every closed trade is journaled. New trades show up here within a minute of closing."}
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">
                <Link href={`/trades/${encodeURIComponent(current.id)}`} className="hover:underline">
                  {current.symbol}{" "}
                  <span className={current.direction === "long" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                    {current.direction}
                  </span>
                </Link>
                <span className={`ml-3 ${pnlClass(current.netPnl)}`}>{formatMoney(current.netPnl, { sign: true })}</span>
              </h2>
              <nav className="flex gap-3 text-sm">
                {skip > 0 && (
                  <Link href={skip === 1 ? "/journal" : `/journal?skip=${skip - 1}`} className="text-zinc-500 hover:underline">
                    ← Previous
                  </Link>
                )}
                {skip < queue.length - 1 && (
                  <Link href={`/journal?skip=${skip + 1}`} className="text-zinc-500 hover:underline">
                    Skip →
                  </Link>
                )}
              </nav>
            </div>
            <p className="text-sm text-zinc-500">
              {formatDateTime(current.openedTs)} IST · held {formatDuration(current.holdSeconds)} · {current.maxQty.toLocaleString()} contracts
              {current.leverage ? ` at ${current.leverage}x` : ""}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {current.tags.map((g) => (
                <TagChip key={g.tag} tag={g.tag} detail={g.detail} />
              ))}
            </div>
          </section>

          <TradePriceChart trade={current} plannedStop={null} plannedTarget={null} />
          <JournalSection trade={current} entry={null} submitLabel="Save & next" />

          {queue.length > 1 && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-zinc-500">Up next</h2>
              <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {queue
                  .map((t, i) => ({ t, i }))
                  .filter(({ i }) => i !== skip)
                  .slice(skip, skip + 8)
                  .map(({ t, i }) => (
                    <li key={t.id}>
                      <Link href={`/journal?skip=${i}`} className="flex justify-between gap-4 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                        <span>
                          {formatDateTime(t.openedTs)} · {t.symbol} {t.direction}
                        </span>
                        <span className={`tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true })}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
