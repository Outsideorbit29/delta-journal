import { gzipSync } from "node:zlib";
import { getDb } from "@/db";
import { exportAccount, tradesCsv } from "@/lib/account";
import { istDate } from "@/lib/stats";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUserId } from "@/lib/session";

// Download everything Hardwon stores about you.
// GET /api/export            → JSON: every table's rows (secrets left out)
// GET /api/export?format=csv → trades with their journal, for a spreadsheet
export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Sign in first" }, { status: 401 });
  const db = await getDb();
  const limit = await rateLimit(db, userId, "account.export");
  if (!limit.ok) return Response.json({ error: tooMany(limit) }, { status: 429 });

  const csv = new URL(request.url).searchParams.get("format") === "csv";
  const day = istDate(Date.now());
  const text = csv ? await tradesCsv(db, userId) : JSON.stringify(await exportAccount(db, userId));
  // Compressed here, so even a long trading history stays far below Vercel's 4.5 MB response limit.
  const gzip = /\bgzip\b/.test(request.headers.get("accept-encoding") ?? "");
  return new Response(gzip ? gzipSync(text) : text, {
    headers: {
      ...(gzip ? { "Content-Encoding": "gzip", Vary: "Accept-Encoding" } : {}),
      "Content-Type": csv ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hardwon-${csv ? "trades" : "export"}-${day}.${csv ? "csv" : "json"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
