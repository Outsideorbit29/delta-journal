import { eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getDb, schema, type Db } from "@/db";
import { DeltaClient } from "@/lib/delta/client";
import { toFillRow, toOrderRow, toWalletRow } from "@/lib/delta/ingest";
import type { DeltaFill, DeltaOrder, DeltaWalletTransaction } from "@/lib/delta/types";
import { rebuildTrades, type RebuildSummary } from "@/lib/trades/rebuild";

// First sync reaches back to before Delta India existed, so it gets everything.
const EARLIEST_MS = Date.UTC(2018, 0, 1);
const DAY_MS = 86_400_000;
// Later syncs re-read a window before the newest record we have. Orders get a
// longer window because stop orders change state long after they are created.
const OVERLAP_MS = { fills: 2 * DAY_MS, orders: 7 * DAY_MS, wallet: 2 * DAY_MS };
const BATCH = 100;

export interface SyncSummary {
  fills: number;
  orders: number;
  walletTransactions: number;
  rebuild: RebuildSummary;
}

export async function syncAll(client = DeltaClient.fromEnv()): Promise<SyncSummary> {
  const db = await getDb();
  const now = Date.now();

  const fills = await syncResource(db, "fills", now, async (since) => {
    const rows = await client.getAll<DeltaFill>("/v2/fills", window(since, now));
    await upsert(db, schema.fills, schema.fills.id, rows.map(toFillRow));
    return rows.map((r) => Date.parse(r.created_at));
  });

  const orders = await syncResource(db, "orders", now, async () => {
    // Order history is read in full every time: with a start/end window Delta
    // silently drops orders (231 of 361 came back on a real account, while the
    // unwindowed listing matched a sweep of 30-day windows).
    const history = await client.getAll<DeltaOrder>("/v2/orders/history");
    // Resting orders (such as the stop on an open position) are not in history yet.
    const open = await client.getAll<DeltaOrder>("/v2/orders", { states: "open,pending" });
    await upsert(db, schema.orders, schema.orders.id, [...history, ...open].map(toOrderRow));
    return history.map((r) => Date.parse(r.created_at));
  });

  const walletTransactions = await syncResource(db, "wallet", now, async (since) => {
    const rows = await client.getAll<DeltaWalletTransaction>("/v2/wallet/transactions", window(since, now));
    await upsert(db, schema.walletTransactions, schema.walletTransactions.uuid, rows.map(toWalletRow));
    return rows.map((r) => Date.parse(r.created_at));
  });

  const rebuild = await rebuildTrades(db);
  return { fills, orders, walletTransactions, rebuild };
}

/** Delta takes time windows in microseconds. */
function window(sinceMs: number, untilMs: number) {
  return { start_time: sinceMs * 1000, end_time: untilMs * 1000 };
}

async function syncResource(
  db: Db,
  resource: keyof typeof OVERLAP_MS,
  now: number,
  run: (sinceMs: number) => Promise<number[]>,
): Promise<number> {
  const [state] = await db.select().from(schema.syncState).where(eq(schema.syncState.resource, resource));
  const since = state?.lastTs ? Math.max(EARLIEST_MS, state.lastTs - OVERLAP_MS[resource]) : EARLIEST_MS;

  try {
    const timestamps = await run(since);
    const lastTs = Math.max(state?.lastTs ?? 0, ...timestamps);
    const values = { resource, lastTs: lastTs || null, lastRunAt: now, lastCount: timestamps.length, lastError: null };
    await db.insert(schema.syncState).values(values).onConflictDoUpdate({ target: schema.syncState.resource, set: values });
    return timestamps.length;
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    await db
      .insert(schema.syncState)
      .values({ resource, lastRunAt: now, lastError })
      .onConflictDoUpdate({ target: schema.syncState.resource, set: { lastRunAt: now, lastError } });
    throw err;
  }
}

/** Inserts rows, overwriting every column of rows that already exist. */
export async function upsert<T extends SQLiteTable>(
  db: Db,
  table: T,
  target: T["_"]["columns"][string],
  rows: T["$inferInsert"][],
) {
  if (!rows.length) return;
  const columns = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (column !== target) set[key] = sql.raw(`excluded."${column.name}"`);
  }
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(table)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({ target, set });
  }
}
