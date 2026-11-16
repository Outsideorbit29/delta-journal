"use client";

import { useEffect, useRef } from "react";
import type { Currency } from "@/db/schema";
import { formatMoney } from "@/lib/format";
import { countAt, COUNT_UP_MS } from "@/lib/motion";

/**
 * A figure that counts up to its value once, when it first comes into view (design.md → Motion). The final value is
 * always in the markup, so it reads right without script, for screen readers, and under reduced motion (no count).
 */
export function CountUp({
  value,
  kind = "money",
  currency = "USD",
  sign = false,
  className,
}: {
  value: number;
  kind?: "money" | "int";
  currency?: Currency;
  sign?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = (v: number) => (kind === "int" ? Math.round(v).toLocaleString("en-IN") : formatMoney(v, { sign, currency }));

  useEffect(() => {
    const el = ref.current;
    if (!el || !value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const elapsed = now - start;
          el.textContent = text(countAt(value, elapsed));
          if (elapsed < COUNT_UP_MS) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      el.textContent = text(value);
    };
    // The figure only ever counts to the value it was rendered with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {text(value)}
    </span>
  );
}
