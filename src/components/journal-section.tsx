import { JournalForm } from "@/components/journal-form";
import { aiConfigured } from "@/lib/ai/models";
import { suggestionsFor, type JournalInput } from "@/lib/journal/entry";
import type { Emotion, Mistake, Setup } from "@/lib/journal/vocab";
import type { JournalEntry, TradeWithTags } from "@/lib/queries";

/** The journal card for a closed trade: your answers, with hints from the automatic tags. */
export function JournalSection({ trade, entry, submitLabel }: { trade: TradeWithTags; entry: JournalEntry | null; submitLabel?: string }) {
  const initial: JournalInput | null = entry && {
    setup: entry.setup as Setup | null,
    emotions: entry.emotions as Emotion[],
    mistakes: entry.mistakes as Mistake[],
    followedPlan: entry.followedPlan,
    rating: entry.rating,
    notes: entry.notes,
    plannedStop: entry.plannedStop,
    plannedTarget: entry.plannedTarget,
  };
  const autoTags = trade.tags.filter((g) => g.source === "auto").map((g) => g.tag);

  return (
    <section className="bg-paper-2 border-t-4 border-ink px-5 py-8 sm:px-8">
      <h2 className="text-2xl">Journal</h2>
      <p className="mt-1 mb-8 text-base text-ink-2">
        {entry ? "Your notes on this trade." : "Not journaled yet. A few taps now make the habit analysis much sharper."}
      </p>
      <JournalForm
        key={trade.id}
        tradeId={trade.id}
        initial={initial}
        suggested={suggestionsFor(autoTags)}
        trade={{ direction: trade.direction, avgEntry: trade.avgEntry, stopPrice: trade.stopPrice, stopMoved: trade.stopMovedAfterSec !== null }}
        submitLabel={submitLabel}
        aiEnabled={aiConfigured()}
      />
    </section>
  );
}
