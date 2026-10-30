import { Suspense } from "react";
import { TradeChart } from "@/components/charts/trade-chart";
import { getTradeCandles } from "@/lib/candles";

interface ChartTrade {
  id: string;
  symbol: string;
  openedTs: number;
  closedTs: number | null;
  avgEntry: number;
  avgExit: number | null;
  stopPrice: number | null;
  stopMovedAfterSec: number | null;
  legs: { ts: number; qty: number; price: number }[];
}

interface Props {
  trade: ChartTrade;
  plannedStop: number | null;
  plannedTarget: number | null;
}

/** Price chart card for a trade; the candles stream in while the rest of the page shows. */
export function TradePriceChart(props: Props) {
  return (
    <section className="rounded-lg border border-black/10 bg-[var(--viz-surface)] p-3 dark:border-white/10">
      <Suspense fallback={<div className="flex h-[380px] items-center justify-center text-sm text-zinc-500">Loading price chart…</div>}>
        <ChartWithCandles {...props} />
      </Suspense>
    </section>
  );
}

async function ChartWithCandles({ trade, plannedStop, plannedTarget }: Props) {
  let data;
  try {
    data = await getTradeCandles(trade);
  } catch (err) {
    return <ChartMessage>Could not load prices from Delta: {err instanceof Error ? err.message : String(err)}</ChartMessage>;
  }
  if (!data.candles.length) {
    return <ChartMessage>Delta has no price history for {trade.symbol} in this period.</ChartMessage>;
  }
  return (
    <>
      <p className="mb-2 text-xs text-zinc-500">
        {trade.symbol} · {data.resolution} candles · times in IST · arrows mark each fill at its price
      </p>
      <TradeChart
        candles={data.candles}
        resolutionSec={data.resolutionSec}
        legs={trade.legs.map((l) => ({ ts: l.ts, qty: l.qty, price: l.price }))}
        avgEntry={trade.avgEntry}
        avgExit={trade.avgExit}
        stopPrice={trade.stopPrice}
        stopMoved={trade.stopMovedAfterSec !== null}
        plannedStop={plannedStop}
        plannedTarget={plannedTarget}
      />
    </>
  );
}

function ChartMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-zinc-500">{children}</div>;
}
