import { count } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { schema, type Db } from "@/db";

// Order does not matter (there are no foreign keys), but raw data goes first.
const TABLES: [string, SQLiteTable, number][] = [
  ["fills", schema.fills, 100],
  ["orders", schema.orders, 100],
  ["wallet_transactions", schema.walletTransactions, 100],
  ["sync_state", schema.syncState, 100],
  ["trades", schema.trades, 100],
  ["trade_fills", schema.tradeFills, 200],
  ["trade_tags", schema.tradeTags, 200],
  ["journal_entries", schema.journalEntries, 100],
  ["trade_candles", schema.tradeCandles, 5],
  ["telegram_messages", schema.telegramMessages, 200],
  ["app_state", schema.appState, 100],
  ["ai_reviews", schema.aiReviews, 20],
];

/**
 * Copies every table from `from` into `to`, which must be empty. Each table's
 * row count is checked afterwards. Returns the rows copied per table.
 */
export async function copyDatabase(from: Db, to: Db): Promise<Record<string, number>> {
  for (const [name, table] of TABLES) {
    const [{ n }] = await to.select({ n: count() }).from(table);
    if (n > 0) throw new Error(`The target database already has data (${n} rows in ${name}). Nothing was copied.`);
  }
  const copied: Record<string, number> = {};
  for (const [name, table, batch] of TABLES) {
    const rows = await from.select().from(table);
    for (let i = 0; i < rows.length; i += batch) await to.insert(table).values(rows.slice(i, i + batch));
    const [{ n }] = await to.select({ n: count() }).from(table);
    if (n !== rows.length) throw new Error(`${name}: copied ${n} of ${rows.length} rows`);
    copied[name] = n;
  }
  return copied;
}
