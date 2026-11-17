"use client";

import { useState, type ReactNode } from "react";
import { buttonSecondary } from "@/components/ui";

/**
 * The trade page's journal: a short summary of your answers with an Edit button, or the form itself while editing
 * (and from the start when the trade is not journaled yet). Saving refreshes the summary.
 */
export function JournalPanel({ journaled, summary, form, prompt }: { journaled: boolean; summary: ReactNode; form: ReactNode; prompt: string }) {
  const [editing, setEditing] = useState(!journaled);
  return (
    <section className="flex flex-col gap-5 border-t-4 border-ink bg-paper-2 px-5 pt-6 pb-7 sm:px-7" aria-labelledby="journal-head">
      <div className="flex items-center justify-between gap-3">
        <h2 id="journal-head" className="text-2xl">
          Your journal
        </h2>
        {journaled && (
          <button type="button" className={buttonSecondary} aria-expanded={editing} onClick={() => setEditing((e) => !e)}>
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {!journaled && <p className="-mt-2 text-base text-ink-2">Not journaled yet. A few taps now make the habit analysis much sharper.</p>}
      {editing ? (
        form
      ) : (
        <>
          {summary}
          {prompt && (
            <button type="button" onClick={() => setEditing(true)} className="link self-start text-left font-serif text-lg text-ink-2">
              {prompt}
            </button>
          )}
        </>
      )}
    </section>
  );
}
