// Turns a stream of fills into round-trip trades. A trade runs from the fill
// that opens a position (size leaves 0) to the fill that brings it back to 0.
// A fill that crosses zero (long -> short) is split: one part closes the old
// trade, the rest opens a new one.

export interface FillInput {
  id: string;
  orderId: string;
  productId: number;
  symbol: string;
  contractType: string;
  contractValue: number;
  notionalType: string | null;
  side: "buy" | "sell";
  size: number;
  price: number;
  commission: number;
  creditsUsed: number;
  fillType: string;
  leverage: number | null;
  positionSizeAfter: number | null;
  realizedPnlAfter: number | null;
  ts: number;
  createdAt: string;
}

export type LegKind = "open" | "add" | "reduce" | "close";

export interface TradeLeg {
  fillId: string;
  orderId: string;
  /** Signed contracts: + bought, - sold. */
  qty: number;
  kind: LegKind;
  price: number;
  fee: number;
  ts: number;
  /** Average entry of the position just before this leg (for adds and exits). */
  avgEntryBefore: number | null;
}

export interface ReconstructedTrade {
  id: string;
  productId: number;
  symbol: string;
  contractType: string;
  contractValue: number;
  direction: "long" | "short";
  status: "open" | "closed";
  openedTs: number;
  closedTs: number | null;
  entryQty: number;
  exitQty: number;
  maxQty: number;
  avgEntry: number;
  avgExit: number | null;
  maxNotional: number;
  leverage: number | null;
  grossPnl: number;
  fees: number;
  feeCredits: number;
  deltaRealizedPnl: number | null;
  liquidated: boolean;
  openedByFlip: boolean;
  closedByFlip: boolean;
  legs: TradeLeg[];
  warnings: string[];
}

interface OpenPosition {
  trade: ReconstructedTrade;
  qty: number; // signed contracts currently held
  // Average cost of the contracts still held. Exits leave it unchanged, adds
  // re-average it; this is how Delta computes realized P&L.
  costBasis: number;
  entryCost: number; // sum(price * contracts) over entry legs
  exitCost: number; // sum(price * contracts) over exit legs
}

const sign = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** P&L of closing `contracts` (unsigned) of a position at `exitPrice`. */
export function closePnl(direction: 1 | -1, contracts: number, entry: number, exitPrice: number, contractValue: number, notionalType: string | null) {
  if (notionalType === "inverse") {
    // Inverse contracts are worth a fixed USD amount; P&L settles in the coin.
    return direction * contracts * contractValue * (1 / entry - 1 / exitPrice);
  }
  return direction * contracts * contractValue * (exitPrice - entry);
}

export function reconstructTrades(fills: FillInput[]): ReconstructedTrade[] {
  const sorted = [...fills].sort((a, b) => a.ts - b.ts || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const open = new Map<number, OpenPosition>();
  const trades: ReconstructedTrade[] = [];

  for (const fill of sorted) {
    let remaining = fill.side === "buy" ? fill.size : -fill.size;
    if (remaining === 0) continue;
    const feePerContract = fill.commission / fill.size;
    const creditPerContract = fill.creditsUsed / fill.size;
    let pos = open.get(fill.productId);

    // 1. Reduce or close the existing position.
    if (pos && sign(remaining) !== sign(pos.qty)) {
      const t = pos.trade;
      const contracts = Math.min(Math.abs(remaining), Math.abs(pos.qty));
      const signed = contracts * sign(remaining);
      const avgEntry = pos.costBasis;
      const closes = contracts === Math.abs(pos.qty);

      t.grossPnl += closePnl(t.direction === "long" ? 1 : -1, contracts, avgEntry, fill.price, fill.contractValue, fill.notionalType);
      t.fees += feePerContract * contracts;
      t.feeCredits += creditPerContract * contracts;
      t.exitQty += contracts;
      pos.exitCost += fill.price * contracts;
      pos.qty += signed;
      remaining -= signed;
      if (fill.fillType === "liquidation") t.liquidated = true;
      t.legs.push(leg(fill, signed, closes ? "close" : "reduce", feePerContract * contracts, avgEntry));

      if (closes) {
        t.status = "closed";
        t.closedTs = fill.ts;
        t.avgExit = pos.exitCost / t.exitQty;
        t.closedByFlip = remaining !== 0;
        // Delta's figure covers the position that this fill closed, unless the
        // same fill went on to open a new one.
        t.deltaRealizedPnl = t.closedByFlip ? null : fill.realizedPnlAfter;
        open.delete(fill.productId);
        pos = undefined;
      }
    }

    // 2. Open a new position or add to the existing one.
    if (remaining !== 0) {
      const contracts = Math.abs(remaining);
      if (!pos) {
        const openedByFlip = contracts !== fill.size;
        pos = {
          qty: 0,
          costBasis: 0,
          entryCost: 0,
          exitCost: 0,
          trade: {
            id: openedByFlip ? `${fill.id}-flip` : fill.id,
            productId: fill.productId,
            symbol: fill.symbol,
            contractType: fill.contractType,
            contractValue: fill.contractValue,
            direction: remaining > 0 ? "long" : "short",
            status: "open",
            openedTs: fill.ts,
            closedTs: null,
            entryQty: 0,
            exitQty: 0,
            maxQty: 0,
            avgEntry: 0,
            avgExit: null,
            maxNotional: 0,
            leverage: fill.leverage,
            grossPnl: 0,
            fees: 0,
            feeCredits: 0,
            deltaRealizedPnl: null,
            liquidated: false,
            openedByFlip,
            closedByFlip: false,
            legs: [],
            warnings: [],
          },
        };
        open.set(fill.productId, pos);
        trades.push(pos.trade);
      }
      const t = pos.trade;
      const isAdd = pos.qty !== 0;
      const avgBefore = isAdd ? pos.costBasis : null;
      const held = Math.abs(pos.qty);
      pos.costBasis = (pos.costBasis * held + fill.price * contracts) / (held + contracts);
      pos.qty += remaining;
      pos.entryCost += fill.price * contracts;
      t.entryQty += contracts;
      t.fees += feePerContract * contracts;
      t.feeCredits += creditPerContract * contracts;
      t.avgEntry = pos.entryCost / t.entryQty;
      t.maxQty = Math.max(t.maxQty, Math.abs(pos.qty));
      t.maxNotional = Math.max(t.maxNotional, Math.abs(pos.qty) * fill.contractValue * fill.price);
      if (fill.leverage !== null) t.leverage = Math.max(t.leverage ?? 0, fill.leverage);
      t.legs.push(leg(fill, remaining, isAdd ? "add" : "open", feePerContract * contracts, avgBefore));
    }

    // 3. Check our running position against the size Delta reported.
    const ours = open.get(fill.productId)?.qty ?? 0;
    if (fill.positionSizeAfter !== null && fill.positionSizeAfter !== ours) {
      const t = open.get(fill.productId)?.trade ?? trades[trades.length - 1];
      t.warnings.push(`After fill ${fill.id} Delta reports position ${fill.positionSizeAfter}, rebuilt position is ${ours}`);
    }
  }

  return trades;
}

function leg(fill: FillInput, qty: number, kind: LegKind, fee: number, avgEntryBefore: number | null): TradeLeg {
  return { fillId: fill.id, orderId: fill.orderId, qty, kind, price: fill.price, fee, ts: fill.ts, avgEntryBefore };
}
