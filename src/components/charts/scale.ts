// Small scale helpers for the hand-drawn SVG charts.

/** Round tick values covering [min, max], about `count` of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

export function linear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** Axis label for money: whole dollars, compact past 10,000. */
export function axisMoney(v: number) {
  const abs = Math.abs(v);
  const text = abs >= 10_000 ? `${Math.round(abs / 1000)}K` : abs.toLocaleString("en-US", { maximumFractionDigits: abs < 10 ? 1 : 0 });
  return `${v < 0 ? "-" : ""}$${text}`;
}
