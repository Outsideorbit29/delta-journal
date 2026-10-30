import type { ReviewRow } from "@/lib/ai/review";
import { formatDateTime, formatMoney } from "@/lib/format";

/** One AI coaching review, rendered from its stored JSON. */
export function ReviewView({ row }: { row: ReviewRow }) {
  const r = row.review;
  const day = (ts: number) => formatDateTime(ts).split(",")[0];
  return (
    <article className="space-y-5">
      <header>
        <p className="text-xs text-zinc-500">
          {day(row.periodStart)} – {day(row.periodEnd)} · {row.tradeCount} trades · written {formatDateTime(row.createdAt)} IST
        </p>
        <h2 className="mt-1 text-xl font-semibold">{r.headline}</h2>
        <p className="mt-2 text-zinc-700 dark:text-zinc-300">{r.summary}</p>
      </header>

      <Section title="Costly habits">
        {r.leaks.map((l) => (
          <li key={l.pattern} className="rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{l.pattern}</span>
              {l.costUsd !== null && <span className="text-sm tabular-nums text-rose-600 dark:text-rose-400">{formatMoney(l.costUsd, { sign: true })}</span>}
            </div>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{l.evidence}</p>
          </li>
        ))}
      </Section>

      {r.strengths.length > 0 && (
        <Section title="What helped">
          {r.strengths.map((s) => (
            <li key={s.point} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <span className="font-medium">{s.point}</span>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{s.evidence}</p>
            </li>
          ))}
        </Section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">Rules for next week</h3>
        <ol className="list-decimal space-y-1 pl-5">
          {r.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      {r.journaling && <p className="text-sm italic text-zinc-500">{r.journaling}</p>}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}
