import { describe, expect, it } from "vitest";
import { COUNT_UP_MS, countAt, easeOutCubic, storyStep } from "./motion";

describe("motion helpers", () => {
  it("count a figure up and land exactly on its value", () => {
    expect(countAt(-158.41, 0)).toBe(-0);
    expect(countAt(-158.41, COUNT_UP_MS)).toBe(-158.41);
    expect(countAt(-158.41, COUNT_UP_MS * 2)).toBe(-158.41);
    // Most of the way there by half time (ease-out).
    expect(countAt(100, COUNT_UP_MS / 2)).toBeCloseTo(87.5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("walk a pinned story step by step", () => {
    expect(storyStep(0, 3)).toEqual({ index: 0, grown: [0, 0, 0] });
    expect(storyStep(0.5, 3)).toEqual({ index: 1, grown: [1, 0.5, 0] });
    expect(storyStep(1, 3)).toEqual({ index: 2, grown: [1, 1, 1] });
    expect(storyStep(-2, 3).index).toBe(0);
  });
});
