import { connection } from "next/server";
import { TradeView } from "@/components/trade-view";
import { requireUserId } from "@/lib/session";

export default async function TradePage({ params }: PageProps<"/trades/[id]">) {
  await connection();
  const userId = await requireUserId();
  const { id } = await params;
  return <TradeView userId={userId} tradeId={decodeURIComponent(id)} />;
}
