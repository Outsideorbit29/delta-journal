import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Owner of rows created before accounts existed. `npm run claim-legacy` hands
 * them to a real user; no signed-in user ever has this id.
 */
export const LEGACY_USER = "legacy";

/** Every per-user row carries its owner's id (the Clerk user id). */
const ownerId = () => text("user_id").notNull().default(LEGACY_USER);

// ---------------------------------------------------------------------------
// People who signed up. The id is the Clerk user id.
// ---------------------------------------------------------------------------

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  createdAt: integer("created_at").notNull(),
  /** "founder" for the first 10 free users; paid plans come later. */
  plan: text("plan").notNull().default("founder"),
  /** Free access ends at this time (ms); null means no limit. */
  accessUntil: integer("access_until"),
});

// ---------------------------------------------------------------------------
// Raw data synced from Delta. Rows are upserted by Delta's own ids, so a sync
// can safely be re-run. `raw` keeps the full API record for anything we have
// not modelled yet.
// ---------------------------------------------------------------------------

export const fills = sqliteTable(
  "fills",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    orderId: text("order_id").notNull(),
    productId: integer("product_id").notNull(),
    symbol: text("symbol").notNull(),
    contractType: text("contract_type").notNull(),
    contractValue: real("contract_value").notNull(),
    notionalType: text("notional_type"),
    side: text("side", { enum: ["buy", "sell"] }).notNull(),
    size: integer("size").notNull(),
    price: real("price").notNull(),
    commission: real("commission").notNull(),
    creditsUsed: real("credits_used").notNull(),
    role: text("role"),
    fillType: text("fill_type").notNull(),
    leverage: real("leverage"),
    source: text("source"),
    // Position state Delta reports right after this fill (signed: short < 0).
    positionSizeAfter: integer("position_size_after"),
    realizedPnlAfter: real("realized_pnl_after"),
    createdAt: text("created_at").notNull(),
    ts: integer("ts").notNull(),
    raw: text("raw", { mode: "json" }).notNull(),
  },
  (t) => [index("fills_user_product_ts").on(t.userId, t.productId, t.ts)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey(),
    userId: ownerId(),
    productId: integer("product_id").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    orderType: text("order_type").notNull(),
    stopOrderType: text("stop_order_type"),
    stopPrice: real("stop_price"),
    limitPrice: real("limit_price"),
    bracketStopLossPrice: real("bracket_stop_loss_price"),
    bracketTakeProfitPrice: real("bracket_take_profit_price"),
    size: integer("size").notNull(),
    unfilledSize: integer("unfilled_size"),
    state: text("state").notNull(),
    reduceOnly: integer("reduce_only", { mode: "boolean" }),
    cancellationReason: text("cancellation_reason"),
    createdAt: text("created_at").notNull(),
    ts: integer("ts").notNull(),
    updatedTs: integer("updated_ts"),
    raw: text("raw", { mode: "json" }).notNull(),
  },
  (t) => [index("orders_user_product_ts").on(t.userId, t.productId, t.ts)],
);

export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    uuid: text("uuid").primaryKey(),
    userId: ownerId(),
    type: text("type").notNull(),
    amount: real("amount").notNull(),
    balance: real("balance"),
    assetSymbol: text("asset_symbol").notNull(),
    productId: integer("product_id"),
    createdAt: text("created_at").notNull(),
    ts: integer("ts").notNull(),
    raw: text("raw", { mode: "json" }).notNull(),
  },
  (t) => [index("wallet_user_type_ts").on(t.userId, t.type, t.ts)],
);

export const syncState = sqliteTable(
  "sync_state",
  {
    userId: ownerId(),
    resource: text("resource").notNull(),
    lastTs: integer("last_ts"),
    lastRunAt: integer("last_run_at"),
    lastCount: integer("last_count"),
    lastError: text("last_error"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.resource] })],
);

// ---------------------------------------------------------------------------
// Derived data, rebuilt from the raw tables. A trade's id is the id of the
// fill that opened it, so it stays stable across rebuilds and journal entries
// can refer to it.
// ---------------------------------------------------------------------------

export const trades = sqliteTable(
  "trades",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    productId: integer("product_id").notNull(),
    symbol: text("symbol").notNull(),
    contractType: text("contract_type").notNull(),
    direction: text("direction", { enum: ["long", "short"] }).notNull(),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    openedTs: integer("opened_ts").notNull(),
    closedTs: integer("closed_ts"),
    holdSeconds: integer("hold_seconds"),
    // Sizes are in contracts.
    entryQty: integer("entry_qty").notNull(),
    exitQty: integer("exit_qty").notNull(),
    maxQty: integer("max_qty").notNull(),
    contractValue: real("contract_value").notNull(),
    avgEntry: real("avg_entry").notNull(),
    avgExit: real("avg_exit"),
    maxNotional: real("max_notional").notNull(),
    leverage: real("leverage"),
    marginUsed: real("margin_used"),
    walletBalanceAtOpen: real("wallet_balance_at_open"),
    grossPnl: real("gross_pnl").notNull(),
    fees: real("fees").notNull(),
    feeCredits: real("fee_credits").notNull(),
    funding: real("funding").notNull(),
    liquidationFees: real("liquidation_fees").notNull().default(0),
    // gross - fees - liquidationFees + funding
    netPnl: real("net_pnl").notNull(),
    // Delta's own realized P&L for the position, used to check our numbers.
    deltaRealizedPnl: real("delta_realized_pnl"),
    pnlMatchesDelta: integer("pnl_matches_delta", { mode: "boolean" }),
    fillCount: integer("fill_count").notNull(),
    addCount: integer("add_count").notNull(),
    reduceCount: integer("reduce_count").notNull(),
    exitReason: text("exit_reason", { enum: ["stop", "target", "liquidation", "manual", "flip"] }),
    stopPrice: real("stop_price"),
    stopPlacedAfterSec: integer("stop_placed_after_sec"),
    stopMovedAfterSec: integer("stop_moved_after_sec"),
    // Risk from the stop order on Delta (null if none, or if it was moved).
    stopOrderRisk: real("stop_order_risk"),
    // Risk used for R: the journal's planned stop if given, else stopOrderRisk.
    riskAmount: real("risk_amount"),
    riskSource: text("risk_source", { enum: ["journal", "stop_order"] }),
    rMultiple: real("r_multiple"),
    warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
  },
  (t) => [index("trades_user_opened").on(t.userId, t.openedTs)],
);

export const tradeFills = sqliteTable(
  "trade_fills",
  {
    tradeId: text("trade_id").notNull(),
    userId: ownerId(),
    fillId: text("fill_id").notNull(),
    // Signed contracts of this fill that belong to the trade (a flip fill is split).
    qty: integer("qty").notNull(),
    kind: text("kind", { enum: ["open", "add", "reduce", "close"] }).notNull(),
    price: real("price").notNull(),
    fee: real("fee").notNull(),
    ts: integer("ts").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.fillId] })],
);

// Price candles around each trade, cached so the chart only calls Delta once
// per closed trade. Times are Unix seconds (UTC), as Delta returns them.
export const tradeCandles = sqliteTable("trade_candles", {
  tradeId: text("trade_id").primaryKey(),
  symbol: text("symbol").notNull(),
  resolution: text("resolution").notNull(),
  startSec: integer("start_sec").notNull(),
  endSec: integer("end_sec").notNull(),
  candles: text("candles", { mode: "json" }).$type<Candle[]>().notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const tradeTags = sqliteTable(
  "trade_tags",
  {
    tradeId: text("trade_id").notNull(),
    userId: ownerId(),
    tag: text("tag").notNull(),
    source: text("source", { enum: ["auto", "user"] }).notNull(),
    detail: text("detail"),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tag] }), index("trade_tags_user_tag").on(t.userId, t.tag)],
);

// What you write about a trade. Keyed by trade id, which is stable across
// rebuilds, and never touched by a sync. Choices are keys from src/lib/journal/vocab.ts.
export const journalEntries = sqliteTable("journal_entries", {
  tradeId: text("trade_id").primaryKey(),
  userId: ownerId(),
  setup: text("setup"),
  emotions: text("emotions", { mode: "json" }).$type<string[]>().notNull(),
  mistakes: text("mistakes", { mode: "json" }).$type<string[]>().notNull(),
  followedPlan: integer("followed_plan", { mode: "boolean" }),
  rating: integer("rating"),
  notes: text("notes"),
  plannedStop: real("planned_stop"),
  plannedTarget: real("planned_target"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Telegram messages the bot sent, so a button tap or a reply can be traced
// back to its trade. Also marks which closed trades were already announced.
export const telegramMessages = sqliteTable(
  "telegram_messages",
  {
    chatId: text("chat_id").notNull(),
    messageId: integer("message_id").notNull(),
    userId: ownerId(),
    tradeId: text("trade_id").notNull(),
    kind: text("kind", { enum: ["trade", "note_prompt", "suggestion"] }).notNull(),
    // For "suggestion" messages: the AI-suggested answers waiting for a tap.
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.chatId, t.messageId] }), index("telegram_messages_trade").on(t.tradeId)],
);

// Small key/value store for process state. userId "" holds process-wide state
// (such as the Telegram update offset); otherwise the value belongs to that user.
export const appState = sqliteTable(
  "app_state",
  {
    userId: text("user_id").notNull().default(""),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// AI coaching reviews, kept so you can look back at past advice.
export const aiReviews = sqliteTable(
  "ai_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: ownerId(),
    periodStart: integer("period_start").notNull(),
    periodEnd: integer("period_end").notNull(),
    tradeCount: integer("trade_count").notNull(),
    model: text("model").notNull(),
    review: text("review", { mode: "json" }).$type<import("@/lib/ai/review").Review>().notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("ai_reviews_user_created").on(t.userId, t.createdAt)],
);

// Browsers (phones) that asked for push notifications. The endpoint is the
// push service URL for that browser; p256dh/auth encrypt the payload.
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: ownerId(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  label: text("label"),
  createdAt: integer("created_at").notNull(),
  lastSentAt: integer("last_sent_at"),
  failures: integer("failures").notNull().default(0),
});
