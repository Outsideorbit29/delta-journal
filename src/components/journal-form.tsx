"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { saveJournal, type SaveJournalResult } from "@/app/journal-actions";
import type { JournalInput } from "@/lib/journal/entry";
import { EMOTIONS, MISTAKES, RISKY_EMOTIONS, SETUPS, type Emotion, type Mistake, type Setup } from "@/lib/journal/vocab";
import { formatPrice } from "@/lib/format";

interface Props {
  tradeId: string;
  initial: JournalInput | null;
  suggested: { mistakes: Mistake[]; emotions: Emotion[] };
  trade: { direction: "long" | "short"; avgEntry: number; stopPrice: number | null; stopMoved: boolean };
  /** Label for the save button, e.g. "Save & next" in the journal queue. */
  submitLabel?: string;
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

export function JournalForm({ tradeId, initial, suggested, trade, submitLabel = "Save journal" }: Props) {
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

  const stopHint =
    trade.stopPrice === null
      ? "No stop order was found on Delta."
      : trade.stopMoved
        ? `Delta only kept where your stop ended up (${formatPrice(trade.stopPrice)}). Enter the original to get an R-multiple.`
        : `Your stop order on Delta was ${formatPrice(trade.stopPrice)}.`;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={onKeyDown}
    >
      <Field label="Setup">
        {(Object.keys(SETUPS) as Setup[]).map((k) => (
          <Chip key={k} pressed={entry.setup === k} onClick={() => update({ setup: entry.setup === k ? null : k })}>
            {SETUPS[k]}
          </Chip>
        ))}
      </Field>

      <Field label="How you felt" hint={suggested.emotions.length ? "Dotted: suggested by the trade data" : undefined}>
        {(Object.keys(EMOTIONS) as Emotion[]).map((k) => (
          <Chip
            key={k}
            pressed={entry.emotions.includes(k)}
            suggested={suggested.emotions.includes(k)}
            warning={RISKY_EMOTIONS.includes(k)}
            onClick={() => update({ emotions: toggle(entry.emotions, k) })}
          >
            {EMOTIONS[k]}
          </Chip>
        ))}
      </Field>

      <Field label="Mistakes" hint={suggested.mistakes.length ? "Dotted: suggested by the trade data" : undefined}>
        {(Object.keys(MISTAKES) as Mistake[]).map((k) => (
          <Chip
            key={k}
            pressed={entry.mistakes.includes(k)}
            suggested={suggested.mistakes.includes(k)}
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
        <Field label="Execution (1 poor – 5 great)">
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

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Notes</span>
        <textarea
          value={entry.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Why you took it, what you saw, what you'd do differently"
          className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <span className="text-xs text-zinc-500">Ctrl+Enter</span>
        {result && (
          <p role="status" className={`text-sm ${result.ok ? "text-zinc-500" : "text-rose-600 dark:text-rose-400"}`}>
            {result.message}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">
        {label}
        {hint && <span className="ml-2 text-xs font-normal text-zinc-500">{hint}</span>}
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
  const on = warning
    ? "border-amber-500 bg-amber-100 text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100"
    : "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900";
  const off = suggested
    ? "border-dashed border-zinc-500 hover:bg-zinc-100 dark:border-zinc-400 dark:hover:bg-zinc-800"
    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${pressed ? on : off}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function PriceInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm tabular-nums dark:border-zinc-700"
      />
      <span className="block text-xs text-zinc-500">{hint}</span>
    </label>
  );
}
