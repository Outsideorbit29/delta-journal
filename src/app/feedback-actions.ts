"use server";

import { getDb } from "@/db";
import { saveFeedback, type FeedbackResult } from "@/lib/feedback";
import { currentUserId } from "@/lib/session";

/** Sends the user's message to the founder (forwarded to Telegram by the sync server). */
export async function sendFeedback(text: string): Promise<FeedbackResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  if (typeof text !== "string") return { ok: false, message: "Write something first." };
  return saveFeedback(await getDb(), userId, text, "web");
}
