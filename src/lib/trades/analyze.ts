// Adds what fills alone cannot tell us: funding paid while the trade was open,
// the stop-loss behind it, how it was exited, the account size at entry, and
// the automatic behaviour tags.

import { journalConfig, type JournalConfig } from "@/lib/config";
import { riskAtStop } from "@/lib/journal/entry";
import type { ReconstructedTrade } from "./reconstruct";

export interface OrderInput {
  id: number;
  productId: number;
  side: string;
  stopOrderType: string | null;
  stopPrice: number | null;
  bracketStopLossPrice: number | null;
  size: number;
  ts: number;
  /** When the order was last edited. Delta keeps only the edited price, not the original. */
  editedTs: number | null;
}

export interface WalletInput {
  type: string;
  amount: number;
  balance: number | null;
  assetSymbol: string;
  productId: number | null;
  ts: number;
}

export interface AutoTag {
  tag: string;
  detail: string | null;
}

export type ExitReason = "stop" | "target" | "liquidation" | "manual" | "flip";

export interface AnalyzedTrade extends ReconstructedTrade {
  holdSeconds: number | null;
  funding: number;
  liquidationFees: number;
  netPnl: number;
  pnlMatchesDelta: boolean | null;
  addCount: number;
  reduceCount: number;
  walletBalanceAtOpen: number | null;
  marginUsed: number | null;
  exitReason: ExitReason | null;
  /** Last price of the first stop-loss (the original is lost if it was moved). */
  stopPrice: number | null;
  stopPlacedAfterSec: number | null;
  stopMovedAfterSec: number | null;
  /** Only known when the stop was never moved. */
  riskAmount: number | null;
  rMultiple: number | null;
  tags: AutoTag[];
}

const MINUTE = 60_000;
const IST_OFFSET_MS = 330 * MINUTE;
// Delta books funding and liquidation fees a few milliseconds after the
// closing fill, and fee-credit payments right after the fill they paid for.
const SETTLE_GRACE_MS = 5_000;

export function analyzeTrades(
  trades: ReconstructedTrade[],
  orders: OrderInput[],
  wallet: WalletInput[],
  config: JournalConfig = journalConfig,
): AnalyzedTrade[] {
  const ordersById = new Map(orders.map((o) => [String(o.id), o]));
  const stopsByProduct = groupBy(
    orders.filter((o) => o.stopOrderType === "stop_loss_order" && o.stopPrice !== null).sort((a, b) => a.ts - b.ts),
    (o) => o.productId,
  );
  const charges = assignWalletCharges(trades, wallet);
  const balances = wallet.filter((w) => w.balance !== null && w.assetSymbol === "USD").sort((a, b) => a.ts - b.ts);

  const analyzed = [...trades]
    .sort((a, b) => a.openedTs - b.openedTs)
    .map((t): AnalyzedTrade => {
      const { funding, liquidationFees, feeCredits } = charges.get(t.id) ?? { funding: 0, liquidationFees: 0, feeCredits: 0 };
      const netPnl = t.grossPnl - t.fees - liquidationFees + funding;
      const walletBalanceAtOpen = lastAtOrBefore(balances, t.openedTs)?.balance ?? null;
      const marginUsed = t.leverage ? t.maxNotional / t.leverage : null;
      const stop = findStop(t, stopsByProduct.get(t.productId) ?? [], ordersById, config);
      const riskAmount = stop && stop.editedTs === null ? riskOf(t, stop) : null;

      return {
        ...t,
        holdSeconds: t.closedTs === null ? null : Math.round((t.closedTs - t.openedTs) / 1000),
        funding,
        liquidationFees,
        feeCredits: t.feeCredits + feeCredits,
        netPnl,
        pnlMatchesDelta: t.deltaRealizedPnl === null ? null : Math.abs(t.grossPnl - t.deltaRealizedPnl) <= Math.max(0.01, Math.abs(t.grossPnl) * 1e-6),
        addCount: t.legs.filter((l) => l.kind === "add").length,
        reduceCount: t.legs.filter((l) => l.kind === "reduce").length,
        walletBalanceAtOpen,
        marginUsed,
        exitReason: exitReasonOf(t, ordersById),
        stopPrice: stop?.price ?? null,
        stopPlacedAfterSec: stop ? Math.max(0, Math.round((stop.ts - t.openedTs) / 1000)) : null,
        stopMovedAfterSec: stop?.editedTs ? Math.max(0, Math.round((stop.editedTs - t.openedTs) / 1000)) : null,
        riskAmount,
        rMultiple: riskAmount && t.status === "closed" ? netPnl / riskAmount : null,
        tags: [],
      };
    });

  addBehaviourTags(analyzed, config);
  return analyzed;
}

interface Charges {
  funding: number;
  liquidationFees: number;
  feeCredits: number;
}

/**
 * Gives each wallet charge to exactly one trade. Funding and liquidation fees
 * carry a product: they belong to the trade on that product that closed just
 * before (settlement at close), otherwise to the one open at the time.
 * Fee-credit payments carry no product, so they go to the trade with the
 * nearest fill.
 */
function assignWalletCharges(trades: ReconstructedTrade[], wallet: WalletInput[]): Map<string, Charges> {
  const charges = new Map<string, Charges>();
  const add = (tradeId: string, key: keyof Charges, amount: number) => {
    const c = charges.get(tradeId) ?? { funding: 0, liquidationFees: 0, feeCredits: 0 };
    c[key] += amount;
    charges.set(tradeId, c);
  };
  const byProduct = groupBy(trades, (t) => t.productId);
  const legs = trades.flatMap((t) => t.legs.map((l) => ({ tradeId: t.id, ts: l.ts }))).sort((a, b) => a.ts - b.ts);

  for (const w of wallet) {
    if (w.type === "funding" || w.type === "liquidation_fee") {
      const candidates = byProduct.get(w.productId ?? -1) ?? [];
      const target =
        candidates.find((t) => t.closedTs !== null && t.closedTs <= w.ts && w.ts - t.closedTs <= SETTLE_GRACE_MS) ??
        candidates.find((t) => t.openedTs <= w.ts && (t.closedTs === null || w.ts <= t.closedTs));
      if (target) add(target.id, w.type === "funding" ? "funding" : "liquidationFees", w.type === "funding" ? w.amount : -w.amount);
    } else if (w.type === "trading_fee_credits_paid") {
      const leg = nearest(legs, w.ts);
      if (leg && Math.abs(leg.ts - w.ts) <= SETTLE_GRACE_MS) add(leg.tradeId, "feeCredits", -w.amount);
    }
  }
  return charges;
}

interface Stop {
  price: number;
  size: number;
  ts: number;
  editedTs: number | null;
}

/** The first stop-loss protecting the trade: a bracket on the entry order, or a separate stop order. */
function findStop(t: ReconstructedTrade, stops: OrderInput[], ordersById: Map<string, OrderInput>, config: JournalConfig): Stop | null {
  const entryOrder = ordersById.get(t.legs[0]?.orderId ?? "");
  if (entryOrder?.bracketStopLossPrice) {
    return { price: entryOrder.bracketStopLossPrice, size: t.legs[0].qty, ts: t.openedTs, editedTs: entryOrder.editedTs };
  }
  const exitSide = t.direction === "long" ? "sell" : "buy";
  const end = t.closedTs ?? Number.POSITIVE_INFINITY;
  const first = stops.find((o) => o.side === exitSide && o.ts >= t.openedTs - config.stopLeadSeconds * 1000 && o.ts <= end);
  return first ? { price: first.stopPrice!, size: first.size, ts: first.ts, editedTs: first.editedTs } : null;
}

/** Money lost if the first stop had been hit, or null when the stop was at or past break-even. */
function riskOf(t: ReconstructedTrade, stop: Stop): number | null {
  const contracts = stop.size > 0 ? Math.min(Math.abs(stop.size), t.maxQty) : t.maxQty;
  return riskAtStop(t, stop.price, contracts);
}

function exitReasonOf(t: ReconstructedTrade, ordersById: Map<string, OrderInput>): ExitReason | null {
  if (t.status !== "closed") return null;
  if (t.liquidated) return "liquidation";
  if (t.closedByFlip) return "flip";
  const closing = t.legs[t.legs.length - 1];
  const type = ordersById.get(closing.orderId)?.stopOrderType;
  if (type === "stop_loss_order" || type === "trailing_stop_order") return "stop";
  if (type === "take_profit_order") return "target";
  return "manual";
}

function addBehaviourTags(trades: AnalyzedTrade[], c: JournalConfig) {
  const closed = trades.filter((t) => t.closedTs !== null).sort((a, b) => a.closedTs! - b.closedTs!);

  trades.forEach((t, i) => {
    const tag = (name: string, detail: string | null = null) => t.tags.push({ tag: name, detail });

    // When and how long.
    const utcHour = new Date(t.openedTs).getUTCHours();
    const session = c.sessions.find((s) => utcHour >= s.fromUtcHour && utcHour < s.toUtcHour);
    if (session) tag(session.tag);
    const istDay = new Date(t.openedTs + IST_OFFSET_MS).getUTCDay();
    if (istDay === 0 || istDay === 6) tag("weekend");
    if (t.holdSeconds !== null) {
      if (t.holdSeconds < c.scalpMaxMinutes * 60) tag("hold:scalp");
      else if (t.holdSeconds < c.intradayMaxHours * 3600) tag("hold:intraday");
      else tag("hold:swing");
    }

    // What happened just before entry.
    const before = closed.filter((p) => p.closedTs! <= t.openedTs && p.id !== t.id);
    const last = before[before.length - 1];
    if (last && last.netPnl < 0) {
      const gapMin = (t.openedTs - last.closedTs!) / MINUTE;
      if (gapMin <= c.afterLossMinutes) {
        tag("after_loss", `${Math.round(gapMin)} min after a ${money(last.netPnl)} loss`);
        if (t.maxNotional >= last.maxNotional * c.sizedUpFactor) {
          tag("sized_up_after_loss", `${(t.maxNotional / last.maxNotional).toFixed(1)}x the size of that loss`);
        }
      }
    }
    const streak = runLength(before, (p) => p.netPnl < 0);
    if (streak >= c.streakLength) tag("loss_streak", `after ${streak} losses in a row`);
    const winStreak = runLength(before, (p) => p.netPnl > 0);
    if (winStreak >= c.streakLength) tag("win_streak", `after ${winStreak} wins in a row`);

    const recent = trades.slice(0, i).filter((p) => p.openedTs >= t.openedTs - c.overtradingWindowMinutes * MINUTE);
    if (recent.length >= c.overtradingCount) {
      tag("overtrading", `${recent.length} other trades opened in the previous ${c.overtradingWindowMinutes} min`);
    }

    // Size and risk.
    const history = trades.slice(Math.max(0, i - c.oversizedLookback), i).map((p) => p.maxNotional);
    if (history.length >= c.oversizedMinHistory) {
      const typical = median(history);
      if (typical > 0 && t.maxNotional >= typical * c.oversizedFactor) {
        tag("oversized", `${(t.maxNotional / typical).toFixed(1)}x your recent median size`);
      }
    }
    if (t.leverage !== null && t.leverage >= c.highLeverage) tag("high_leverage", `${t.leverage}x`);
    if (t.marginUsed !== null && t.walletBalanceAtOpen) {
      const share = t.marginUsed / t.walletBalanceAtOpen;
      if (share >= c.heavyMarginShare) tag("heavy_margin", `margin was ${Math.round(share * 100)}% of the wallet`);
    }

    // Managing the position.
    const addedToLoser = t.legs.some(
      (l) => l.kind === "add" && l.avgEntryBefore !== null && (t.direction === "long" ? l.price < l.avgEntryBefore : l.price > l.avgEntryBefore),
    );
    if (addedToLoser) tag("added_to_loser");
    if (t.addCount > 0) tag("scaled_in");
    if (t.reduceCount > 0) tag("scaled_out");
    if (t.openedByFlip) tag("flipped");

    if (t.stopPrice === null) tag("no_stop");
    else if (t.stopPlacedAfterSec! > c.lateStopMinutes * 60) tag("late_stop", `stop placed ${Math.round(t.stopPlacedAfterSec! / 60)} min after entry`);
    if (t.stopPrice !== null && t.stopMovedAfterSec !== null) {
      const when = `${Math.round(t.stopMovedAfterSec / 60)} min after entry`;
      // Delta keeps only the final price, so we can only tell where the stop ended up.
      const inProfit = t.direction === "long" ? t.stopPrice >= t.avgEntry : t.stopPrice <= t.avgEntry;
      if (inProfit) tag("stop_to_profit", `stop moved past entry ${when}`);
      else tag("moved_stop", `stop moved ${when} and still on the losing side`);
    }

    if (t.exitReason === "stop") tag("stopped_out");
    if (t.exitReason === "target") tag("target_hit");
    if (t.exitReason === "liquidation") tag("liquidated");
  });
}

// --- helpers ---------------------------------------------------------------

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Index of the last item with `ts <= ts` in a list sorted by time, or -1. */
function indexAtOrBefore<T extends { ts: number }>(sorted: T[], ts: number): number {
  let lo = 0;
  let hi = sorted.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].ts <= ts) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function lastAtOrBefore<T extends { ts: number }>(sorted: T[], ts: number): T | undefined {
  return sorted[indexAtOrBefore(sorted, ts)];
}

function nearest<T extends { ts: number }>(sorted: T[], ts: number): T | undefined {
  const i = indexAtOrBefore(sorted, ts);
  const before = sorted[i];
  const after = sorted[i + 1];
  if (!before) return after;
  if (!after) return before;
  return ts - before.ts <= after.ts - ts ? before : after;
}

function runLength<T>(items: T[], test: (item: T) => boolean): number {
  let n = 0;
  for (let i = items.length - 1; i >= 0 && test(items[i]); i--) n++;
  return n;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
