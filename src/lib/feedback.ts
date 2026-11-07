import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { escapeHtml } from "@/lib/telegram/render";

// Feedback from users (Settings → Feedback, or /feedback in Telegram). It is saved under the
// user, and the sync server forwards each message to the owner's Telegram once.

export const FEEDBACK_MAX = 2000;

export type FeedbackSource = "web" | "telegram";

export interface FeedbackResult {
  ok: boolean;
  message: string;
}

/** Saves one message from the user, rate limited (10 an hour). */
export async function saveFeedback(db: Db, userId: string, text: string, source: FeedbackSource, now = Date.now()): Promise<FeedbackResult> {
  const message = text.replace(/\r\n?/g, "\n").trim();
  if (!message) return { ok: false, message: "Write something first." };
  if (message.length > FEEDBACK_MAX) return { ok: false, message: `Keep it under ${FEEDBACK_MAX} characters, or send it in two parts.` };
  const limit = await rateLimit(db, userId, "feedback.send", now);
  if (!limit.ok) return { ok: false, message: tooMany(limit, now) };
  await db.insert(schema.feedback).values({ userId, message, source, createdAt: now });
  return { ok: true, message: "Thanks, it's on its way to the founder." };
}

/**
 * Every user's feedback the owner has not been sent yet, oldest first, with the sender's email.
 * Only the sync server calls this, to forward it to the owner.
 */
export async function undeliveredFeedback(db: Db, limit = 20) {
  return db
    .select({
      id: schema.feedback.id,
      userId: schema.feedback.userId,
      email: schema.users.email,
      message: schema.feedback.message,
      source: schema.feedback.source,
      createdAt: schema.feedback.createdAt,
    })
    .from(schema.feedback)
    .leftJoin(schema.users, eq(schema.users.id, schema.feedback.userId))
    .where(isNull(schema.feedback.deliveredAt))
    .orderBy(schema.feedback.id)
    .limit(limit);
}

export async function markFeedbackDelivered(db: Db, ids: number[], now = Date.now()): Promise<void> {
  if (!ids.length) return;
  await db
    .update(schema.feedback)
    .set({ deliveredAt: now })
    .where(and(inArray(schema.feedback.id, ids), isNull(schema.feedback.deliveredAt)));
}

type FeedbackRow = Awaited<ReturnType<typeof undeliveredFeedback>>[number];

/** One Telegram message (HTML) for the owner. */
export function renderFeedback(row: FeedbackRow): string {
  const who = row.email || row.userId;
  const via = row.source === "telegram" ? "Telegram" : "the website";
  return [`💬 <b>Feedback</b> from ${escapeHtml(who)} (via ${via})`, "", escapeHtml(row.message)].join("\n");
}
