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
    <main id="main" className="container space-y-10 pt-10 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-4 border-ink pb-6">
        <div>
          <h1 className="text-3xl leading-none">Journal</h1>
          <p className="face-label mt-2 text-base text-ink-2">
            {journaled.size} of {total} closed trades journaled, {queue.length} to go
          </p>
        </div>
        <div className="w-56" role="img" aria-label={`${journaled.size} of ${total} journaled`}>
          <div className="h-2 bg-paper-3">
            <div className="h-2 bg-accent" style={{ width: `${total ? (journaled.size / total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      {!current ? (
        <section className="max-w-2xl">
          <h2 className="text-xl">{total === 0 ? "No closed trades yet" : "Every closed trade is journaled"}</h2>
          <p className="mt-2 text-ink-2">
            {total === 0
              ? "Each trade you close on Delta shows up here, ready to journal, within a minute."
              : "New trades show up here within a minute of closing."}
          </p>
        </section>
      ) : (
        <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
          <div className="space-y-10 lg:col-span-8">
            <section>
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                <h2 className="text-[clamp(2rem,4vw,3rem)]">
                  <Link href={`/trades/${encodeURIComponent(current.id)}`} className="no-underline hover:underline hover:decoration-accent">
                    {current.symbol} {current.direction}
                  </Link>
                </h2>
                <p className={`figure-display text-[clamp(2rem,4vw,3rem)] ${pnlClass(current.netPnl)}`}>{formatMoney(current.netPnl, { sign: true })}</p>
              </div>
              <p className="face-label mt-2 text-base text-muted">
                Opened {formatDateTime(current.openedTs)} IST, held {formatDuration(current.holdSeconds)}, {current.maxQty.toLocaleString()} contracts
                {current.leverage ? ` at ${current.leverage}x` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {current.tags.map((g) => (
                  <TagChip key={g.tag} tag={g.tag} detail={g.detail} />
                ))}
              </div>
              <nav aria-label="Queue" className="face-label mt-5 flex gap-6 text-sm">
                {skip > 0 && (
                  <Link href={skip === 1 ? "/journal" : `/journal?skip=${skip - 1}`} className="link">
                    Previous trade
                  </Link>
                )}
                {skip < queue.length - 1 && (
                  <Link href={`/journal?skip=${skip + 1}`} className="link">
                    Skip this one
                  </Link>
                )}
              </nav>
            </section>

            <TradePriceChart trade={current} plannedStop={null} plannedTarget={null} />
            <JournalSection trade={current} entry={null} submitLabel="Save & next" />
          </div>

          {queue.length > 1 && (
            <aside className="lg:col-span-4">
              <div className="opens lg:sticky lg:top-24">
                <h2 className="text-xl">Up next</h2>
                <ul className="face-label mt-4 divide-y divide-rule border-y border-rule-2 text-base">
                  {queue
                    .map((t, i) => ({ t, i }))
                    .filter(({ i }) => i !== skip)
                    .slice(skip, skip + 8)
                    .map(({ t, i }) => (
                      <li key={t.id}>
                        <Link href={`/journal?skip=${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3 no-underline hover:bg-paper-2">
                          <span className="min-w-0">
                            <span className="block text-ink">
                              {t.symbol} {t.direction}
                            </span>
                            <span className="block text-sm text-muted">{formatDateTime(t.openedTs)}</span>
                          </span>
                          <span className={`self-center tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true })}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
