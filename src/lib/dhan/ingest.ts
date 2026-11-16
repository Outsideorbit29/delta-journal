import type { schema } from "@/db";
import type { DhanTrade } from "./types";

type FillRow = typeof schema.fills.$inferInsert;

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : 0;
  return Number.isFinite(n) ? n : 0;
};

/** Dhan's statutory charges and brokerage on one trade, in rupees. */
export function dhanCharges(t: DhanTrade): number {
  return num(t.brokerageCharges) + num(t.stt) + num(t.exchangeTransactionCharges) + num(t.sebiTax) + num(t.stampDuty) + num(t.serviceTax);
}

/** Whether Dhan has booked the charges yet (today's trade book has none; the history does). */
export const hasCharges = (t: DhanTrade) =>
  ["brokerageCharges", "stt", "exchangeTransactionCharges", "sebiTax", "stampDuty", "serviceTax"].some((k) => t[k as keyof DhanTrade] != null);

const CONTRACT_TYPES: Record<string, string> = {
  EQUITY: "equity",
  OPTIDX: "options",
  OPTSTK: "options",
  OPTFUT: "options",
  OPTCUR: "options",
  FUTIDX: "futures",
  FUTSTK: "futures",
  FUTCOM: "futures",
  FUTCUR: "futures",
};

/** Dhan's IST "2026-11-14T10:15:03" (or "2026-11-14 10:15:03") as an ISO time with its offset. */
function istIso(time: string): string {
  const t = time.trim().replace(" ", "T");
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(t) ? t : `${t}+05:30`;
}

/**
 * The instrument a position is matched on. A share has one ISIN but a different security id on NSE and BSE, so
 * shares bought on one exchange and sold on the other must meet: for equity the id is the ISIN's nine-character
 * national code read as a base-36 number (unique, and far above Dhan's security ids). Derivatives keep the
 * security id, which names one contract.
 */
export function dhanInstrumentId(t: Pick<DhanTrade, "securityId" | "isin" | "instrument">): number {
  const isin = (t.isin ?? "").trim().toUpperCase();
  if ((t.instrument ?? "").toUpperCase() === "EQUITY" && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return parseInt(isin.slice(2, 11), 36);
  return Number(t.securityId);
}

/** Our id for a Dhan trade: the order plus the trade's number within it, prefixed so it never meets a Delta id. */
export const dhanFillId = (t: Pick<DhanTrade, "orderId" | "exchangeTradeId">) => `dhan:${t.orderId}:${t.exchangeTradeId}`;

/**
 * A Dhan trade as a fill. Quantities are in shares or units (lots already multiplied out), so a contract is
 * worth one unit. The product type (intraday or delivery), segment and expiry stay in `raw` for now.
 */
export function toDhanFillRow(t: DhanTrade): FillRow {
  const time = t.exchangeTime && t.exchangeTime !== "NA" ? t.exchangeTime : t.createTime;
  if (!time) throw new Error(`Dhan trade ${dhanFillId(t)} has no time`);
  const createdAt = istIso(time);
  const ts = Date.parse(createdAt);
  if (!Number.isFinite(ts)) throw new Error(`Dhan trade ${dhanFillId(t)} has an unreadable time`);
  const productId = dhanInstrumentId(t);
  if (!Number.isSafeInteger(productId)) throw new Error(`Dhan trade ${dhanFillId(t)} has an unexpected security id`);
  const instrument = (t.instrument ?? "").toUpperCase();
  return {
    id: dhanFillId(t),
    orderId: `dhan:${t.orderId}`,
    productId,
    symbol: (t.customSymbol || t.tradingSymbol || String(t.securityId)).trim(),
    contractType: CONTRACT_TYPES[instrument] ?? (instrument.toLowerCase() || "unknown"),
    contractValue: 1,
    notionalType: null,
    side: t.transactionType === "SELL" ? "sell" : "buy",
    size: Math.round(num(t.tradedQuantity)),
    price: num(t.tradedPrice),
    commission: dhanCharges(t),
    creditsUsed: 0,
    role: null,
    fillType: "normal",
    leverage: null,
    source: null,
    positionSizeAfter: null,
    realizedPnlAfter: null,
    createdAt,
    ts,
    raw: t,
  };
}
