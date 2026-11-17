import type { Currency } from "@/db/schema";
import { formatDuration, formatMoney, formatPrice } from "@/lib/format";

// The trade page's story: one plain summary line, the trade's moments in time order, and where its money went.
// Pure, so it is tested (trade-story.test.ts).

type Tag = { tag: string; detail: string | null };

export interface StoryTrade {
  status: "open" | "closed";
  direction: "long" | "short";
  holdSeconds: number | null;
  netPnl: number;
  grossPnl: number;
  exitReason: "stop" | "target" | "liquidation" | "manual" | "flip" | null;
  tags: Tag[];
}

const detailOf = (tags: Tag[], tag: string) => tags.find((g) => g.tag === tag)?.detail ?? null;
const has = (tags: Tag[], tag: string) => tags.some((g) => g.tag === tag);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A short account of the trade in words: how it went and how long it was held, what the stop did, then what was
 * unusual about it (size, timing). Only facts the automatic tags already found.
 */
export function tradeSummary(t: StoryTrade): string {
  const tags = t.tags;
  const parts: string[] = [];
  if (t.status === "open") parts.push(`This ${t.direction} is still open.`);
  else {
    const outcome = t.netPnl < 0 ? "losing" : t.netPnl > 0 ? "winning" : "flat";
    parts.push(`You held a ${outcome} ${t.direction} for ${formatDuration(t.holdSeconds)}.`);
    const before = detailOf(tags, "won_before_charges");
    if (before) parts.push(`It made ${before}.`);
  }

  const stoppedOut = t.exitReason === "stop";
  if (has(tags, "moved_stop")) parts.push(`You moved the stop while still behind${stoppedOut ? ", then it took you out" : ""}.`);
  else if (has(tags, "stop_to_profit")) parts.push(`You trailed the stop into profit${stoppedOut ? ", and it closed the trade" : ""}.`);
  else {
    if (has(tags, "no_stop")) parts.push("There was no stop.");
    const late = detailOf(tags, "late_stop");
    if (late) parts.push(`${sentence(late)}.`);
    if (t.status === "closed") {
      const exit = { stop: "The stop closed it.", target: "It closed at your target.", liquidation: "It was liquidated.", flip: "You flipped it to the other side.", manual: null }[t.exitReason ?? "manual"];
      if (exit) parts.push(exit);
    }
  }

  const size = detailOf(tags, "oversized") ?? detailOf(tags, "sized_up_after_loss");
  const timing = detailOf(tags, "loss_streak") ?? detailOf(tags, "after_loss");
  const context = [size, timing && `opened ${timing}`].filter(Boolean);
  if (context.length) parts.push(`It was ${context.join(", ")}.`);
  return parts.join(" ");
}

export interface StoryLeg {
  fillId: string;
  kind: "open" | "add" | "reduce" | "close";
  qty: number;
  price: number;
  fee: number;
  ts: number;
}

export interface TimelineTrade extends StoryTrade {
  openedTs: number;
  stopPrice: number | null;
  stopPlacedAfterSec: number | null;
  stopMovedAfterSec: number | null;
  currency: Currency;
  legs: StoryLeg[];
}

export interface Moment {
  key: string;
  ts: number;
  title: string;
  detail: string;
  /** A moment worth a second look (a stop moved while losing). */
  warn: boolean;
}

/** The trade's moments in time order: each fill, and when the stop was placed and moved. */
export function tradeTimeline(t: TimelineTrade, units: string): Moment[] {
  const opening = t.direction === "long" ? "Bought" : "Sold";
  const closing = t.direction === "long" ? "Sold" : "Bought back";
  const fee = (l: StoryLeg) => `${t.currency === "INR" ? "charges" : "fee"} ${formatMoney(l.fee, { currency: t.currency })}`;
  const qty = (l: StoryLeg) => `${Math.abs(l.qty).toLocaleString("en-IN")} ${units}`;
  const last = t.legs.at(-1);

  const moments: (Moment & { order: number })[] = t.legs.map((l, i) => {
    let title: string;
    if (l.kind === "open") title = `${opening} ${qty(l)} at ${formatPrice(l.price)}`;
    else if (l.kind === "add") title = `Added ${qty(l)} at ${formatPrice(l.price)}`;
    else if (l.kind === "reduce") title = `${closing} ${qty(l)} at ${formatPrice(l.price)}`;
    else if (l === last && t.exitReason === "stop") title = `Stopped out at ${formatPrice(l.price)}`;
    else if (l === last && t.exitReason === "target") title = `Target hit at ${formatPrice(l.price)}`;
    else if (l === last && t.exitReason === "liquidation") title = `Liquidated at ${formatPrice(l.price)}`;
    else title = `${closing} ${qty(l)} at ${formatPrice(l.price)}`;
    return { key: l.fillId, ts: l.ts, title, detail: sentence(fee(l)), warn: false, order: i * 3 };
  });

  if (t.stopPlacedAfterSec !== null) {
    const moved = t.stopMovedAfterSec !== null;
    moments.push({
      key: "stop-placed",
      ts: t.openedTs + t.stopPlacedAfterSec * 1000,
      title: `Stop placed, ${formatDuration(t.stopPlacedAfterSec)} after entry`,
      detail: moved ? "Its first price is gone: Delta keeps only the last one" : `At ${formatPrice(t.stopPrice)}`,
      warn: false,
      order: 1,
    });
  }
  if (t.stopMovedAfterSec !== null) {
    const losing = has(t.tags, "moved_stop");
    moments.push({
      key: "stop-moved",
      ts: t.openedTs + t.stopMovedAfterSec * 1000,
      title: losing ? "Stop moved while losing" : has(t.tags, "stop_to_profit") ? "Stop trailed past entry" : "Stop moved",
      detail: `${formatDuration(t.stopMovedAfterSec)} after entry${t.stopPrice === null ? "" : `, to ${formatPrice(t.stopPrice)}`}`,
      warn: losing,
      order: 2,
    });
  }
  return moments.sort((a, b) => a.ts - b.ts || a.order - b.order).map((m) => ({ key: m.key, ts: m.ts, title: m.title, detail: m.detail, warn: m.warn }));
}

export interface MoneyStep {
  label: string;
  value: number;
  /** Where the step's bar starts and how wide it is, as a share of the whole span (0 to 1). */
  left: number;
  width: number;
}

/**
 * Where the money went, as a waterfall: each step starts where the last one ended, so the price move, the costs and
 * the net read as one line. The net's bar runs from zero.
 */
export function moneySteps(steps: { label: string; value: number }[]): { steps: MoneyStep[]; net: number } {
  let at = 0;
  const spans = steps.map((s) => {
    const from = at;
    at += s.value;
    return { ...s, from, to: at };
  });
  const lo = Math.min(0, ...spans.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(0, ...spans.map((s) => Math.max(s.from, s.to)));
  const span = hi - lo || 1;
  return {
    steps: spans.map((s) => ({ label: s.label, value: s.value, left: (Math.min(s.from, s.to) - lo) / span, width: Math.abs(s.value) / span })),
    net: at,
  };
}
