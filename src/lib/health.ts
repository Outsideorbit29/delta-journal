import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";

// The sync server writes a heartbeat after every round; /api/health reads it,
// so an outside uptime monitor can tell when the server has stopped.

const HEARTBEAT_KEY = "bot.heartbeat";
/** Rounds run every minute; a few missed in a row means the server is down or stuck. */
export const STALE_AFTER_MS = 5 * 60_000;

export interface Heartbeat {
  at: number;
  /** Users synced this round, and how many of them failed. Counts only: the endpoint is public. */
  users: number;
  failing: number;
}

export interface Health {
  ok: boolean;
  database: "ok" | "unreachable";
  syncServer: "ok" | "stale" | "never";
  lastRoundSecondsAgo: number | null;
  users: number | null;
  failing: number | null;
}

export async function recordHeartbeat(db: Db, beat: Heartbeat): Promise<void> {
  const value = JSON.stringify(beat);
  await db
    .insert(schema.appState)
    .values({ userId: "", key: HEARTBEAT_KEY, value })
    .onConflictDoUpdate({ target: [schema.appState.userId, schema.appState.key], set: { value } });
}

export async function readHealth(db: Db, now = Date.now()): Promise<Health> {
  let beat: Heartbeat | null = null;
  try {
    const [row] = await db
      .select({ value: schema.appState.value })
      .from(schema.appState)
      .where(and(eq(schema.appState.userId, ""), eq(schema.appState.key, HEARTBEAT_KEY)));
    beat = row ? (JSON.parse(row.value) as Heartbeat) : null;
  } catch {
    return { ok: false, database: "unreachable", syncServer: "never", lastRoundSecondsAgo: null, users: null, failing: null };
  }
  const age = beat ? now - beat.at : null;
  const syncServer = age === null ? "never" : age > STALE_AFTER_MS ? "stale" : "ok";
  return {
    ok: syncServer === "ok",
    database: "ok",
    syncServer,
    lastRoundSecondsAgo: age === null ? null : Math.round(age / 1000),
    users: beat?.users ?? null,
    failing: beat?.failing ?? null,
  };
}
