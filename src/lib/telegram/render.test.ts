import { describe, expect, it } from "vitest";
import type { schema } from "@/db";
import { EMPTY_ENTRY } from "@/lib/journal/save";
import { applyCallback, changesEntry, encodeCallback, escapeHtml, parseCallback, renderTradeCard, type Callback } from "./render";

type Trade = typeof schema.trades.$inferSelect;

const trade = {
  id: "t1",
  symbol: "XAUTUSD",
  direction: "short",
  status: "closed",
  holdSeconds: 1800,
  maxQty: 1000,
  leverage: 50,
  avgEntry: 3919.83,
  avgExit: 3913.71,
  exitReason: "stop",
  fees: 0.54,
  liquidationFees: 0,
  netPnl: 5.58,
  rMultiple: 0.55,
} as Trade;

const ALL: Callback[] = [
  { kind: "setup", value: "breakout" },
  { kind: "setup", value: null },
  { kind: "emotion", value: "fomo" },
  { kind: "mistake", value: "held_too_long" },
  { kind: "next", from: "emotions" },
  { kind: "next", from: "mistakes" },
  { kind: "plan", value: true },
  { kind: "plan", value: false },
  { kind: "plan", value: null },
  { kind: "rating", value: 4 },
  { kind: "rating", value: null },
  { kind: "note" },
  { kind: "edit" },
];

describe("callbacks", () => {
  it("round-trip through Telegram's 64-byte callback data", () => {
    for (const cb of ALL) {
      const data = encodeCallback(cb);
      expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
      expect(parseCallback(data)).toEqual(cb);
    }
  });

  it("rejects anything that is not one of our buttons", () => {
    for (const bad of [undefined, "", "s:v:scalp", "e:t:toString", "r:v:9", "x:y", "p:maybe"]) expect(parseCallback(bad)).toBeNull();
  });

  it("walks the steps in order, saving only real answers", () => {
    let e = EMPTY_ENTRY;
    const steps: [Callback, string][] = [
      [{ kind: "setup", value: "pullback" }, "emotions"],
      [{ kind: "emotion", value: "fomo" }, "emotions"],
      [{ kind: "emotion", value: "calm" }, "emotions"],
      [{ kind: "emotion", value: "fomo" }, "emotions"],
      [{ kind: "next", from: "emotions" }, "mistakes"],
      [{ kind: "mistake", value: "moved_stop" }, "mistakes"],
      [{ kind: "next", from: "mistakes" }, "plan"],
      [{ kind: "plan", value: false }, "rating"],
      [{ kind: "rating", value: 2 }, "done"],
    ];
    for (const [cb, stage] of steps) {
      const r = applyCallback(e, cb);
      expect(r.stage).toBe(stage);
      e = r.entry;
    }
    expect(e).toMatchObject({ setup: "pullback", emotions: ["calm"], mistakes: ["moved_stop"], followedPlan: false, rating: 2 });
    expect(changesEntry({ kind: "next", from: "emotions" })).toBe(false);
    expect(changesEntry({ kind: "setup", value: null })).toBe(false);
    expect(changesEntry({ kind: "emotion", value: "fear" })).toBe(true);
  });
});

describe("renderTradeCard", () => {
  it("summarises the trade, its warnings and the current step", () => {
    const { text, markup } = renderTradeCard(trade, ["after_loss", "session:new_york", "oversized"], null, "setup");
    expect(text).toContain("<b>XAUTUSD short</b> · <b>+$5.58</b> (+0.55R)");
    expect(text).toContain("3,919.83 → 3,913.71 (stop-loss)");
    expect(text).toContain("⚠️ After a loss · Oversized");
    expect(text).not.toContain("New York");
    expect(text).toContain("1/5 · What was the setup?");
    expect("inline_keyboard" in markup && markup.inline_keyboard.flat().map((b) => b.text)).toContain("Breakout");
  });

  it("marks chosen answers with ✓ and suggestions with •, and escapes notes", () => {
    const entry = { ...EMPTY_ENTRY, emotions: ["fomo" as const], notes: "entered <late> & chased" };
    const { text, markup } = renderTradeCard(trade, [], entry, "emotions", { emotions: ["revenge"], mistakes: [] });
    const labels = "inline_keyboard" in markup ? markup.inline_keyboard.flat().map((b) => b.text) : [];
    expect(labels).toContain("✓ FOMO");
    expect(labels).toContain("• Revenge");
    expect(labels).toContain("Calm");
    expect(text).toContain("<i>entered &lt;late&gt; &amp; chased</i>");
    expect(text).toContain("<b>Journal:</b> felt FOMO");
  });

  it("offers a note and editing once done", () => {
    const { markup } = renderTradeCard(trade, [], { ...EMPTY_ENTRY, rating: 3 }, "done");
    expect("inline_keyboard" in markup && markup.inline_keyboard.flat().map((b) => b.callback_data)).toEqual(["d:note", "d:edit"]);
  });

  it("escapes HTML", () => {
    expect(escapeHtml("a<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });
});
