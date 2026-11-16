import { listTrades } from "@/lib/queries";
import { currentUserId } from "@/lib/session";
import { computeStats } from "@/lib/stats";

// JSON API for other clients, such as the planned mobile app.
// GET /api/trades?account=acc_…&symbol=XAUTUSD&tag=after_loss&since=1790000000000
// Each trade carries its currency; `stats` is null when the trades are in more than one currency.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = Number(searchParams.get("since"));
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in first" }, { status: 401 });
  const trades = await listTrades(userId, {
    accountId: searchParams.get("account") ?? undefined,
    symbol: searchParams.get("symbol") ?? undefined,
    tag: searchParams.get("tag") ?? undefined,
    sinceTs: Number.isFinite(since) && since > 0 ? since : undefined,
  });
  const oneCurrency = new Set(trades.map((t) => t.currency)).size <= 1;
  return Response.json({ stats: oneCurrency ? computeStats(trades) : null, trades });
}
