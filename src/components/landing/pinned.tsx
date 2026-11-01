"use client";

import { useEffect, useRef, useState } from "react";

export interface PinnedPanel {
  title: string;
  body: string;
  visual: React.ReactNode;
}

/**
 * One visual held still while short panels scroll past it; each panel brings up
 * its own picture of the product. Under 60rem (and without script) every panel
 * simply carries its visual inline.
 */
export function Pinned({ panels }: { panels: PinnedPanel[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-x-8 lg:grid-cols-12">
      {/* Wide screens: the visual for the panel in view, pinned beside the text. Decorative copy of what each panel shows inline below 60rem. */}
      <div className="hidden lg:col-span-7 lg:block" aria-hidden="true">
        <div className="sticky top-28 grid">
          {panels.map((p, i) => (
            <div
              key={p.title}
              className={`[grid-area:1/1] bg-paper-2 border-t-4 border-ink p-8 transition-opacity duration-(--dur-long) ease-out ${i === active ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              {p.visual}
            </div>
          ))}
        </div>
      </div>

      <ol className="list-none p-0 lg:col-span-4 lg:col-start-9">
        {panels.map((p, i) => (
          <li
            key={p.title}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-index={i}
            className="flex flex-col justify-center border-t border-rule-2 py-10 first:border-t-0 lg:min-h-[70vh] lg:border-t-0 lg:py-0"
          >
            <h3 className={`text-[clamp(1.75rem,2.4vw,2.25rem)] transition-colors duration-(--dur-short) ${i === active ? "lg:text-ink" : "lg:text-muted"}`}>{p.title}</h3>
            <p className="mt-4 text-lg text-ink-2">{p.body}</p>
            <div className="mt-8 bg-paper-2 border-t-4 border-ink p-6 lg:hidden">{p.visual}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
