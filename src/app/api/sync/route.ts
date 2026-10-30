import { syncNow } from "@/app/actions";

// POST /api/sync pulls new data from Delta and rebuilds trades.
export async function POST() {
  const result = await syncNow();
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
