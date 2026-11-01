"use client";

import { useState, useTransition } from "react";
import { reviewAction, type AiResult } from "@/app/ai-actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

export function ReviewButtons() {
  const [result, setResult] = useState<AiResult | null>(null);
  const [pending, start] = useTransition();
  const [days, setDays] = useState<number | null>(null);

  const run = (d: number) => {
    setDays(d);
    setResult(null);
    start(async () => setResult(await reviewAction(d)));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {[7, 30].map((d) => (
        <button
          key={d}
          type="button"
          disabled={pending}
          aria-busy={pending && days === d}
          onClick={() => run(d)}
          className={d === 7 ? buttonPrimary : buttonSecondary}
        >
          {pending && days === d ? "Writing the review…" : `Review the last ${d} days`}
        </button>
      ))}
      {result && !result.ok && (
        <p role="status" className="face-label w-full text-sm text-error">
          {result.message}
        </p>
      )}
    </div>
  );
}
