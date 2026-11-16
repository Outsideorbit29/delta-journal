"use client";

import type { Currency } from "@/db/schema";
import { useState } from "react";
import { formatMoney } from "@/lib/format";
import type { DayPnl } from "@/lib/stats";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_MONTHS = 12;
/** Months shown before "Show older months": enough for recent context without a very long page. */
const FIRST_MONTHS = 3;

const monthName = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Thresholds splitting |P&L| into four steps per arm, by quartile of the days shown. */
function binEdges(days: DayPnl[]): number[] {
  const mags = days.map((d) => Math.abs(d.netPnl)).filter((v) => v > 0).sort((a, b) => a - b);
  if (!mags.length) return [0, 0, 0];
  const q = (p: number) => mags[Math.min(mags.length - 1, Math.floor(p * mags.length))];
  return [q(0.25), q(0.5), q(0.75)];
}

function stepOf(value: number, edges: number[]): 1 | 2 | 3 | 4 {
  const mag = Math.abs(value);
  return mag <= edges[0] ? 1 : mag <= edges[1] ? 2 : mag <= edges[2] ? 3 : 4;
}

function cellStyle(day: DayPnl | undefined, edges: number[]) {
  if (!day) return undefined;
  if (Math.abs(day.netPnl) < 0.005) return { background: "var(--viz-neutral)", color: "var(--viz-ink)" };
  const step = stepOf(day.netPnl, edges);
  return { background: `var(--viz-${day.netPnl > 0 ? "profit" : "loss"}-${step})`, color: `var(--viz-on-${step})` };
}

/** Daily net P&L laid out as month calendars, newest month first. */
export function PnlCalendar({ days, currency = "USD" }: { days: DayPnl[]; currency?: Currency }) {
  const [hover, setHover] = useState<{ day: DayPnl; month: string; x: number; y: number } | null>(null);
  const [older, setOlder] = useState(false);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const edges = binEdges(days);
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort().reverse();
  const shown = months.slice(0, older ? MAX_MONTHS : FIRST_MONTHS);

  return (
    <div className="face-label space-y-6">
      <Legend edges={edges} currency={currency} />
      <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((month) => {
          const [y, m] = month.split("-").map(Number);
          const first = new Date(Date.UTC(y, m - 1, 1));
          const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const lead = (first.getUTCDay() + 6) % 7; // Monday first
          const monthDays = days.filter((d) => d.date.startsWith(month));
          const net = monthDays.reduce((a, d) => a + d.netPnl, 0);
          const trades = monthDays.reduce((a, d) => a + d.trades, 0);

          return (
            <section key={month} className="relative" onPointerLeave={() => setHover(null)}>
              <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <h3 className="text-lg text-[var(--viz-ink)]">{monthName.format(first)}</h3>
                <span className="text-sm text-[var(--viz-ink-2)]">
                  <span className="font-medium text-[var(--viz-ink)]">{formatMoney(net, { sign: true, currency })}</span>, {trades} {trades === 1 ? "trade" : "trades"}
                </span>
              </header>
              <div className="grid grid-cols-7 gap-0.5 text-xs">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="pb-0.5 text-center text-[var(--viz-muted)]" aria-hidden>
                    {w[0]}
                  </div>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <div key={`lead${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                  const day = byDate.get(date);
                  const style = cellStyle(day, edges);
                  const show = (el: HTMLElement) => {
                    if (!day) return;
                    const box = el.getBoundingClientRect();
                    const parent = el.closest("section")!.getBoundingClientRect();
                    setHover({ day, month, x: box.left - parent.left + box.width / 2, y: box.top - parent.top });
                  };
                  return (
                    <div
                      key={date}
                      role={day ? "img" : undefined}
                      tabIndex={day ? 0 : undefined}
                      aria-label={day ? `${dayName.format(new Date(date))}: ${formatMoney(day.netPnl, { sign: true, currency })}, ${day.trades} trades` : undefined}
                      onPointerEnter={(e) => show(e.currentTarget)}
                      onFocus={(e) => show(e.currentTarget)}
                      onBlur={() => setHover(null)}
                      className={`flex aspect-square items-center justify-center tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                        day ? "cursor-default" : "text-[var(--viz-muted)] ring-1 ring-inset ring-[var(--viz-grid)]"
                      }`}
                      style={style}
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>
              {hover?.month === month && (
                <div
                  className="pointer-events-none absolute z-(--z-tooltip) w-48 -translate-x-1/2 -translate-y-full border border-rule-2 bg-paper p-3 text-sm"
                  style={{ left: hover.x, top: hover.y - 6 }}
                >
                  <div className="text-base font-medium text-[var(--viz-ink)]">{formatMoney(hover.day.netPnl, { sign: true, currency })}</div>
                  <div className="text-[var(--viz-ink-2)]">{dayName.format(new Date(hover.day.date))}</div>
                  <div className="text-[var(--viz-ink-2)]">
                    {hover.day.trades} {hover.day.trades === 1 ? "trade" : "trades"}, {hover.day.wins} won
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {!older && months.length > shown.length && (
        <button
          type="button"
          onClick={() => setOlder(true)}
          className="min-h-10 w-full border border-ink text-sm whitespace-nowrap text-ink transition-colors duration-(--dur-short) hover:bg-paper-2"
        >
          Show older months ({Math.min(months.length, MAX_MONTHS) - shown.length} more)
        </button>
      )}
      {older && months.length > shown.length && (
        <p className="text-sm text-[var(--viz-muted)]">
          Showing the latest {shown.length} of {months.length} months with trades. Narrow the date range to see older months.
        </p>
      )}
    </div>
  );
}

function Legend({ edges, currency }: { edges: number[]; currency: Currency }) {
  const steps = [4, 3, 2, 1] as const;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--viz-ink-2)]">
      <div className="flex items-center gap-1.5">
        <span>Loss</span>
        {steps.map((s) => (
          <span key={`l${s}`} className="h-3 w-3" style={{ background: `var(--viz-loss-${s})` }} aria-hidden />
        ))}
        <span className="h-3 w-3" style={{ background: "var(--viz-neutral)" }} aria-hidden />
        {[...steps].reverse().map((s) => (
          <span key={`p${s}`} className="h-3 w-3" style={{ background: `var(--viz-profit-${s})` }} aria-hidden />
        ))}
        <span>Profit</span>
      </div>
      <span className="text-[var(--viz-muted)]">
        Steps at {edges.map((e) => formatMoney(e, { currency })).join(", ")}. Empty squares had no closed trades.
      </span>
    </div>
  );
}
