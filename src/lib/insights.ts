import { tagPerformance, type TagPerformance } from "@/lib/stats";
import { isJournalTag, isWarningTag } from "@/lib/tags";

// The dashboard's headline findings: which habits cost the most, and what works.

type Trades = Parameters<typeof tagPerformance>[0];

/** A habit needs a few trades before it means anything. */
const MIN_TRADES = 3;

/** One line on what each habit tag means, shown under it on the dashboard. */
export const TAG_HINTS: Record<string, string> = {
  moved_stop: "Stop moved further away while the trade was losing.",
  "hold:scalp": "Trades closed within minutes, where fees eat most of the move.",
  no_stop: "No stop-loss order at all.",
  late_stop: "Stop placed well after entering.",
  oversized: "Much bigger than your usual size.",
  heavy_margin: "Used most of the wallet as margin.",
  high_leverage: "Very high leverage.",
  after_loss: "Opened soon after a losing trade.",
  sized_up_after_loss: "Bigger than usual right after a loss.",
  loss_streak: "Taken during a run of losses.",
  overtrading: "Many trades in a short time.",
  added_to_loser: "Added to a position that was losing.",
  liquidated: "Closed by liquidation.",
  stop_to_profit: "Stop trailed past entry, locking in profit.",
  "hold:swing": "Held for hours or days.",
  win_streak: "Taken during a run of wins.",
  target_hit: "Closed at the planned target.",
};

/** A habit: a warning tag from the data, or scalping. Journal tags would only repeat these. */
const isHabit = (tag: string) => !isJournalTag(tag) && (isWarningTag(tag) || tag === "hold:scalp");

/** The habits that lost the most money, worst first. */
export function biggestLeaks(trades: Trades, n = 3): TagPerformance[] {
  return tagPerformance(trades)
    .filter((r) => isHabit(r.tag) && r.trades >= MIN_TRADES && r.netPnl < 0)
    .slice(0, n);
}

/** Patterns that made money, best first. Sessions and weekdays are left out: they are not habits you can repeat. */
export function whatWorks(trades: Trades, n = 2): TagPerformance[] {
  return tagPerformance(trades)
    .filter((r) => !isJournalTag(r.tag) && !r.tag.startsWith("session:") && r.tag !== "weekend" && r.trades >= MIN_TRADES && r.netPnl > 0)
    .reverse()
    .slice(0, n);
}
