import { describe, expect, it } from "vitest";
import { journalHints } from "./hints";

describe("journal hints from the automatic tags", () => {
  it("suggests each answer once, with the first tag's detail as the reason", () => {
    const hints = journalHints([
      { tag: "moved_stop", detail: "stop moved 164 min after entry and still on the losing side" },
      { tag: "oversized", detail: "3.0x your recent median size" },
      { tag: "heavy_margin", detail: "used 61% of your margin" },
      { tag: "after_loss", detail: "opened 4 min after a loss" },
      { tag: "stopped_out", detail: null },
    ]);
    expect(hints.mistakes).toEqual([
      { key: "moved_stop", reason: "Stop moved 164 min after entry and still on the losing side" },
      { key: "oversized", reason: "3.0x your recent median size" },
    ]);
    expect(hints.emotions).toEqual([{ key: "revenge", reason: "Opened 4 min after a loss" }]);
  });

  it("suggests nothing for a trade with no telling tags", () => {
    expect(journalHints([{ tag: "stopped_out", detail: null }])).toEqual({ mistakes: [], emotions: [] });
    expect(journalHints([{ tag: "no_stop", detail: null }]).mistakes).toEqual([{ key: "no_stop", reason: null }]);
  });
});
