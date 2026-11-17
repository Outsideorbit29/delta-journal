import { SUGGESTED_BY_TAG, type Emotion, type Mistake } from "./vocab";

// What the automatic tags suggest for the journal, with the tag's own words as the reason, so the phone journal can
// say why an answer is suggested ("Moved stop: stop moved 164 min after entry…"). Nothing is chosen for the trader.

export interface Hint<T> {
  key: T;
  /** The tag's detail, sentence-cased, or null when the tag has none. */
  reason: string | null;
}

const sentence = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);

/** Suggested mistakes and emotions, each once (the first tag that suggests it gives the reason), in tag order. */
export function journalHints(tags: { tag: string; detail: string | null }[]): { mistakes: Hint<Mistake>[]; emotions: Hint<Emotion>[] } {
  const mistakes = new Map<Mistake, Hint<Mistake>>();
  const emotions = new Map<Emotion, Hint<Emotion>>();
  for (const { tag, detail } of tags) {
    const s = SUGGESTED_BY_TAG[tag];
    if (!s) continue;
    for (const m of s.mistakes ?? []) if (!mistakes.has(m)) mistakes.set(m, { key: m, reason: sentence(detail) });
    for (const e of s.emotions ?? []) if (!emotions.has(e)) emotions.set(e, { key: e, reason: sentence(detail) });
  }
  return { mistakes: [...mistakes.values()], emotions: [...emotions.values()] };
}
