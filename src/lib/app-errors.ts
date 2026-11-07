import { createHash } from "node:crypto";
import { and, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { escapeHtml } from "@/lib/telegram/render";

// Server errors on the website are recorded here (src/instrumentation.ts) and the
// sync server tells the owner on Telegram, at most once an hour per distinct error.

const MAX_MESSAGE = 300;
export const REALERT_AFTER_MS = 60 * 60_000;
export const KEEP_DAYS = 30;

export interface AppErrorInfo {
  key: string;
  message: string;
  routePath: string;
  routeType: string;
  method: string;
  path: string;
}

/**
 * What to keep of a server error: the message with database parameters cut off (a failed query's
 * message lists them, and they can hold user data), the path without its query string, and a key
 * that groups repeats of the same error on the same route (numbers and ids ignored).
 */
export function errorInfo(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
): AppErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.split(/\n\s*params:/)[0].replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE) || "(no message)";
  const routePath = context.routePath ?? "?";
  const shape = message.replace(/[0-9a-f]{8,}|\d+/gi, "#");
  return {
    key: createHash("sha256").update(`${routePath}\n${shape}`).digest("hex").slice(0, 32),
    message,
    routePath,
    routeType: context.routeType ?? "?",
    method: request.method,
    path: request.path.split("?")[0],
  };
}

export async function recordAppError(db: Db, info: AppErrorInfo, now = Date.now()): Promise<void> {
  const t = schema.appErrors;
  await db
    .insert(t)
    .values({ ...info, count: 1, firstSeen: now, lastSeen: now })
    .onConflictDoUpdate({
      target: t.key,
      set: { count: sql`${t.count} + 1`, lastSeen: now, message: info.message, path: info.path, method: info.method },
    });
}

/** Errors the owner has not heard about: new ones, and ones that came back an hour or more after the last alert. */
export async function errorsToAlert(db: Db, now = Date.now()) {
  const t = schema.appErrors;
  return db
    .select()
    .from(t)
    .where(or(isNull(t.alertedAt), and(gt(t.count, t.alertedCount), lte(t.alertedAt, now - REALERT_AFTER_MS))))
    .orderBy(t.lastSeen);
}

export async function markAlerted(db: Db, keys: string[], now = Date.now()): Promise<void> {
  if (!keys.length) return;
  const t = schema.appErrors;
  await db.update(t).set({ alertedAt: now, alertedCount: sql`${t.count}` }).where(inArray(t.key, keys));
}

/** Forgets errors not seen for KEEP_DAYS. */
export async function pruneAppErrors(db: Db, now = Date.now()): Promise<void> {
  await db.delete(schema.appErrors).where(lt(schema.appErrors.lastSeen, now - KEEP_DAYS * 86_400_000));
}

type AppErrorRow = typeof schema.appErrors.$inferSelect;

/** One Telegram message (HTML) listing the errors, the newest few in full. */
export function renderErrorAlert(rows: AppErrorRow[], limit = 5): string {
  const lines = [`⚠️ <b>Website errors</b> on hardwon.in`];
  for (const r of rows.slice(-limit).reverse()) {
    const times = r.count - r.alertedCount;
    const where = `${r.method} ${r.path}` + (r.routePath !== r.path ? ` (${r.routePath}, ${r.routeType})` : ` (${r.routeType})`);
    lines.push("", `<b>${times}×</b> ${escapeHtml(where)}`, `<code>${escapeHtml(r.message)}</code>`);
  }
  if (rows.length > limit) lines.push("", `…and ${rows.length - limit} more. Vercel → Logs has the details.`);
  return lines.join("\n");
}
