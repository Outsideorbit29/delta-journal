import { connection } from "next/server";
import { getDb } from "@/db";
import { readHealth } from "@/lib/health";

// Public health check for an uptime monitor: 200 while the sync server is
// running its rounds, 503 when it has stopped or the database is unreachable.
// Counts only, never user ids or errors.
export async function GET() {
  await connection();
  let health;
  try {
    health = await readHealth(await getDb());
  } catch {
    health = { ok: false, database: "unreachable" as const };
  }
  return Response.json(health, { status: health.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
