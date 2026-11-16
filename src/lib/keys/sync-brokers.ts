import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { accountExists, deleteAccountData } from "@/lib/account";
import { DhanApiError, DhanClient, tokenExpiry, type DhanCredentials } from "@/lib/dhan/client";
import { syncDhan, type DhanSyncSummary } from "@/lib/dhan/sync";
import { markBrokerChecked, openDhanCredentials, replaceDhanToken } from "./brokers";
import { sealPublicKey } from "./credentials";
import { ACCOUNT_DELETED } from "./sync-users";

// The sync server's side of Dhan: every connected account is synced with its own token, and a token
// is renewed (Dhan Web tokens last 24 hours) while it still has a few hours left.

/** Renew once fewer than this many hours remain. */
const RENEW_WITHIN_MS = 4 * 3_600_000;

export const DHAN_UNREADABLE = "The stored Dhan token could not be unlocked. Connect Dhan again in Settings.";
export const DHAN_EXPIRED = "Your Dhan access token has expired. Generate a new one on web.dhan.co and paste it in Hardwon → Settings.";

export type DhanClientFactory = (credentials: DhanCredentials) => DhanClient;
const dhanClient: DhanClientFactory = (credentials) => new DhanClient(credentials);

export interface DhanSyncResult {
  userId: string;
  summary?: DhanSyncSummary;
  error?: string;
  /** True when the token was renewed this round. */
  renewed?: boolean;
}

type Row = typeof schema.brokerCredentials.$inferSelect;

/** Syncs every connected Dhan account. One user's failure never stops the others. */
export async function syncDhanAccounts(
  db: Db,
  privateKey: string,
  { makeClient = dhanClient, now = Date.now() }: { makeClient?: DhanClientFactory; now?: number } = {},
): Promise<DhanSyncResult[]> {
  const rows = await db.select().from(schema.brokerCredentials).where(eq(schema.brokerCredentials.broker, "dhan"));
  const results: DhanSyncResult[] = [];
  for (const row of rows) {
    const result: DhanSyncResult = { userId: row.userId };
    try {
      await syncRow(db, row, privateKey, makeClient, now, result);
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
    }
    results.push(result);
  }
  return results;
}

async function syncRow(db: Db, row: Row, privateKey: string, makeClient: DhanClientFactory, now: number, result: DhanSyncResult) {
  let credentials: DhanCredentials;
  try {
    credentials = openDhanCredentials(row, privateKey);
  } catch {
    await markBrokerChecked(db, row.userId, "dhan", row.sealed, DHAN_UNREADABLE, now);
    throw new Error(DHAN_UNREADABLE);
  }
  let sealed = row.sealed;
  if (row.expiresAt !== null && row.expiresAt <= now) {
    // Dhan cannot renew an expired token; only a new one from the user helps. Don't call Dhan for nothing.
    await markBrokerChecked(db, row.userId, "dhan", sealed, DHAN_EXPIRED, now);
    throw new Error(DHAN_EXPIRED);
  }
  try {
    let client = makeClient(credentials);
    if (row.expiresAt !== null && row.expiresAt - now < RENEW_WITHIN_MS) {
      const renewed = await renew(db, row, client, credentials, makeClient, now);
      if (renewed) {
        ({ client, sealed } = renewed);
        result.renewed = true;
      }
    }
    result.summary = await syncDhan(db, row.userId, client, now);
    // The account was deleted while this sync ran: erase what the sync just wrote.
    if (!(await accountExists(db, row.userId))) {
      await deleteAccountData(db, row.userId);
      throw new Error(ACCOUNT_DELETED);
    }
    await markBrokerChecked(db, row.userId, "dhan", sealed, null, now);
  } catch (err) {
    const error = err instanceof DhanApiError && err.isAuth ? DHAN_EXPIRED : err instanceof Error ? err.message : String(err);
    await markBrokerChecked(db, row.userId, "dhan", sealed, error, now);
    throw new Error(error);
  }
}

/**
 * Swaps the token for a fresh one and stores it. Dhan expires the old token as it hands out the new one, so the
 * new one is stored before anything else. Returns null (keep the old token) when Dhan's reply carried no token.
 */
async function renew(db: Db, row: Row, client: DhanClient, credentials: DhanCredentials, makeClient: DhanClientFactory, now: number) {
  const publicKey = sealPublicKey();
  if (!publicKey) return null;
  const token = await client.renewToken();
  if (!token) return null;
  const fresh = { ...credentials, accessToken: token };
  const next = makeClient(fresh);
  const expiresAt = tokenExpiry(await next.profile().catch(() => ({ tokenValidity: "" }))) ?? now + 24 * 3_600_000;
  const sealed = await replaceDhanToken(db, row, fresh, publicKey, expiresAt, now);
  if (!sealed) return null; // The user pasted a new token meanwhile; theirs wins.
  return { client: next, sealed };
}

/** One user's sync round across all their brokers, as the bot needs it. */
export interface SyncOutcome {
  userId: string;
  /** Some broker wrote new data and trades were rebuilt. */
  rebuilt: boolean;
  /** Every broker's problem, one per line; undefined when all worked. */
  error?: string;
}

/** Joins each user's Delta and Dhan results into one, in the order users first appear. */
export function mergeSyncResults(
  delta: { userId: string; summary?: { rebuild: unknown }; error?: string }[],
  dhan: DhanSyncResult[],
): SyncOutcome[] {
  const byUser = new Map<string, { rebuilt: boolean; errors: string[] }>();
  const add = (userId: string, rebuilt: boolean, error: string | undefined) => {
    const entry = byUser.get(userId) ?? { rebuilt: false, errors: [] };
    entry.rebuilt ||= rebuilt;
    if (error) entry.errors.push(error);
    byUser.set(userId, entry);
  };
  for (const r of delta) add(r.userId, !!r.summary?.rebuild, r.error);
  for (const r of dhan) add(r.userId, !!r.summary?.rebuild, r.error);
  return [...byUser].map(([userId, { rebuilt, errors }]) => ({ userId, rebuilt, ...(errors.length ? { error: errors.join("\n") } : {}) }));
}
