import { describe, expect, it } from "vitest";
import { biggestLeaks, whatWorks } from "./insights";
import { topTags } from "./tags";

type T = Parameters<typeof biggestLeaks>[0][number];
let n = 0;
const trade = (netPnl: number, tags: string[]) =>
  ({ id: `t${n++}`, status: "closed", netPnl, grossPnl: netPnl, fees: 0, liquidationFees: 0, funding: 0, closedTs: n, tags: tags.map((tag) => ({ tag, source: "auto", detail: null })) }) as unknown as T;

describe("dashboard insights", () => {
  const trades = [
    ...[1, 2, 3].map(() => trade(-30, ["moved_stop", "mistake:moved_stop", "session:asia"])),
    ...[1, 2, 3, 4].map(() => trade(-5, ["hold:scalp", "session:asia"])),
    ...[1, 2].map(() => trade(-100, ["liquidated"])),
    ...[1, 2, 3].map(() => trade(20, ["stop_to_profit", "session:london"])),
    trade(-2, ["no_stop"]),
  ];

  it("names the costliest habits, ignoring journal repeats, sessions and one-off tags", () => {
    expect(biggestLeaks(trades).map((r) => [r.tag, r.netPnl])).toEqual([
      ["moved_stop", -90],
      ["hold:scalp", -20],
    ]);
  });

  it("names what made money, leaving out sessions", () => {
    expect(whatWorks(trades).map((r) => r.tag)).toEqual(["stop_to_profit"]);
  });
});

describe("topTags", () => {
  it("shows warnings from the data first, sessions last, and counts the rest", () => {
    const tags = ["session:asia", "hold:scalp", "mistake:no_plan", "moved_stop", "stopped_out"].map((tag) => ({ tag }));
    const { shown, more } = topTags(tags, 3);
    expect(shown.map((t) => t.tag)).toEqual(["moved_stop", "mistake:no_plan", "hold:scalp"]);
    expect(more).toBe(2);
  });
});
