import { describe, expect, it } from "vitest";
import { moneySteps, tradeSummary, tradeTimeline, type TimelineTrade } from "./trade-story";

const T0 = Date.UTC(2026, 10, 5, 2, 49, 13); // 08:19 IST
// The demo's XAUTUSD long: stop moved while losing, then stopped out, oversized, after a losing streak.
const movedStop: TimelineTrade = {
  status: "closed",
  direction: "long",
  holdSeconds: 24_647,
  netPnl: -71.29,
  grossPnl: -66.87,
  exitReason: "stop",
  openedTs: T0,
  stopPrice: 4119.34,
  stopPlacedAfterSec: 27,
  stopMovedAfterSec: 9818,
  currency: "USD",
  tags: [
    { tag: "moved_stop", detail: "stop moved 164 min after entry and still on the losing side" },
    { tag: "oversized", detail: "3.0x your recent median size" },
    { tag: "loss_streak", detail: "after 4 losses in a row" },
    { tag: "stopped_out", detail: null },
  ],
  legs: [
    { fillId: "f1", kind: "open", qty: 1066, price: 4182.07, fee: 2.23, ts: T0 },
    { fillId: "f2", kind: "close", qty: -1066, price: 4119.34, fee: 2.2, ts: T0 + 24_647_000 },
  ],
};

describe("the trade page's story", () => {
  it("sums a trade up in a few plain sentences, from the tags it carries", () => {
    expect(tradeSummary(movedStop)).toBe(
      "You held a losing long for 6h 51m. You moved the stop while still behind, then it took you out. It was 3.0x your recent median size, opened after 4 losses in a row.",
    );
    const won = { ...movedStop, netPnl: 12, exitReason: "target" as const, tags: [] };
    expect(tradeSummary(won)).toBe("You held a winning long for 6h 51m. It closed at your target.");
    const charges = { ...movedStop, netPnl: -30, exitReason: "manual" as const, tags: [{ tag: "won_before_charges", detail: "+₹120.00 before charges of ₹150.00" }, { tag: "no_stop", detail: null }] };
    expect(tradeSummary(charges)).toBe("You held a losing long for 6h 51m. It made +₹120.00 before charges of ₹150.00. There was no stop.");
    expect(tradeSummary({ ...movedStop, status: "open", tags: [] })).toBe("This long is still open.");
  });

  it("lists the fills and the stop's moves in time order", () => {
    const moments = tradeTimeline(movedStop, "contracts");
    expect(moments.map((m) => m.title)).toEqual([
      "Bought 1,066 contracts at 4,182.07",
      "Stop placed, 27s after entry",
      "Stop moved while losing",
      "Stopped out at 4,119.34",
    ]);
    expect(moments[1].detail).toMatch(/keeps only the last one/);
    expect(moments.filter((m) => m.warn).map((m) => m.key)).toEqual(["stop-moved"]);
    // A short with no stops: bought back, and only the fills.
    const short = { ...movedStop, direction: "short" as const, exitReason: "manual" as const, stopPlacedAfterSec: null, stopMovedAfterSec: null, tags: [], currency: "INR" as const };
    expect(tradeTimeline(short, "units").map((m) => m.title)).toEqual(["Sold 1,066 units at 4,182.07", "Bought back 1,066 units at 4,119.34"]);
    expect(tradeTimeline(short, "units")[0].detail).toBe("Charges ₹2.23");
  });

  it("draws the money as a waterfall that ends on the net", () => {
    const { steps, net } = moneySteps([
      { label: "Price move", value: -66.87 },
      { label: "Fees", value: -4.42 },
    ]);
    expect(net).toBeCloseTo(-71.29);
    expect(steps[0].left).toBeCloseTo(4.42 / 71.29);
    expect(steps[0].width).toBeCloseTo(66.87 / 71.29);
    // Fees carry on from where the price move ended: at the far left.
    expect(steps[1].left).toBeCloseTo(0);
    // A winner whose costs take some back.
    const win = moneySteps([{ label: "Price move", value: 100 }, { label: "Fees", value: -10 }]);
    expect(win.steps[1]).toMatchObject({ left: 0.9, width: 0.1 });
  });
});
