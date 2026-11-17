"use server";

import { transcribe } from "ai";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { AI_MODELS, AI_NOT_CONFIGURED, aiConfigured, explainAiError } from "@/lib/ai/models";
import { generateReview } from "@/lib/ai/review";
import { suggestFromNote, type NoteSuggestion } from "@/lib/ai/suggest";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUserId } from "@/lib/session";

export interface AiResult<T = undefined> {
  ok: boolean;
  message: string;
  value?: T;
}

/** Writes and stores a coaching review of one account's last `days` days. */
export async function reviewAction(days: number, accountId: string): Promise<AiResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  if (!aiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED };
  if (![7, 30, 90].includes(days)) return { ok: false, message: "Choose 7, 30 or 90 days." };
  const db = await getDb();
  const limit = await rateLimit(db, userId, "ai.review");
  if (!limit.ok) return { ok: false, message: tooMany(limit) };
  try {
    // generateReview checks the account is the user's.
    const row = await generateReview(db, userId, String(accountId ?? ""), days);
    if (!row) return { ok: false, message: `No closed trades in the last ${days} days.` };
    revalidatePath("/", "layout");
    return { ok: true, message: "Review ready." };
  } catch (err) {
    return { ok: false, message: explainAiError(err) };
  }
}

/** Journal answers the note suggests. Nothing is saved. */
export async function suggestAction(tradeId: string, note: string): Promise<AiResult<NoteSuggestion>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  if (!aiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED };
  const text = note.trim();
  if (!text) return { ok: false, message: "Write a note first." };
  const db = await getDb();
  const limit = await rateLimit(db, userId, "ai.suggest");
  if (!limit.ok) return { ok: false, message: tooMany(limit) };
  const [trade] = await db.select().from(schema.trades)
    .where(and(eq(schema.trades.userId, userId), eq(schema.trades.id, tradeId)));
  if (!trade) return { ok: false, message: "That trade no longer exists." };
  try {
    return { ok: true, message: "", value: await suggestFromNote(text, trade) };
  } catch (err) {
    return { ok: false, message: explainAiError(err) };
  }
}

/** Under the 1 MB a server action accepts; a minute of speech at 32 kbit/s is about 240 kB. */
const MAX_VOICE_BYTES = 900_000;

/** A voice note recorded in the phone journal, as text. The audio is not kept. */
export async function transcribeAction(form: FormData): Promise<AiResult<string>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  if (!aiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED };
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return { ok: false, message: "Nothing was recorded." };
  if (audio.size > MAX_VOICE_BYTES) return { ok: false, message: "That recording is too long. Keep it under a minute." };
  const limit = await rateLimit(await getDb(), userId, "ai.transcribe");
  if (!limit.ok) return { ok: false, message: tooMany(limit) };
  try {
    const { text } = await transcribe({ model: AI_MODELS.transcribe, audio: new Uint8Array(await audio.arrayBuffer()) });
    return text.trim() ? { ok: true, message: "", value: text.trim() } : { ok: false, message: "No speech was heard. Try again a little closer." };
  } catch (err) {
    return { ok: false, message: explainAiError(err) };
  }
}
