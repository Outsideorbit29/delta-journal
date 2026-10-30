// Validating journal input and turning it into tags. Pure, so the web form,
// the API and the Telegram bot can share it.

import { EMOTIONS, MISTAKES, SETUPS, SUGGESTED_BY_TAG, type Emotion, type Mistake, type Setup } from "./vocab";

export interface JournalInput {
  setup: Setup | null;
  emotions: Emotion[];
  mistakes: Mistake[];
  followedPlan: boolean | null;
  /** Execution quality, 1-5. */
  rating: number | null;
  notes: string | null;
  plannedStop: number | null;
  plannedTarget: number | null;
}

export const MAX_NOTES = 4000;

const isKey = <T extends object>(obj: T, v: unknown): v is keyof T => typeof v === "string" && Object.hasOwn(obj, v);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Accepts loosely-typed input (form data or JSON) and returns a clean entry, or the problems found. */
export function parseJournalInput(raw: Record<string, unknown>): { ok: true; value: JournalInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);

  const setup = raw.setup === undefined || raw.setup === null || raw.setup === "" ? null : raw.setup;
  if (setup !== null && !isKey(SETUPS, setup)) errors.push(`Unknown setup "${String(setup)}"`);

  const emotions = [...new Set(list(raw.emotions))];
  for (const e of emotions) if (!isKey(EMOTIONS, e)) errors.push(`Unknown emotion "${String(e)}"`);
  const mistakes = [...new Set(list(raw.mistakes))];
  for (const m of mistakes) if (!isKey(MISTAKES, m)) errors.push(`Unknown mistake "${String(m)}"`);

  let followedPlan: boolean | null = null;
  if (raw.followedPlan === true || raw.followedPlan === "yes") followedPlan = true;
  else if (raw.followedPlan === false || raw.followedPlan === "no") followedPlan = false;
  else if (raw.followedPlan !== undefined && raw.followedPlan !== null && raw.followedPlan !== "") errors.push("Followed plan must be yes or no");

  let rating: number | null = null;
  if (raw.rating !== undefined && raw.rating !== null && raw.rating !== "") {
    rating = Number(raw.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push("Rating must be a whole number from 1 to 5");
  }

  const notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null;
  if (notes && notes.length > MAX_NOTES) errors.push(`Notes are limited to ${MAX_NOTES} characters`);

  const plannedStop = num(raw.plannedStop);
  const plannedTarget = num(raw.plannedTarget);
  if (raw.plannedStop && plannedStop === null) errors.push("Planned stop must be a positive price");
  if (raw.plannedTarget && plannedTarget === null) errors.push("Planned target must be a positive price");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      setup: setup as Setup | null,
      emotions: emotions as Emotion[],
      mistakes: mistakes as Mistake[],
      followedPlan,
      rating,
      notes,
      plannedStop,
      plannedTarget,
    },
  };
}

/** Tags stored for a journal entry, so journal answers can be analysed like automatic tags. */
export function journalTags(entry: JournalInput): string[] {
  const tags: string[] = [];
  if (entry.setup) tags.push(`setup:${entry.setup}`);
  for (const e of entry.emotions) tags.push(`emotion:${e}`);
  for (const m of entry.mistakes) tags.push(`mistake:${m}`);
  if (entry.followedPlan !== null) tags.push(entry.followedPlan ? "plan:followed" : "plan:broken");
  return tags;
}

/** Journal answers hinted by a trade's automatic tags. */
export function suggestionsFor(autoTags: string[]): { mistakes: Mistake[]; emotions: Emotion[] } {
  const mistakes = new Set<Mistake>();
  const emotions = new Set<Emotion>();
  for (const tag of autoTags) {
    const s = SUGGESTED_BY_TAG[tag];
    s?.mistakes?.forEach((m) => mistakes.add(m));
    s?.emotions?.forEach((e) => emotions.add(e));
  }
  return { mistakes: [...mistakes], emotions: [...emotions] };
}

/**
 * Risk of a trade, in USD, if it had gone to `stop`, or null when the stop is
 * at or beyond break-even (no risk) or on the wrong side.
 */
export function riskAtStop(
  t: { direction: "long" | "short"; avgEntry: number; contractValue: number },
  stop: number,
  contracts: number,
): number | null {
  const perUnit = t.direction === "long" ? t.avgEntry - stop : stop - t.avgEntry;
  const risk = perUnit * contracts * t.contractValue;
  return risk > 0 ? risk : null;
}

export interface EffectiveRisk {
  riskAmount: number | null;
  riskSource: "journal" | "stop_order" | null;
  rMultiple: number | null;
}

/**
 * The risk used for R: your planned stop from the journal when you gave one,
 * otherwise the stop order found on Delta (only known if it was never moved).
 */
export function effectiveRisk(
  t: {
    direction: "long" | "short";
    avgEntry: number;
    contractValue: number;
    maxQty: number;
    status: "open" | "closed";
    netPnl: number;
    stopOrderRisk: number | null;
  },
  plannedStop: number | null,
): EffectiveRisk {
  const riskAmount = plannedStop !== null ? riskAtStop(t, plannedStop, t.maxQty) : t.stopOrderRisk;
  return {
    riskAmount,
    riskSource: riskAmount === null ? null : plannedStop !== null ? "journal" : "stop_order",
    rMultiple: riskAmount && t.status === "closed" ? t.netPnl / riskAmount : null,
  };
}
