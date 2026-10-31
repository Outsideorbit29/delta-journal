import { eq, getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
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

/** Rows written by a sync: new fills and wallet records, and new or changed orders. */
export interface SyncSummary {
  fills: number;
  orders: number;
  walletTransactions: number;
  /** Null when nothing changed, so trades were left as they were. */
  rebuild: RebuildSummary | null;
}

export async function syncAll(client = DeltaClient.fromEnv()): Promise<SyncSummary> {
  const db = await getDb();
  const now = Date.now();

  const fills = await syncResource(db, "fills", now, async (since) => {
    const rows = await client.getAll<DeltaFill>("/v2/fills", window(since, now));
    const written = await writeChanged(db, schema.fills, rows.map(toFillRow), (r) => r.id);
    return { timestamps: rows.map((r) => Date.parse(r.created_at)), written };
  });

  const orders = await syncResource(db, "orders", now, async () => {
    // Order history is read in full every time: with a start/end window Delta
    // silently drops orders (231 of 361 came back on a real account, while the
    // unwindowed listing matched a sweep of 30-day windows).
    const history = await client.getAll<DeltaOrder>("/v2/orders/history");
    // Resting orders (such as the stop on an open position) are not in history yet.
    const open = await client.getAll<DeltaOrder>("/v2/orders", { states: "open,pending" });
    const written = await writeChanged(db, schema.orders, [...history, ...open].map(toOrderRow), (r) => r.id!);
    return { timestamps: history.map((r) => Date.parse(r.created_at)), written };
  });

  const walletTransactions = await syncResource(db, "wallet", now, async (since) => {
    const rows = await client.getAll<DeltaWalletTransaction>("/v2/wallet/transactions", window(since, now));
    const written = await writeChanged(db, schema.walletTransactions, rows.map(toWalletRow), (r) => r.uuid);
    return { timestamps: rows.map((r) => Date.parse(r.created_at)), written };
  });

  // Rebuilding rewrites every trade, so only do it when the raw data changed.
  // This keeps a once-a-minute sync well inside a hosted database's write quota.
  const rebuild = fills + orders + walletTransactions > 0 ? await rebuildTrades(db) : null;
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
  run: (sinceMs: number) => Promise<{ timestamps: number[]; written: number }>,
): Promise<number> {
  const [state] = await db.select().from(schema.syncState).where(eq(schema.syncState.resource, resource));
  const since = state?.lastTs ? Math.max(EARLIEST_MS, state.lastTs - OVERLAP_MS[resource]) : EARLIEST_MS;

  try {
    const { timestamps, written } = await run(since);
    const lastTs = Math.max(state?.lastTs ?? 0, ...timestamps);
    const values = { resource, lastTs: lastTs || null, lastRunAt: now, lastCount: written, lastError: null };
    await db.insert(schema.syncState).values(values).onConflictDoUpdate({ target: schema.syncState.resource, set: values });
    return written;
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    await db
      .insert(schema.syncState)
      .values({ resource, lastRunAt: now, lastError })
      .onConflictDoUpdate({ target: schema.syncState.resource, set: { lastRunAt: now, lastError } });
    throw err;
  }
}

type RawTable = typeof schema.fills | typeof schema.orders | typeof schema.walletTransactions;

/**
 * Writes only the rows that are new or whose Delta record (`raw`) changed, and
 * returns how many that was. Re-reading an overlap window then costs reads,
 * not writes.
 */
export async function writeChanged<T extends RawTable>(
  db: Db,
  table: T,
  rows: (T["$inferInsert"] & { raw: unknown })[],
  idOf: (row: T["$inferInsert"]) => string | number,
): Promise<number> {
  const idColumn = "id" in table ? table.id : table.uuid;
  // The same record can appear twice (e.g. an order in both history and open
  // orders); one statement may not update a row twice, so keep the last.
  const unique = [...new Map(rows.map((r) => [idOf(r), r])).values()];

  const stored = new Map<string | number, string>();
  for (let i = 0; i < unique.length; i += 200) {
    const ids = unique.slice(i, i + 200).map(idOf);
    const found = await db
      .select({ id: idColumn, raw: table.raw })
      .from(table as typeof schema.fills)
      .where(inArray(idColumn, ids as never[]));
    for (const f of found) stored.set(f.id as string | number, canonicalJson(f.raw));
  }
  const changed = unique.filter((r) => stored.get(idOf(r)) !== canonicalJson(r.raw));
  await upsert(db, table as SQLiteTable, idColumn as never, changed as never[]);
  return changed.length;
}

/**
 * JSON with object keys sorted. Delta's API does not keep a stable key order
 * between responses, so the same record can arrive with its fields shuffled.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
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
