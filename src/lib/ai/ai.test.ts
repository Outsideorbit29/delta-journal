import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, schema, type Db } from "@/db";
import { buildReviewInput, generateReview, listReviews, tidyReview, type Review } from "./review";
import { isEmptySuggestion, newSuggestions, suggestFromNote } from "./suggest";
import { explainAiError } from "./models";

/** A mock model that answers with `json` and remembers the prompt it was sent. */
function mockModel(json: unknown) {
  const prompts: string[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1200, noCache: 1200, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 300, text: 300, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, prompts };
}

describe("suggestFromNote", () => {
  it("returns the model's labels, de-duplicated, and sends the note and trade", async () => {
    const { model, prompts } = mockModel({ setup: "breakout", emotions: ["fomo", "fomo"], mistakes: ["chased_entry"], followedPlan: null });
    const s = await suggestFromNote("bhai late entry, FOMO ho gaya", { symbol: "XAUTUSD", direction: "short", netPnl: -2.5 }, model);
    expect(s).toEqual({ setup: "breakout", emotions: ["fomo"], mistakes: ["chased_entry"], followedPlan: null });
    expect(prompts[0]).toContain("FOMO ho gaya");
    expect(prompts[0]).toContain("XAUTUSD short, net -2.50 USD");
  });

  it("rejects labels outside the fixed lists", async () => {
    const { model } = mockModel({ setup: "scalp", emotions: [], mistakes: [], followedPlan: null });
    await expect(suggestFromNote("note", { symbol: "X", direction: "long", netPnl: 1 }, model)).rejects.toThrow();
  });

  it("keeps only answers the entry does not have yet", () => {
    const s = { setup: "pullback" as const, emotions: ["fomo" as const, "fear" as const], mistakes: ["no_plan" as const], followedPlan: true };
    const fresh = newSuggestions(s, { setup: "breakout", emotions: ["fear"], mistakes: [], followedPlan: false });
    expect(fresh).toEqual({ setup: null, emotions: ["fomo"], mistakes: ["no_plan"], followedPlan: null });
    expect(isEmptySuggestion(newSuggestions(s, { setup: "x", emotions: ["fomo", "fear"], mistakes: ["no_plan"], followedPlan: true }))).toBe(true);
  });
});

describe("weekly review", () => {
  let dir: string;
  let db: Db;
  const NOW = Date.UTC(2026, 9, 31, 12);
  const review: Review = {
    headline: "Fees ate your edge",
    summary: "Two trades.",
    strengths: [],
    leaks: [{ pattern: "Scalping", evidence: "2 trades, -$3.00", costUsd: -3 }],
    rules: ["Hold at least 15 minutes"],
    journaling: "1 of 2 trades journaled.",
  };

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "journal-ai-"));
    db = await openDatabase(`file:${path.join(dir, "test.db")}`);
    const base = {
      userId: "u1",
      productId: 1,
      symbol: "XAUTUSD",
      contractType: "perpetual_futures",
      direction: "long" as const,
      status: "closed" as const,
      holdSeconds: 300,
      entryQty: 1,
      exitQty: 1,
      maxQty: 1,
      contractValue: 1,
      avgEntry: 1,
      avgExit: 1,
      maxNotional: 1,
      leverage: 50,
      grossPnl: 0,
      fees: 1,
      feeCredits: 0,
      funding: 0,
      liquidationFees: 0,
      fillCount: 2,
      addCount: 0,
      reduceCount: 0,
      warnings: [],
    };
    await db.insert(schema.trades).values([
      { ...base, id: "in1", openedTs: NOW - 3 * 3_600_000, closedTs: NOW - 2 * 3_600_000, netPnl: -1 },
      { ...base, id: "in2", openedTs: NOW - 2 * 3_600_000, closedTs: NOW - 3_600_000, netPnl: -2 },
      { ...base, id: "old", openedTs: NOW - 30 * 86_400_000, closedTs: NOW - 30 * 86_400_000 + 1, netPnl: 10 },
    ]);
    await db.insert(schema.tradeTags).values([
      { tradeId: "in1", userId: "u1", tag: "hold:scalp", source: "auto" },
      { tradeId: "in2", userId: "u1", tag: "hold:scalp", source: "auto" },
      { tradeId: "in2", userId: "u1", tag: "emotion:fomo", source: "user" },
    ]);
    await db.insert(schema.journalEntries).values({
      tradeId: "in2",
      userId: "u1",
      setup: "breakout",
      emotions: ["fomo"],
      mistakes: [],
      notes: "chased it",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  afterAll(() => {
    db.$client.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it("gives the coach the period's stats, tag results and trades with journal notes", async () => {
    const input = await buildReviewInput(db, "u1", { start: NOW - 7 * 86_400_000, end: NOW });
    expect(input.stats).toMatchObject({ trades: 2, netPnl: -3, winRatePct: 0 });
    expect(input.allTimeStats.trades).toBe(3);
    expect(input.journaled).toBe("1 of 2 trades");
    expect(input.byTag).toEqual([{ tag: "Scalp", trades: 2, winRatePct: 0, netPnl: -3 }]);
    expect(input.trades.map((t) => t.netPnl)).toEqual([-2, -1]);
    expect(input.trades[0].journal).toMatchObject({ setup: "breakout", notes: "chased it" });
    expect(input.trades[0].tags).toEqual(["Scalp"]);
  });

  it("stores the review with its period and token usage", async () => {
    const { model, prompts } = mockModel(review);
    const row = await generateReview(db, "u1", 7, model, NOW);
    expect(row).toMatchObject({ tradeCount: 2, review, inputTokens: 1200, outputTokens: 300, periodEnd: NOW });
    expect(prompts[0]).toContain("Do not recommend specific trades");
    expect((await listReviews(db, "u1")).map((r) => r.review.headline)).toEqual(["Fees ate your edge"]);
  });

  it("skips a period with no closed trades", async () => {
    const { model, prompts } = mockModel(review);
    expect(await generateReview(db, "u1", 7, model, NOW - 60 * 86_400_000)).toBeNull();
    expect(prompts).toHaveLength(0);
  });
});

describe("tidyReview", () => {
  it("collapses runaway whitespace and caps rambling fields", () => {
    const messy: Review = {
      headline: "  Fees   ate\nyour edge ",
      summary: "x".repeat(900),
      strengths: [],
      leaks: [{ pattern: "Scalping", evidence: "12 trades", costUsd: -30 }],
      rules: [`No scale-outs this week.${"\t".repeat(700)}`, "   "],
      journaling: "  ",
    };
    const tidy = tidyReview(messy);
    expect(tidy.headline).toBe("Fees ate your edge");
    expect(tidy.summary).toHaveLength(500);
    expect(tidy.summary.endsWith("…")).toBe(true);
    expect(tidy.rules).toEqual(["No scale-outs this week."]);
    expect(tidy.journaling).toBeNull();
    expect(tidy.leaks[0].costUsd).toBe(-30);
  });
});

describe("explainAiError", () => {
  it("turns gateway failures into something you can act on", () => {
    const auth = Object.assign(new Error("Invalid API key"), { name: "GatewayAuthenticationError" });
    expect(explainAiError(new Error("Retry failed", { cause: auth }))).toContain("AI_GATEWAY_API_KEY");
    expect(explainAiError(new Error("Insufficient credits"))).toContain("out of credits");
    expect(explainAiError(new Error("boom"))).toBe("AI request failed: boom");
  });
});
