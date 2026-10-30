// Pure summary maths over trades. Everything counts closed trades only, by
// close time, since an open trade has no final P&L yet.

import type { schema } from "@/db";

type Trade = typeof schema.trades.$inferSelect;
type Tagged = Trade & { tags: { tag: string }[] };

const IST_OFFSET_MS = 330 * 60_000;

const closedOnly = (trades: Trade[]) =>
  trades.filter((t) => t.status === "closed" && t.closedTs !== null).sort((a, b) => a.closedTs! - b.closedTs!);

const total = (list: Trade[], pick: (t: Trade) => number) => list.reduce((a, t) => a + pick(t), 0);

/** Calendar date (YYYY-MM-DD) of a timestamp in India Standard Time. */
export const istDate = (ts: number) => new Date(ts + IST_OFFSET_MS).toISOString().slice(0, 10);

export interface Stats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  netPnl: number;
  grossPnl: number;
  fees: number;
  liquidationFees: number;
  funding: number;
  feeCredits: number;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdown: number;
}

export function computeStats(trades: Trade[]): Stats {
  const closed = closedOnly(trades);
  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl <= 0);
  const winSum = total(wins, (t) => t.netPnl);
  const lossSum = total(losses, (t) => t.netPnl);
  const netPnl = total(closed, (t) => t.netPnl);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    netPnl,
    grossPnl: total(closed, (t) => t.grossPnl),
    fees: total(closed, (t) => t.fees),
    liquidationFees: total(closed, (t) => t.liquidationFees),
    funding: total(closed, (t) => t.funding),
    feeCredits: total(closed, (t) => t.feeCredits),
    avgWin: wins.length ? winSum / wins.length : null,
    avgLoss: losses.length ? lossSum / losses.length : null,
    profitFactor: lossSum < 0 ? winSum / -lossSum : null,
    expectancy: closed.length ? netPnl / closed.length : null,
    maxDrawdown: Math.min(0, ...equityCurve(trades).map((p) => p.drawdown)),
  };
}

export interface EquityPoint {
  /** 1-based count of closed trades so far; 0 is the starting point. */
  n: number;
  ts: number | null;
  tradeId: string | null;
  symbol: string | null;
  tradePnl: number;
  /** Cumulative net P&L after this trade. */
  equity: number;
  /** Distance below the highest equity so far (0 or negative). */
  drawdown: number;
}

export function equityCurve(trades: Trade[]): EquityPoint[] {
  const points: EquityPoint[] = [{ n: 0, ts: null, tradeId: null, symbol: null, tradePnl: 0, equity: 0, drawdown: 0 }];
  let equity = 0;
  let peak = 0;
  closedOnly(trades).forEach((t, i) => {
    equity += t.netPnl;
    peak = Math.max(peak, equity);
    points.push({ n: i + 1, ts: t.closedTs, tradeId: t.id, symbol: t.symbol, tradePnl: t.netPnl, equity, drawdown: equity - peak });
  });
  return points;
}

export interface DayPnl {
  date: string;
  netPnl: number;
  trades: number;
  wins: number;
  /** Net P&L of this day and every day before it in the list. */
  cumulative: number;
}

/** Net P&L per IST calendar day, oldest first. */
export function dailyPnl(trades: Trade[]): DayPnl[] {
  const days = new Map<string, DayPnl>();
  for (const t of closedOnly(trades)) {
    const date = istDate(t.closedTs!);
    const day = days.get(date) ?? { date, netPnl: 0, trades: 0, wins: 0, cumulative: 0 };
    day.netPnl += t.netPnl;
    day.trades += 1;
    if (t.netPnl > 0) day.wins += 1;
    days.set(date, day);
  }
  let cumulative = 0;
  return [...days.values()].map((d) => ({ ...d, cumulative: (cumulative += d.netPnl) }));
}

export interface GroupStats extends Stats {
  key: string;
}

export function groupStats(trades: Trade[], key: (t: Trade) => string): GroupStats[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const k = key(t);
    const list = groups.get(k);
    if (list) list.push(t);
    else groups.set(k, [t]);
  }
  return [...groups.entries()]
    .map(([k, list]) => ({ key: k, ...computeStats(list) }))
    .filter((g) => g.trades > 0)
    .sort((a, b) => b.trades - a.trades);
}

export interface TagPerformance {
  tag: string;
  trades: number;
  winRate: number | null;
  netPnl: number;
  avgPnl: number | null;
}

/** How closed trades carrying each tag performed, worst first. */
export function tagPerformance(trades: Tagged[]): TagPerformance[] {
  const byTag = new Map<string, Trade[]>();
  for (const t of trades) {
    if (t.status !== "closed") continue;
    for (const g of t.tags) {
      const list = byTag.get(g.tag);
      if (list) list.push(t);
      else byTag.set(g.tag, [t]);
    }
  }
  return [...byTag.entries()]
    .map(([tag, list]) => {
      const s = computeStats(list);
      return { tag, trades: s.trades, winRate: s.winRate, netPnl: s.netPnl, avgPnl: s.expectancy };
    })
    .sort((a, b) => a.netPnl - b.netPnl);
}
