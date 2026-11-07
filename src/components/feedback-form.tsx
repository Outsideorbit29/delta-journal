"use client";

import { useState, useTransition } from "react";
import { sendFeedback } from "@/app/feedback-actions";
import type { FeedbackResult } from "@/lib/feedback";
import { buttonSecondary, input, label } from "@/components/ui";

/** A message box that goes straight to the founder's Telegram. */
export function FeedbackForm({ max }: { max: number }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [pending, start] = useTransition();

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await sendFeedback(text);
      setResult(r);
      if (r.ok) setText("");
    });
  };

  return (
    <form onSubmit={send} className="space-y-3">
      <label htmlFor="feedback" className={label}>
        Your message
      </label>
      <textarea
        id="feedback"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (result) setResult(null);
        }}
        maxLength={max}
        rows={4}
        placeholder="A bug, a number that looks wrong, something you wish it did…"
        className={`${input} block py-2`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !text.trim()} className={buttonSecondary}>
          {pending ? "Sending…" : "Send feedback"}
        </button>
        {result && <p className={`face-label text-sm ${result.ok ? "text-muted" : "text-error"}`}>{result.message}</p>}
      </div>
      <p className="text-sm text-muted">You can also send it from Telegram: /feedback followed by your message.</p>
    </form>
  );
}
