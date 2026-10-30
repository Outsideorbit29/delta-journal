import { listTrades } from "@/lib/queries";
import { computeStats } from "@/lib/stats";

// JSON API for other clients, such as the planned mobile app.
// GET /api/trades?symbol=XAUTUSD&tag=after_loss&since=1790000000000
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = Number(searchParams.get("since"));
  const trades = await listTrades({
    symbol: searchParams.get("symbol") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    sinceTs: Number.isFinite(since) && since > 0 ? since : undefined,
  });
  return Response.json({ stats: computeStats(trades), trades });
}
