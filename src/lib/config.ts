// Thresholds behind the automatic tags. Change them here and run
// `npm run rebuild`; trades and tags are recomputed from the stored fills.
export const journalConfig = {
  /** Display time zone (India Standard Time). */
  timeZone: "Asia/Kolkata",

  /** Trading sessions by UTC hour of entry: [start, end). */
  sessions: [
    { tag: "session:asia", fromUtcHour: 0, toUtcHour: 7 },
    { tag: "session:london", fromUtcHour: 7, toUtcHour: 13 },
    { tag: "session:new_york", fromUtcHour: 13, toUtcHour: 21 },
    { tag: "session:late", fromUtcHour: 21, toUtcHour: 24 },
  ],

  /** Hold type: below scalp is a scalp, below intraday is intraday, else swing. */
  scalpMaxMinutes: 15,
  intradayMaxHours: 24,

  /** `after_loss`: opened within this many minutes of closing a losing trade. */
  afterLossMinutes: 30,
  /** `sized_up_after_loss`: and at least this many times the losing trade's size. */
  sizedUpFactor: 1.25,

  /** `oversized`: position size this many times the median of recent trades. */
  oversizedFactor: 1.5,
  oversizedLookback: 20,
  oversizedMinHistory: 5,

  /** `high_leverage`: leverage at or above this. */
  highLeverage: 100,
  /** `heavy_margin`: margin of the trade at or above this share of the wallet. */
  heavyMarginShare: 0.5,

  /** `loss_streak` / `win_streak`: entered after this many results in a row. */
  streakLength: 3,

  /** `overtrading`: this many other trades opened in the window before entry. */
  overtradingWindowMinutes: 60,
  overtradingCount: 3,

  /** `late_stop`: first stop-loss placed more than this long after entry. */
  lateStopMinutes: 5,
  /** A stop counts for a trade if placed up to this long before the entry fill. */
  stopLeadSeconds: 60,
} as const;

export type JournalConfig = typeof journalConfig;
