"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUserId } from "@/lib/session";
import { createLinkCode, linkUrl, unlinkTelegram } from "@/lib/telegram/links";

export interface TelegramActionResult {
  ok: boolean;
  message: string;
  /** The one-time t.me link that connects the user's chat. */
  url?: string;
}

/** Makes a one-time link that connects the user's Telegram chat to their account. */
export async function connectTelegram(): Promise<TelegramActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  const db = await getDb();
  const limit = await rateLimit(db, userId, "telegram.link");
  if (!limit.ok) return { ok: false, message: tooMany(limit) };
  const code = await createLinkCode(db, userId);
  revalidatePath("/settings");
  return { ok: true, message: "", url: linkUrl(code) };
}

/** Stops the bot messaging the user. Their journal stays. */
export async function disconnectTelegram(): Promise<TelegramActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  await unlinkTelegram(await getDb(), userId);
  revalidatePath("/settings");
  return { ok: true, message: "Telegram disconnected. Your trades and journal stay." };
}
