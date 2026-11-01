import { sql } from "drizzle-orm";
import { schema, type Db } from "@/db";

// Fixed-window rate limits, counted in the database so they hold across
// Vercel instances and the bot server alike. One row per (subject, action).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How often each user may do the things that cost money or could be abused. */
export const LIMITS = {
  /** AI coaching reviews on request (web and /review). The automatic weekly one is not counted. */
  "ai.review": { limit: 10, windowMs: DAY },
  /** AI journal suggestions from a note (web and bot). */
  "ai.suggest": { limit: 60, windowMs: HOUR },
  /** Telegram voice notes transcribed by AI. */
  "ai.transcribe": { limit: 30, windowMs: HOUR },
  "delta.connect": { limit: 10, windowMs: HOUR },
  "telegram.link": { limit: 10, windowMs: HOUR },
  "push.test": { limit: 10, windowMs: HOUR },
  "account.export": { limit: 10, windowMs: HOUR },
  /** /sync from Telegram (the server syncs everyone each minute anyway). */
  "bot.sync": { limit: 20, windowMs: HOUR },
  /** Any message or button tap to the bot from a linked chat. */
  "bot.update": { limit: 60, windowMs: MINUTE },
  /** Replies to chats that are not linked ("chat:<id>"). */
  "bot.stranger": { limit: 10, windowMs: HOUR },
} as const;

export type LimitedAction = keyof typeof LIMITS;

export interface RateLimitResult {
  ok: boolean;
  /** When the current window ends (ms), so callers can say "try again in…". */
  resetAt: number;
}

/**
 * Counts one attempt and says whether it is within the limit. Attempts over
 * the limit are counted too, so hammering does not shorten the wait.
 */
export async function rateLimit(db: Db, subject: string, action: LimitedAction, now = Date.now()): Promise<RateLimitResult> {
  const { limit, windowMs } = LIMITS[action];
  const expired = sql`${schema.rateLimits.windowStart} <= ${now - windowMs}`;
  const [row] = await db
    .insert(schema.rateLimits)
    .values({ subject, action, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: [schema.rateLimits.subject, schema.rateLimits.action],
      set: {
        count: sql`case when ${expired} then 1 else ${schema.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${expired} then ${now} else ${schema.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: schema.rateLimits.count, windowStart: schema.rateLimits.windowStart });
  return { ok: row.count <= limit, resetAt: row.windowStart + windowMs };
}

/** "Too many tries. Try again in 12 minutes." */
export function tooMany(result: RateLimitResult, now = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((result.resetAt - now) / MINUTE));
  const wait = minutes < 90 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${Math.ceil(minutes / 60)} hours`;
  return `Too many tries. Try again in ${wait}.`;
}
