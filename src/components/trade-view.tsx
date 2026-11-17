import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { listAccounts } from "@/lib/accounts";
import { requestTime } from "@/lib/session";
import { JournalPanel } from "@/components/journal-panel";
import { TradeJournalForm } from "@/components/journal-section";
import { TagChip } from "@/components/tag-chip";
import { TradePriceChart } from "@/components/trade-price-chart";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { isHabit, LEAK_FIXES } from "@/lib/insights";
import { EMOTIONS, MISTAKES, SETUPS } from "@/lib/journal/vocab";
import { getJournalEntry, getTrade, listTrades, type JournalEntry } from "@/lib/queries";
import { tagPerformance } from "@/lib/stats";
import { isJournalTag, tagLabel } from "@/lib/tags";
import { moneySteps, tradeSummary, tradeTimeline } from "@/lib/trade-story";

const EXIT_LABELS = { stop: "Stop-loss", target: "Take-profit", liquidation: "Liquidation", manual: "Manual", flip: "Flipped position" };
const CONTRACT_LABELS: Record<string, string> = { perpetual_futures: "Perpetual", futures: "Futures", options: "Options", equity: "Shares" };

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });

/** One trade, told as a story: the result, what happened, where the money went, its habits and your journal. */
export async function TradeView({ userId, tradeId }: { userId: string; tradeId: string }) {
  const now = await requestTime();
  const [trade, entry] = await Promise.all([getTrade(userId, tradeId), getJournalEntry(userId, tradeId)]);
  if (!trade) notFound();
  // The rest of this account's trades: where this one sits among them, and what each of its habits costs overall.
  const [siblings, accounts] = await Promise.all([listTrades(userId, { accountId: trade.accountId }), listAccounts(await getDb(), userId)]);
  const at = siblings.findIndex((t) => t.id === trade.id);
  const newer = at > 0 ? siblings[at - 1] : null;
  const older = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;
  const cost = new Map(tagPerformance(siblings).map((r) => [r.tag, r]));
  const account = accounts.find((a) => a.id === trade.accountId);

  const currency = trade.currency;
  const indian = currency === "INR";
  const closed = trade.status === "closed";
  const units = indian ? (trade.contractType === "equity" ? "shares" : "units") : "contracts";
  const money = (n: number | null, sign = false) => formatMoney(n, { sign, currency });

  const autoTags = trade.tags.filter((g) => !isJournalTag(g.tag));
  // Costliest habit first, by what it has cost across the account.
  const habits = autoTags.filter((g) => isHabit(g.tag)).sort((a, b) => (cost.get(a.tag)?.netPnl ?? 0) - (cost.get(b.tag)?.netPnl ?? 0));
  const context = autoTags.filter((g) => !isHabit(g.tag));
  const timeline = tradeTimeline(trade, units);
  const waterfall = moneySteps([
    { label: "Price move", value: trade.grossPnl },
    { label: indian ? "Charges" : "Fees", value: -trade.fees },
    ...(trade.liquidationFees ? [{ label: "Liquidation fee", value: -trade.liquidationFees }] : []),
    ...(!indian && trade.funding ? [{ label: "Funding", value: trade.funding }] : []),
  ]);
  const feeShare = trade.netPnl < 0 && trade.fees > 0 ? trade.fees / Math.abs(trade.netPnl) : null;

  // "3.0x your recent median size" → "3.0×": an oversized trade shows its size against your usual.
  const oversized = trade.tags.find((g) => g.tag === "oversized")?.detail?.match(/^[\d.]+x/)?.[0].replace("x", "×") ?? null;
  const figures: { label: string; value: string; note: string; tone?: string }[] = [
    { label: closed ? "Held" : "Open for", value: formatDuration(closed ? trade.holdSeconds : Math.round((now - trade.openedTs) / 1000)), note: `${time.format(trade.openedTs)} to ${trade.closedTs ? `${time.format(trade.closedTs)} IST` : "now"}` },
    {
      label: "Size",
      value: oversized ?? trade.maxQty.toLocaleString("en-IN"),
      note: `${oversized ? `${trade.maxQty.toLocaleString("en-IN")} ${units}` : units}, ${money(trade.maxNotional)} ${indian ? "value" : "notional"}`,
    },
    indian
      ? { label: "Charges", value: money(-trade.fees), note: trade.grossPnl ? `${formatPercent(trade.fees / Math.abs(trade.grossPnl))} of the price move` : "", tone: "text-loss" }
      : {
          label: "Margin",
          value: trade.marginUsed !== null && trade.walletBalanceAtOpen ? formatPercent(trade.marginUsed / trade.walletBalanceAtOpen) : trade.leverage ? `${trade.leverage}x` : "–",
          note: trade.marginUsed !== null && trade.walletBalanceAtOpen ? `${money(trade.marginUsed)} of a ${money(trade.walletBalanceAtOpen)} wallet` : "Leverage",
        },
    {
      label: "R-multiple",
      value: formatR(trade.rMultiple),
      note: trade.rMultiple !== null ? `Risk ${money(trade.riskAmount)}` : trade.stopMovedAfterSec !== null ? "Risk unknown: the stop moved" : "Add a planned stop in the journal",
    },
  ];

  const details: [string, React.ReactNode][] = [
    ["Opened", `${formatDateTime(trade.openedTs)} IST`],
    ["Closed", trade.closedTs ? `${formatDateTime(trade.closedTs)} IST` : "Still open"],
    ["Max size", indian ? `${trade.maxQty.toLocaleString("en-IN")} ${units}` : `${trade.maxQty.toLocaleString()} contracts (${formatPrice(trade.maxQty * trade.contractValue)} units)`],
    [indian ? "Value" : "Notional", money(trade.maxNotional)],
    ...(indian ? [] : ([["Leverage", trade.leverage ? `${trade.leverage}x` : "–"]] as [string, string][])),
    ["Avg entry", formatPrice(trade.avgEntry)],
    ["Avg exit", formatPrice(trade.avgExit)],
    ["Exit", trade.exitReason ? EXIT_LABELS[trade.exitReason] : "–"],
    [
      "Stop-loss",
      trade.stopPrice === null
        ? indian
          ? "Not shared by your broker. Add your planned stop in the journal."
          : "None found"
        : `${formatPrice(trade.stopPrice)}, placed ${formatDuration(trade.stopPlacedAfterSec)} after entry` +
          (trade.stopMovedAfterSec === null ? "" : `, moved ${formatDuration(trade.stopMovedAfterSec)} after entry`),
    ],
    [
      "Planned risk",
      trade.riskSource === "journal"
        ? `${money(trade.riskAmount)} (from your planned stop)`
        : trade.stopMovedAfterSec !== null
          ? "Unknown: the stop was moved and Delta keeps only its last price. Add your planned stop in the journal."
          : money(trade.riskAmount),
    ],
  ];

  const chip = "face-label bg-paper-3 px-2.5 py-1 text-sm text-ink-2";
  const pager = "face-label inline-flex min-h-11 items-center border border-rule-2 px-4 text-sm no-underline hover:border-ink";

  return (
    <main id="main" className="container flex flex-col gap-12 pt-8 pb-24">
      <nav aria-label="Trades" className="face-label flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/trades" className="link">
          All trades
        </Link>
        {at >= 0 && (
          <div className="flex items-center gap-2 text-muted">
            <span className="hidden sm:inline">
              Trade {siblings.length - at} of {siblings.length}
            </span>
            {older ? (
              <Link href={`/trades/${encodeURIComponent(older.id)}`} className={pager} aria-label="Previous trade">
                Previous
              </Link>
            ) : (
              <span className={`${pager} opacity-40`} aria-disabled="true">
                Previous
              </span>
            )}
            {newer ? (
              <Link href={`/trades/${encodeURIComponent(newer.id)}`} className={pager} aria-label="Next trade">
                Next
              </Link>
            ) : (
              <span className={`${pager} opacity-40`} aria-disabled="true">
                Next
              </span>
            )}
          </div>
        )}
      </nav>

      <header className="flex flex-col gap-5 border-b-4 border-ink pb-7">
        <div className="flex flex-wrap gap-2">
          {account && <span className={chip}>{account.label}</span>}
          <span className={chip}>
            {CONTRACT_LABELS[trade.contractType] ?? trade.contractType}
            {trade.leverage ? ` · ${trade.leverage}x` : ""}
          </span>
          <span className={chip}>
            {closed ? "Closed" : "Open"} · {day.format(trade.closedTs ?? trade.openedTs)}
          </span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <h1 className="text-[clamp(2.5rem,5vw,4.5rem)]">
            {trade.symbol} {trade.direction}
          </h1>
          <p className={`figure-display text-[clamp(3.25rem,6vw,5.5rem)] ${closed ? pnlClass(trade.netPnl) : "text-muted"}`}>{closed ? money(trade.netPnl, true) : "open"}</p>
        </div>
        <p className="max-w-[62ch] font-serif text-[clamp(1.125rem,0.5vw+1rem,1.375rem)] leading-relaxed text-ink-2">{tradeSummary(trade)}</p>
      </header>

      {trade.warnings.length > 0 && (
        <ul className="face-label -mt-6 space-y-1 bg-warn-soft px-5 py-4 text-sm text-warn">
          {trade.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <section aria-label="Key figures" className="grid grid-cols-2 border-y border-rule-2 lg:grid-cols-4">
        {figures.map((f, i) => (
          <div
            key={f.label}
            className={`flex min-w-0 flex-col gap-2 py-4 lg:py-5 ${i % 2 ? "border-l border-rule pl-4 lg:pl-6" : "pr-4 lg:pr-6"} ${i < 2 ? "border-b border-rule lg:border-b-0" : ""} ${i === 2 ? "lg:border-l lg:border-rule lg:pl-6" : ""}`}
          >
            <span className="face-label text-sm text-muted">{f.label}</span>
            <span className={`figure-display text-[clamp(2rem,3vw,2.75rem)] ${f.tone ?? ""}`}>{f.value}</span>
            {f.note && <span className="face-label hidden text-sm text-muted sm:block">{f.note}</span>}
          </div>
        ))}
      </section>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-12">
        {/* On a phone the journal and habits come first, right after the result; on wide screens they sit on the right. */}
        <aside className="flex min-w-0 flex-col gap-10 lg:col-span-5 lg:col-start-8 lg:row-start-1">
          {habits.length > 0 && (
            <section className="opens order-2 lg:order-1" aria-labelledby="habits-head">
              <h2 id="habits-head" className="text-2xl">
                Habits on this trade
              </h2>
              <ul className="mt-2 divide-y divide-rule">
                {habits.map((g) => {
                  const overall = cost.get(g.tag);
                  return (
                    <li key={g.tag} className="flex flex-col gap-1.5 py-4">
                      <div className="face-label flex items-baseline justify-between gap-3 text-lg">
                        <span>{tagLabel(g.tag)}</span>
                        {overall && <span className={pnlClass(overall.netPnl)}>{money(overall.netPnl, true)}</span>}
                      </div>
                      {g.detail && <p className="text-base text-ink-2">{g.detail.charAt(0).toUpperCase() + g.detail.slice(1)}.</p>}
                      {LEAK_FIXES[g.tag] && <p className="text-base text-muted">{LEAK_FIXES[g.tag]}</p>}
                      {overall && (
                        <Link href={`/trades?tag=${encodeURIComponent(g.tag)}`} className="face-label link self-start text-sm">
                          {overall.trades === 1 ? "Your only trade with it" : `See the ${overall.trades} trades with it`}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
              {context.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {context.map((g) => (
                    <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={`/trades?tag=${encodeURIComponent(g.tag)}`} />
                  ))}
                </div>
              )}
              <p className="face-label mt-3 text-xs text-muted">Totals are the net of every closed trade with the habit in this account.</p>
            </section>
          )}
          {habits.length === 0 && context.length > 0 && (
            <div className="order-2 flex flex-wrap gap-1.5 lg:order-1">
              {context.map((g) => (
                <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={`/trades?tag=${encodeURIComponent(g.tag)}`} />
              ))}
            </div>
          )}
          {closed && (
            <div className="order-1 lg:order-2">
              <JournalPanel
                journaled={!!entry}
                summary={entry && <JournalSummary entry={entry} />}
                form={<TradeJournalForm trade={trade} entry={entry} />}
                prompt={entry && !entry.notes ? (trade.tags.some((g) => g.tag === "moved_stop") ? "No note yet. What made you move the stop?" : "No note yet. What were you thinking?") : ""}
              />
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-12 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          {/* Price candles come from Delta's public API; Dhan's need its paid data plan. */}
          {!indian && (
            <section className="opens" aria-labelledby="chart-head">
              <h2 id="chart-head" className="mb-4 text-2xl">
                The price while you held
              </h2>
              <TradePriceChart trade={trade} plannedStop={entry?.plannedStop ?? null} plannedTarget={entry?.plannedTarget ?? null} />
            </section>
          )}

          <section className="opens" aria-labelledby="timeline-head">
            <h2 id="timeline-head" className="text-2xl">
              What happened
            </h2>
            <ol className="face-label mt-3 text-base">
              {timeline.map((m) => (
                <li
                  key={m.key}
                  className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 border-b border-rule py-3.5 sm:grid-cols-[6rem_minmax(0,1fr)] ${m.warn ? "-mx-3 bg-warn-soft px-3" : ""}`}
                >
                  <span className={`tabular-nums ${m.warn ? "text-warn" : "text-muted"}`}>{time.format(m.ts)}</span>
                  <span>
                    <span className="block font-semibold text-ink">{m.title}</span>
                    <span className={`block text-sm ${m.warn ? "text-ink-2" : "text-muted"}`}>{m.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {closed && (
            <section className="opens" aria-labelledby="money-head">
              <h2 id="money-head" className="text-2xl">
                Where the money went
              </h2>
              <dl className="face-label mt-4 flex flex-col gap-3 text-base">
                {waterfall.steps.map((s) => (
                  <div key={s.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_7rem]">
                    <dt className="text-muted">{s.label}</dt>
                    <dd className={`text-right tabular-nums sm:order-last ${pnlClass(s.value)}`}>{money(s.value, true)}</dd>
                    <dd className="col-span-2 h-3 bg-paper-3 sm:col-span-1" aria-hidden="true">
                      <span
                        className="block h-3"
                        style={{ marginLeft: `${s.left * 100}%`, width: `${Math.max(s.value ? 0.5 : 0, s.width * 100)}%`, background: s.value < 0 ? "var(--viz-loss)" : "var(--viz-profit)" }}
                      />
                    </dd>
                  </div>
                ))}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-t-4 border-ink pt-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                  <dt className="text-ink">Net P&L</dt>
                  <dd className="hidden text-sm text-muted sm:block">{feeShare !== null && feeShare >= 0.01 ? `${indian ? "Charges" : "Fees"} were ${formatPercent(feeShare)} of this loss.` : ""}</dd>
                  <dd className={`figure-display text-right text-3xl ${pnlClass(trade.netPnl)}`}>{money(trade.netPnl, true)}</dd>
                </div>
              </dl>
              {trade.deltaRealizedPnl !== null && (
                <p className={`face-label mt-4 text-sm ${trade.pnlMatchesDelta ? "text-muted" : "text-warn"}`}>
                  Delta reports {money(trade.deltaRealizedPnl, true)} gross: {trade.pnlMatchesDelta ? "matches" : "does not match"}.
                </p>
              )}
              {trade.feeCredits > 0 && <p className="face-label mt-1 text-sm text-muted">{money(trade.feeCredits)} of fees were paid with fee credits.</p>}
            </section>
          )}

          <details className="group border-y border-rule-2">
            <summary className="face-label flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 text-base [&::-webkit-details-marker]:hidden">
              All details and fills
              <span className="text-sm text-muted">
                <span className="group-open:hidden">Show</span>
                <span className="hidden group-open:inline">Hide</span>
              </span>
            </summary>
            <dl className="face-label divide-y divide-rule border-t border-rule text-base">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-6 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-ink tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 mb-4 overflow-x-auto">
              <table className="face-label w-full text-base">
                <thead className="border-b border-rule-2 text-left">
                  <tr>
                    <th className={th}>Time (IST)</th>
                    <th className={th}>Action</th>
                    <th className={`${th} text-right`}>{indian ? "Quantity" : "Contracts"}</th>
                    <th className={`${th} text-right`}>Price</th>
                    <th className={`${th} text-right`}>{indian ? "Charges" : "Fee"}</th>
                    <th className={th}>Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {trade.legs.map((l) => (
                    <tr key={l.fillId}>
                      <td className={`${td} whitespace-nowrap`}>{formatDateTime(l.ts)}</td>
                      <td className={`${td} text-ink capitalize`}>{l.kind}</td>
                      <td className={`${td} text-right tabular-nums`}>{l.qty > 0 ? `+${l.qty}` : l.qty}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatPrice(l.price)}</td>
                      <td className={`${td} text-right tabular-nums`}>{money(l.fee)}</td>
                      <td className={`${td} text-muted`}>
                        {l.fillType === "liquidation" ? "liquidation" : (l.stopOrderType?.replace(/_order$/, "").replace("_", " ") ?? l.orderType?.replace("_order", "") ?? "–")}
                        {l.source ? `, ${l.source.replace("_", " ")}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}

/** Your journal answers in a few lines; anything left blank is left out. */
function JournalSummary({ entry }: { entry: JournalEntry }) {
  const rows: [string, string, string?][] = [];
  if (entry.setup) rows.push(["Setup", SETUPS[entry.setup as keyof typeof SETUPS] ?? entry.setup]);
  if (entry.emotions.length) rows.push(["Felt", entry.emotions.map((k) => EMOTIONS[k as keyof typeof EMOTIONS] ?? k).join(", ")]);
  if (entry.mistakes.length) rows.push(["Mistakes", entry.mistakes.map((k) => MISTAKES[k as keyof typeof MISTAKES] ?? k).join(", ")]);
  if (entry.followedPlan !== null) rows.push(["Plan", entry.followedPlan ? "Followed" : "Broken", entry.followedPlan ? "" : "text-loss"]);
  if (entry.rating !== null) rows.push(["Execution", `${entry.rating} of 5`]);
  if (entry.plannedStop !== null) rows.push(["Planned stop", formatPrice(entry.plannedStop)]);
  if (entry.plannedTarget !== null) rows.push(["Planned target", formatPrice(entry.plannedTarget)]);
  return (
    <>
      {rows.length > 0 && (
        <dl className="face-label grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-base">
          {rows.map(([k, v, tone]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className={tone ?? ""}>{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {entry.notes && <p className="font-serif text-lg leading-relaxed whitespace-pre-line text-ink-2">{entry.notes}</p>}
    </>
  );
}

const th = "px-3 py-3 text-sm font-medium whitespace-nowrap text-muted first:pl-0";
const td = "px-3 py-2.5 text-ink-2 first:pl-0";
