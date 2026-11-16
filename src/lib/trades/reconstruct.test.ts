import { describe, expect, it } from "vitest";
import { reconstructTrades, type FillInput } from "./reconstruct";

let seq = 0;
const T0 = Date.UTC(2026, 9, 1, 12);

function fill(side: "buy" | "sell", size: number, price: number, extra: Partial<FillInput> = {}): FillInput {
  seq++;
  return {
    id: `f${seq}`,
    accountId: "acc_a",
    orderId: `o${seq}`,
    productId: 1,
    symbol: "XAUTUSD",
    contractType: "perpetual_futures",
    contractValue: 0.001,
    notionalType: "vanilla",
    side,
    size,
    price,
    commission: size * 0.001,
    creditsUsed: 0,
    fillType: "normal",
    leverage: 50,
    positionSizeAfter: null,
    realizedPnlAfter: null,
    ts: T0 + seq * 60_000,
    createdAt: new Date(T0 + seq * 60_000).toISOString(),
    ...extra,
  };
}

describe("reconstructTrades", () => {
  it("pairs an entry and exit into one closed long", () => {
    const [t] = reconstructTrades([fill("buy", 1000, 4000), fill("sell", 1000, 4010, { realizedPnlAfter: 10 })]);
    expect(t).toMatchObject({ direction: "long", status: "closed", entryQty: 1000, exitQty: 1000, avgEntry: 4000, avgExit: 4010 });
    expect(t.grossPnl).toBeCloseTo(10);
    expect(t.fees).toBeCloseTo(2);
    expect(t.deltaRealizedPnl).toBe(10);
    expect(t.maxNotional).toBeCloseTo(4000);
  });

  it("computes short P&L with the sign flipped", () => {
    const [t] = reconstructTrades([fill("sell", 500, 4000), fill("buy", 500, 3980)]);
    expect(t.direction).toBe("short");
    expect(t.grossPnl).toBeCloseTo(10);
  });

  it("uses average cost when adding after a partial exit, as Delta does", () => {
    const trades = reconstructTrades([
      fill("buy", 10, 100, { contractValue: 1 }),
      fill("sell", 5, 110, { contractValue: 1 }), // +50 on 5 @ cost 100
      fill("buy", 5, 120, { contractValue: 1 }), // cost basis becomes (5*100 + 5*120) / 10 = 110
      fill("sell", 10, 115, { contractValue: 1 }), // +50 on 10 @ cost 110
    ]);
    expect(trades).toHaveLength(1);
    const [t] = trades;
    expect(t.grossPnl).toBeCloseTo(100);
    expect(t.legs.map((l) => l.kind)).toEqual(["open", "reduce", "add", "close"]);
    expect(t.legs[2].avgEntryBefore).toBeCloseTo(100);
    expect(t.maxQty).toBe(10);
    expect(t.entryQty).toBe(15);
    expect(t.avgEntry).toBeCloseTo((10 * 100 + 5 * 120) / 15);
    expect(t.avgExit).toBeCloseTo((5 * 110 + 10 * 115) / 15);
  });

  it("splits a fill that flips long to short across two trades", () => {
    const entry = fill("buy", 10, 100, { contractValue: 1 });
    const flip = fill("sell", 15, 90, { contractValue: 1, commission: 1.5, realizedPnlAfter: -150 });
    const [first, second] = reconstructTrades([entry, flip, fill("buy", 5, 80, { contractValue: 1 })]);

    expect(first).toMatchObject({ direction: "long", status: "closed", closedByFlip: true, deltaRealizedPnl: null });
    expect(first.grossPnl).toBeCloseTo(-100);
    expect(first.legs[1]).toMatchObject({ qty: -10, kind: "close" });
    expect(first.legs[1].fee).toBeCloseTo(1);

    expect(second).toMatchObject({ id: `${flip.id}-flip`, direction: "short", status: "closed", openedByFlip: true, entryQty: 5 });
    expect(second.legs[0].fee).toBeCloseTo(0.5);
    expect(second.grossPnl).toBeCloseTo(50);
  });

  it("keeps positions in different products apart", () => {
    const btc = { productId: 27, symbol: "BTCUSD", contractValue: 0.001 };
    const trades = reconstructTrades([
      fill("buy", 1000, 4000),
      fill("sell", 10, 70000, btc),
      fill("sell", 1000, 4005),
      fill("buy", 10, 69000, btc),
    ]);
    expect(trades.map((t) => [t.symbol, t.direction, t.status])).toEqual([
      ["XAUTUSD", "long", "closed"],
      ["BTCUSD", "short", "closed"],
    ]);
    expect(trades[1].grossPnl).toBeCloseTo(10);
  });

  it("leaves an unclosed position open and flags liquidations", () => {
    const [liq, open] = reconstructTrades([
      fill("buy", 10, 100),
      fill("sell", 10, 80, { fillType: "liquidation" }),
      fill("sell", 3, 90),
    ]);
    expect(liq.liquidated).toBe(true);
    expect(open).toMatchObject({ status: "open", closedTs: null, avgExit: null, direction: "short" });
  });

  it("warns when the rebuilt position disagrees with Delta", () => {
    const [t] = reconstructTrades([fill("buy", 10, 100, { positionSizeAfter: 10 }), fill("sell", 4, 101, { positionSizeAfter: 0 })]);
    expect(t.warnings).toHaveLength(1);
  });

  it("orders fills by time regardless of input order", () => {
    const a = fill("buy", 10, 100);
    const b = fill("sell", 10, 110);
    const [t] = reconstructTrades([b, a]);
    expect(t.direction).toBe("long");
    expect(t.status).toBe("closed");
  });
});
