import type { Currency } from "@/db/schema";
import { journalConfig } from "@/lib/config";

const dateTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: journalConfig.timeZone,
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const formatDateTime = (ts: number) => dateTime.format(ts);

const MONEY: Record<Currency, { symbol: string; locale: string }> = {
  USD: { symbol: "$", locale: "en-US" },
  // Indian grouping: ₹1,25,000.00
  INR: { symbol: "₹", locale: "en-IN" },
};

/** "$1,234.50", "-₹1,25,000.00"; with `sign`, gains get a "+". Each account has one currency, never mixed. */
export function formatMoney(n: number | null | undefined, { sign = false, currency = "USD" }: { sign?: boolean; currency?: Currency } = {}) {
  if (n === null || n === undefined) return "–";
  const { symbol, locale } = MONEY[currency];
  const abs = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `-${symbol}${abs}`;
  return `${sign && n > 0 ? "+" : ""}${symbol}${abs}`;
}

/** The symbol alone, for chart axes. */
export const currencySymbol = (currency: Currency = "USD") => MONEY[currency].symbol;

export function formatPrice(n: number | null | undefined) {
  if (n === null || n === undefined) return "–";
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 6 });
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined) return "–";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const formatPercent = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? "–" : `${Math.round(n * 100)}%`);

export const formatR = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}R`);

export const pnlClass = (n: number | null | undefined) =>
  !n ? "text-muted" : n > 0 ? "text-gain" : "text-loss";

/** "Good morning/afternoon/evening, Name" by the hour in India. */
export function greeting(name: string | null | undefined, now = Date.now()): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(now));
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return name ? `Good ${part}, ${name}` : `Good ${part}`;
}
