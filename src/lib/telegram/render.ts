// What the bot shows for a trade, and what each button does. Pure functions:
// no network or database, so the whole journaling flow is unit-testable.

import type { schema } from "@/db";
import type { Currency } from "@/db/schema";
import type { NoteSuggestion } from "@/lib/ai/suggest";
import type { Review } from "@/lib/ai/review";
import type { JournalInput } from "@/lib/journal/entry";
import { EMOTIONS, MISTAKES, SETUPS, type Emotion, type Mistake, type Setup } from "@/lib/journal/vocab";
import { formatDateTime, formatDuration, formatMoney, formatPrice, formatR } from "@/lib/format";
import { isJournalTag, isWarningTag, tagLabel } from "@/lib/tags";
import type { InlineButton, ReplyMarkup } from "./api";

type Trade = typeof schema.trades.$inferSelect;

/** The journaling steps, in order. Each button tap either stays on its step or moves to the next. */
export type Stage = "setup" | "emotions" | "mistakes" | "plan" | "rating" | "done";

const STEP_PROMPTS: Record<Exclude<Stage, "done">, string> = {
  setup: "1/5 · What was the setup?",
  emotions: "2/5 · How did you feel? Tap all that apply, then Next.",
  mistakes: "3/5 · Any mistakes? Tap all that apply, then Next.",
  plan: "4/5 · Did you follow your plan?",
  rating: "5/5 · Rate your execution, 1 (poor) to 5 (great).",
};

const EXIT_LABELS = { stop: "stop-loss", target: "take-profit", liquidation: "liquidation", manual: "closed manually", flip: "flipped" };

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- callbacks ---------------------------------------------------------------

/**
 * Button payloads are short (Telegram allows 64 bytes): "<step>:<action>[:<value>]".
 * The trade comes from the message the button is on, not the payload.
 */
export type Callback =
  | { kind: "setup"; value: Setup | null }
  | { kind: "emotion"; value: Emotion }
  | { kind: "mistake"; value: Mistake }
  | { kind: "next"; from: "emotions" | "mistakes" }
  | { kind: "plan"; value: boolean | null }
  | { kind: "rating"; value: number | null }
  | { kind: "note" }
  | { kind: "edit" };

export function encodeCallback(cb: Callback): string {
  switch (cb.kind) {
    case "setup":
      return cb.value ? `s:v:${cb.value}` : "s:x";
    case "emotion":
      return `e:t:${cb.value}`;
    case "mistake":
      return `m:t:${cb.value}`;
    case "next":
      return cb.from === "emotions" ? "e:n" : "m:n";
    case "plan":
      return cb.value === null ? "p:x" : cb.value ? "p:y" : "p:n";
    case "rating":
      return cb.value === null ? "r:x" : `r:v:${cb.value}`;
    case "note":
      return "d:note";
    case "edit":
      return "d:edit";
  }
}

export function parseCallback(data: string | undefined): Callback | null {
  if (!data) return null;
  const [step, action, value] = data.split(":");
  const has = (obj: object, k: string | undefined): k is string => k !== undefined && Object.hasOwn(obj, k);
  if (step === "s" && action === "x") return { kind: "setup", value: null };
  if (step === "s" && action === "v" && has(SETUPS, value)) return { kind: "setup", value: value as Setup };
  if (step === "e" && action === "t" && has(EMOTIONS, value)) return { kind: "emotion", value: value as Emotion };
  if (step === "e" && action === "n") return { kind: "next", from: "emotions" };
  if (step === "m" && action === "t" && has(MISTAKES, value)) return { kind: "mistake", value: value as Mistake };
  if (step === "m" && action === "n") return { kind: "next", from: "mistakes" };
  if (step === "p" && (action === "y" || action === "n" || action === "x")) return { kind: "plan", value: action === "x" ? null : action === "y" };
  if (step === "r" && action === "x") return { kind: "rating", value: null };
  if (step === "r" && action === "v" && ["1", "2", "3", "4", "5"].includes(value ?? "")) return { kind: "rating", value: Number(value) };
  if (data === "d:note") return { kind: "note" };
  if (data === "d:edit") return { kind: "edit" };
  return null;
}

/** Applies a tap to the entry and returns the step to show next. "note" is handled by the bot. */
export function applyCallback(entry: JournalInput, cb: Callback): { entry: JournalInput; stage: Stage } {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  switch (cb.kind) {
    case "setup":
      return { entry: { ...entry, setup: cb.value ?? entry.setup }, stage: "emotions" };
    case "emotion":
      return { entry: { ...entry, emotions: toggle(entry.emotions, cb.value) }, stage: "emotions" };
    case "mistake":
      return { entry: { ...entry, mistakes: toggle(entry.mistakes, cb.value) }, stage: "mistakes" };
    case "next":
      return { entry, stage: cb.from === "emotions" ? "mistakes" : "plan" };
    case "plan":
      return { entry: { ...entry, followedPlan: cb.value ?? entry.followedPlan }, stage: "rating" };
    case "rating":
      return { entry: { ...entry, rating: cb.value ?? entry.rating }, stage: "done" };
    case "edit":
      return { entry, stage: "setup" };
    case "note":
      return { entry, stage: "done" };
  }
}

/** Whether the tap changes what is saved (moving between steps does not). */
export const changesEntry = (cb: Callback) =>
  (cb.kind === "setup" || cb.kind === "plan" || cb.kind === "rating") ? cb.value !== null : cb.kind === "emotion" || cb.kind === "mistake";

// --- message ---------------------------------------------------------------

interface Suggestions {
  emotions: Emotion[];
  mistakes: Mistake[];
}

export function renderTradeCard(
  /** With its account's currency (USD when not given). */
  trade: Trade & { currency?: Currency },
  autoTags: string[],
  entry: JournalInput | null,
  stage: Stage,
  suggested: Suggestions = { emotions: [], mistakes: [] },
): { text: string; markup: ReplyMarkup } {
  const e = entry ?? { setup: null, emotions: [], mistakes: [], followedPlan: null, rating: null, notes: null, plannedStop: null, plannedTarget: null };
  const lines: string[] = [];

  const currency = trade.currency ?? "USD";
  // Rupee accounts are Indian brokers: shares or units, no leverage.
  const indian = currency === "INR";
  const pnl = trade.status === "closed" ? formatMoney(trade.netPnl, { sign: true, currency }) : "open";
  lines.push(`<b>${escapeHtml(trade.symbol)} ${trade.direction}</b> · <b>${pnl}</b>${trade.rMultiple !== null ? ` (${formatR(trade.rMultiple)})` : ""}`);
  lines.push(
    indian
      ? `Held ${formatDuration(trade.holdSeconds)} · ${trade.maxQty.toLocaleString("en-IN")} ${trade.contractType === "equity" ? "shares" : "units"}`
      : `Held ${formatDuration(trade.holdSeconds)} · ${trade.maxQty.toLocaleString("en-US")} contracts${trade.leverage ? ` · ${trade.leverage}x` : ""}`,
  );
  lines.push(
    `${formatPrice(trade.avgEntry)} → ${formatPrice(trade.avgExit)}${trade.exitReason ? ` (${EXIT_LABELS[trade.exitReason]})` : ""} · ${indian ? "charges" : "fees"} ${formatMoney(trade.fees + trade.liquidationFees, { currency })}`,
  );
  const warnings = autoTags.filter((t) => isWarningTag(t) && !isJournalTag(t)).map(tagLabel);
  if (warnings.length) lines.push(`⚠️ ${warnings.join(" · ")}`);

  const summary = journalSummary(e);
  if (summary) lines.push("", `<b>Journal:</b> ${summary}`);
  if (e.notes) lines.push(`<i>${escapeHtml(e.notes)}</i>`);
  lines.push("", stage === "done" ? "Saved. Reply to this message to add a note." : STEP_PROMPTS[stage]);

  return { text: lines.join("\n"), markup: { inline_keyboard: keyboard(e, stage, suggested) } };
}

export function journalSummary(e: JournalInput): string {
  const parts: string[] = [];
  if (e.setup) parts.push(SETUPS[e.setup]);
  if (e.emotions.length) parts.push(`felt ${e.emotions.map((k) => EMOTIONS[k]).join(", ")}`);
  if (e.mistakes.length) parts.push(`mistakes: ${e.mistakes.map((k) => MISTAKES[k]).join(", ")}`);
  if (e.followedPlan !== null) parts.push(e.followedPlan ? "followed plan" : "broke plan");
  if (e.rating !== null) parts.push(`execution ${e.rating}/5`);
  return parts.join(" · ");
}

function keyboard(e: JournalInput, stage: Stage, s: Suggestions): InlineButton[][] {
  const btn = (text: string, cb: Callback): InlineButton => ({ text, callback_data: encodeCallback(cb) });
  const mark = (selected: boolean, suggested: boolean, label: string) => (selected ? `✓ ${label}` : suggested ? `• ${label}` : label);

  switch (stage) {
    case "setup":
      return [
        ...rows((Object.keys(SETUPS) as Setup[]).map((k) => btn(mark(e.setup === k, false, SETUPS[k]), { kind: "setup", value: k })), 3),
        [btn("Skip", { kind: "setup", value: null })],
      ];
    case "emotions":
      return [
        ...rows(
          (Object.keys(EMOTIONS) as Emotion[]).map((k) => btn(mark(e.emotions.includes(k), s.emotions.includes(k), EMOTIONS[k]), { kind: "emotion", value: k })),
          3,
        ),
        [btn("Next →", { kind: "next", from: "emotions" })],
      ];
    case "mistakes":
      return [
        ...rows(
          (Object.keys(MISTAKES) as Mistake[]).map((k) => btn(mark(e.mistakes.includes(k), s.mistakes.includes(k), MISTAKES[k]), { kind: "mistake", value: k })),
          2,
        ),
        [btn(e.mistakes.length ? "Next →" : "No mistakes →", { kind: "next", from: "mistakes" })],
      ];
    case "plan":
      return [
        [btn(mark(e.followedPlan === true, false, "Yes"), { kind: "plan", value: true }), btn(mark(e.followedPlan === false, false, "No"), { kind: "plan", value: false })],
        [btn("Skip", { kind: "plan", value: null })],
      ];
    case "rating":
      return [[1, 2, 3, 4, 5].map((n) => btn(mark(e.rating === n, false, String(n)), { kind: "rating", value: n })), [btn("Skip", { kind: "rating", value: null })]];
    case "done":
      return [[btn("📝 Add note", { kind: "note" }), btn("✏️ Edit answers", { kind: "edit" })]];
  }
}

// --- AI ----------------------------------------------------------------------

/** "Felt FOMO · mistakes: Chased entry" for answers suggested from a note. */
export function suggestionSummary(s: NoteSuggestion): string {
  return journalSummary({ ...s, rating: null, notes: null, plannedStop: null, plannedTarget: null });
}

const TELEGRAM_MAX_CHARS = 4096;

/** A coaching review as one Telegram message. Model text is escaped. */
export function renderReview(review: Review, meta: { periodStart: number; periodEnd: number; tradeCount: number }): string {
  const e = escapeHtml;
  const day = (ts: number) => formatDateTime(ts).split(",")[0];
  const lines = [
    `<b>Trading review</b> · ${day(meta.periodStart)} – ${day(meta.periodEnd)} · ${meta.tradeCount} trades`,
    "",
    `<b>${e(review.headline)}</b>`,
    e(review.summary),
    "",
    "<b>Costly habits</b>",
    ...review.leaks.map((l) => `• ${e(l.pattern)}: ${e(l.evidence)}${l.costUsd !== null ? ` (${formatMoney(l.costUsd, { sign: true })})` : ""}`),
  ];
  if (review.strengths.length) lines.push("", "<b>What helped</b>", ...review.strengths.map((s) => `• ${e(s.point)}: ${e(s.evidence)}`));
  lines.push("", "<b>Rules for next week</b>", ...review.rules.map((r, i) => `${i + 1}. ${e(r)}`));
  if (review.journaling) lines.push("", `<i>${e(review.journaling)}</i>`);
  const text = lines.join("\n");
  return text.length <= TELEGRAM_MAX_CHARS ? text : `${text.slice(0, TELEGRAM_MAX_CHARS - 40)}…\n\n(Full review in the app.)`;
}

function rows<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
