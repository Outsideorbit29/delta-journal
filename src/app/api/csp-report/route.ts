import { getDb } from "@/db";
import { recordAppError } from "@/lib/app-errors";
import { readViolations, violationError } from "@/lib/csp";

// Browsers post Content Security Policy reports here (src/lib/csp.ts). Each distinct violation is filed
// with the website's errors, so the owner hears of it on Telegram. Anyone can post, so the body is
// capped and only a few violations per request are kept.

const MAX_BODY = 16_000;

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const violations = readViolations(body);
  if (violations.length) {
    const db = await getDb();
    for (const v of violations) await recordAppError(db, violationError(v));
  }
  return new Response(null, { status: 204 });
}
