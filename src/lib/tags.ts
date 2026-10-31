import { EMOTIONS, MISTAKES, RISKY_EMOTIONS, SETUPS, type Emotion } from "@/lib/journal/vocab";

// Display names for automatic tags, and which ones point at a habit to watch.

const LABELS: Record<string, string> = {
  "session:asia": "Asia session",
  "session:london": "London session",
  "session:new_york": "New York session",
  "session:late": "Late session",
  "hold:scalp": "Scalp",
  "hold:intraday": "Intraday",
  "hold:swing": "Swing",
  weekend: "Weekend",
  after_loss: "After a loss",
  sized_up_after_loss: "Sized up after loss",
  loss_streak: "On a losing streak",
  win_streak: "On a winning streak",
  overtrading: "Overtrading",
  oversized: "Oversized",
  high_leverage: "High leverage",
  heavy_margin: "Heavy margin",
  added_to_loser: "Added to a loser",
  scaled_in: "Scaled in",
  scaled_out: "Scaled out",
  flipped: "Flipped",
  no_stop: "No stop",
  late_stop: "Late stop",
  moved_stop: "Moved stop",
  stop_to_profit: "Stop trailed to profit",
  stopped_out: "Stopped out",
  target_hit: "Target hit",
  liquidated: "Liquidated",
};

const WARNING = new Set([
  "after_loss",
  "sized_up_after_loss",
  "loss_streak",
  "overtrading",
  "oversized",
  "high_leverage",
  "heavy_margin",
  "added_to_loser",
  "no_stop",
  "late_stop",
  "moved_stop",
  "liquidated",
]);

// Tags written from your journal: setup:*, emotion:*, mistake:*, plan:*.
function journalLabel(tag: string): string | undefined {
  const [kind, key] = tag.split(":");
  if (kind === "setup") return SETUPS[key as keyof typeof SETUPS] && `Setup: ${SETUPS[key as keyof typeof SETUPS]}`;
  if (kind === "emotion") return EMOTIONS[key as keyof typeof EMOTIONS] && `Felt ${EMOTIONS[key as keyof typeof EMOTIONS]}`;
  if (kind === "mistake") return MISTAKES[key as keyof typeof MISTAKES] && `Mistake: ${MISTAKES[key as keyof typeof MISTAKES]}`;
  if (tag === "plan:followed") return "Followed plan";
  if (tag === "plan:broken") return "Broke plan";
}

export const tagLabel = (tag: string) => LABELS[tag] ?? journalLabel(tag) ?? tag.replace(/[_:]/g, " ");

export const isWarningTag = (tag: string) =>
  WARNING.has(tag) ||
  tag.startsWith("mistake:") ||
  tag === "plan:broken" ||
  (tag.startsWith("emotion:") && RISKY_EMOTIONS.includes(tag.slice("emotion:".length) as Emotion));

/** Whether a tag came from your journal rather than from the data. */
export const isJournalTag = (tag: string) => /^(setup|emotion|mistake|plan):/.test(tag);

/** The tags worth showing first: warnings from the data, then from the journal, then the rest. */
export function topTags<T extends { tag: string }>(tags: T[], n: number): { shown: T[]; more: number } {
  const rank = (t: T) => (isWarningTag(t.tag) ? (isJournalTag(t.tag) ? 1 : 0) : t.tag.startsWith("session:") ? 3 : 2);
  const sorted = [...tags].sort((a, b) => rank(a) - rank(b));
  return { shown: sorted.slice(0, n), more: Math.max(0, tags.length - n) };
}
