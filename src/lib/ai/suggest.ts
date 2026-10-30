import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { EMOTIONS, MISTAKES, SETUPS, type Emotion, type Mistake, type Setup } from "@/lib/journal/vocab";
import { AI_MODELS } from "./models";

const keys = <T extends string>(obj: Record<T, string>) => Object.keys(obj) as [T, ...T[]];

const suggestionSchema = z.object({
  setup: z.enum(keys(SETUPS)).nullable().describe("The setup, only if the note names or clearly describes it"),
  emotions: z.array(z.enum(keys(EMOTIONS))).describe("Feelings the note states or clearly shows"),
  mistakes: z.array(z.enum(keys(MISTAKES))).describe("Mistakes the note admits or clearly describes"),
  followedPlan: z.boolean().nullable().describe("true/false only if the note says whether the plan was followed"),
});

export type NoteSuggestion = {
  setup: Setup | null;
  emotions: Emotion[];
  mistakes: Mistake[];
  followedPlan: boolean | null;
};

const list = (obj: Record<string, string>) =>
  Object.entries(obj)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

const SYSTEM = `You label a trader's journal note with choices from fixed lists.
Only choose a label when the note states it or makes it clearly obvious. When in doubt, leave it out: fewer, correct labels are better than many guesses.
The note may mix English and Hindi or Hinglish.

Setups: ${list(SETUPS)}
Emotions: ${list(EMOTIONS)}
Mistakes: ${list(MISTAKES)}`;

/** Suggests journal answers from a note. Nothing is saved; the trader confirms. */
export async function suggestFromNote(
  note: string,
  trade: { symbol: string; direction: string; netPnl: number },
  model: LanguageModel = AI_MODELS.fast,
): Promise<NoteSuggestion> {
  const { output } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Trade: ${trade.symbol} ${trade.direction}, net ${trade.netPnl >= 0 ? "+" : ""}${trade.netPnl.toFixed(2)} USD.\nNote: """${note}"""`,
    output: Output.object({ schema: suggestionSchema }),
  });
  return {
    setup: output.setup,
    emotions: [...new Set(output.emotions)],
    mistakes: [...new Set(output.mistakes)],
    followedPlan: output.followedPlan,
  };
}

/** Whether a suggestion adds anything the entry does not already have. */
export function newSuggestions(
  s: NoteSuggestion,
  entry: { setup: string | null; emotions: string[]; mistakes: string[]; followedPlan: boolean | null },
): NoteSuggestion {
  return {
    setup: s.setup && !entry.setup ? s.setup : null,
    emotions: s.emotions.filter((e) => !entry.emotions.includes(e)),
    mistakes: s.mistakes.filter((m) => !entry.mistakes.includes(m)),
    followedPlan: s.followedPlan !== null && entry.followedPlan === null ? s.followedPlan : null,
  };
}

export const isEmptySuggestion = (s: NoteSuggestion) => !s.setup && !s.emotions.length && !s.mistakes.length && s.followedPlan === null;
