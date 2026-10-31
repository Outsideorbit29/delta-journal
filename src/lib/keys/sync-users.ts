import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { DeltaClient } from "@/lib/delta/client";
import { syncAll, type SyncSummary } from "@/lib/sync";
import { markDeltaKeyChecked, openDeltaKey, type DeltaKey } from "./credentials";

// The multi-user sync, run by the bot on the fixed-IP server: every user who
// connected a Delta key is synced with their own key, one after another.

export type ClientFactory = (key: DeltaKey) => DeltaClient;
const deltaClient: ClientFactory = (key) => new DeltaClient(key.apiKey, key.apiSecret, process.env.DELTA_BASE_URL);

export const KEY_UNREADABLE = "The stored key could not be unlocked. Connect your Delta key again.";

export interface UserSyncResult {
  userId: string;
  summary?: SyncSummary;
  error?: string;
}

type Row = typeof schema.deltaCredentials.$inferSelect;

/** Whether the user has connected a key (the owner may sync with the server's own key instead). */
export async function hasStoredKey(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: schema.deltaCredentials.userId })
    .from(schema.deltaCredentials)
    .where(eq(schema.deltaCredentials.userId, userId));
  return !!row;
}

/** Syncs one user with their stored key and records the outcome on the key. Throws when the sync fails. */
export async function syncWithStoredKey(db: Db, userId: string, privateKey: string, makeClient: ClientFactory = deltaClient, now = Date.now()) {
  const [row] = await db.select().from(schema.deltaCredentials).where(eq(schema.deltaCredentials.userId, userId));
  if (!row) throw new Error("No Delta key is connected.");
  return syncRow(db, row, privateKey, makeClient, now);
}

/** Syncs every user with a stored key except `skip`. One user's failure never stops the others. */
export async function syncStoredKeys(
  db: Db,
  privateKey: string,
  { skip = [], makeClient = deltaClient, now = Date.now() }: { skip?: string[]; makeClient?: ClientFactory; now?: number } = {},
): Promise<UserSyncResult[]> {
  const rows = await db.select().from(schema.deltaCredentials);
  const results: UserSyncResult[] = [];
  for (const row of rows) {
    if (skip.includes(row.userId)) continue;
    try {
      results.push({ userId: row.userId, summary: await syncRow(db, row, privateKey, makeClient, now) });
    } catch (err) {
      results.push({ userId: row.userId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

async function syncRow(db: Db, row: Row, privateKey: string, makeClient: ClientFactory, now: number): Promise<SyncSummary> {
  let key: DeltaKey;
  try {
    key = openDeltaKey(row, privateKey);
  } catch {
    await markDeltaKeyChecked(db, row.userId, row.sealed, KEY_UNREADABLE, now);
    throw new Error(KEY_UNREADABLE);
  }
  try {
    const summary = await syncAll(row.userId, makeClient(key));
    await markDeltaKeyChecked(db, row.userId, row.sealed, null, now);
    return summary;
  } catch (err) {
    await markDeltaKeyChecked(db, row.userId, row.sealed, err instanceof Error ? err.message : String(err), now);
    throw err;
  }
}
