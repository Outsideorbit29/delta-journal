import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { requireUserId } from "@/lib/session";
import { JournalSection } from "@/components/journal-section";
import { TagChip } from "@/components/tag-chip";
import { TradePriceChart } from "@/components/trade-price-chart";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { getJournalEntry, getTrade } from "@/lib/queries";

const EXIT_LABELS = { stop: "Stop-loss", target: "Take-profit", liquidation: "Liquidation", manual: "Manual", flip: "Flipped position" };

export default async function TradePage({ params }: PageProps<"/trades/[id]">) {
  await connection();
  const userId = await requireUserId();
  const { id } = await params;
  const tradeId = decodeURIComponent(id);
  const [trade, entry] = await Promise.all([getTrade(userId, tradeId), getJournalEntry(userId, tradeId)]);
  if (!trade) notFound();
  const plannedReward =
    entry?.plannedTarget && trade.riskSource === "journal" && trade.riskAmount
      ? (Math.abs(entry.plannedTarget - trade.avgEntry) * trade.maxQty * trade.contractValue) / trade.riskAmount
      : null;

  const rows: [string, React.ReactNode][] = [
    ["Opened", `${formatDateTime(trade.openedTs)} IST`],
    ["Closed", trade.closedTs ? `${formatDateTime(trade.closedTs)} IST` : "Still open"],
    ["Held", formatDuration(trade.holdSeconds)],
    ["Max size", `${trade.maxQty.toLocaleString()} contracts (${formatPrice(trade.maxQty * trade.contractValue)} units)`],
    ["Notional", formatMoney(trade.maxNotional)],
    ["Leverage", trade.leverage ? `${trade.leverage}x` : "–"],
    [
      "Margin used",
      trade.marginUsed === null
        ? "–"
        : `${formatMoney(trade.marginUsed)}${trade.walletBalanceAtOpen ? ` (${formatPercent(trade.marginUsed / trade.walletBalanceAtOpen)} of ${formatMoney(trade.walletBalanceAtOpen)} wallet)` : ""}`,
    ],
    ["Avg entry", formatPrice(trade.avgEntry)],
    ["Avg exit", formatPrice(trade.avgExit)],
    ["Exit", trade.exitReason ? EXIT_LABELS[trade.exitReason] : "–"],
    [
      "Stop-loss",
      trade.stopPrice === null
        ? "None found"
        : `${formatPrice(trade.stopPrice)}, placed ${formatDuration(trade.stopPlacedAfterSec)} after entry` +
          (trade.stopMovedAfterSec === null ? "" : `, moved ${formatDuration(trade.stopMovedAfterSec)} after entry`),
    ],
    [
      "Planned risk",
      trade.riskSource === "journal"
        ? `${formatMoney(trade.riskAmount)} (from your planned stop)`
        : trade.stopMovedAfterSec !== null
          ? "Unknown: the stop was moved and Delta keeps only its last price. Add your planned stop in the journal."
          : formatMoney(trade.riskAmount),
    ],
    ["R-multiple", formatR(trade.rMultiple)],
    ...(plannedReward ? ([["Planned reward:risk", `${plannedReward.toFixed(1)} : 1`]] as [string, string][]) : []),
  ];

  const pnl: [string, number][] = [
    ["Gross P&L", trade.grossPnl],
    ["Fees", -trade.fees],
    ...(trade.liquidationFees ? ([["Liquidation fee", -trade.liquidationFees]] as [string, number][]) : []),
    ["Funding", trade.funding],
    ["Net P&L", trade.netPnl],
  ];

  return (
    <main id="main" className="container space-y-14 pt-10 pb-24">
      <div>
        <Link href="/trades" className="face-label link text-sm">
          All trades
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-b-4 border-ink pb-6">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)]">
            {trade.symbol} {trade.direction}
          </h1>
          <p className={`figure-display text-[clamp(2.5rem,5vw,4rem)] ${pnlClass(trade.netPnl)}`}>{trade.status === "open" ? "open" : formatMoney(trade.netPnl, { sign: true })}</p>
        </div>
        {/* Each tag once: the ones with an explanation as a list, the rest as tags. */}
        {trade.tags.some((g) => g.detail) && (
          <ul className="mt-5 space-y-2 text-base text-ink-2">
            {trade.tags.filter((g) => g.detail).map((g) => (
              <li key={g.tag}>
                <TagChip tag={g.tag} href={`/trades?tag=${encodeURIComponent(g.tag)}`} /> {g.detail}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trade.tags.filter((g) => !g.detail).map((g) => (
            <TagChip key={g.tag} tag={g.tag} href={`/trades?tag=${encodeURIComponent(g.tag)}`} />
          ))}
        </div>
      </div>

      {trade.warnings.length > 0 && (
        <ul className="face-label space-y-1 bg-warn-soft px-5 py-4 text-sm text-warn">
          {trade.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <TradePriceChart trade={trade} plannedStop={entry?.plannedStop ?? null} plannedTarget={entry?.plannedTarget ?? null} />

      {trade.status === "closed" && <JournalSection trade={trade} entry={entry} />}

      <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
        <section className="opens lg:col-span-7">
          <h2 className="text-xl">The trade</h2>
          <dl className="face-label mt-4 divide-y divide-rule border-t border-rule-2 text-base">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-6 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="opens lg:col-span-5">
          <h2 className="text-xl">Where the money went</h2>
          <dl className="face-label mt-4 border-t border-rule-2 text-base">
            {pnl.map(([k, v]) => (
              <div key={k} className={`flex justify-between gap-4 py-2.5 ${k === "Net P&L" ? "border-t-4 border-ink" : "border-b border-rule"}`}>
                <dt className={k === "Net P&L" ? "text-ink" : "text-muted"}>{k}</dt>
                <dd className={k === "Net P&L" ? `figure-display text-3xl ${pnlClass(v)}` : `tabular-nums ${pnlClass(v)}`}>{formatMoney(v, { sign: true })}</dd>
              </div>
            ))}
          </dl>
          {trade.deltaRealizedPnl !== null && (
            <p className={`face-label mt-4 text-sm ${trade.pnlMatchesDelta ? "text-muted" : "text-warn"}`}>
              Delta reports {formatMoney(trade.deltaRealizedPnl, { sign: true })} gross: {trade.pnlMatchesDelta ? "matches" : "does not match"}.
            </p>
          )}
          {trade.feeCredits > 0 && <p className="face-label mt-1 text-sm text-muted">{formatMoney(trade.feeCredits)} of fees were paid with fee credits.</p>}
        </section>
      </div>

      <section className="opens">
        <h2 className="text-xl">Fills</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="face-label w-full text-base">
            <thead className="border-b border-rule-2 text-left">
              <tr>
                <th className={th}>Time (IST)</th>
                <th className={th}>Action</th>
                <th className={`${th} text-right`}>Contracts</th>
                <th className={`${th} text-right`}>Price</th>
                <th className={`${th} text-right`}>Fee</th>
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
                  <td className={`${td} text-right tabular-nums`}>{formatMoney(l.fee)}</td>
                  <td className={`${td} text-muted`}>
                    {l.fillType === "liquidation" ? "liquidation" : (l.stopOrderType?.replace(/_order$/, "").replace("_", " ") ?? l.orderType?.replace("_order", "") ?? "–")}
                    {l.source ? `, ${l.source.replace("_", " ")}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const th = "px-3 py-3 text-sm font-medium whitespace-nowrap text-muted first:pl-0";
const td = "px-3 py-2.5 text-ink-2 first:pl-0";
