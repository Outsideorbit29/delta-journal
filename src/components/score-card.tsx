import { card } from "@/components/ui";
import { weakest, type BehaviourScore } from "@/lib/score";

/** The behaviour score: the overall number, a radar of its dimensions, and the one habit to work on. */
export function ScoreCard({ score, compact = false }: { score: BehaviourScore; compact?: boolean }) {
  const focus = weakest(score);
  return (
    <section className={`${card} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Behaviour score</h2>
          {!compact && <p className="text-xs text-zinc-500">How often your trades avoid each costly habit, over {score.trades} trades</p>}
        </div>
        <div className="text-right">
          <div className="text-3xl font-semibold tabular-nums text-brand">{score.overall}</div>
          <div className="text-xs text-zinc-400">
            {score.label}
            {score.trend !== null && score.trend !== 0 && (
              <span className={score.trend > 0 ? "text-emerald-400" : "text-rose-400"}>
                {" "}
                · {score.trend > 0 ? "▲" : "▼"} {Math.abs(score.trend)} lately
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={`mt-2 grid items-center gap-4 ${compact ? "" : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}>
        <Radar score={score} />
        {!compact && (
          <ul className="space-y-1.5 text-sm">
            {score.dimensions.map((d) => (
              <li key={d.key} className="space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-300">{d.label}</span>
                  <span className="tabular-nums text-zinc-400">{d.score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-zinc-800">
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${d.score}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!compact && (
        <p className="mt-4 rounded-md bg-brand-soft px-3 py-2 text-sm text-zinc-200">
          <span className="font-medium text-brand">Work on {focus.label.toLowerCase()}:</span> {focus.tip}
        </p>
      )}
    </section>
  );
}

/** A radar of the dimensions on a 0-100 scale, with rings at 25, 50, 75 and 100. */
function Radar({ score }: { score: BehaviourScore }) {
  const dims = score.dimensions;
  // Wider than tall, so the labels on the sides fit.
  const cx = 150;
  const cy = 110;
  const r = 72;
  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
    return [cx + Math.cos(angle) * r * (value / 100), cy + Math.sin(angle) * r * (value / 100)] as const;
  };
  const ring = (v: number) => dims.map((_, i) => point(i, v).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 220" className="mx-auto w-full max-w-[340px]" role="img" aria-label={`Behaviour score ${score.overall} out of 100`}>
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke="var(--viz-grid)" strokeWidth="1" />
      ))}
      {dims.map((_, i) => {
        const [x, y] = point(i, 100);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--viz-grid)" strokeWidth="1" />;
      })}
      <polygon points={dims.map((d, i) => point(i, d.score).join(",")).join(" ")} fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" />
      {dims.map((d, i) => {
        const [x, y] = point(i, d.score);
        return <circle key={d.key} cx={x} cy={y} r="3" fill="var(--brand)" stroke="var(--background)" strokeWidth="1.5" />;
      })}
      {dims.map((d, i) => {
        const [x, y] = point(i, 122);
        const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
        return (
          <text key={d.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-zinc-400 text-[9px]">
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
