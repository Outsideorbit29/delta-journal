import { count, eq, getTableName } from "drizzle-orm";
import type { Db } from "./index";
import * as schema from "./schema";

/**
 * Every table with an owner (a user_id column). Global caches (trade_candles),
 * users and rate_limits (keyed by subject) are not here. Claim, export and
 * account deletion all use this list, so a new per-user table goes here.
 */
export const OWNED = [
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
  schema.deltaCredentials,
  schema.telegramLinks,
  schema.feedback,
] as const;

export type ClaimResult = Record<string, number>;

/** Tables keyed by the user, where the new account's own first-visit rows would collide with the moved ones. */
const KEYED_BY_USER = [schema.deltaCredentials, schema.telegramLinks, schema.appState, schema.syncState] as const;

/**
 * Gives every row owned by `from` to the signed-up user `to`, in one
 * transaction: the pre-accounts data ("legacy"), or a whole account moving to a
 * new Clerk id (the development instance's user to the production instance's).
 * Refuses unless `to` has signed in once (so has a users row) and has no synced
 * data of its own yet; `to`'s stray first-visit state gives way to the moved rows.
 *
 * A stored Delta key is sealed to its owner's id and cannot open under another,
 * so it is deleted rather than moved (`delta_credentials_dropped`): that person
 * connects their key again. The account's sign-up date, plan and free access
 * carry over, so a founder's three months do not restart.
 */
export async function claimRows(db: Db, from: string, to: string): Promise<ClaimResult> {
  if (!to || to === from) throw new Error("Give the Clerk user id to move the data to.");
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, to));
  if (!user) throw new Error(`No user ${to}. Sign in to the app once first, then run this again.`);
  const [{ n }] = await db.select({ n: count() }).from(schema.fills).where(eq(schema.fills.userId, to));
  if (n) throw new Error(`${to} already has ${n} synced fills; refusing to mix two accounts.`);

  return db.transaction(async (tx) => {
    const moved: ClaimResult = {};
    for (const table of KEYED_BY_USER) await tx.delete(table).where(eq(table.userId, to));
    const sealed = await tx
      .delete(schema.deltaCredentials)
      .where(eq(schema.deltaCredentials.userId, from))
      .returning({ userId: schema.deltaCredentials.userId });
    moved.delta_credentials_dropped = sealed.length;
    for (const table of OWNED) {
      const rows = await tx.update(table).set({ userId: to }).where(eq(table.userId, from)).returning({ userId: table.userId });
      moved[getTableName(table)] = rows.length;
    }
    const [account] = await tx.select().from(schema.users).where(eq(schema.users.id, from));
    if (account) {
      await tx.update(schema.users).set({ createdAt: account.createdAt, plan: account.plan, accessUntil: account.accessUntil }).where(eq(schema.users.id, to));
      await tx.delete(schema.users).where(eq(schema.users.id, from));
    }
    moved.account_moved = account ? 1 : 0;
    return moved;
  });
}
