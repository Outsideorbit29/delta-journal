"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/** The symbol filter as one dropdown: an options trader has a symbol per contract, too many for chips. */
export function SymbolSelect({ options, value }: { options: { label: string; href: string; value: string }[]; value: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="face-label flex min-h-10 items-center gap-2 text-sm text-ink-2">
      <span className="sr-only">Symbol</span>
      <select
        value={value}
        aria-busy={pending}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) start(() => router.push(next.href));
        }}
        className="min-h-10 max-w-[16rem] border border-rule-2 bg-paper px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
