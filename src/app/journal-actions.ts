"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { effectiveRisk, journalTags, parseJournalInput, riskAtStop } from "@/lib/journal/entry";
import { formatPrice } from "@/lib/format";

export interface SaveJournalResult {
  ok: boolean;
  message: string;
}

export async function saveJournal(tradeId: string, input: Record<string, unknown>): Promise<SaveJournalResult> {
  const db = await getDb();
  const [trade] = await db.select().from(schema.trades).where(eq(schema.trades.id, tradeId));
  if (!trade) return { ok: false, message: "That trade no longer exists. Sync and try again." };

  const parsed = parseJournalInput(input);
  if (!parsed.ok) return { ok: false, message: parsed.errors.join(". ") };
  const entry = parsed.value;

  // A stop or target on the wrong side of the entry is almost always a typo.
  const side = trade.direction === "long" ? "below" : "above";
  if (entry.plannedStop !== null && riskAtStop(trade, entry.plannedStop, trade.maxQty) === null) {
    return { ok: false, message: `For a ${trade.direction}, the planned stop should be ${side} the entry (${formatPrice(trade.avgEntry)}).` };
  }
  if (entry.plannedTarget !== null && riskAtStop(trade, entry.plannedTarget, trade.maxQty) !== null) {
    return {
      ok: false,
      message: `For a ${trade.direction}, the planned target should be ${trade.direction === "long" ? "above" : "below"} the entry (${formatPrice(trade.avgEntry)}).`,
    };
  }

  const now = Date.now();
  const values = { tradeId, ...entry, updatedAt: now };
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.journalEntries)
      .values({ ...values, createdAt: now })
      .onConflictDoUpdate({ target: schema.journalEntries.tradeId, set: values });
    await tx.delete(schema.tradeTags).where(and(eq(schema.tradeTags.tradeId, tradeId), eq(schema.tradeTags.source, "user")));
    // Journal tags have their own prefixes (setup:, emotion:, ...), so they never clash with automatic ones.
    const tags = journalTags(entry);
    if (tags.length) await tx.insert(schema.tradeTags).values(tags.map((tag) => ({ tradeId, tag, source: "user" as const, detail: null })));
    await tx.update(schema.trades).set(effectiveRisk(trade, entry.plannedStop)).where(eq(schema.trades.id, tradeId));
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}
