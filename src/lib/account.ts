import { eq, getTableName, inArray } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { OWNED } from "@/db/claim";
import { formatDateTime } from "@/lib/format";
import { isJournalTag } from "@/lib/tags";

// A user's right to their data (India's DPDP Act, 2023): a full copy on
// request, and erasure when they leave.

/**
 * Left out of every table: `raw` is Delta's own copy of each record, which the
 * other columns already hold in readable form (and Delta can provide). It
 * would triple the size of the download.
 */
const HIDDEN_EVERYWHERE = ["raw"];

/** Columns that are secrets or internal, never part of an export. */
const HIDDEN: Record<string, string[]> = {
  // Sealed to the server's key: useless to the user, and nobody should carry it around.
  delta_credentials: ["sealed"],
  broker_credentials: ["sealed"],
  // The device's push encryption keys.
  push_subscriptions: ["p256dh", "auth"],
  // A pending one-time link code.
  telegram_links: ["codeHash", "codeExpiresAt"],
};

export interface AccountExport {
  exportedAt: string;
  account: typeof schema.users.$inferSelect | null;
  /** Every table that holds the user's rows, by table name. */
  tables: Record<string, Record<string, unknown>[]>;
}

/** Everything stored about the user, as plain JSON. */
export async function exportAccount(db: Db, userId: string, now = Date.now()): Promise<AccountExport> {
  const [account] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const tables: AccountExport["tables"] = {};
  for (const table of OWNED) {
    const name = getTableName(table);
    const hidden = [...HIDDEN_EVERYWHERE, ...(HIDDEN[name] ?? [])];
    const rows = (await db.select().from(table).where(eq(table.userId, userId))) as Record<string, unknown>[];
    tables[name] = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !hidden.includes(k))));
  }
  return { exportedAt: new Date(now).toISOString(), account: account ?? null, tables };
}

const CSV_COLUMNS = [
  "trade_id", "account", "currency", "symbol", "direction", "status", "opened_ist", "closed_ist", "hold_seconds", "max_qty", "avg_entry", "avg_exit",
  "leverage", "gross_pnl", "fees", "funding", "liquidation_fees", "net_pnl", "exit_reason", "stop_price", "risk", "r_multiple",
  "tags", "setup", "emotions", "mistakes", "followed_plan", "rating", "planned_stop", "planned_target", "notes",
] as const;

/** One row per trade with its journal, for a spreadsheet. Oldest first; times in IST. */
export async function tradesCsv(db: Db, userId: string): Promise<string> {
  const trades = await db.select().from(schema.trades).where(eq(schema.trades.userId, userId)).orderBy(schema.trades.openedTs);
  const accounts = new Map((await db.select().from(schema.accounts).where(eq(schema.accounts.userId, userId))).map((a) => [a.id, a]));
  const journals = new Map(
    (await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.userId, userId))).map((j) => [j.tradeId, j]),
  );
  const tags = new Map<string, string[]>();
  for (const t of await db.select().from(schema.tradeTags).where(eq(schema.tradeTags.userId, userId))) {
    // Journal answers already have their own columns.
    if (!isJournalTag(t.tag)) tags.set(t.tradeId, [...(tags.get(t.tradeId) ?? []), t.tag]);
  }

  const lines = [CSV_COLUMNS.join(",")];
  for (const t of trades) {
    const j = journals.get(t.id);
    const row = [
      t.id, accounts.get(t.accountId)?.label, accounts.get(t.accountId)?.currency ?? "USD", t.symbol, t.direction, t.status, formatDateTime(t.openedTs), t.closedTs ? formatDateTime(t.closedTs) : "",
      t.holdSeconds, t.maxQty, t.avgEntry, t.avgExit, t.leverage, t.grossPnl, t.fees, t.funding, t.liquidationFees, t.netPnl,
      t.exitReason, t.stopPrice, t.riskAmount, t.rMultiple, (tags.get(t.id) ?? []).sort().join(" "),
      j?.setup, j?.emotions.join(" "), j?.mistakes.join(" "), j?.followedPlan == null ? "" : j.followedPlan ? "yes" : "no",
      j?.rating, j?.plannedStop, j?.plannedTarget, j?.notes,
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Quotes a cell when needed, and defuses cells a spreadsheet would run as a
 * formula (a note starting with "=" or "+"), since notes are free text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The word the user types to confirm, so a stray tap can never delete an account. */
export const DELETE_CONFIRMATION = "DELETE";

/**
 * Erases the user's data: their Delta key first (so the server stops syncing
 * them), then every row they own, the chart cache for their trades, their
 * rate-limit counters and their account row. One transaction.
 */
export async function deleteAccountData(db: Db, userId: string): Promise<Record<string, number>> {
  return db.transaction(async (tx) => {
    const deleted: Record<string, number> = {};
    const tradeIds = (await tx.select({ id: schema.trades.id }).from(schema.trades).where(eq(schema.trades.userId, userId))).map((t) => t.id);
    let candles = 0;
    // In chunks, to stay under SQLite's limit on query parameters.
    for (let i = 0; i < tradeIds.length; i += 500) {
      const chunk = tradeIds.slice(i, i + 500);
      candles += (await tx.delete(schema.tradeCandles).where(inArray(schema.tradeCandles.tradeId, chunk)).returning({ id: schema.tradeCandles.tradeId })).length;
    }
    deleted.trade_candles = candles;
    // Access first, so a sync running right now cannot write anything more.
    const access = [schema.deltaCredentials, schema.brokerCredentials] as const;
    const ordered = [...access, ...OWNED.filter((t) => !(access as readonly unknown[]).includes(t))];
    for (const table of ordered) {
      deleted[getTableName(table)] = (await tx.delete(table).where(eq(table.userId, userId)).returning({ userId: table.userId })).length;
    }
    deleted.rate_limits = (await tx.delete(schema.rateLimits).where(eq(schema.rateLimits.subject, userId)).returning({ s: schema.rateLimits.subject })).length;
    deleted.users = (await tx.delete(schema.users).where(eq(schema.users.id, userId)).returning({ id: schema.users.id })).length;
    return deleted;
  });
}

/** Whether a user still has an account row (deleted accounts do not). */
export async function accountExists(db: Db, userId: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId));
  return !!row;
}
