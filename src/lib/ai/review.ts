import { and, desc, eq, gte, lt } from "drizzle-orm";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { schema, type Db } from "@/db";
import type { Broker } from "@/db/schema";
import { formatDateTime } from "@/lib/format";
import { computeStats, tagPerformance } from "@/lib/stats";
import { isJournalTag, tagLabel } from "@/lib/tags";
import { AI_MODELS } from "./models";

const DAY_MS = 86_400_000;
/** Keeps the prompt small: the most recent trades in the period are listed one by one. */
const MAX_LISTED_TRADES = 80;

export const reviewSchema = z.object({
  headline: z.string().describe("The single most important thing about this period, as one short sentence"),
  summary: z.string().describe("Two short sentences on how the period went, with the key numbers"),
  strengths: z
    .array(z.object({ point: z.string(), evidence: z.string().describe("The numbers or trades that show it") }))
    .max(3)
    .describe("Habits that helped, if any. Empty if nothing stands out."),
  leaks: z
    .array(
      z.object({
        pattern: z.string().describe("A behaviour that cost money, in plain words"),
        evidence: z.string().describe("Counts, win rate and P&L from the data that show it"),
        // Named before rupee accounts existed (stored reviews use it): the amount is in the account's currency.
        costUsd: z.number().nullable().describe("Net P&L of the trades showing this pattern, in the account's currency, if it can be read from the data"),
      }),
    )
    .min(1)
    .max(4)
    .describe("The costliest habits, worst first"),
  rules: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("Concrete, checkable rules for the next period, each tied to a leak and written as one short plain sentence"),
  journaling: z.string().nullable().describe("A short note on journaling coverage or quality, if worth saying"),
});

export type Review = z.infer<typeof reviewSchema>;

/** Longest any single text field may be; anything longer is a runaway generation. */
const MAX_FIELD_CHARS = 500;
/** Bounds cost if a model runs away (reasoning models count thinking as output). */
const MAX_OUTPUT_TOKENS = 8000;

/**
 * Models occasionally pad structured output with runs of whitespace or ramble.
 * Collapses whitespace in every text field and caps its length.
 */
export function tidyReview(review: Review): Review {
  const clean = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length <= MAX_FIELD_CHARS ? t : `${t.slice(0, MAX_FIELD_CHARS - 1).trimEnd()}…`;
  };
  return {
    headline: clean(review.headline),
    summary: clean(review.summary),
    strengths: review.strengths.map((x) => ({ point: clean(x.point), evidence: clean(x.evidence) })),
    leaks: review.leaks.map((x) => ({ pattern: clean(x.pattern), evidence: clean(x.evidence), costUsd: x.costUsd })),
    rules: review.rules.map(clean).filter(Boolean),
    journaling: review.journaling === null ? null : clean(review.journaling) || null,
  };
}
export type ReviewRow = typeof schema.aiReviews.$inferSelect;

/** What the coach is told about the account's market, so it reads the numbers right. */
const MARKETS: Record<Broker, string> = {
  delta: "Delta Exchange India (crypto and tokenized-gold perpetual futures, amounts in USD)",
  dhan: "Dhan, an Indian broker (NSE and BSE stocks, intraday and delivery, and index and stock options and futures; amounts in INR, and fees are the statutory charges: brokerage, STT, GST, exchange and SEBI fees, stamp duty; stop orders are not visible)",
  groww: "Groww, an Indian broker (NSE and BSE stocks and F&O; amounts in INR, fees are the statutory charges)",
};

const system = (broker: Broker) => `You are a trading coach reviewing one trader's journal from ${MARKETS[broker]}.

Coach the process and habits, using only the data provided:
- Base every claim on the numbers given, and quote them (counts, win rates, P&L, R-multiples).
- Tags were computed from the trader's own fills and orders; "journal" fields were written by the trader.
- Fees, liquidations, oversizing and stop handling are often the real story; check them.
- Do not recommend specific trades, instruments, directions, entry or exit prices, or market views. This is about behaviour, not market calls.
- Be direct and specific, in plain words a busy trader reads in under a minute. Keep every item short. No generic advice that would apply to anyone.
- Watch for small samples: a pattern from 2 or 3 trades is a hint, not proof, so say so rather than building a rule on it.
- Never list a risky habit (sizing up after a loss, oversizing, high leverage, moving stops) as a strength because it happened to win.
- Output only the review itself: no notes to yourself, word counts or comments about the instructions.
- If there are too few trades to say something reliably, say so.`;

interface Window {
  start: number;
  end: number;
}

/** Everything the coach sees, as compact JSON: period stats, tag performance and the trades themselves. */
/** One account's trades only: a review never mixes currencies or markets. */
export async function buildReviewInput(db: Db, userId: string, accountId: string, window: Window) {
  const inAccount = eq(schema.trades.accountId, accountId);
  const [trades, tags, journal, allTrades] = await Promise.all([
    db
      .select()
      .from(schema.trades)
      .where(
        and(
          eq(schema.trades.userId, userId),
          inAccount,
          eq(schema.trades.status, "closed"),
          gte(schema.trades.closedTs, window.start),
          lt(schema.trades.closedTs, window.end),
        ),
      )
      .orderBy(desc(schema.trades.closedTs)),
    db.select().from(schema.tradeTags).where(eq(schema.tradeTags.userId, userId)),
    db.select().from(schema.journalEntries).where(eq(schema.journalEntries.userId, userId)),
    db
      .select()
      .from(schema.trades)
      .where(and(eq(schema.trades.userId, userId), inAccount, eq(schema.trades.status, "closed"))),
  ]);
  const tagsByTrade = new Map<string, string[]>();
  for (const t of tags) tagsByTrade.set(t.tradeId, [...(tagsByTrade.get(t.tradeId) ?? []), t.tag]);
  const journalByTrade = new Map(journal.map((j) => [j.tradeId, j]));
  const tagged = trades.map((t) => ({ ...t, tags: (tagsByTrade.get(t.id) ?? []).map((tag) => ({ tag })) }));

  const round = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  const stats = (list: typeof trades) => {
    const s = computeStats(list);
    return {
      trades: s.trades,
      winRatePct: s.winRate === null ? null : Math.round(s.winRate * 100),
      netPnl: round(s.netPnl),
      grossPnl: round(s.grossPnl),
      fees: round(s.fees + s.liquidationFees),
      funding: round(s.funding),
      avgWin: round(s.avgWin),
      avgLoss: round(s.avgLoss),
      profitFactor: round(s.profitFactor),
      maxDrawdown: round(s.maxDrawdown),
    };
  };

  return {
    period: { from: formatDateTime(window.start), to: formatDateTime(window.end), timeZone: "IST" },
    stats: stats(trades),
    allTimeStats: stats(allTrades),
    journaled: `${trades.filter((t) => journalByTrade.has(t.id)).length} of ${trades.length} trades`,
    byTag: tagPerformance(tagged)
      .filter((r) => r.trades >= 2)
      .map((r) => ({ tag: tagLabel(r.tag), trades: r.trades, winRatePct: r.winRate === null ? null : Math.round(r.winRate * 100), netPnl: round(r.netPnl) })),
    trades: trades.slice(0, MAX_LISTED_TRADES).map((t) => {
      const j = journalByTrade.get(t.id);
      return {
        closed: formatDateTime(t.closedTs!),
        symbol: t.symbol,
        side: t.direction,
        netPnl: round(t.netPnl),
        r: round(t.rMultiple),
        heldMin: t.holdSeconds === null ? null : Math.round(t.holdSeconds / 60),
        leverage: t.leverage,
        exit: t.exitReason,
        tags: (tagsByTrade.get(t.id) ?? []).filter((g) => !isJournalTag(g)).map(tagLabel),
        journal: j
          ? {
              setup: j.setup,
              emotions: j.emotions,
              mistakes: j.mistakes,
              followedPlan: j.followedPlan,
              rating: j.rating,
              notes: j.notes,
            }
          : null,
      };
    }),
    tradesNotListed: Math.max(0, trades.length - MAX_LISTED_TRADES),
  };
}

/**
 * Writes a coaching review of one account's last `days` days and stores it. Returns null when it had no closed
 * trades (or is not the user's).
 */
export async function generateReview(
  db: Db,
  userId: string,
  accountId: string,
  days: number,
  model: LanguageModel = AI_MODELS.review,
  now = Date.now(),
): Promise<ReviewRow | null> {
  const [account] = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.id, accountId)));
  if (!account) return null;
  const window = { start: now - days * DAY_MS, end: now };
  const input = await buildReviewInput(db, userId, accountId, window);
  if (!input.stats.trades) return null;

  const { output, usage } = await generateText({
    model,
    system: system(account.broker),
    prompt: `Review this trader's last ${days} days.\n\n${JSON.stringify(input)}`,
    output: Output.object({ schema: reviewSchema }),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const [row] = await db
    .insert(schema.aiReviews)
    .values({
      userId,
      accountId,
      periodStart: window.start,
      periodEnd: window.end,
      tradeCount: input.stats.trades,
      model: typeof model === "string" ? model : model.modelId,
      review: tidyReview(output),
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      createdAt: now,
    })
    .returning();
  return row;
}

/** Writes a review for each of the user's accounts that closed trades in the period (the weekly review, /review). */
export async function generateReviews(db: Db, userId: string, days: number, model?: LanguageModel, now = Date.now()): Promise<ReviewRow[]> {
  const accounts = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.userId, userId)).orderBy(schema.accounts.createdAt);
  const rows: ReviewRow[] = [];
  for (const a of accounts) {
    const row = await generateReview(db, userId, a.id, days, model, now);
    if (row) rows.push(row);
  }
  return rows;
}

/** The user's reviews, newest first; only one account's when `accountId` is given. */
export async function listReviews(db: Db, userId: string, limit = 20, accountId?: string): Promise<ReviewRow[]> {
  return db
    .select()
    .from(schema.aiReviews)
    .where(and(eq(schema.aiReviews.userId, userId), accountId ? eq(schema.aiReviews.accountId, accountId) : undefined))
    .orderBy(desc(schema.aiReviews.createdAt))
    .limit(limit);
}
