import { describe, expect, it } from "vitest";
import { journalConfig } from "@/lib/config";
import { analyzeTrades, type OrderInput, type WalletInput } from "./analyze";
import type { ReconstructedTrade } from "./reconstruct";

const MIN = 60_000;
// Tuesday 2026-10-13 14:00 UTC, which is the New York session.
const T0 = Date.UTC(2026, 9, 13, 14);

function trade(id: string, openMin: number, closeMin: number | null, grossPnl: number, extra: Partial<ReconstructedTrade> = {}): ReconstructedTrade {
  const openedTs = T0 + openMin * MIN;
  const closedTs = closeMin === null ? null : T0 + closeMin * MIN;
  return {
    id,
    productId: 1,
    symbol: "XAUTUSD",
    contractType: "perpetual_futures",
    contractValue: 0.001,
    direction: "long",
    status: closedTs === null ? "open" : "closed",
    openedTs,
    closedTs,
    entryQty: 500,
    exitQty: closedTs === null ? 0 : 500,
    maxQty: 500,
    avgEntry: 4000,
    avgExit: closedTs === null ? null : 4000 + grossPnl / 0.5,
    maxNotional: 2000,
    leverage: 50,
    grossPnl,
    fees: 0,
    feeCredits: 0,
    deltaRealizedPnl: grossPnl,
    liquidated: false,
    openedByFlip: false,
    closedByFlip: false,
    legs: [
      { fillId: `${id}-in`, orderId: `${id}-in`, qty: 500, kind: "open", price: 4000, fee: 0, ts: openedTs, avgEntryBefore: null },
      ...(closedTs === null
        ? []
        : [{ fillId: `${id}-out`, orderId: `${id}-out`, qty: -500, kind: "close" as const, price: 4000, fee: 0, ts: closedTs, avgEntryBefore: 4000 }]),
    ],
    warnings: [],
    ...extra,
  };
}

const tagsOf = (t: { tags: { tag: string }[] }) => t.tags.map((g) => g.tag);

describe("analyzeTrades", () => {
  it("adds funding paid while the trade was open and nets it with fees", () => {
    const wallet: WalletInput[] = [
      { type: "funding", amount: -0.1, balance: 100, assetSymbol: "USD", productId: 1, ts: T0 + 5 * MIN },
      { type: "funding", amount: -0.5, balance: 100, assetSymbol: "USD", productId: 1, ts: T0 + 90 * MIN },
      { type: "funding", amount: -0.7, balance: 100, assetSymbol: "USD", productId: 2, ts: T0 + 5 * MIN },
    ];
    const [t] = analyzeTrades([trade("a", 0, 60, 5, { fees: 1 })], [], wallet);
    expect(t.funding).toBeCloseTo(-0.1);
    expect(t.netPnl).toBeCloseTo(3.9);
  });

  it("gives funding and liquidation fees booked just after the close to the closed trade", () => {
    const close = T0 + 60 * MIN;
    const wallet: WalletInput[] = [
      { type: "funding", amount: -0.2, balance: 100, assetSymbol: "USD", productId: 1, ts: close + 13 },
      { type: "liquidation_fee", amount: -3, balance: 97, assetSymbol: "USD", productId: 1, ts: close + 20 },
    ];
    // The next trade opens on the same product before those records land.
    const [first, second] = analyzeTrades([trade("a", 0, 60, -10, { fees: 1 }), { ...trade("b", 60, 90, 0), openedTs: close + 5 }], [], wallet);
    expect(first.funding).toBeCloseTo(-0.2);
    expect(first.liquidationFees).toBeCloseTo(3);
    expect(first.netPnl).toBeCloseTo(-10 - 1 - 3 - 0.2);
    expect(second.funding).toBe(0);
    expect(second.liquidationFees).toBe(0);
  });

  it("matches fee-credit payments to the trade with the nearest fill", () => {
    const wallet: WalletInput[] = [{ type: "trading_fee_credits_paid", amount: -0.4, balance: 5, assetSymbol: "TFC_USD", productId: null, ts: T0 + 30 * MIN + 50 }];
    const [a, b] = analyzeTrades([trade("a", 0, 10, 1), trade("b", 20, 30, 1)], [], wallet);
    expect(a.feeCredits).toBe(0);
    expect(b.feeCredits).toBeCloseTo(0.4);
    expect(b.netPnl).toBeCloseTo(1);
  });

  it("finds the stop, its risk and the R-multiple, and labels a stop exit", () => {
    const orders: OrderInput[] = [
      { id: 1, productId: 1, side: "sell", stopOrderType: "stop_loss_order", stopPrice: 3990, bracketStopLossPrice: null, size: 500, editedTs: null, ts: T0 + 2 * MIN },
      // The order that closed the trade was the stop.
      { id: 2, productId: 1, side: "sell", stopOrderType: "stop_loss_order", stopPrice: 3990, bracketStopLossPrice: null, size: 500, editedTs: null, ts: T0 + 3 * MIN },
    ];
    const t0 = trade("a", 0, 30, -5);
    t0.legs[1].orderId = "2";
    const [t] = analyzeTrades([t0], orders, []);
    expect(t.stopPrice).toBe(3990);
    expect(t.stopPlacedAfterSec).toBe(120);
    expect(t.riskAmount).toBeCloseTo(5); // 10 * 500 * 0.001
    expect(t.rMultiple).toBeCloseTo(-1);
    expect(t.exitReason).toBe("stop");
    expect(tagsOf(t)).toContain("stopped_out");
    expect(tagsOf(t)).not.toContain("no_stop");
  });

  it("treats a moved stop's risk as unknown and says where it ended up", () => {
    const orders: OrderInput[] = [
      { id: 1, productId: 1, side: "sell", stopOrderType: "stop_loss_order", stopPrice: 4001, bracketStopLossPrice: null, size: 500, ts: T0 + MIN, editedTs: T0 + 20 * MIN },
      { id: 2, productId: 1, side: "sell", stopOrderType: "stop_loss_order", stopPrice: 3995, bracketStopLossPrice: null, size: 500, ts: T0 + 101 * MIN, editedTs: T0 + 110 * MIN },
    ];
    const [trailed, widened] = analyzeTrades([trade("a", 0, 30, 1), trade("b", 100, 130, -3)], orders, []);
    expect(trailed.stopMovedAfterSec).toBe(20 * 60);
    expect(trailed.riskAmount).toBeNull();
    expect(trailed.rMultiple).toBeNull();
    expect(tagsOf(trailed)).toContain("stop_to_profit");
    expect(tagsOf(widened)).toContain("moved_stop");
    expect(widened.tags.find((g) => g.tag === "moved_stop")?.detail).toBe("stop moved 10 min after entry and still on the losing side");
  });

  it("tags a late stop and a missing stop", () => {
    const orders: OrderInput[] = [
      { id: 1, productId: 1, side: "sell", stopOrderType: "stop_loss_order", stopPrice: 3990, bracketStopLossPrice: null, size: 500, editedTs: null, ts: T0 + 10 * MIN },
    ];
    const [late, none] = analyzeTrades([trade("a", 0, 30, 1), trade("b", 100, 130, 1)], orders, []);
    expect(tagsOf(late)).toContain("late_stop");
    expect(tagsOf(none)).toContain("no_stop");
  });

  it("flags trading right after a loss, sizing up, and a losing streak", () => {
    const trades = [
      trade("l1", 0, 10, -1),
      trade("l2", 20, 30, -1),
      trade("l3", 40, 50, -2),
      trade("next", 55, 70, 1, { maxNotional: 4000 }),
    ];
    const next = analyzeTrades(trades, [], []).find((t) => t.id === "next")!;
    expect(tagsOf(next)).toEqual(expect.arrayContaining(["after_loss", "sized_up_after_loss", "loss_streak", "overtrading"]));
    expect(next.tags.find((g) => g.tag === "after_loss")?.detail).toBe("5 min after a -$2.00 loss");
    expect(next.tags.find((g) => g.tag === "loss_streak")?.detail).toBe("after 3 losses in a row");
  });

  it("does not call a trade after_loss once the cool-off has passed", () => {
    const [, later] = analyzeTrades([trade("l1", 0, 10, -1), trade("later", 10 + journalConfig.afterLossMinutes + 1, 90, 1)], [], []);
    expect(tagsOf(later)).not.toContain("after_loss");
  });

  it("flags oversized positions against the recent median", () => {
    const trades = Array.from({ length: 6 }, (_, i) => trade(`t${i}`, i * 200, i * 200 + 10, 1));
    trades.push(trade("big", 1400, 1410, 1, { maxNotional: 4000 }));
    const big = analyzeTrades(trades, [], []).find((t) => t.id === "big")!;
    expect(tagsOf(big)).toContain("oversized");
  });

  it("flags heavy margin against the wallet balance at entry", () => {
    const wallet: WalletInput[] = [{ type: "deposit", amount: 100, balance: 100, assetSymbol: "USD", productId: null, ts: T0 - MIN }];
    const [t] = analyzeTrades([trade("a", 0, 10, 1, { maxNotional: 4000, leverage: 50 })], [], wallet);
    expect(t.marginUsed).toBeCloseTo(80);
    expect(t.tags.find((g) => g.tag === "heavy_margin")?.detail).toBe("margin was 80% of the wallet");
  });

  it("tags session, hold type and adding to a loser", () => {
    const t0 = trade("a", 0, 5, 1);
    t0.legs.splice(1, 0, { fillId: "add", orderId: "add", qty: 500, kind: "add", price: 3990, fee: 0, ts: T0 + MIN, avgEntryBefore: 4000 });
    const [t] = analyzeTrades([{ ...t0 }], [], []);
    expect(tagsOf(t)).toEqual(expect.arrayContaining(["session:new_york", "hold:scalp", "added_to_loser"]));
    expect(t.addCount).toBe(1);
  });
});
