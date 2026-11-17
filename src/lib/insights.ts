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
  expiry_day: "Options or futures traded on their expiry day.",
  "nse:open": "Opened in the first 30 minutes after 9:15.",
  "nse:close": "Opened in the last 30 minutes before 15:30.",
  won_before_charges: "Trades that made money until brokerage, STT and GST were paid.",
  "product:intraday": "Intraday (MIS) trades, squared off the same day.",
  "product:delivery": "Delivery (CNC) trades, held overnight or longer.",
};

/** What to do about a leak, one plain line (habits without one show no fix). */
export const LEAK_FIXES: Record<string, string> = {
  moved_stop: "Set the stop once. If it is wrong, close the trade instead.",
  "hold:scalp": "Costs eat quick trades. Hold for a planned target, or skip the trade.",
  no_stop: "Place the stop with the entry, as a bracket order.",
  late_stop: "Place the stop in the same minute as the entry.",
  oversized: "Keep size near your usual; size up only by plan, never by feel.",
  heavy_margin: "Leave most of the wallet free; one trade should never be able to sink it.",
  high_leverage: "Lower the leverage: the same move then costs far less.",
  after_loss: "After a loss, wait 30 minutes before the next trade.",
  sized_up_after_loss: "Never size up to win a loss back. Same size, or stop for the day.",
  loss_streak: "After three losses in a row, stop for the day.",
  overtrading: "Cap your trades per hour; most of the extra ones lose.",
  added_to_loser: "Never add to a losing position; add only to winners, by plan.",
  liquidated: "Use a stop well before the liquidation price.",
  expiry_day: "Expiry-day options decay fast. Trade them only with a plan, or not at all.",
  "nse:open": "Let the first 30 minutes settle before entering.",
  won_before_charges: "Small targets lose to brokerage, STT and GST. Aim for moves several times your charges.",
};

/** A habit: a warning tag from the data, or scalping. Journal tags would only repeat these. */
export const isHabit = (tag: string) =>
  !isJournalTag(tag) && (isWarningTag(tag) || tag === "hold:scalp" || tag === "expiry_day" || tag === "nse:open");

/** The habits that lost the most money, worst first. */
export function biggestLeaks(trades: Trades, n = 3): TagPerformance[] {
  return tagPerformance(trades)
    .filter((r) => isHabit(r.tag) && r.trades >= MIN_TRADES && r.netPnl < 0)
    .slice(0, n);
}

/** Patterns that made money, best first. Sessions and weekdays are left out: they are not habits you can repeat. */
export function whatWorks(trades: Trades, n = 2): TagPerformance[] {
  return tagPerformance(trades)
    .filter((r) => !isJournalTag(r.tag) && !r.tag.startsWith("session:") && !r.tag.startsWith("nse:") && r.tag !== "weekend" && r.trades >= MIN_TRADES && r.netPnl > 0)
    .reverse()
    .slice(0, n);
}
