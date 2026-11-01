"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { suggestAction } from "@/app/ai-actions";
import { saveJournal, type SaveJournalResult } from "@/app/journal-actions";
import type { NoteSuggestion } from "@/lib/ai/suggest";
import type { JournalInput } from "@/lib/journal/entry";
import { EMOTIONS, MISTAKES, RISKY_EMOTIONS, SETUPS, type Emotion, type Mistake, type Setup } from "@/lib/journal/vocab";
import { formatPrice } from "@/lib/format";
import { buttonPrimary, buttonSecondary, input } from "@/components/ui";

interface Props {
  tradeId: string;
  initial: JournalInput | null;
  suggested: { mistakes: Mistake[]; emotions: Emotion[] };
  trade: { direction: "long" | "short"; avgEntry: number; stopPrice: number | null; stopMoved: boolean };
  /** Label for the save button, e.g. "Save & next" in the journal queue. */
  submitLabel?: string;
  /** Whether AI suggestions from the note are available. */
  aiEnabled?: boolean;
}

function suggestionLabels(s: NoteSuggestion): string[] {
  return [
    ...(s.setup ? [SETUPS[s.setup]] : []),
    ...s.emotions.map((k) => EMOTIONS[k]),
    ...s.mistakes.map((k) => MISTAKES[k]),
    ...(s.followedPlan === null ? [] : [s.followedPlan ? "Followed plan" : "Broke plan"]),
  ];
}

const EMPTY: JournalInput = {
  setup: null,
  emotions: [],
  mistakes: [],
  followedPlan: null,
  rating: null,
  notes: null,
  plannedStop: null,
  plannedTarget: null,
};

export function JournalForm({ tradeId, initial, suggested, trade, submitLabel = "Save journal", aiEnabled = false }: Props) {
  const [entry, setEntry] = useState<JournalInput>(initial ?? EMPTY);
  const [stopText, setStopText] = useState(initial?.plannedStop?.toString() ?? "");
  const [targetText, setTargetText] = useState(initial?.plannedTarget?.toString() ?? "");
  const [result, setResult] = useState<SaveJournalResult | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const update = (patch: Partial<JournalInput>) => {
    setEntry((e) => ({ ...e, ...patch }));
    setResult(null);
  };

  const save = () =>
    startTransition(async () => {
      setResult(await saveJournal(tradeId, { ...entry, plannedStop: stopText, plannedTarget: targetText }));
    });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  // AI suggestions from the note: shown dotted like the data suggestions, applied only on request.
  const [ai, setAi] = useState<NoteSuggestion | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();
  const suggest = () =>
    startAi(async () => {
      setAiMessage(null);
      const r = await suggestAction(tradeId, entry.notes ?? "");
      setAi(r.value ?? null);
      if (!r.ok) setAiMessage(r.message);
      else if (r.value && !suggestionLabels(r.value).length) setAiMessage("Nothing to add from this note.");
    });
  const applyAi = () => {
    if (!ai) return;
    update({
      setup: entry.setup ?? ai.setup,
      emotions: [...new Set([...entry.emotions, ...ai.emotions])],
      mistakes: [...new Set([...entry.mistakes, ...ai.mistakes])],
      followedPlan: entry.followedPlan ?? ai.followedPlan,
    });
    setAi(null);
  };
  const aiLabels = ai ? suggestionLabels(ai) : [];
  const hintEmotions = [...suggested.emotions, ...(ai?.emotions ?? [])];
  const hintMistakes = [...suggested.mistakes, ...(ai?.mistakes ?? [])];

  const stopHint =
    trade.stopPrice === null
      ? "No stop order was found on Delta."
      : trade.stopMoved
        ? `Delta only kept where your stop ended up (${formatPrice(trade.stopPrice)}). Enter the original to get an R-multiple.`
        : `Your stop order on Delta was ${formatPrice(trade.stopPrice)}.`;

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={onKeyDown}
    >
      <Field label="Setup">
        {(Object.keys(SETUPS) as Setup[]).map((k) => (
          <Chip key={k} pressed={entry.setup === k} suggested={ai?.setup === k} onClick={() => update({ setup: entry.setup === k ? null : k })}>
            {SETUPS[k]}
          </Chip>
        ))}
      </Field>

      <Field label="How you felt" hint={hintEmotions.length ? "Dotted: suggested" : undefined}>
        {(Object.keys(EMOTIONS) as Emotion[]).map((k) => (
          <Chip
            key={k}
            pressed={entry.emotions.includes(k)}
            suggested={hintEmotions.includes(k)}
            warning={RISKY_EMOTIONS.includes(k)}
            onClick={() => update({ emotions: toggle(entry.emotions, k) })}
          >
            {EMOTIONS[k]}
          </Chip>
        ))}
      </Field>

      <Field label="Mistakes" hint={hintMistakes.length ? "Dotted: suggested" : undefined}>
        {(Object.keys(MISTAKES) as Mistake[]).map((k) => (
          <Chip
            key={k}
            pressed={entry.mistakes.includes(k)}
            suggested={hintMistakes.includes(k)}
            warning
            onClick={() => update({ mistakes: toggle(entry.mistakes, k) })}
          >
            {MISTAKES[k]}
          </Chip>
        ))}
      </Field>

      <div className="flex flex-wrap gap-x-10 gap-y-5">
        <Field label="Followed your plan?">
          <Chip pressed={entry.followedPlan === true} onClick={() => update({ followedPlan: entry.followedPlan === true ? null : true })}>
            Yes
          </Chip>
          <Chip pressed={entry.followedPlan === false} warning onClick={() => update({ followedPlan: entry.followedPlan === false ? null : false })}>
            No
          </Chip>
        </Field>
        <Field label="Execution" hint="1 is poor, 5 is great">
          {[1, 2, 3, 4, 5].map((n) => (
            <Chip key={n} pressed={entry.rating === n} onClick={() => update({ rating: entry.rating === n ? null : n })} aria-label={`Rating ${n}`}>
              {n}
            </Chip>
          ))}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PriceInput label="Planned stop" value={stopText} onChange={(v) => {
            setStopText(v);
            setResult(null);
          }} hint={stopHint} />
        <PriceInput
          label="Planned target"
          value={targetText}
          onChange={(v) => {
            setTargetText(v);
            setResult(null);
          }}
          hint={`Entry was ${formatPrice(trade.avgEntry)} (${trade.direction}).`}
        />
      </div>

      <label className="block space-y-2">
        <span className="face-label block text-base text-ink">Notes</span>
        <textarea
          value={entry.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          rows={4}
          placeholder="Why you took it, what you saw, what you'd do differently"
          className={`${input} py-2 font-serif text-base`}
        />
      </label>

      {aiEnabled && (
        <div className="face-label flex flex-wrap items-center gap-3 text-sm">
          <button type="button" disabled={aiPending || !entry.notes?.trim()} onClick={suggest} className={buttonSecondary} aria-busy={aiPending}>
            {aiPending ? "Reading your note…" : "Suggest answers from note"}
          </button>
          {ai && aiLabels.length > 0 && (
            <>
              <span className="text-muted">AI suggests: {aiLabels.join(", ")} (dotted above)</span>
              <button type="button" onClick={applyAi} className="link min-h-10">
                Apply them
              </button>
            </>
          )}
          {aiMessage && <span className="text-muted">{aiMessage}</span>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t border-rule-2 pt-6">
        <button type="submit" disabled={pending} className={`${buttonPrimary} min-h-11`} aria-busy={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <span className="face-label text-sm text-muted">
          or <kbd className="face-label">Ctrl</kbd>&nbsp;+&nbsp;<kbd className="face-label">Enter</kbd>
        </span>
        {result && (
          <p role="status" className={`face-label text-sm ${result.ok ? "text-muted" : "text-error"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="face-label text-base text-ink">
        {label}
        {hint && <span className="ml-3 text-sm text-muted">{hint}</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({
  pressed,
  suggested,
  warning,
  onClick,
  children,
  ...rest
}: {
  pressed: boolean;
  suggested?: boolean;
  warning?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  // Chosen: filled (a risky answer in the warning ink). Suggested by the data or the AI: dotted.
  const on = warning ? "border-warn bg-warn text-paper" : "border-ink bg-ink text-paper";
  const off = suggested ? "border-dashed border-ink-2 text-ink hover:bg-paper-3" : "border-rule-2 text-ink-2 hover:border-ink hover:text-ink";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`face-label min-h-10 border px-3.5 text-sm transition-colors duration-(--dur-micro) ${pressed ? on : off}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PriceInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="block space-y-2">
      <span className="face-label block text-base text-ink">{label}</span>
      <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className={`${input} face-label tabular-nums`} />
      <span className="face-label block text-sm text-muted">{hint}</span>
    </label>
  );
}
