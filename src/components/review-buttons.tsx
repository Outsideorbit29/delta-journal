"use client";

import { useState, useTransition } from "react";
import { reviewAction, type AiResult } from "@/app/ai-actions";

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
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
