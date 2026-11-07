import Link from "next/link";
import { buttonSecondary } from "@/components/ui";
import { weakest, type BehaviourScore } from "@/lib/score";

/** What to do about the weakest habit: a sentence and a link, in place of the generic tip. */
export interface ScoreAction {
  message: string;
  href: string;
  label: string;
}

/**
 * The behaviour score: the overall number, one bar per dimension, and the one habit
 * to work on. The weakest dimension carries the accent; the rest stay in ink.
 */
export function ScoreCard({ score, compact = false, action }: { score: BehaviourScore; compact?: boolean; action?: ScoreAction }) {
  const focus = weakest(score);
  return (
    <section className="opens" aria-labelledby="score-head">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 id="score-head" className="text-xl">
            Behaviour score
          </h2>
          {!compact && <p className="mt-1 max-w-sm text-base text-muted">How often your trades avoid each costly habit, over {score.trades} trades.</p>}
        </div>
        <div className="text-right">
          <p className="figure-display text-6xl text-ink">{score.overall}</p>
          <p className="face-label mt-1 text-sm text-muted">
            {score.label}
            {score.trend !== null && score.trend !== 0 && (
              <span className={score.trend > 0 ? "text-gain" : "text-loss"}>
                {", "}
                {Math.abs(score.trend)} {score.trend > 0 ? "up" : "down"} lately
              </span>
            )}
          </p>
        </div>
      </div>

      <ul className="mt-6 divide-y divide-rule border-t border-rule-2">
        {score.dimensions.map((d) => {
          const isFocus = d.key === focus.key;
          return (
            <li key={d.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-4 py-2.5">
              <span className={`face-label text-sm ${isFocus ? "text-ink" : "text-ink-2"}`}>{d.label}</span>
              <span className="h-2 bg-paper-3" aria-hidden="true">
                <span className={`block h-2 ${isFocus ? "bg-accent" : "bg-ink-2"}`} style={{ width: `${d.score}%` }} />
              </span>
              <span className="face-label text-right text-sm text-ink">{d.score}</span>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-paper-2 border-t border-accent px-5 py-4">
          <p className="min-w-0 flex-1 basis-64 text-base text-ink-2">
            <strong className="face-label font-medium text-ink">{focus.label} is your weakest habit.</strong> {action?.message ?? focus.tip}
          </p>
          {action && (
            <Link href={action.href} className={buttonSecondary}>
              {action.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
