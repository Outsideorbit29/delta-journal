"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type AutoscaleInfo,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/db/schema";

// The chart library labels times in UTC; shifting by +5:30 makes it show IST.
const IST_OFFSET_SEC = 19_800;

export interface ChartLeg {
  ts: number;
  qty: number;
  price: number;
}

interface Props {
  candles: Candle[];
  resolutionSec: number;
  legs: ChartLeg[];
  avgEntry: number;
  avgExit: number | null;
  stopPrice: number | null;
  /** The stop was edited, so `stopPrice` is where it ended up. */
  stopMoved: boolean;
  /** From your journal. */
  plannedStop: number | null;
  plannedTarget: number | null;
}

function tokens() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    surface: v("--viz-surface"),
    ink2: v("--viz-ink-2"),
    muted: v("--viz-muted"),
    grid: v("--viz-grid"),
    axis: v("--viz-axis"),
    up: v("--viz-profit"),
    down: v("--viz-loss"),
  };
}

const darkQuery = "(prefers-color-scheme: dark)";
function subscribeScheme(onChange: () => void) {
  const mq = window.matchMedia(darkQuery);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isDark = () => window.matchMedia(darkQuery).matches;

/** Candles around the trade with each fill marked at its price, plus entry, exit and stop lines. */
export function TradeChart({ candles, resolutionSec, legs, avgEntry, avgExit, stopPrice, stopMoved, plannedStop, plannedTarget }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Rebuild the chart with the other palette when the OS theme flips.
  const dark = useSyncExternalStore(subscribeScheme, isDark, () => false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const t = tokens();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: t.surface }, textColor: t.muted, fontFamily: "inherit" },
      grid: { vertLines: { color: t.grid }, horzLines: { color: t.grid } },
      rightPriceScale: { borderColor: t.axis },
      timeScale: { borderColor: t.axis, timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: t.up,
      downColor: t.down,
      wickUpColor: t.up,
      wickDownColor: t.down,
      borderVisible: false,
    });
    series.setData(candles.map((c) => ({ ...c, time: (c.time + IST_OFFSET_SEC) as UTCTimestamp })));

    const markers: SeriesMarker<Time>[] = legs
      .map((l) => {
        const buy = l.qty > 0;
        const candleTime = Math.floor(l.ts / 1000 / resolutionSec) * resolutionSec;
        return {
          time: (candleTime + IST_OFFSET_SEC) as UTCTimestamp,
          position: buy ? ("atPriceBottom" as const) : ("atPriceTop" as const),
          price: l.price,
          shape: buy ? ("arrowUp" as const) : ("arrowDown" as const),
          color: buy ? t.up : t.down,
          text: `${buy ? "Buy" : "Sell"} ${Math.abs(l.qty)}`,
        };
      })
      .sort((a, b) => a.time - b.time);
    createSeriesMarkers(series, markers);

    const line = (price: number, title: string, color: string, style = LineStyle.Solid) =>
      series.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true });
    line(avgEntry, "Entry", t.ink2);
    if (avgExit !== null) line(avgExit, "Exit", t.ink2);
    // Keep every marked level in view, not just the candles' range.
    const levels = [avgEntry, avgExit, stopPrice, plannedStop, plannedTarget].filter((p): p is number => p !== null);
    series.applyOptions({
      autoscaleInfoProvider: (base: () => AutoscaleInfo | null) => {
        const info = base();
        if (!info?.priceRange) return info;
        const { minValue, maxValue } = info.priceRange;
        return { ...info, priceRange: { minValue: Math.min(minValue, ...levels), maxValue: Math.max(maxValue, ...levels) } };
      },
    });

    if (stopPrice !== null && stopPrice !== plannedStop) line(stopPrice, stopMoved ? "Last stop" : "Stop", t.down, LineStyle.Dashed);
    if (plannedStop !== null) line(plannedStop, "Planned stop", t.down, LineStyle.Dotted);
    if (plannedTarget !== null) line(plannedTarget, "Planned target", t.up, LineStyle.Dotted);

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [candles, resolutionSec, legs, avgEntry, avgExit, stopPrice, stopMoved, plannedStop, plannedTarget, dark]);

  return <div ref={ref} className="h-[380px] w-full" role="img" aria-label="Price chart of the trade with entry and exit fills marked" />;
}
