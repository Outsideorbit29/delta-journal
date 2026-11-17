import { and, eq, inArray, notInArray } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { ensureAccount } from "@/lib/accounts";
import { istDate } from "@/lib/stats";
import { writeChanged, type RowOwner } from "@/lib/sync";
import { rebuildTrades, type RebuildSummary } from "@/lib/trades/rebuild";
import type { DhanClient } from "./client";
import { hasCharges, toDhanFillRows } from "./ingest";
import type { DhanTrade } from "./types";

const DAY_MS = 86_400_000;
/** The first sync reaches back this far (Dhan opened its API in 2022; earlier days just come back empty). */
const EARLIEST_MS = Date.UTC(2020, 0, 1);
/** The trade history (with charges) is read this often; today's trade book every round. */
export const HISTORY_EVERY_MS = 15 * 60_000;
/** Each history read goes back this far, so charges Dhan books late are picked up. */
const HISTORY_OVERLAP_MS = 7 * DAY_MS;
/** Days per history request. */
const WINDOW_DAYS = 90;

export interface DhanSyncSummary {
  /** Fills written from the history, or null when it was not read this time. */
  history: number | null;
  /** New fills from today's trade book. */
  today: number;
  rebuild: RebuildSummary | null;
}

/**
 * Syncs one user's Dhan account. Today's trade book is read every time for quick Telegram cards; the history,
 * which carries the charges, every 15 minutes. Today's rows are only ever added, never rewritten, so once the
 * history's copy (with charges) is stored, the trade book cannot flip it back each minute.
 */
export async function syncDhan(db: Db, userId: string, client: DhanClient, now = Date.now()): Promise<DhanSyncSummary> {
  const account = await ensureAccount(db, userId, "dhan", now);
  const owner: RowOwner = { userId, accountId: account.id };

  const state = await readState(db, userId, "dhan.history");
  let history: number | null = null;
  if (!state?.lastRunAt || state.lastError || now - state.lastRunAt >= HISTORY_EVERY_MS) {
    history = await run(db, userId, "dhan.history", now, async () => {
      // lastTs is how far the history has been read up to.
      const since = state?.lastTs ? Math.max(EARLIEST_MS, state.lastTs - HISTORY_OVERLAP_MS) : EARLIEST_MS;
      const trades = [];
      for (let from = since; from <= now; from += WINDOW_DAYS * DAY_MS) {
        const to = Math.min(now, from + (WINDOW_DAYS - 1) * DAY_MS);
        trades.push(...(await client.tradeHistory(istDate(from), istDate(to))));
      }
      const rows = toDhanFillRows(trades);
      const written = await writeChanged(db, owner, schema.fills, rows, (r) => r.id);
      return { written: written + (await dropBookCopies(db, userId, rows)), lastTs: now };
    });
  }

  const today = await run(db, userId, "dhan.today", now, async () => {
    const rows = toDhanFillRows(await client.todaysTrades());
    const stored = rows.length
      ? await db
          .select({ id: schema.fills.id, orderId: schema.fills.orderId, raw: schema.fills.raw })
          .from(schema.fills)
          .where(and(eq(schema.fills.userId, userId), inArray(schema.fills.orderId, [...new Set(rows.map((r) => r.orderId))])))
      : [];
    const known = new Set(stored.map((r) => r.id));
    // Orders the history already holds are settled: the trade book never adds to them.
    const settled = new Set(stored.filter((r) => hasCharges(r.raw as DhanTrade)).map((r) => r.orderId));
    const fresh = rows.filter((r) => !known.has(r.id) && !settled.has(r.orderId));
    const written = await writeChanged(db, owner, schema.fills, fresh, (r) => r.id);
    return { written, lastTs: now };
  });

  const rebuild = (history ?? 0) + today > 0 ? await rebuildTrades(db, userId) : null;
  return { history, today, rebuild };
}

/**
 * Deletes the trade book's copies of orders the history has just written, where the two disagree on an order's
 * trades (so the history's set stands alone). Returns how many went.
 */
async function dropBookCopies(db: Db, userId: string, rows: { id: string; orderId: string }[]): Promise<number> {
  const orders = [...new Set(rows.map((r) => r.orderId))];
  let dropped = 0;
  // Batches keep each statement well under SQLite's variable limit.
  for (let i = 0; i < orders.length; i += 200) {
    const batch = orders.slice(i, i + 200);
    const ids = rows.filter((r) => batch.includes(r.orderId)).map((r) => r.id);
    const gone = await db
      .delete(schema.fills)
      .where(and(eq(schema.fills.userId, userId), inArray(schema.fills.orderId, batch), notInArray(schema.fills.id, ids)))
      .returning({ id: schema.fills.id });
    dropped += gone.length;
  }
  return dropped;
}

async function readState(db: Db, userId: string, resource: string) {
  const [state] = await db
    .select()
    .from(schema.syncState)
    .where(and(eq(schema.syncState.userId, userId), eq(schema.syncState.resource, resource)));
  return state;
}

/** Runs one read, recording when it ran, how many rows it wrote, and its error (which is passed on). */
async function run(db: Db, userId: string, resource: string, now: number, read: () => Promise<{ written: number; lastTs: number }>) {
  const target = [schema.syncState.userId, schema.syncState.resource];
  try {
    const { written, lastTs } = await read();
    const values = { userId, resource, lastTs, lastRunAt: now, lastCount: written, lastError: null };
    await db.insert(schema.syncState).values(values).onConflictDoUpdate({ target, set: values });
    return written;
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    await db
      .insert(schema.syncState)
      .values({ userId, resource, lastRunAt: now, lastError })
      .onConflictDoUpdate({ target, set: { lastRunAt: now, lastError } });
    throw err;
  }
}
