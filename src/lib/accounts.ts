import { randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { Broker, Currency } from "@/db/schema";

// A user's trading accounts (Delta today; Dhan and Groww next). Every synced
// row and every trade belongs to one, and an account has one currency, so
// totals are only ever added up within an account.

export type Account = typeof schema.accounts.$inferSelect;

const DEFAULTS: Record<Broker, { label: string; currency: Currency }> = {
  delta: { label: "Delta Exchange", currency: "USD" },
  dhan: { label: "Dhan", currency: "INR" },
  groww: { label: "Groww", currency: "INR" },
};

const newAccountId = () => `acc_${randomBytes(8).toString("hex")}`;

/**
 * The user's account at `broker`, created on first use. Reads first, so the
 * sync that calls this every minute writes nothing once the account exists; the
 * unique (user, broker) index makes two racing first calls agree on one row.
 */
export async function ensureAccount(db: Db, userId: string, broker: Broker, now = Date.now()): Promise<Account> {
  const find = () =>
    db
      .select()
      .from(schema.accounts)
      .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.broker, broker)));
  const [existing] = await find();
  if (existing) return existing;
  await db
    .insert(schema.accounts)
    .values({ id: newAccountId(), userId, broker, ...DEFAULTS[broker], createdAt: now })
    .onConflictDoNothing();
  const [created] = await find();
  if (!created) throw new Error(`Could not create the ${broker} account for ${userId}`);
  return created;
}

/** The user's accounts, oldest first. */
export async function listAccounts(db: Db, userId: string): Promise<Account[]> {
  return db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId)).orderBy(asc(schema.accounts.createdAt), asc(schema.accounts.id));
}

/** Tables whose rows carry an account. */
const WITH_ACCOUNT = [schema.fills, schema.orders, schema.walletTransactions, schema.trades] as const;

/**
 * Gives the user's rows that have no account ("", written by code from before
 * accounts existed, e.g. a sync running while the database was migrated) to
 * their Delta account, the only broker that code knew. Returns how many moved.
 */
export async function adoptUnassigned(db: Db, userId: string): Promise<number> {
  let orphans = 0;
  for (const table of WITH_ACCOUNT) {
    const [row] = await db
      .select({ userId: table.userId })
      .from(table as typeof schema.fills)
      .where(and(eq(table.userId, userId), eq(table.accountId, "")))
      .limit(1);
    if (row) orphans++;
  }
  if (!orphans) return 0;
  const { id } = await ensureAccount(db, userId, "delta");
  let moved = 0;
  for (const table of WITH_ACCOUNT) {
    const rows = await db
      .update(table)
      .set({ accountId: id })
      .where(and(eq(table.userId, userId), eq(table.accountId, "")))
      .returning({ userId: table.userId });
    moved += rows.length;
  }
  return moved;
}
