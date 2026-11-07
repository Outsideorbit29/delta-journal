import { and, eq } from "drizzle-orm";
import { effectiveRisk } from "@/lib/journal/entry";
import { schema, type Db } from "@/db";
import { analyzeTrades, walletFillIds } from "./analyze";
import { reconstructTrades } from "./reconstruct";

const BATCH = 100;

export interface RebuildSummary {
  trades: number;
  open: number;
  pnlMismatches: number;
  warnings: number;
}

/** Recomputes one user's trades, their fill legs and auto tags from that user's raw synced data. */
export async function rebuildTrades(db: Db, userId: string): Promise<RebuildSummary> {
  const [fills, orders, wallet, journal] = await Promise.all([
    db.select().from(schema.fills).where(eq(schema.fills.userId, userId)),
    db.select().from(schema.orders).where(eq(schema.orders.userId, userId)),
    db.select().from(schema.walletTransactions).where(eq(schema.walletTransactions.userId, userId)),
    db
      .select({ tradeId: schema.journalEntries.tradeId, plannedStop: schema.journalEntries.plannedStop })
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.userId, userId)),
  ]);
  const plannedStops = new Map(journal.map((j) => [j.tradeId, j.plannedStop]));

  const orderInputs = orders.map((o) => ({ ...o, editedTs: editedAt(o.raw) }));
  const walletInputs = wallet.map((w) => ({ ...w, fillIds: walletFillIds(w.raw) }));
  const analyzed = analyzeTrades(reconstructTrades(fills), orderInputs, walletInputs);

  const tradeRows: (typeof schema.trades.$inferInsert)[] = analyzed.map((t) => ({
    ...effectiveRisk({ ...t, stopOrderRisk: t.riskAmount }, plannedStops.get(t.id) ?? null),
    stopOrderRisk: t.riskAmount,
    id: t.id,
    userId,
    productId: t.productId,
    symbol: t.symbol,
    contractType: t.contractType,
    direction: t.direction,
    status: t.status,
    openedTs: t.openedTs,
    closedTs: t.closedTs,
    holdSeconds: t.holdSeconds,
    entryQty: t.entryQty,
    exitQty: t.exitQty,
    maxQty: t.maxQty,
    contractValue: t.contractValue,
    avgEntry: t.avgEntry,
    avgExit: t.avgExit,
    maxNotional: t.maxNotional,
    leverage: t.leverage,
    marginUsed: t.marginUsed,
    walletBalanceAtOpen: t.walletBalanceAtOpen,
    grossPnl: t.grossPnl,
    fees: t.fees,
    feeCredits: t.feeCredits,
    funding: t.funding,
    liquidationFees: t.liquidationFees,
    netPnl: t.netPnl,
    deltaRealizedPnl: t.deltaRealizedPnl,
    pnlMatchesDelta: t.pnlMatchesDelta,
    fillCount: t.legs.length,
    addCount: t.addCount,
    reduceCount: t.reduceCount,
    exitReason: t.exitReason,
    stopPrice: t.stopPrice,
    stopPlacedAfterSec: t.stopPlacedAfterSec,
    stopMovedAfterSec: t.stopMovedAfterSec,
    warnings: t.warnings,
  }));
  const legRows = analyzed.flatMap((t) =>
    t.legs.map((l) => ({ tradeId: t.id, userId, fillId: l.fillId, qty: l.qty, kind: l.kind, price: l.price, fee: l.fee, ts: l.ts })),
  );
  const tagRows = analyzed.flatMap((t) => t.tags.map((g) => ({ tradeId: t.id, userId, tag: g.tag, detail: g.detail, source: "auto" as const })));

  await db.transaction(async (tx) => {
    await tx.delete(schema.trades).where(eq(schema.trades.userId, userId));
    await tx.delete(schema.tradeFills).where(eq(schema.tradeFills.userId, userId));
    await tx.delete(schema.tradeTags).where(and(eq(schema.tradeTags.userId, userId), eq(schema.tradeTags.source, "auto")));
    for (let i = 0; i < tradeRows.length; i += BATCH) await tx.insert(schema.trades).values(tradeRows.slice(i, i + BATCH));
    for (let i = 0; i < legRows.length; i += BATCH) await tx.insert(schema.tradeFills).values(legRows.slice(i, i + BATCH));
    for (let i = 0; i < tagRows.length; i += BATCH) {
      // A tag you added yourself wins over the same automatic tag.
      await tx.insert(schema.tradeTags).values(tagRows.slice(i, i + BATCH)).onConflictDoNothing();
    }
  });

  return {
    trades: analyzed.length,
    open: analyzed.filter((t) => t.status === "open").length,
    pnlMismatches: analyzed.filter((t) => t.pnlMatchesDelta === false).length,
    warnings: analyzed.reduce((n, t) => n + t.warnings.length, 0),
  };
}

/** Delta stamps `meta_data.edit_timestamp` ("2026-10-30 15:34:15.453064Z") on edited orders. */
function editedAt(raw: unknown): number | null {
  const stamp = (raw as { meta_data?: { edit_timestamp?: string } } | null)?.meta_data?.edit_timestamp;
  if (!stamp) return null;
  const ts = Date.parse(stamp.replace(" ", "T"));
  return Number.isFinite(ts) ? ts : null;
}
