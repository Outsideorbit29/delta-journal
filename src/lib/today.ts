import { istDate } from "@/lib/stats";

// The top of the dashboard: how today went and what is left to journal, whatever the filters say.

/** The window the journal queue and Telegram's /journal use. */
export const RECENT_DAYS = 7;
const DAY_MS = 86_400_000;

interface SummaryTrade {
  id: string;
  status: string;
  closedTs: number | null;
  netPnl: number;
}

export interface TodaySummary {
  /** Trades closed today (IST). */
  today: { netPnl: number; trades: number; wins: number };
  /** Trades closed in the last RECENT_DAYS days. */
  recent: { netPnl: number; trades: number };
  /** Closed in the last RECENT_DAYS days and not journaled yet. */
  toJournal: number;
}

/** How far back to load trades for the summary (by opening time, so a long trade closed this week is still in). */
export const summarySince = (now = Date.now()) => now - 30 * DAY_MS;

export function todaySummary(trades: SummaryTrade[], journaled: Set<string>, now = Date.now()): TodaySummary {
  const day = istDate(now);
  const since = now - RECENT_DAYS * DAY_MS;
  const summary: TodaySummary = { today: { netPnl: 0, trades: 0, wins: 0 }, recent: { netPnl: 0, trades: 0 }, toJournal: 0 };
  for (const t of trades) {
    if (t.status !== "closed" || t.closedTs === null) continue;
    if (istDate(t.closedTs) === day) {
      summary.today.netPnl += t.netPnl;
      summary.today.trades++;
      if (t.netPnl > 0) summary.today.wins++;
    }
    if (t.closedTs >= since) {
      summary.recent.netPnl += t.netPnl;
      summary.recent.trades++;
      if (!journaled.has(t.id)) summary.toJournal++;
    }
  }
  return summary;
}
