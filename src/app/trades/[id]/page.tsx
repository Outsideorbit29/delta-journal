import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JournalSection } from "@/components/journal-section";
import { TagChip } from "@/components/tag-chip";
import { TradePriceChart } from "@/components/trade-price-chart";
import { formatDateTime, formatDuration, formatMoney, formatPercent, formatPrice, formatR, pnlClass } from "@/lib/format";
import { getJournalEntry, getTrade } from "@/lib/queries";

const EXIT_LABELS = { stop: "Stop-loss", target: "Take-profit", liquidation: "Liquidation", manual: "Manual", flip: "Flipped position" };

export default async function TradePage({ params }: PageProps<"/trades/[id]">) {
  await connection();
  const { id } = await params;
  const tradeId = decodeURIComponent(id);
  const [trade, entry] = await Promise.all([getTrade(tradeId), getJournalEntry(tradeId)]);
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
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← All trades
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {trade.symbol} <span className={trade.direction === "long" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{trade.direction}</span>
          <span className={`ml-3 ${pnlClass(trade.netPnl)}`}>{trade.status === "open" ? "open" : formatMoney(trade.netPnl, { sign: true })}</span>
        </h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {trade.tags.map((g) => (
            <TagChip key={g.tag} tag={g.tag} detail={g.detail} href={`/?tag=${encodeURIComponent(g.tag)}`} />
          ))}
        </div>
        {trade.tags.some((g) => g.detail) && (
          <ul className="mt-2 space-y-0.5 text-sm text-zinc-500">
            {trade.tags.filter((g) => g.detail).map((g) => (
              <li key={g.tag}>
                <TagChip tag={g.tag} /> {g.detail}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trade.warnings.length > 0 && (
        <ul className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {trade.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <TradePriceChart trade={trade} plannedStop={entry?.plannedStop ?? null} plannedTarget={entry?.plannedTarget ?? null} />

      {trade.status === "closed" && <JournalSection trade={trade} entry={entry} />}

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <dl className="space-y-1.5 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          {pnl.map(([k, v]) => (
            <div key={k} className={`flex justify-between ${k === "Net P&L" ? "border-t border-zinc-200 pt-1.5 font-semibold dark:border-zinc-800" : ""}`}>
              <dt>{k}</dt>
              <dd className={`tabular-nums ${pnlClass(v)}`}>{formatMoney(v, { sign: true })}</dd>
            </div>
          ))}
          {trade.deltaRealizedPnl !== null && (
            <p className={`pt-2 text-xs ${trade.pnlMatchesDelta ? "text-zinc-500" : "text-amber-700 dark:text-amber-300"}`}>
              Delta reports {formatMoney(trade.deltaRealizedPnl, { sign: true })} gross: {trade.pnlMatchesDelta ? "matches" : "does not match"}.
            </p>
          )}
          {trade.feeCredits > 0 && <p className="text-xs text-zinc-500">{formatMoney(trade.feeCredits)} of fees were paid with fee credits.</p>}
        </dl>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Fills</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Time (IST)</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2 text-right">Contracts</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Fee</th>
                <th className="px-3 py-2">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {trade.legs.map((l) => (
                <tr key={l.fillId}>
                  <td className="whitespace-nowrap px-3 py-1.5">{formatDateTime(l.ts)}</td>
                  <td className="px-3 py-1.5 capitalize">{l.kind}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty > 0 ? `+${l.qty}` : l.qty}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatPrice(l.price)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(l.fee)}</td>
                  <td className="px-3 py-1.5 text-zinc-500">
                    {l.fillType === "liquidation" ? "liquidation" : (l.stopOrderType?.replace(/_order$/, "").replace("_", " ") ?? l.orderType?.replace("_order", "") ?? "–")}
                    {l.source ? ` · ${l.source.replace("_", " ")}` : ""}
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
