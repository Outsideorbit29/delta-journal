import type { schema } from "@/db";
import type { DeltaFill, DeltaOrder, DeltaWalletTransaction } from "./types";

type FillRow = typeof schema.fills.$inferInsert;
type OrderRow = typeof schema.orders.$inferInsert;
type WalletRow = typeof schema.walletTransactions.$inferInsert;

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

export function toFillRow(f: DeltaFill): FillRow {
  const position = f.meta_data?.new_position;
  return {
    id: f.id,
    orderId: String(f.order_id),
    productId: f.product_id,
    symbol: f.product_symbol,
    contractType: f.product.contract_type,
    contractValue: Number(f.product.contract_value),
    notionalType: f.product.notional_type ?? null,
    side: f.side,
    size: Number(f.size),
    price: Number(f.price),
    commission: Number(f.commission),
    creditsUsed: num(f.credits_used) ?? 0,
    role: f.role ?? null,
    fillType: f.fill_type,
    leverage: num(f.meta_data?.leverage),
    source: f.meta_data?.source ?? null,
    positionSizeAfter: position?.size === undefined ? null : Number(position.size),
    realizedPnlAfter: num(position?.realized_pnl),
    createdAt: f.created_at,
    ts: Date.parse(f.created_at),
    raw: f,
  };
}

export function toOrderRow(o: DeltaOrder): OrderRow {
  return {
    id: o.id,
    productId: o.product_id,
    symbol: o.product_symbol,
    side: o.side,
    orderType: o.order_type,
    stopOrderType: o.stop_order_type,
    stopPrice: num(o.stop_price),
    limitPrice: num(o.limit_price),
    bracketStopLossPrice: num(o.bracket_stop_loss_price),
    bracketTakeProfitPrice: num(o.bracket_take_profit_price),
    size: Number(o.size),
    unfilledSize: num(o.unfilled_size),
    state: o.state,
    reduceOnly: o.reduce_only,
    cancellationReason: o.cancellation_reason,
    createdAt: o.created_at,
    ts: Date.parse(o.created_at),
    updatedTs: o.updated_at ? Date.parse(o.updated_at) : null,
    raw: o,
  };
}

export function toWalletRow(t: DeltaWalletTransaction): WalletRow {
  return {
    uuid: t.uuid,
    type: t.transaction_type,
    amount: Number(t.amount),
    balance: num(t.balance),
    assetSymbol: t.asset_symbol,
    productId: t.product_id,
    createdAt: t.created_at,
    ts: Date.parse(t.created_at),
    raw: t,
  };
}
