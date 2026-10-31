"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { saveJournalEntry, type SaveJournalResult } from "@/lib/journal/save";
import { currentUserId } from "@/lib/session";

export type { SaveJournalResult };

export async function saveJournal(tradeId: string, input: Record<string, unknown>): Promise<SaveJournalResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  const result = await saveJournalEntry(await getDb(), userId, tradeId, input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
