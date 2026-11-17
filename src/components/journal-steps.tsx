"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { suggestAction, transcribeAction } from "@/app/ai-actions";
import { saveJournal } from "@/app/journal-actions";
import type { NoteSuggestion } from "@/lib/ai/suggest";
import { formatPrice } from "@/lib/format";
import { parseJournalInput, type JournalInput } from "@/lib/journal/entry";
import type { Hint } from "@/lib/journal/hints";
import { EMOTIONS, MISTAKES, RISKY_EMOTIONS, SETUPS, type Emotion, type Mistake, type Setup } from "@/lib/journal/vocab";
import { buttonPrimary, buttonSecondary, input } from "@/components/ui";

// The phone journal: the next trade as a card, then one question per screen (setup, feelings, mistakes, plan, note)
// over the whole screen, then a "saved, next trade" screen. Answers are kept on the phone until saved, so closing
// half way loses nothing. Wide screens keep the one-page form (journal-form.tsx).

export interface StepsTrade {
  id: string;
  /** "XAUTUSD long" */
  title: string;
  /** Net P&L, formatted with its sign, and its colour class. */
  pnl: string;
  pnlClass: string;
  /** When it opened, in IST. */
  when: string;
  /** The trade page's one-paragraph summary. */
  summary: string;
  direction: "long" | "short";
  avgEntry: number;
  stopPrice: number | null;
  stopMoved: boolean;
}

interface Props {
  trade: StepsTrade;
  /** The trade's tag chips, drawn on the server. */
  tags: ReactNode;
  hints: { mistakes: Hint<Mistake>[]; emotions: Hint<Emotion>[] };
  /** Trades left to journal, this one included. */
  remaining: number;
  tradeHref: string;
  skipHref: string | null;
  /** The trade after this one (where "Journal the next one" goes, starting its questions at once). */
  next: (Omit<StepsTrade, "id" | "direction" | "avgEntry" | "stopPrice" | "stopMoved"> & { href: string }) | null;
  /** The journal page, for "Done for now". */
  doneHref: string;
  aiEnabled: boolean;
  /** Open the questions straight away (arriving from "Journal the next one"). */
  start: boolean;
}

const STEPS = 5;
const EMPTY: JournalInput = { setup: null, emotions: [], mistakes: [], followedPlan: null, rating: null, notes: null, plannedStop: null, plannedTarget: null };

interface Draft {
  entry: JournalInput;
  stop: string;
  target: string;
  step: number;
}
const draftKey = (tradeId: string) => `hardwon.journal-draft:${tradeId}`;

function readDraft(tradeId: string): Draft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey(tradeId)) ?? "null") as Partial<Draft> | null;
    if (!raw || typeof raw !== "object") return null;
    const parsed = parseJournalInput({ ...(raw.entry ?? {}), plannedStop: null, plannedTarget: null });
    if (!parsed.ok) return null;
    const step = Number.isInteger(raw.step) ? Math.min(Math.max(Number(raw.step), 0), STEPS - 1) : 0;
    return { entry: parsed.value, stop: String(raw.stop ?? ""), target: String(raw.target ?? ""), step };
  } catch {
    return null;
  }
}
function writeDraft(tradeId: string, draft: Draft | null) {
  try {
    if (draft) localStorage.setItem(draftKey(tradeId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(tradeId));
  } catch {
    // Private windows and full storage: the answers just aren't kept.
  }
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

function suggestionLabels(s: NoteSuggestion, entry: JournalInput): string[] {
  return [
    ...(s.setup && !entry.setup ? [SETUPS[s.setup]] : []),
    ...s.emotions.filter((k) => !entry.emotions.includes(k)).map((k) => EMOTIONS[k]),
    ...s.mistakes.filter((k) => !entry.mistakes.includes(k)).map((k) => MISTAKES[k]),
    ...(s.followedPlan === null || entry.followedPlan !== null ? [] : [s.followedPlan ? "Followed plan" : "Broke plan"]),
  ];
}

const listWords = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function JournalSteps({ trade, tags, hints, remaining, tradeHref, skipHref, next, doneHref, aiEnabled, start }: Props) {
  const router = useRouter();
  // -1: the card; 0 to 4: the questions; 5: saved.
  const [step, setStep] = useState(start ? 0 : -1);
  const [entry, setEntry] = useState<JournalInput>(EMPTY);
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [ai, setAi] = useState<NoteSuggestion | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  const asking = step >= 0 && step < STEPS;
  const open = step >= 0;

  // Keep the answers on the phone while they are being given.
  useEffect(() => {
    if (asking) writeDraft(trade.id, { entry, stop, target, step });
  }, [asking, entry, stop, target, step, trade.id]);

  // The questions cover the page: hold its scroll, and move focus to each new question.
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [open]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open, step]);

  const update = (patch: Partial<JournalInput>) => {
    setEntry((e) => ({ ...e, ...patch }));
    setError(null);
  };

  const begin = () => {
    const draft = readDraft(trade.id);
    if (draft) {
      setEntry(draft.entry);
      setStop(draft.stop);
      setTarget(draft.target);
    }
    setStep(draft?.step ?? 0);
  };

  const pickSetup = (k: Setup) => {
    const picked = entry.setup === k ? null : k;
    update({ setup: picked });
    // Picking moves on by itself, after a beat so the choice is seen.
    if (picked) window.setTimeout(() => setStep((s) => (s === 0 ? 1 : s)), 220);
  };

  const save = () =>
    startSaving(async () => {
      const r = await saveJournal(trade.id, { ...entry, plannedStop: stop, plannedTarget: target });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      writeDraft(trade.id, null);
      setStep(STEPS);
    });

  const suggest = () =>
    startAi(async () => {
      setAiMessage(null);
      const r = await suggestAction(trade.id, entry.notes ?? "");
      setAi(r.value ?? null);
      if (!r.ok) setAiMessage(r.message);
      else if (r.value && !suggestionLabels(r.value, entry).length) setAiMessage("Your note matches your answers.");
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

  if (!open) {
    return (
      <section aria-labelledby="journal-next" className="flex flex-col gap-3 border-t-4 border-ink bg-paper-2 px-4 pt-4 pb-3">
        <p className="face-label text-sm text-muted">Opened {trade.when}</p>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="journal-next" className="text-[1.9rem] leading-none">
            {trade.title}
          </h2>
          <p className={`figure-display text-[2.1rem] ${trade.pnlClass}`}>{trade.pnl}</p>
        </div>
        <p className="text-base text-ink-2">{trade.summary}</p>
        <div className="flex flex-wrap gap-1.5">{tags}</div>
        <button type="button" onClick={begin} className={`${buttonPrimary} mt-1 min-h-13 text-base`}>
          Journal it · about 30 seconds
        </button>
        <div className="face-label flex justify-between text-base">
          <a href={tradeHref} className="link inline-flex min-h-11 items-center">
            Open the trade
          </a>
          {skipHref && (
            <a href={skipHref} className="link inline-flex min-h-11 items-center">
              Skip for now
            </a>
          )}
        </div>
      </section>
    );
  }

  const close = () => setStep(-1);
  const hintedEmotions = hints.emotions.map((h) => h.key);
  const emotionReason = hints.emotions.find((h) => h.reason);
  const hintedMistakes = hints.mistakes.map((h) => h.key);
  const aiLabels = ai ? suggestionLabels(ai, entry) : [];
  const stopHint =
    trade.stopPrice === null
      ? "No stop order was found."
      : trade.stopMoved
        ? `Only where your stop ended up was kept (${formatPrice(trade.stopPrice)}). Enter the original to get an R-multiple.`
        : `Your stop order was ${formatPrice(trade.stopPrice)}.`;

  const title = (text: string) => (
    <h2 ref={heading} tabIndex={-1} className="text-[2.25rem] leading-none outline-none">
      {text}
    </h2>
  );

  return (
    <div role="dialog" aria-modal="true" aria-label={`Journal ${trade.title}`} className="fixed inset-0 z-(--z-modal) flex flex-col bg-paper text-ink">
      <header className="flex flex-col gap-2.5 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={step === STEPS ? () => router.push(doneHref) : close} aria-label={step === STEPS ? "Back to the journal" : "Close and keep your answers"} className="-ml-2.5 inline-flex size-11 items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          {asking && (
            <>
              <span className="face-label flex-1 text-base">
                {trade.title} <span className={trade.pnlClass}>{trade.pnl}</span>
              </span>
              <span className="face-label text-sm text-muted">
                {step + 1} of {STEPS}
              </span>
            </>
          )}
        </div>
        {asking && (
          <div role="img" aria-label={`Question ${step + 1} of ${STEPS}`} className="grid grid-cols-5 gap-1">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={`h-1 ${i <= step ? "bg-ink" : "bg-paper-3"}`} />
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-8 pb-6">
        {step === 0 && (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-2.5">
              {title("What was the setup?")}
              <p className="text-lg text-ink-2">Pick one. It moves on by itself.</p>
            </div>
            <fieldset>
              <legend className="sr-only">Setup</legend>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(SETUPS) as Setup[]).map((k) => (
                  <Choice key={k} pressed={entry.setup === k} onClick={() => pickSetup(k)} className="min-h-16 text-lg">
                    {SETUPS[k]}
                  </Choice>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-2.5">
              {title("How did you feel going in?")}
              <p className="text-lg text-ink-2">
                Pick any.
                {hintedEmotions.length > 0 &&
                  ` ${listWords(hintedEmotions.map((k) => EMOTIONS[k]))} is dotted${emotionReason ? `: ${emotionReason.reason}` : ", from your data"}.`}
              </p>
            </div>
            <fieldset>
              <legend className="sr-only">How you felt</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(EMOTIONS) as Emotion[]).map((k) => (
                  <Choice
                    key={k}
                    pressed={entry.emotions.includes(k)}
                    suggested={hintedEmotions.includes(k)}
                    warning={RISKY_EMOTIONS.includes(k)}
                    onClick={() => update({ emotions: toggle(entry.emotions, k) })}
                    className="min-h-14 px-5 text-lg"
                  >
                    {EMOTIONS[k]}
                  </Choice>
                ))}
              </div>
            </fieldset>
            {hintedEmotions.length > 0 && <p className="face-label text-sm text-muted">Dotted: suggested from your data. Nothing is chosen for you.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            {title("What went wrong?")}
            {hints.mistakes.length > 0 && (
              <fieldset className="flex flex-col gap-3 border-t-4 border-ink bg-paper-2 px-3.5 pt-3.5 pb-4">
                <legend className="sr-only">Spotted in the trade</legend>
                <p className="face-label text-base text-ink-2">Hardwon spotted {hints.mistakes.length === 1 ? "this" : "these"} in the trade. Tap to agree.</p>
                {hints.mistakes.map((h) => {
                  const on = entry.mistakes.includes(h.key);
                  return (
                    <Choice key={h.key} pressed={on} suggested warning onClick={() => update({ mistakes: toggle(entry.mistakes, h.key) })} className="min-h-15 justify-between px-3.5 py-2 text-left text-base">
                      <span className="flex flex-col gap-0.5">
                        <span>{MISTAKES[h.key]}</span>
                        {h.reason && <span className={`text-sm ${on ? "" : "text-muted"}`}>{h.reason}</span>}
                      </span>
                      {on && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" className="shrink-0">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </Choice>
                  );
                })}
              </fieldset>
            )}
            <fieldset className="flex flex-col gap-2.5">
              <legend className="face-label mb-2.5 text-base text-muted">{hints.mistakes.length ? "Anything else" : "Pick any, or none"}</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MISTAKES) as Mistake[])
                  .filter((k) => !hintedMistakes.includes(k))
                  .map((k) => (
                    <Choice key={k} pressed={entry.mistakes.includes(k)} warning onClick={() => update({ mistakes: toggle(entry.mistakes, k) })} className="min-h-13 px-4 text-base">
                      {MISTAKES[k]}
                    </Choice>
                  ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-8">
            <fieldset className="flex flex-col gap-3.5">
              <legend className="mb-3.5">{title("Did you follow your plan?")}</legend>
              <div className="grid grid-cols-2 gap-2">
                <Choice pressed={entry.followedPlan === true} onClick={() => update({ followedPlan: entry.followedPlan === true ? null : true })} className="min-h-15 text-lg">
                  Yes
                </Choice>
                <Choice pressed={entry.followedPlan === false} warning onClick={() => update({ followedPlan: entry.followedPlan === false ? null : false })} className="min-h-15 text-lg">
                  No
                </Choice>
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-3.5">
                <h3 className="text-[2rem] leading-none">How well did you execute?</h3>
              </legend>
              <div className="grid grid-cols-5 border border-rule-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={entry.rating === n}
                    aria-label={n === 1 ? "1, poor" : n === 5 ? "5, great" : String(n)}
                    onClick={() => update({ rating: entry.rating === n ? null : n })}
                    className={`face-label min-h-14 text-xl ${n > 1 ? "border-l border-rule" : ""} ${entry.rating === n ? "bg-ink text-paper" : "text-ink"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="face-label flex justify-between text-sm text-muted">
                <span>Poor</span>
                <span>Great</span>
              </div>
            </fieldset>
            <details open={Boolean(stop || target) || undefined} className="border-y border-rule-2">
              <summary className="face-label flex min-h-13 cursor-pointer list-none items-center justify-between text-base [&::-webkit-details-marker]:hidden">
                Planned stop and target <span className="text-sm text-muted">optional</span>
              </summary>
              <div className="flex flex-col gap-3 pt-1 pb-4">
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="face-label flex flex-col gap-1.5 text-sm">
                    Stop
                    <input inputMode="decimal" value={stop} onChange={(e) => (setStop(e.target.value), setError(null))} className={`${input} tabular-nums`} />
                  </label>
                  <label className="face-label flex flex-col gap-1.5 text-sm">
                    Target
                    <input inputMode="decimal" value={target} onChange={(e) => (setTarget(e.target.value), setError(null))} className={`${input} tabular-nums`} />
                  </label>
                </div>
                <p className="face-label text-sm text-muted">
                  {stopHint} Entry was {formatPrice(trade.avgEntry)} ({trade.direction}).
                </p>
              </div>
            </details>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              {title("Anything to remember?")}
              <p className="text-lg text-ink-2">Why you took it, what you saw, what you would do differently.</p>
            </div>
            <label className="block">
              <span className="sr-only">Note</span>
              <textarea
                value={entry.notes ?? ""}
                onChange={(e) => update({ notes: e.target.value })}
                rows={6}
                className={`${input} resize-none py-3 font-serif text-lg`}
              />
            </label>
            {aiEnabled && (
              <>
                <div className="flex gap-2">
                  <VoiceButton onText={(t) => update({ notes: entry.notes?.trim() ? `${entry.notes.trim()}\n${t}` : t })} />
                  <button type="button" disabled={aiPending || !entry.notes?.trim()} onClick={suggest} className={`${buttonSecondary} min-h-13 flex-1 text-base`} aria-busy={aiPending}>
                    {aiPending ? "Reading…" : "Suggest answers"}
                  </button>
                </div>
                {(aiLabels.length > 0 || aiMessage) && (
                  <div aria-live="polite" className="flex flex-col gap-1 border-t-4 border-ink bg-paper-2 px-3.5 py-3">
                    {aiLabels.length > 0 ? (
                      <>
                        <p className="face-label text-base text-ink-2">From your note: {listWords(aiLabels)}, which you left out.</p>
                        <div className="face-label flex gap-4 text-base">
                          <button type="button" onClick={applyAi} className="link min-h-11">
                            Add {aiLabels.length === 1 ? "it" : "them"}
                          </button>
                          <button type="button" onClick={() => setAi(null)} className="link min-h-11 text-muted">
                            No thanks
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="face-label text-base text-ink-2">{aiMessage}</p>
                    )}
                  </div>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="face-label text-base text-error">
                {error}
              </p>
            )}
          </div>
        )}

        {step === STEPS && (
          <div className="flex flex-col gap-6">
            <div role="status" className="flex flex-col gap-3 border-b-4 border-ink pb-4">
              <span className="face-label inline-flex items-center gap-2 text-base text-gain">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M5 12l5 5L20 7" />
                </svg>
                Saved
              </span>
              {title(remaining - 1 > 0 ? `${remaining - 1} to go` : "All journaled")}
            </div>
            <section aria-labelledby="journal-yours" className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <h3 id="journal-yours" className="face-label text-base font-normal text-muted">
                  {trade.title}, as you saw it
                </h3>
                <button type="button" onClick={() => setStep(0)} className="link face-label min-h-11 text-base">
                  Edit
                </button>
              </div>
              <Answers entry={entry} />
            </section>
            {next && (
              <section aria-labelledby="journal-after" className="flex flex-col gap-2.5 border-t-4 border-ink bg-paper-2 p-4">
                <p className="face-label text-sm text-muted">Next · opened {next.when}</p>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="journal-after" className="text-[1.75rem] leading-none">
                    {next.title}
                  </h3>
                  <span className={`figure-display text-[1.9rem] ${next.pnlClass}`}>{next.pnl}</span>
                </div>
                <p className="text-base text-ink-2">{next.summary}</p>
              </section>
            )}
          </div>
        )}
      </div>

      <footer className="face-label flex gap-2.5 border-t border-rule-2 bg-paper px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] text-base">
        {step === STEPS ? (
          <div className="flex flex-1 flex-col gap-2">
            {next && (
              <button type="button" onClick={() => router.push(next.href)} className={`${buttonPrimary} min-h-13 text-base`}>
                Journal the next one
              </button>
            )}
            <button type="button" onClick={() => router.push(doneHref)} className={next ? "link min-h-12" : `${buttonPrimary} min-h-13 text-base`}>
              Done for now
            </button>
          </div>
        ) : (
          <>
            {step === 0 ? (
              <button type="button" onClick={close} className={`${buttonSecondary} min-h-13 flex-1 text-base`}>
                Not now
              </button>
            ) : (
              <button type="button" onClick={() => setStep(step - 1)} className={`${buttonSecondary} min-h-13 flex-1 text-base`}>
                Back
              </button>
            )}
            {step < STEPS - 1 ? (
              <button type="button" onClick={() => setStep(step + 1)} className={`${buttonPrimary} min-h-13 flex-[2] text-base`}>
                Next
              </button>
            ) : (
              <button type="button" onClick={save} disabled={saving} aria-busy={saving} className={`${buttonPrimary} min-h-13 flex-[2] text-base`}>
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}

function Choice({
  pressed,
  suggested,
  warning,
  onClick,
  className,
  children,
}: {
  pressed: boolean;
  suggested?: boolean;
  warning?: boolean;
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  // Chosen: filled (a risky answer in the warning ink). Suggested by the data: dotted.
  const on = warning ? "border-warn bg-warn text-paper" : "border-ink bg-ink text-paper";
  const off = suggested ? "border-2 border-dashed border-ink-2 text-ink" : "border-rule-2 text-ink";
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`face-label flex items-center ${className.includes("justify-") ? "" : "justify-center"} gap-3 border transition-colors duration-(--dur-micro) ${pressed ? on : off} ${className}`}>
      {children}
    </button>
  );
}

/** What was saved, as small chips: risky answers on the warning paper. */
function Answers({ entry }: { entry: JournalInput }) {
  const chips: { text: string; risky: boolean }[] = [
    ...(entry.setup ? [{ text: SETUPS[entry.setup], risky: false }] : []),
    ...entry.emotions.map((k) => ({ text: EMOTIONS[k], risky: RISKY_EMOTIONS.includes(k) })),
    ...entry.mistakes.map((k) => ({ text: MISTAKES[k], risky: true })),
    ...(entry.followedPlan === null ? [] : [{ text: entry.followedPlan ? "Followed plan" : "Broke plan", risky: !entry.followedPlan }]),
    ...(entry.rating ? [{ text: `Execution ${entry.rating}/5`, risky: false }] : []),
    ...(entry.notes ? [{ text: "Note", risky: false }] : []),
  ];
  if (!chips.length) return <p className="face-label text-base text-muted">No answers, just marked as journaled.</p>;
  return (
    <ul className="face-label flex flex-wrap gap-1.5 text-sm">
      {chips.map((c) => (
        <li key={c.text} className={`px-2.5 py-1 ${c.risky ? "bg-warn-soft text-ink" : "bg-paper-2"}`}>
          {c.text}
        </li>
      ))}
    </ul>
  );
}

/** Records up to a minute from the microphone and adds the words to the note. The audio is not kept. */
function VoiceButton({ onText }: { onText: (text: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  const record = async () => {
    setMessage(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser can't record audio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessage("Allow the microphone to record a note.");
      return;
    }
    const r = new MediaRecorder(stream, { audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    const limit = window.setTimeout(() => r.state === "recording" && r.stop(), 60_000);
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      window.clearTimeout(limit);
      stream.getTracks().forEach((t) => t.stop());
      recorder.current = null;
      setState("working");
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: r.mimeType || "audio/webm" }), "voice-note");
      try {
        const res = await transcribeAction(form);
        if (res.ok && res.value) onText(res.value);
        else setMessage(res.message);
      } catch {
        setMessage("Couldn't send the recording. Check your connection.");
      }
      setState("idle");
    };
    recorder.current = r;
    r.start();
    setState("recording");
  };

  return (
    <div className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        disabled={state === "working"}
        aria-busy={state === "working"}
        onClick={state === "recording" ? () => recorder.current?.stop() : record}
        className={`${state === "recording" ? buttonPrimary : buttonSecondary} min-h-13 text-base`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          {state === "recording" ? <rect x="7" y="7" width="10" height="10" /> : <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />}
        </svg>
        {state === "recording" ? "Stop" : state === "working" ? "Writing it…" : "Speak it"}
      </button>
      {message && (
        <p role="status" className="face-label text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
