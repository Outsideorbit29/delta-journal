"use client";

import { useEffect, useRef, useState } from "react";
import { storyStep } from "@/lib/motion";

const COUNT_WORDS: Record<number, string> = { 1: "One", 2: "Two", 3: "Three", 4: "Four" };

export interface StoryLeak {
  label: string;
  /** "-$359.88" */
  amount: string;
  /** "11 trades, 0% won" */
  detail: string;
  /** What to do about it. */
  fix: string | null;
  /** This leak's size against the biggest, 0 to 1. */
  share: number;
}

/**
 * A4: the demo's biggest leaks as a pinned story. On wide screens the list holds still while you scroll through the
 * section: each leak lights up in turn, its bar grows and its fix appears. On phones, without script and under reduced
 * motion it is a plain list with every bar drawn, so nothing waits on an animation.
 */
export function LeakStory({ leaks, total }: { leaks: StoryLeak[]; total: string }) {
  const outer = useRef<HTMLDivElement>(null);
  // null: the static list (server render, phones, reduced motion).
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 60rem)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!wide.matches || still.matches) return setProgress(null);
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      setProgress(run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    wide.addEventListener("change", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      wide.removeEventListener("change", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const story = progress === null ? null : storyStep(progress, leaks.length);

  return (
    <div ref={outer} className={story ? "h-[260vh]" : ""}>
      <div className={story ? "sticky top-0 flex min-h-svh flex-col justify-center" : ""}>
        <h2 className="max-w-[18ch]">
          {COUNT_WORDS[leaks.length] ?? leaks.length} {leaks.length === 1 ? "habit" : "habits"} cost the demo trader {total}
        </h2>
        <p className="lead mt-5 max-w-[46ch] text-ink-2">Hardwon found them in the trades alone, priced each one, and says what to do about it.</p>
        <ol className="face-label mt-12 list-none divide-y divide-rule border-y border-rule-2 p-0">
          {leaks.map((l, i) => {
            const grown = story ? story.grown[i] : 1;
            const lit = !story || grown > 0.02;
            return (
              <li
                key={l.label}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-3 py-6 transition-opacity duration-(--dur-long) ${lit ? "opacity-100" : "opacity-30"}`}
              >
                <span className="text-[clamp(1.5rem,2.2vw,2rem)] text-ink">{l.label}</span>
                <span className="text-right">
                  <span className="figure-display block text-[clamp(2rem,3.4vw,3rem)] text-loss">{l.amount}</span>
                  <span className="block text-sm text-muted">{l.detail}</span>
                </span>
                <span className="col-span-2 block h-2.5 bg-paper-3" aria-hidden="true">
                  <span className="block h-2.5 bg-[var(--viz-loss)]" style={{ width: `${Math.max(3, l.share * grown * 100)}%` }} />
                </span>
                {l.fix && (
                  <span className={`col-span-2 font-serif text-lg text-ink-2 transition-opacity duration-(--dur-long) ${!story || grown > 0.6 ? "opacity-100" : "opacity-0"}`}>
                    {l.fix}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
