import { describe, expect, it } from "vitest";
import type { schema } from "@/db";
import { candleWindow } from "./candles";
import { computeStats, dailyPnl, equityCurve, groupStats, istDate } from "./stats";
import { niceTicks } from "@/components/charts/scale";

type Trade = typeof schema.trades.$inferSelect;

const HOUR = 3_600_000;
// 2026-10-13 18:00 UTC = 23:30 IST on the 13th.
const T0 = Date.UTC(2026, 9, 13, 18);

function trade(id: string, closeHours: number, netPnl: number, extra: Partial<Trade> = {}): Trade {
  return {
    id,
    productId: 1,
    symbol: "XAUTUSD",
    contractType: "perpetual_futures",
    direction: "long",
    status: "closed",
    openedTs: T0 + closeHours * HOUR - HOUR,
    closedTs: T0 + closeHours * HOUR,
    holdSeconds: 3600,
    entryQty: 1,
    exitQty: 1,
    maxQty: 1,
    contractValue: 1,
    avgEntry: 1,
    avgExit: 1,
    maxNotional: 1,
    leverage: 1,
    marginUsed: 1,
    walletBalanceAtOpen: 100,
    grossPnl: netPnl + 1,
    fees: 1,
    feeCredits: 0,
    funding: 0,
    liquidationFees: 0,
    netPnl,
    deltaRealizedPnl: null,
    pnlMatchesDelta: null,
    fillCount: 2,
    addCount: 0,
    reduceCount: 0,
    exitReason: "manual",
    stopPrice: null,
    stopPlacedAfterSec: null,
    stopMovedAfterSec: null,
    stopOrderRisk: null,
    riskAmount: null,
    riskSource: null,
    rMultiple: null,
    warnings: [],
    ...extra,
  };
}

describe("equityCurve", () => {
  it("starts at zero and tracks drawdown from the running peak", () => {
    const curve = equityCurve([trade("a", 1, 10), trade("c", 3, 5), trade("b", 2, -15)]);
    expect(curve.map((p) => p.equity)).toEqual([0, 10, -5, 0]);
    expect(curve.map((p) => p.drawdown)).toEqual([0, 0, -15, -10]);
    expect(curve.map((p) => p.tradeId)).toEqual([null, "a", "b", "c"]);
  });

  it("ignores open trades", () => {
    const curve = equityCurve([trade("a", 1, 10), trade("open", 2, 0, { status: "open", closedTs: null })]);
    expect(curve).toHaveLength(2);
  });
});

describe("computeStats", () => {
  it("computes win rate, profit factor, expectancy and max drawdown", () => {
    const s = computeStats([trade("a", 1, 10), trade("b", 2, -4), trade("c", 3, -6), trade("d", 4, 20)]);
    expect(s).toMatchObject({ trades: 4, wins: 2, losses: 2, winRate: 0.5, netPnl: 20, avgWin: 15, avgLoss: -5, expectancy: 5, maxDrawdown: -10 });
    expect(s.profitFactor).toBeCloseTo(3);
    expect(s.fees).toBe(4);
  });

  it("has no profit factor without losses", () => {
    expect(computeStats([trade("a", 1, 10)]).profitFactor).toBeNull();
  });
});

describe("dailyPnl", () => {
  it("groups by the IST calendar day of the close and keeps a running total", () => {
    // 23:30 IST on the 13th, then 00:30 IST on the 14th.
    const days = dailyPnl([trade("a", 0, 5), trade("b", 1, -2), trade("c", 1.5, 4)]);
    expect(days).toEqual([
      { date: "2026-10-13", netPnl: 5, trades: 1, wins: 1, cumulative: 5 },
      { date: "2026-10-14", netPnl: 2, trades: 2, wins: 1, cumulative: 7 },
    ]);
    expect(istDate(Date.UTC(2026, 9, 13, 18, 29))).toBe("2026-10-13");
    expect(istDate(Date.UTC(2026, 9, 13, 18, 30))).toBe("2026-10-14");
  });
});

describe("groupStats", () => {
  it("splits stats per key, busiest group first", () => {
    const groups = groupStats([trade("a", 1, 1), trade("b", 2, 1, { symbol: "BTCUSD" }), trade("c", 3, -1)], (t) => t.symbol);
    expect(groups.map((g) => [g.key, g.trades, g.netPnl])).toEqual([
      ["XAUTUSD", 2, 0],
      ["BTCUSD", 1, 1],
    ]);
  });
});

describe("candleWindow", () => {
  const open = Date.UTC(2026, 9, 30, 14, 0);

  it("uses 1-minute candles with 30 candles of context for a short scalp", () => {
    const w = candleWindow(open, open + 4 * 60_000, open + 48 * HOUR);
    expect(w.resolution).toBe("1m");
    expect(w.startSec).toBe(open / 1000 - 30 * 60);
    expect(w.endSec).toBe(open / 1000 + 4 * 60 + 30 * 60);
  });

  it("picks coarser candles for longer trades", () => {
    expect(candleWindow(open, open + 6 * HOUR, open + 48 * HOUR).resolution).toBe("3m");
    expect(candleWindow(open, open + 10 * 24 * HOUR, open + 30 * 24 * HOUR).resolution).toBe("2h");
  });

  it("never asks for candles in the future", () => {
    const now = open + 10 * 60_000;
    expect(candleWindow(open, null, now).endSec).toBe(now / 1000);
  });
});

describe("niceTicks", () => {
  it("covers the range with round steps", () => {
    expect(niceTicks(-158.8, 0)).toEqual([-200, -150, -100, -50, 0]);
    expect(niceTicks(0, 135, 6)).toEqual([0, 25, 50, 75, 100, 125, 150]);
  });
});
