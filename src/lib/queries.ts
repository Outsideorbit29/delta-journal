// Reads for the web pages. Every function takes the signed-in user's id and
// only ever returns that user's rows.

import { and, asc, desc, eq, gte, inArray, notInArray, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";

export type Trade = typeof schema.trades.$inferSelect;
export type TradeTag = typeof schema.tradeTags.$inferSelect;
export type TradeWithTags = Trade & { tags: TradeTag[] };

export interface TradeFilter {
  symbol?: string;
  tag?: string;
  /** Only trades opened at or after this time (ms). */
  sinceTs?: number;
}

export async function listTrades(userId: string, filter: TradeFilter = {}): Promise<TradeWithTags[]> {
  const db = await getDb();
  const where: SQL[] = [eq(schema.trades.userId, userId)];
  if (filter.symbol) where.push(eq(schema.trades.symbol, filter.symbol));
  if (filter.sinceTs !== undefined) where.push(gte(schema.trades.openedTs, filter.sinceTs));
  if (filter.tag) {
    const tagged = db
      .select({ id: schema.tradeTags.tradeId })
      .from(schema.tradeTags)
      .where(and(eq(schema.tradeTags.userId, userId), eq(schema.tradeTags.tag, filter.tag)));
    where.push(inArray(schema.trades.id, tagged));
  }
  const rows = await db
    .select()
    .from(schema.trades)
    .where(and(...where))
    .orderBy(desc(schema.trades.openedTs));
  return attachTags(userId, rows);
}

export async function getTrade(userId: string, id: string) {
  const db = await getDb();
  const [trade] = await db
    .select()
    .from(schema.trades)
    .where(and(eq(schema.trades.userId, userId), eq(schema.trades.id, id)));
  if (!trade) return null;
  const [withTags] = await attachTags(userId, [trade]);
  const legs = await db
    .select({
      fillId: schema.tradeFills.fillId,
      qty: schema.tradeFills.qty,
      kind: schema.tradeFills.kind,
      price: schema.tradeFills.price,
      fee: schema.tradeFills.fee,
      ts: schema.tradeFills.ts,
      fillType: schema.fills.fillType,
      orderId: schema.fills.orderId,
      leverage: schema.fills.leverage,
      source: schema.fills.source,
      stopOrderType: schema.orders.stopOrderType,
      orderType: schema.orders.orderType,
    })
    .from(schema.tradeFills)
    .innerJoin(schema.fills, and(eq(schema.fills.id, schema.tradeFills.fillId), eq(schema.fills.userId, userId)))
    .leftJoin(schema.orders, and(eq(schema.orders.id, schema.fills.orderId), eq(schema.orders.userId, userId)))
    .where(and(eq(schema.tradeFills.userId, userId), eq(schema.tradeFills.tradeId, id)))
    .orderBy(asc(schema.tradeFills.ts));
  return { ...withTags, legs };
}

export async function getSyncStatus(userId: string) {
  const db = await getDb();
  return db.select().from(schema.syncState).where(eq(schema.syncState.userId, userId));
}

export async function listSymbols(userId: string) {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ symbol: schema.trades.symbol })
    .from(schema.trades)
    .where(eq(schema.trades.userId, userId))
    .orderBy(asc(schema.trades.symbol));
  return rows.map((r) => r.symbol);
}

async function attachTags(userId: string, trades: Trade[]): Promise<TradeWithTags[]> {
  if (!trades.length) return [];
  const db = await getDb();
  const tags = await db.select().from(schema.tradeTags).where(eq(schema.tradeTags.userId, userId));
  const byTrade = new Map<string, TradeTag[]>();
  for (const tag of tags) {
    const list = byTrade.get(tag.tradeId);
    if (list) list.push(tag);
    else byTrade.set(tag.tradeId, [tag]);
  }
  return trades.map((t) => ({ ...t, tags: byTrade.get(t.id) ?? [] }));
}

// --- journal ------------------------------------------------------------------

export type JournalEntry = typeof schema.journalEntries.$inferSelect;

export async function getJournalEntry(userId: string, tradeId: string): Promise<JournalEntry | null> {
  const db = await getDb();
  const [entry] = await db
    .select()
    .from(schema.journalEntries)
    .where(and(eq(schema.journalEntries.userId, userId), eq(schema.journalEntries.tradeId, tradeId)));
  return entry ?? null;
}

export async function journaledTradeIds(userId: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
  return new Set(rows.map((r) => r.id));
}

/** Closed trades without a journal entry, newest first. */
export async function listUnjournaled(userId: string): Promise<TradeWithTags[]> {
  const db = await getDb();
  const journaled = db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries).where(eq(schema.journalEntries.userId, userId));
  const rows = await db
    .select()
    .from(schema.trades)
    .where(and(eq(schema.trades.userId, userId), eq(schema.trades.status, "closed"), notInArray(schema.trades.id, journaled)))
    .orderBy(desc(schema.trades.closedTs));
  return attachTags(userId, rows);
}
