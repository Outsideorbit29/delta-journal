import { count, eq, getTableName } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";

/** Every table with an owner. Global caches (trade_candles) and users are not here. */
const OWNED = [
  schema.fills,
  schema.orders,
  schema.walletTransactions,
  schema.syncState,
  schema.trades,
  schema.tradeFills,
  schema.tradeTags,
  schema.journalEntries,
  schema.telegramMessages,
  schema.appState,
  schema.aiReviews,
  schema.pushSubscriptions,
] as const;

export type ClaimResult = Record<string, number>;

/**
 * Gives every row owned by `from` (the pre-accounts data, "legacy") to the
 * signed-up user `to`, in one transaction. Refuses unless `to` has signed in
 * once (so has a users row) and has no synced data of its own yet.
 */
export async function claimRows(db: Db, from: string, to: string): Promise<ClaimResult> {
  if (!to || to === from) throw new Error("Give the Clerk user id to move the data to.");
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, to));
  if (!user) throw new Error(`No user ${to}. Sign in to the app once first, then run this again.`);
  const [{ n }] = await db.select({ n: count() }).from(schema.fills).where(eq(schema.fills.userId, to));
  if (n) throw new Error(`${to} already has ${n} synced fills; refusing to mix two accounts.`);

  return db.transaction(async (tx) => {
    const moved: ClaimResult = {};
    for (const table of OWNED) {
      const rows = await tx.update(table).set({ userId: to }).where(eq(table.userId, from)).returning({ userId: table.userId });
      moved[getTableName(table)] = rows.length;
    }
    return moved;
  });
}
