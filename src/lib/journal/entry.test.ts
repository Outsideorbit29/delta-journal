import { describe, expect, it } from "vitest";
import { effectiveRisk, journalTags, parseJournalInput, riskAtStop, suggestionsFor } from "./entry";

describe("parseJournalInput", () => {
  it("accepts a full entry from form-style values", () => {
    const r = parseJournalInput({
      setup: "breakout",
      emotions: ["fomo", "fomo", "calm"],
      mistakes: "chased_entry",
      followedPlan: "no",
      rating: "2",
      notes: "  jumped in late  ",
      plannedStop: "3,925.5",
      plannedTarget: "",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        setup: "breakout",
        emotions: ["fomo", "calm"],
        mistakes: ["chased_entry"],
        followedPlan: false,
        rating: 2,
        notes: "jumped in late",
        plannedStop: 3925.5,
        plannedTarget: null,
      },
    });
  });

  it("treats an empty form as an empty entry", () => {
    expect(parseJournalInput({})).toEqual({
      ok: true,
      value: { setup: null, emotions: [], mistakes: [], followedPlan: null, rating: null, notes: null, plannedStop: null, plannedTarget: null },
    });
  });

  it("rejects values outside the fixed lists and bad numbers", () => {
    const r = parseJournalInput({ setup: "scalp", emotions: ["angry"], rating: 9, plannedStop: "abc", followedPlan: "maybe" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(5);
  });

  it("does not accept inherited object keys as choices", () => {
    expect(parseJournalInput({ setup: "toString" }).ok).toBe(false);
  });
});

describe("journalTags", () => {
  it("prefixes each answer so it can be analysed like a tag", () => {
    const tags = journalTags({
      setup: "pullback",
      emotions: ["revenge"],
      mistakes: ["moved_stop", "oversized"],
      followedPlan: true,
      rating: 3,
      notes: null,
      plannedStop: null,
      plannedTarget: null,
    });
    expect(tags).toEqual(["setup:pullback", "emotion:revenge", "mistake:moved_stop", "mistake:oversized", "plan:followed"]);
  });
});

describe("suggestionsFor", () => {
  it("suggests journal answers from automatic tags without duplicates", () => {
    expect(suggestionsFor(["moved_stop", "oversized", "heavy_margin", "after_loss", "session:asia"])).toEqual({
      mistakes: ["moved_stop", "oversized"],
      emotions: ["revenge"],
    });
  });
});

describe("risk", () => {
  const short = { direction: "short" as const, avgEntry: 4000, contractValue: 0.001, maxQty: 1000, status: "closed" as const, netPnl: -5, stopOrderRisk: 2 };

  it("measures risk to the stop, and none for a stop past break-even", () => {
    expect(riskAtStop(short, 4010, 1000)).toBeCloseTo(10);
    expect(riskAtStop(short, 3990, 1000)).toBeNull();
  });

  it("prefers the journal's planned stop over the stop order", () => {
    expect(effectiveRisk(short, 4010)).toEqual({ riskAmount: expect.closeTo(10), riskSource: "journal", rMultiple: expect.closeTo(-0.5) });
    expect(effectiveRisk(short, null)).toEqual({ riskAmount: 2, riskSource: "stop_order", rMultiple: -2.5 });
    expect(effectiveRisk({ ...short, stopOrderRisk: null }, null)).toEqual({ riskAmount: null, riskSource: null, rMultiple: null });
  });

  it("has no R for an open trade", () => {
    expect(effectiveRisk({ ...short, status: "open" }, 4010).rMultiple).toBeNull();
  });
});
