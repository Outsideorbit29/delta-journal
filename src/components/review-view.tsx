import type { ReviewRow } from "@/lib/ai/review";
import { formatDateTime, formatMoney } from "@/lib/format";

/** One AI coaching review, set like a short magazine piece from its stored JSON. */
export function ReviewView({ row }: { row: ReviewRow }) {
  const r = row.review;
  const day = (ts: number) => formatDateTime(ts).split(",")[0];
  return (
    <article className="space-y-12">
      <header className="border-b-4 border-ink pb-8">
        <p className="face-label text-sm text-muted">
          {day(row.periodStart)} to {day(row.periodEnd)}, {row.tradeCount} trades. Written{" "}
          <time dateTime={new Date(row.createdAt).toISOString()}>{formatDateTime(row.createdAt)} IST</time>.
        </p>
        <h2 className="mt-3 max-w-[24ch] text-[clamp(2rem,4vw,3.25rem)]">{r.headline}</h2>
        <p className="mt-5 max-w-[48ch] text-[clamp(1.25rem,1.6vw,1.5rem)] leading-snug text-ink">{r.summary}</p>
      </header>

      <Section title="Costly habits">
        {r.leaks.map((l) => (
          <li key={l.pattern} className="grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="face-label text-xl text-ink">{l.pattern}</p>
              <p className="mt-1 max-w-[60ch] text-base text-ink-2">{l.evidence}</p>
            </div>
            {l.costUsd !== null && <p className="figure-display text-3xl text-loss sm:text-right">{formatMoney(l.costUsd, { sign: true })}</p>}
          </li>
        ))}
      </Section>

      {r.strengths.length > 0 && (
        <Section title="What helped">
          {r.strengths.map((s) => (
            <li key={s.point} className="py-5">
              <p className="face-label text-xl text-ink">{s.point}</p>
              <p className="mt-1 max-w-[60ch] text-base text-ink-2">{s.evidence}</p>
            </li>
          ))}
        </Section>
      )}

      <section className="bg-paper-2 border-t-4 border-ink px-6 py-8 sm:px-8">
        <h3 className="text-2xl">Rules for next week</h3>
        <ol className="mt-5 list-none space-y-4 p-0">
          {r.rules.map((rule, i) => (
            <li key={rule} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-3 text-lg text-ink">
              <span aria-hidden="true" className="figure-display text-3xl text-ink">
                {i + 1}
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </section>

      {r.journaling && <p className="max-w-[60ch] text-lg text-ink-2 italic">{r.journaling}</p>}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="opens">
      <h3 className="text-2xl">{title}</h3>
      <ul className="mt-3 divide-y divide-rule">{children}</ul>
    </section>
  );
}
