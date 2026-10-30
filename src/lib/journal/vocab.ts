// The fixed choices for journaling a trade. Keeping the list small and fixed is
// what makes the answers analysable; edit it here (labels can change freely,
// keys are stored). The Telegram bot will offer the same choices as buttons.

export const SETUPS = {
  breakout: "Breakout",
  pullback: "Pullback",
  reversal: "Reversal",
  range: "Range",
  news: "News",
  other: "Other",
} as const;

export const EMOTIONS = {
  calm: "Calm",
  confident: "Confident",
  fomo: "FOMO",
  fear: "Fear",
  revenge: "Revenge",
  greed: "Greed",
  bored: "Bored",
} as const;

export const MISTAKES = {
  chased_entry: "Chased entry",
  no_plan: "No plan",
  moved_stop: "Moved stop",
  no_stop: "No stop",
  oversized: "Oversized",
  exited_early: "Exited early",
  held_too_long: "Held too long",
  overtraded: "Overtraded",
} as const;

export type Setup = keyof typeof SETUPS;
export type Emotion = keyof typeof EMOTIONS;
export type Mistake = keyof typeof MISTAKES;

/** Emotions that usually precede a bad decision; shown in the warning colour. */
export const RISKY_EMOTIONS: readonly Emotion[] = ["fomo", "fear", "revenge", "greed", "bored"];

/**
 * Journal answers suggested by automatic tags. They are only shown as hints;
 * nothing is selected for you.
 */
export const SUGGESTED_BY_TAG: Record<string, { mistakes?: Mistake[]; emotions?: Emotion[] }> = {
  moved_stop: { mistakes: ["moved_stop"] },
  no_stop: { mistakes: ["no_stop"] },
  oversized: { mistakes: ["oversized"] },
  heavy_margin: { mistakes: ["oversized"] },
  overtrading: { mistakes: ["overtraded"] },
  sized_up_after_loss: { emotions: ["revenge"] },
  after_loss: { emotions: ["revenge"] },
};
