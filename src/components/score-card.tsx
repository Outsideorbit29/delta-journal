import { weakest, type BehaviourScore } from "@/lib/score";

/**
 * The behaviour score: the overall number, one bar per dimension, and the one habit
 * to work on. The weakest dimension carries the accent; the rest stay in ink.
 */
export function ScoreCard({ score, compact = false }: { score: BehaviourScore; compact?: boolean }) {
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
        <p className="mt-6 bg-paper-2 border-t border-rule-2 px-5 py-4 text-base text-ink-2">
          <strong className="face-label font-medium text-ink">Work on {focus.label.toLowerCase()}.</strong> {focus.tip}
        </p>
      )}
    </section>
  );
}
