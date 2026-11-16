// Records from Dhan's API v2 (https://dhanhq.co/docs/v2/), only the fields we use. Numbers may arrive as strings.

type Num = number | string | null | undefined;

export interface DhanTrade {
  dhanClientId?: string;
  orderId: string;
  exchangeOrderId?: string;
  /** A small sequence number within the order, not unique on its own. */
  exchangeTradeId: string | number;
  transactionType: "BUY" | "SELL";
  /** NSE_EQ, BSE_EQ, NSE_FNO, BSE_FNO, MCX_COMM… */
  exchangeSegment: string;
  /** INTRADAY, CNC (delivery), MARGIN, MTF… (sometimes missing). */
  productType: string | null;
  orderType?: string;
  tradingSymbol?: string | null;
  customSymbol?: string | null;
  securityId: string | number;
  tradedQuantity: Num;
  tradedPrice: Num;
  isin?: string | null;
  /** EQUITY, OPTIDX, OPTSTK, FUTIDX, FUTSTK… */
  instrument: string | null;
  // Charges, in the trade history only.
  sebiTax?: Num;
  stt?: Num;
  brokerageCharges?: Num;
  serviceTax?: Num;
  exchangeTransactionCharges?: Num;
  stampDuty?: Num;
  /** "2026-11-14T10:15:03", IST. */
  exchangeTime?: string | null;
  createTime?: string | null;
  updateTime?: string | null;
  drvExpiryDate?: string | null;
  drvOptionType?: string | null;
  drvStrikePrice?: Num;
}

export interface DhanProfile {
  dhanClientId: string;
  /** "17/11/2026 10:36", IST. */
  tokenValidity: string;
  activeSegment?: string;
}
