"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { saveJournalEntry, type SaveJournalResult } from "@/lib/journal/save";

export type { SaveJournalResult };

export async function saveJournal(tradeId: string, input: Record<string, unknown>): Promise<SaveJournalResult> {
  const result = await saveJournalEntry(await getDb(), tradeId, input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
