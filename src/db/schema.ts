import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Raw data synced from Delta. Rows are upserted by Delta's own ids, so a sync
// can safely be re-run. `raw` keeps the full API record for anything we have
// not modelled yet.
// ---------------------------------------------------------------------------

export const fills = sqliteTable(
  "fills",
  {
    id: text("id").primaryKey(),
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
  (t) => [index("fills_product_ts").on(t.productId, t.ts)],
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey(),
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
  (t) => [index("orders_product_ts").on(t.productId, t.ts)],
);

export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    uuid: text("uuid").primaryKey(),
    type: text("type").notNull(),
    amount: real("amount").notNull(),
    balance: real("balance"),
    assetSymbol: text("asset_symbol").notNull(),
    productId: integer("product_id"),
    createdAt: text("created_at").notNull(),
    ts: integer("ts").notNull(),
    raw: text("raw", { mode: "json" }).notNull(),
  },
  (t) => [index("wallet_type_ts").on(t.type, t.ts)],
);

export const syncState = sqliteTable("sync_state", {
  resource: text("resource").primaryKey(),
  lastTs: integer("last_ts"),
  lastRunAt: integer("last_run_at"),
  lastCount: integer("last_count"),
  lastError: text("last_error"),
});

// ---------------------------------------------------------------------------
// Derived data, rebuilt from the raw tables. A trade's id is the id of the
// fill that opened it, so it stays stable across rebuilds and journal entries
// can refer to it.
// ---------------------------------------------------------------------------

export const trades = sqliteTable(
  "trades",
  {
    id: text("id").primaryKey(),
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
  (t) => [index("trades_opened").on(t.openedTs)],
);

export const tradeFills = sqliteTable(
  "trade_fills",
  {
    tradeId: text("trade_id").notNull(),
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
    tag: text("tag").notNull(),
    source: text("source", { enum: ["auto", "user"] }).notNull(),
    detail: text("detail"),
  },
  (t) => [primaryKey({ columns: [t.tradeId, t.tag] }), index("trade_tags_tag").on(t.tag)],
);

// What you write about a trade. Keyed by trade id, which is stable across
// rebuilds, and never touched by a sync. Choices are keys from src/lib/journal/vocab.ts.
export const journalEntries = sqliteTable("journal_entries", {
  tradeId: text("trade_id").primaryKey(),
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
