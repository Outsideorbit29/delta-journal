"use client";

import type { Currency } from "@/db/schema";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { EquityPoint } from "@/lib/stats";
import { axisMoney, linear, niceTicks } from "./scale";

const M = { top: 12, right: 76, bottom: 0, left: 56 };
const EQUITY_H = 220;
const GAP = 44;
const DD_H = 90;
const AXIS_H = 28;
const HEIGHT = EQUITY_H + GAP + DD_H + AXIS_H;

/** Cumulative net P&L by closed trade, with the drawdown beneath it on its own axis. */
export function EquityChart({ points, currency = "USD" }: { points: EquityPoint[]; currency?: Currency }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const last = points.length - 1;
  const x = linear([0, Math.max(1, last)], [M.left, width - M.right]);

  const eqTicks = niceTicks(Math.min(0, ...points.map((p) => p.equity)), Math.max(0, ...points.map((p) => p.equity)));
  const yEq = linear([eqTicks[0], eqTicks[eqTicks.length - 1]], [M.top + EQUITY_H, M.top]);
  const ddTop = M.top + EQUITY_H + GAP;
  const ddTicks = niceTicks(Math.min(...points.map((p) => p.drawdown), -1), 0, 2);
  const yDd = linear([ddTicks[0], 0], [ddTop + DD_H, ddTop]);
  const xTicks = niceTicks(0, last, Math.min(6, Math.max(1, last))).filter((t) => t <= last && Number.isInteger(t));

  const line = (y: (v: number) => number, pick: (p: EquityPoint) => number) =>
    points.map((p, i) => `${i ? "L" : "M"}${x(p.n).toFixed(1)},${y(pick(p)).toFixed(1)}`).join("");
  const area = (y: (v: number) => number, pick: (p: EquityPoint) => number) =>
    `${line(y, pick)}L${x(last).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const n = Math.round(((e.clientX - box.left) / box.width) * last);
    setHover(Math.min(last, Math.max(0, n)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((h) => Math.min(last, Math.max(0, (h ?? last) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const h = hover === null ? null : points[hover];
  const end = points[last];

  return (
    <div
      ref={ref}
      className="face-label relative outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
      tabIndex={0}
      role="img"
      aria-label={`Equity curve over ${last} closed trades, ending at ${formatMoney(end.equity, { currency })}. Use the arrow keys to read each trade.`}
      onKeyDown={onKey}
      onFocus={() => setHover((v) => v ?? last)}
      onBlur={() => setHover(null)}
    >
      {/* The lines trace themselves as the chart scrolls in (globals.css → Motion, A3). */}
      <svg width={width} height={HEIGHT} className="chart-timeline block overflow-visible">
        {/* Equity */}
        {eqTicks.map((t) => (
          <g key={`e${t}`}>
            <line x1={M.left} x2={width - M.right} y1={yEq(t)} y2={yEq(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} />
            <text x={M.left - 8} y={yEq(t)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-muted)] text-xs tabular-nums">
              {axisMoney(t, currency)}
            </text>
          </g>
        ))}
        <path className="draw-after" d={area(yEq, (p) => p.equity)} fill="var(--viz-profit)" fillOpacity={0.1} />
        <path className="draw-line" pathLength={1} d={line(yEq, (p) => p.equity)} fill="none" stroke="var(--viz-profit)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle className="draw-after" cx={x(last)} cy={yEq(end.equity)} r={4} fill="var(--viz-profit)" stroke="var(--viz-surface)" strokeWidth={2} />
        <text x={x(last) + 10} y={yEq(end.equity)} dy="0.32em" className="draw-after fill-[var(--viz-ink)] text-xs font-medium">
          {formatMoney(end.equity, { sign: true, currency })}
        </text>

        {/* Drawdown */}
        <text x={M.left} y={ddTop - 14} className="fill-[var(--viz-ink-2)] text-xs">
          Drawdown from peak
        </text>
        {ddTicks.map((t) => (
          <g key={`d${t}`}>
            <line x1={M.left} x2={width - M.right} y1={yDd(t)} y2={yDd(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} />
            <text x={M.left - 8} y={yDd(t)} dy="0.32em" textAnchor="end" className="fill-[var(--viz-muted)] text-xs tabular-nums">
              {axisMoney(t, currency)}
            </text>
          </g>
        ))}
        <path className="draw-after" d={area(yDd, (p) => p.drawdown)} fill="var(--viz-loss)" fillOpacity={0.1} />
        <path className="draw-line" pathLength={1} d={line(yDd, (p) => p.drawdown)} fill="none" stroke="var(--viz-loss)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Trade-number axis */}
        {xTicks.map((t) => (
          <text key={`x${t}`} x={x(t)} y={ddTop + DD_H + 18} textAnchor="middle" className="fill-[var(--viz-muted)] text-xs tabular-nums">
            {t}
          </text>
        ))}
        <text x={width - M.right} y={ddTop + DD_H + 18} dx={10} className="fill-[var(--viz-muted)] text-xs">
          trades
        </text>

        {/* Crosshair */}
        {h && (
          <g pointerEvents="none">
            <line x1={x(h.n)} x2={x(h.n)} y1={M.top} y2={ddTop + DD_H} stroke="var(--viz-muted)" />
            <circle cx={x(h.n)} cy={yEq(h.equity)} r={4} fill="var(--viz-profit)" stroke="var(--viz-surface)" strokeWidth={2} />
            <circle cx={x(h.n)} cy={yDd(h.drawdown)} r={4} fill="var(--viz-loss)" stroke="var(--viz-surface)" strokeWidth={2} />
          </g>
        )}
        <rect
          x={M.left}
          y={M.top}
          width={Math.max(0, width - M.left - M.right)}
          height={ddTop + DD_H - M.top}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute z-(--z-tooltip) w-56 border border-rule-2 bg-paper p-3 text-sm"
          style={{ left: Math.min(x(h.n) + 12, width - 216), top: M.top }}
        >
          <div className="text-[var(--viz-ink-2)]">
            {h.n === 0 ? "Start" : `After trade ${h.n}`}
            {h.ts !== null && `, ${formatDateTime(h.ts)}`}
          </div>
          <dl className="mt-1.5 space-y-0.5">
            <TooltipRow color="var(--viz-profit)" label="Cumulative P&L" value={formatMoney(h.equity, { sign: true, currency })} />
            <TooltipRow color="var(--viz-loss)" label="Drawdown" value={formatMoney(h.drawdown, { currency })} />
          </dl>
          {h.ts !== null && (
            <p className="mt-1.5 text-[var(--viz-ink-2)]">
              This trade: {h.symbol} {formatMoney(h.tradePnl, { sign: true, currency })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-0.5 w-3" style={{ background: color }} aria-hidden />
      <dt className="flex-1 text-[var(--viz-ink-2)]">{label}</dt>
      <dd className="font-medium tabular-nums text-[var(--viz-ink)]">{value}</dd>
    </div>
  );
}
