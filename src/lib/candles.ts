import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Candle } from "@/db/schema";
import { DeltaClient } from "@/lib/delta/client";

const RESOLUTIONS = [
  ["1m", 60],
  ["3m", 180],
  ["5m", 300],
  ["15m", 900],
  ["30m", 1800],
  ["1h", 3600],
  ["2h", 7200],
  ["4h", 14400],
  ["6h", 21600],
  ["1d", 86400],
] as const;

/** Aim for roughly this many candles across the whole window. */
const TARGET_CANDLES = 240;
/** Open trades refresh their candles at most this often. */
const OPEN_TRADE_TTL_MS = 60_000;

export interface CandleWindow {
  resolution: string;
  resolutionSec: number;
  startSec: number;
  endSec: number;
}

/**
 * Picks a candle size and time window that shows the whole trade with context
 * on both sides: half the trade's duration, and at least 30 candles, each way.
 */
export function candleWindow(openedTs: number, closedTs: number | null, nowMs = Date.now()): CandleWindow {
  const open = Math.floor(openedTs / 1000);
  const close = Math.ceil((closedTs ?? nowMs) / 1000);
  const span = Math.max(close - open, 60);
  const [resolution, resolutionSec] =
    RESOLUTIONS.find(([, sec]) => (span * 2) / sec <= TARGET_CANDLES) ?? RESOLUTIONS[RESOLUTIONS.length - 1];
  const pad = Math.max(span / 2, 30 * resolutionSec);
  return {
    resolution,
    resolutionSec,
    startSec: Math.floor((open - pad) / resolutionSec) * resolutionSec,
    endSec: Math.min(Math.ceil(close + pad), Math.floor(nowMs / 1000)),
  };
}

export interface TradeCandles extends CandleWindow {
  candles: Candle[];
}

export async function getTradeCandles(trade: {
  id: string;
  symbol: string;
  openedTs: number;
  closedTs: number | null;
}): Promise<TradeCandles> {
  const db = await getDb();
  const window = candleWindow(trade.openedTs, trade.closedTs);
  const [cached] = await db.select().from(schema.tradeCandles).where(eq(schema.tradeCandles.tradeId, trade.id));
  const fresh = trade.closedTs !== null || Date.now() - (cached?.fetchedAt ?? 0) < OPEN_TRADE_TTL_MS;
  if (cached && fresh && cached.resolution === window.resolution && cached.startSec === window.startSec) {
    return { ...window, endSec: cached.endSec, candles: cached.candles };
  }

  const { result } = await DeltaClient.public().get<(Candle & { volume?: number })[]>("/v2/history/candles", {
    symbol: trade.symbol,
    resolution: window.resolution,
    start: window.startSec,
    end: window.endSec,
  });
  const candles = result
    .map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
    .sort((a, b) => a.time - b.time);

  const row = {
    tradeId: trade.id,
    symbol: trade.symbol,
    resolution: window.resolution,
    startSec: window.startSec,
    endSec: window.endSec,
    candles,
    fetchedAt: Date.now(),
  };
  await db.insert(schema.tradeCandles).values(row).onConflictDoUpdate({ target: schema.tradeCandles.tradeId, set: row });
  return { ...window, candles };
}
