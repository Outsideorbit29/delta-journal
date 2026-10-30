import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { Emotion, Mistake, Setup } from "./vocab";
import { effectiveRisk, journalTags, parseJournalInput, riskAtStop, type JournalInput } from "./entry";
import { formatPrice } from "@/lib/format";

export interface SaveJournalResult {
  ok: boolean;
  message: string;
}

export const EMPTY_ENTRY: JournalInput = {
  setup: null,
  emotions: [],
  mistakes: [],
  followedPlan: null,
  rating: null,
  notes: null,
  plannedStop: null,
  plannedTarget: null,
};

/** The saved journal entry for a trade, as a JournalInput, or null. */
export async function loadJournalEntry(db: Db, tradeId: string): Promise<JournalInput | null> {
  const [row] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, tradeId));
  if (!row) return null;
  return {
    setup: row.setup as Setup | null,
    emotions: row.emotions as Emotion[],
    mistakes: row.mistakes as Mistake[],
    followedPlan: row.followedPlan,
    rating: row.rating,
    notes: row.notes,
    plannedStop: row.plannedStop,
    plannedTarget: row.plannedTarget,
  };
}

/**
 * Validates and stores a journal entry, replaces the trade's journal tags and
 * recomputes its risk and R from the planned stop. Shared by the web form and
 * the Telegram bot.
 */
export async function saveJournalEntry(db: Db, tradeId: string, input: Record<string, unknown>): Promise<SaveJournalResult> {
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

  return { ok: true, message: "Saved" };
}
