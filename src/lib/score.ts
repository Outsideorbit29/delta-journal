// The behaviour score: how often your trades avoid each costly habit, from the
// automatic tags. Each dimension is the share of trades without that habit
// (0-100); the overall score is their average. It measures process, not P&L.

interface ScoredTrade {
  id: string;
  status: string;
  closedTs: number | null;
  tags: { tag: string }[];
}

export interface ScoreDimension {
  key: string;
  label: string;
  score: number;
  /** What to work on when this dimension is low. */
  tip: string;
}

export interface BehaviourScore {
  overall: number;
  label: "Strong" | "Solid" | "Needs work" | "Leaking";
  dimensions: ScoreDimension[];
  trades: number;
  /** Recent trades' score minus the earlier ones', when there are enough trades to compare. */
  trend: number | null;
}

/** Fewer trades than this say little about habits. */
export const MIN_SCORED_TRADES = 5;

type Dimension = {
  key: string;
  label: string;
  tip: string;
  /** Which trades this dimension applies to (default: all). */
  applies?: (tags: Set<string>) => boolean;
  good: (tags: Set<string>, id: string) => boolean;
};

const has = (tags: Set<string>, ...names: string[]) => names.some((n) => tags.has(n));

function dimensions(journaled?: Set<string>): Dimension[] {
  const list: Dimension[] = [
    {
      key: "risk",
      label: "Risk control",
      tip: "Place a stop-loss as soon as you enter.",
      good: (t) => !has(t, "no_stop", "late_stop"),
    },
    {
      key: "stops",
      label: "Stop discipline",
      tip: "Never move a stop further away while the trade is losing.",
      applies: (t) => !t.has("no_stop"),
      good: (t) => !t.has("moved_stop"),
    },
    {
      key: "sizing",
      label: "Position sizing",
      tip: "Keep size and leverage close to your usual.",
      good: (t) => !has(t, "oversized", "heavy_margin", "high_leverage"),
    },
    {
      key: "emotions",
      label: "Emotional control",
      tip: "After a loss, take a break instead of sizing up or adding to a loser.",
      good: (t) => !has(t, "sized_up_after_loss", "added_to_loser", "liquidated"),
    },
    {
      key: "patience",
      label: "Patience",
      tip: "Fewer, longer trades: scalps and bursts of trades mostly feed fees.",
      good: (t) => !has(t, "overtrading", "hold:scalp"),
    },
  ];
  if (journaled) {
    list.push({
      key: "journal",
      label: "Journaling",
      tip: "Journal each trade; it takes a few taps on Telegram.",
      good: (_, id) => journaled.has(id),
    });
  }
  return list;
}

/** The score for these trades, or null when there are too few closed trades to judge. */
export function behaviourScore(trades: ScoredTrade[], journaled?: Set<string>): BehaviourScore | null {
  const closed = trades.filter((t) => t.status === "closed").sort((a, b) => (a.closedTs ?? 0) - (b.closedTs ?? 0));
  if (closed.length < MIN_SCORED_TRADES) return null;

  const scored = scoreOf(closed, journaled);
  // Compare the most recent trades with the ones just before them.
  const half = Math.min(20, Math.floor(closed.length / 2));
  let trend: number | null = null;
  if (half >= MIN_SCORED_TRADES) {
    const recent = scoreOf(closed.slice(-half), journaled);
    const before = scoreOf(closed.slice(-2 * half, -half), journaled);
    trend = recent.overall - before.overall;
  }
  return { ...scored, trades: closed.length, trend };
}

function scoreOf(trades: ScoredTrade[], journaled?: Set<string>) {
  const tagSets = trades.map((t) => ({ id: t.id, tags: new Set(t.tags.map((g) => g.tag)) }));
  const dims: ScoreDimension[] = [];
  for (const d of dimensions(journaled)) {
    const applicable = tagSets.filter((t) => d.applies?.(t.tags) ?? true);
    if (!applicable.length) continue;
    const good = applicable.filter((t) => d.good(t.tags, t.id)).length;
    dims.push({ key: d.key, label: d.label, tip: d.tip, score: Math.round((100 * good) / applicable.length) });
  }
  const overall = Math.round(dims.reduce((sum, d) => sum + d.score, 0) / dims.length);
  return { overall, label: labelFor(overall), dimensions: dims };
}

function labelFor(score: number): BehaviourScore["label"] {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Solid";
  if (score >= 40) return "Needs work";
  return "Leaking";
}

/** The weakest dimension: the one habit to work on next. */
export const weakest = (score: BehaviourScore) => [...score.dimensions].sort((a, b) => a.score - b.score)[0];
