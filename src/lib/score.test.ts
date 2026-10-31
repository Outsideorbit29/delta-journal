import { describe, expect, it } from "vitest";
import { behaviourScore, weakest } from "./score";

let ts = 0;
const trade = (tags: string[], status = "closed") => ({ id: `t${++ts}`, status, closedTs: ts, tags: tags.map((tag) => ({ tag })) });

describe("behaviourScore", () => {
  it("needs a few closed trades before it judges anything", () => {
    expect(behaviourScore([trade([]), trade([]), trade([]), trade([]), trade([], "open")])).toBeNull();
  });

  it("scores each habit as the share of trades without it", () => {
    const trades = [
      trade(["moved_stop", "hold:scalp"]),
      trade(["no_stop"]),
      trade(["oversized", "sized_up_after_loss"]),
      trade([]),
      trade([]),
    ];
    const s = behaviourScore(trades)!;
    const byKey = Object.fromEntries(s.dimensions.map((d) => [d.key, d.score]));
    expect(byKey).toEqual({ risk: 80, stops: 75, sizing: 80, emotions: 80, patience: 80 });
    expect(s.overall).toBe(79);
    expect(s.label).toBe("Solid");
    expect(s.trend).toBeNull();
    expect(weakest(s).key).toBe("stops");
  });

  it("adds journaling when journal data is given, and reports a trend", () => {
    const early = Array.from({ length: 5 }, () => trade(["moved_stop", "no_stop", "overtrading"]));
    const late = Array.from({ length: 5 }, () => trade([]));
    const journaled = new Set(late.map((t) => t.id));
    const s = behaviourScore([...early, ...late], journaled)!;
    expect(s.dimensions.map((d) => d.key)).toContain("journal");
    expect(s.trend).toBeGreaterThan(50);
  });
});
