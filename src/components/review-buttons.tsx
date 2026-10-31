"use client";

import { useState, useTransition } from "react";
import { reviewAction, type AiResult } from "@/app/ai-actions";
import { buttonPrimary } from "@/components/ui";

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
          onClick={() => run(d)}
          className={buttonPrimary}
        >
          {pending && days === d ? "Writing review…" : `Review last ${d} days`}
        </button>
      ))}
      {result && !result.ok && (
        <p role="status" className="text-sm text-rose-600 dark:text-rose-400">
          {result.message}
        </p>
      )}
    </div>
  );
}
