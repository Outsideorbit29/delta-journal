import Link from "next/link";
import { connection } from "next/server";
import { requireUserId } from "@/lib/session";
import { AccountPicker } from "@/components/filter-bar";
import { JournalSection } from "@/components/journal-section";
import { JournalSteps, type StepsTrade } from "@/components/journal-steps";
import { aiConfigured } from "@/lib/ai/models";
import { journalHints } from "@/lib/journal/hints";
import { tradeSummary } from "@/lib/trade-story";
import { getDb } from "@/db";
import { chooseAccount, listAccounts } from "@/lib/accounts";
import { TagChip } from "@/components/tag-chip";
import { TradePriceChart } from "@/components/trade-price-chart";
import { formatDateTime, formatDuration, formatMoney, pnlClass } from "@/lib/format";
import { countJournaled, getTrade, listUnjournaled, type TradeWithTags } from "@/lib/queries";

/** Work through closed trades that have no journal entry yet, newest first. */
export default async function JournalQueue({ searchParams }: PageProps<"/journal">) {
  await connection();
  const userId = await requireUserId();
  const params = await searchParams;
  // One account at a time, like the dashboard: its own queue and its own count.
  const accounts = await listAccounts(await getDb(), userId);
  const account = chooseAccount(accounts, typeof params.account === "string" ? params.account : undefined);
  const [queue, journaledCount] = account ? await Promise.all([listUnjournaled(userId, account.id), countJournaled(userId, account.id)]) : [[], 0];
  const skip = Math.min(Math.max(0, Number(params.skip) || 0), Math.max(0, queue.length - 1));
  const current = queue[skip] ? await getTrade(userId, queue[skip].id) : null;
  const total = queue.length + journaledCount;
  const href = (n: number, accountId = account?.id, start = false) => {
    const q = new URLSearchParams();
    if (accountId && accountId !== accounts[0]?.id) q.set("account", accountId);
    if (n > 0) q.set("skip", String(n));
    if (start) q.set("start", "1");
    const s = q.toString();
    return s ? `/journal?${s}` : "/journal";
  };
  const indian = current?.currency === "INR";

  // Phones journal one question per screen (JournalSteps). Once this trade is saved it leaves the queue, so the one
  // after it moves into its place (or, at the end of the queue, the one before it).
  const after = queue[skip + 1] ?? queue[skip - 1] ?? null;
  const afterHref = queue[skip + 1] ? href(skip, account?.id, true) : href(skip - 1, account?.id, true);
  const card = (t: TradeWithTags): Omit<StepsTrade, "id" | "direction" | "avgEntry" | "stopPrice" | "stopMoved"> => ({
    title: `${t.symbol} ${t.direction}`,
    pnl: formatMoney(t.netPnl, { sign: true, currency: t.currency }),
    pnlClass: pnlClass(t.netPnl),
    when: formatDateTime(t.openedTs),
    summary: tradeSummary(t),
  });

  return (
    <main id="main" className="container space-y-10 pt-10 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b-4 border-ink pb-6">
        <div>
          <h1 className="text-3xl leading-none">Journal</h1>
          <p className="face-label mt-2 text-base text-ink-2">
            {journaledCount} of {total} closed trades journaled, {queue.length} to go
          </p>
          <div className="mt-4">
            <AccountPicker accounts={accounts} account={account} href={(id) => href(0, id)} />
          </div>
        </div>
        <div className="w-56" role="img" aria-label={`${journaledCount} of ${total} journaled`}>
          <div className="h-2 bg-paper-3">
            <div className="h-2 bg-accent" style={{ width: `${total ? (journaledCount / total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      {!current ? (
        <section className="max-w-2xl">
          <h2 className="text-xl">{total === 0 ? "No closed trades yet" : "Every closed trade is journaled"}</h2>
          <p className="mt-2 text-ink-2">
            {total === 0
              ? "Each trade you close shows up here, ready to journal, within minutes."
              : "New trades show up here within a minute of closing."}
          </p>
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-8 md:hidden">
            <JournalSteps
              key={current.id}
              trade={{ ...card(current), id: current.id, direction: current.direction, avgEntry: current.avgEntry, stopPrice: current.stopPrice, stopMoved: current.stopMovedAfterSec !== null }}
              tags={current.tags.map((g) => (
                <TagChip key={g.tag} tag={g.tag} detail={g.detail} />
              ))}
              hints={journalHints(current.tags.filter((g) => g.source === "auto"))}
              remaining={queue.length}
              tradeHref={`/trades/${encodeURIComponent(current.id)}`}
              skipHref={skip < queue.length - 1 ? href(skip + 1) : null}
              next={after && { ...card(after), href: afterHref }}
              doneHref={href(skip)}
              aiEnabled={aiConfigured()}
              start={params.start === "1"}
            />
            {queue.length > 1 && (
              <section aria-labelledby="up-next-phone" className="flex flex-col gap-1.5">
                <h2 id="up-next-phone" className="face-label text-base font-normal text-muted">
                  Up next
                </h2>
                <ul className="face-label divide-y divide-rule border-y border-rule-2 text-base">
                  {queue
                    .map((t, i) => ({ t, i }))
                    .filter(({ i }) => i !== skip)
                    .slice(skip, skip + 3)
                    .map(({ t, i }) => (
                      <li key={t.id}>
                        <Link href={href(i)} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2 no-underline">
                          <span className="min-w-0">
                            <span className="block text-ink">
                              {t.symbol} {t.direction}
                            </span>
                            <span className="block text-sm text-muted">{formatDateTime(t.openedTs)}</span>
                          </span>
                          <span className={`tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true, currency: t.currency })}</span>
                        </Link>
                      </li>
                    ))}
                </ul>
                {queue.length - 1 > 3 && <p className="face-label text-sm text-muted">and {queue.length - 4} more</p>}
              </section>
            )}
          </div>
          <div className="hidden gap-x-8 gap-y-12 md:grid lg:grid-cols-12">
            <div className="space-y-10 lg:col-span-8">
              <section>
                <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
                  <h2 className="text-[clamp(2rem,4vw,3rem)]">
                    <Link href={`/trades/${encodeURIComponent(current.id)}`} className="no-underline hover:underline hover:decoration-accent">
                      {current.symbol} {current.direction}
                    </Link>
                  </h2>
                  <p className={`figure-display text-[clamp(2rem,4vw,3rem)] ${pnlClass(current.netPnl)}`}>{formatMoney(current.netPnl, { sign: true, currency: current.currency })}</p>
                </div>
                <p className="face-label mt-2 text-base text-muted">
                  Opened {formatDateTime(current.openedTs)} IST, held {formatDuration(current.holdSeconds)},{" "}
                  {indian
                    ? `${current.maxQty.toLocaleString("en-IN")} ${current.contractType === "equity" ? "shares" : "units"}`
                    : `${current.maxQty.toLocaleString()} contracts`}
                  {current.leverage ? ` at ${current.leverage}x` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {current.tags.map((g) => (
                    <TagChip key={g.tag} tag={g.tag} detail={g.detail} />
                  ))}
                </div>
                <nav aria-label="Queue" className="face-label mt-5 flex gap-6 text-sm">
                  {skip > 0 && (
                    <Link href={href(skip - 1)} className="link">
                      Previous trade
                    </Link>
                  )}
                  {skip < queue.length - 1 && (
                    <Link href={href(skip + 1)} className="link">
                      Skip this one
                    </Link>
                  )}
                </nav>
              </section>

              {/* Price candles come from Delta's public API; Indian trades have none yet. */}
              {!indian && <TradePriceChart trade={current} plannedStop={null} plannedTarget={null} />}
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
                          <Link href={href(i)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-3 no-underline hover:bg-paper-2">
                            <span className="min-w-0">
                              <span className="block text-ink">
                                {t.symbol} {t.direction}
                              </span>
                              <span className="block text-sm text-muted">{formatDateTime(t.openedTs)}</span>
                            </span>
                            <span className={`self-center tabular-nums ${pnlClass(t.netPnl)}`}>{formatMoney(t.netPnl, { sign: true, currency: t.currency })}</span>
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </main>
  );
}
