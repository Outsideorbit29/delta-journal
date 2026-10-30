"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { AI_NOT_CONFIGURED, aiConfigured, explainAiError } from "@/lib/ai/models";
import { generateReview } from "@/lib/ai/review";
import { suggestFromNote, type NoteSuggestion } from "@/lib/ai/suggest";

export interface AiResult<T = undefined> {
  ok: boolean;
  message: string;
  value?: T;
}

/** Writes and stores a coaching review of the last `days` days. */
export async function reviewAction(days: number): Promise<AiResult> {
  if (!aiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED };
  if (![7, 30, 90].includes(days)) return { ok: false, message: "Choose 7, 30 or 90 days." };
  try {
    const row = await generateReview(await getDb(), days);
    if (!row) return { ok: false, message: `No closed trades in the last ${days} days.` };
    revalidatePath("/", "layout");
    return { ok: true, message: "Review ready." };
  } catch (err) {
    return { ok: false, message: explainAiError(err) };
  }
}

/** Journal answers the note suggests. Nothing is saved. */
export async function suggestAction(tradeId: string, note: string): Promise<AiResult<NoteSuggestion>> {
  if (!aiConfigured()) return { ok: false, message: AI_NOT_CONFIGURED };
  const text = note.trim();
  if (!text) return { ok: false, message: "Write a note first." };
  const [trade] = await (await getDb()).select().from(schema.trades).where(eq(schema.trades.id, tradeId));
  if (!trade) return { ok: false, message: "That trade no longer exists." };
  try {
    return { ok: true, message: "", value: await suggestFromNote(text, trade) };
  } catch (err) {
    return { ok: false, message: explainAiError(err) };
  }
}
