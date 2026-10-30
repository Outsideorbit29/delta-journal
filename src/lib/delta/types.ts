// Shapes of the Delta Exchange India REST records we read. Numbers arrive as
// strings in most fields, so they are typed that way and parsed on ingest.
// Only the fields the journal uses are listed; the rest is kept in `raw`.

export interface DeltaPage {
  meta?: { after?: string | null; before?: string | null; limit?: number; total_count?: number };
}

export interface DeltaProductRef {
  id: number;
  symbol: string;
  contract_type: string;
  contract_value: string;
  notional_type?: string;
}

export interface DeltaFill {
  id: string;
  order_id: string;
  product_id: number;
  product_symbol: string;
  product: DeltaProductRef;
  side: "buy" | "sell";
  size: string | number;
  price: string;
  commission: string;
  credits_used?: string;
  role?: string;
  fill_type: string;
  created_at: string;
  meta_data?: {
    leverage?: string;
    source?: string;
    new_position?: {
      size?: number | string;
      realized_pnl?: string;
      total_commission_paid?: string;
    };
  };
}

export interface DeltaOrder {
  id: number;
  product_id: number;
  product_symbol: string;
  side: string;
  order_type: string;
  stop_order_type: string | null;
  stop_price: string | null;
  limit_price: string | null;
  bracket_stop_loss_price: string | null;
  bracket_take_profit_price: string | null;
  size: number | string;
  unfilled_size: number | string | null;
  state: string;
  reduce_only: boolean | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface DeltaWalletTransaction {
  uuid: string;
  transaction_type: string;
  amount: string;
  balance: string | null;
  asset_symbol: string;
  product_id: number | null;
  created_at: string;
}
