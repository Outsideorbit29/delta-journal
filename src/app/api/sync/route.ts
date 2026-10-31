import { syncNow } from "@/app/actions";
import { canSyncHere } from "@/lib/runtime";

// POST /api/sync pulls new data from Delta and rebuilds trades.
export async function POST() {
  const result = await syncNow();
  if (!result.ok && !canSyncHere()) return Response.json(result, { status: 403 });
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
