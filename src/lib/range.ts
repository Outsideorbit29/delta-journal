// Date-range presets shared by the dashboard and the trade list.

const DAY = 86_400_000;

export const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;

export type RangeKey = (typeof RANGES)[number]["key"];

export function parseRange(value: unknown): RangeKey {
  return RANGES.some((r) => r.key === value) ? (value as RangeKey) : "all";
}

export function rangeStart(key: RangeKey, now = Date.now()): number | undefined {
  const days = RANGES.find((r) => r.key === key)?.days;
  return days ? now - days * DAY : undefined;
}

export interface Filters {
  /** The trading account shown (an id from `accounts`); unset means the user's first. */
  account?: string;
  range: RangeKey;
  symbol?: string;
  tag?: string;
}

export function readFilters(params: Record<string, string | string[] | undefined>): Filters {
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  return { account: one(params.account), range: parseRange(params.range), symbol: one(params.symbol), tag: one(params.tag) };
}

/** URL for `path` with the current filters, overridden by `next` (undefined clears one). */
export function filterHref(path: string, current: Filters, next: Partial<Filters>): string {
  const merged = { ...current, ...next };
  const q = new URLSearchParams();
  if (merged.account) q.set("account", merged.account);
  if (merged.range && merged.range !== "all") q.set("range", merged.range);
  if (merged.symbol) q.set("symbol", merged.symbol);
  if (merged.tag) q.set("tag", merged.tag);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
