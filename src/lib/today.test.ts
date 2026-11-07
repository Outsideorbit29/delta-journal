import { describe, expect, it } from "vitest";
import { todaySummary } from "./today";

const now = Date.parse("2026-11-08T20:00:00+05:30");
const at = (iso: string) => Date.parse(`${iso}+05:30`);
const trade = (id: string, closed: string | null, netPnl: number, status = "closed") => ({ id, status, closedTs: closed ? at(closed) : null, netPnl });

describe("todaySummary", () => {
  it("counts today by the IST day, the last 7 days, and what still needs journaling", () => {
    const trades = [
      trade("a", "2026-11-08T00:30:00", -4.75), // today in IST, still 7 Nov in UTC
      trade("b", "2026-11-08T19:00:00", 6.15),
      trade("c", "2026-11-07T23:50:00", -2.1), // yesterday
      trade("d", "2026-11-01T21:00:00", -9), // within 7 days
      trade("e", "2026-10-30T10:00:00", 3), // older
      trade("f", null, 0, "open"),
    ];
    const s = todaySummary(trades, new Set(["b", "d"]), now);
    expect(s.today).toMatchObject({ trades: 2, wins: 1 });
    expect(s.today.netPnl).toBeCloseTo(1.4);
    expect(s.recent.trades).toBe(4);
    expect(s.recent.netPnl).toBeCloseTo(-9.7);
    expect(s.toJournal).toBe(2); // a and c
  });

  it("is empty with no recent trades", () => {
    expect(todaySummary([trade("e", "2026-10-01T10:00:00", 3)], new Set(), now)).toEqual({
      today: { netPnl: 0, trades: 0, wins: 0 },
      recent: { netPnl: 0, trades: 0 },
      toJournal: 0,
    });
  });
});
