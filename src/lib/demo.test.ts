import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { computeStats, tagPerformance } from "@/lib/stats";

const dir = mkdtempSync(path.join(tmpdir(), "edgebook-demo-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

// Imported after DATABASE_URL is set, so writeChanged and rebuild use the temporary database.
const { getDb } = await import("@/db");
const { listTrades } = await import("@/lib/queries");
const { DEMO_USER, demoData, seedDemo } = await import("./demo");

const NOW = Date.UTC(2026, 10, 1, 12);

afterAll(async () => {
  (await getDb()).$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("demo account", () => {
  it("is the same every time and never uses ids Delta could use", () => {
    const a = demoData(NOW);
    expect(demoData(NOW)).toEqual(a);
    expect(a.fills.every((f) => f.id.startsWith("demo-"))).toBe(true);
    expect(a.orders.every((o) => o.id < 0)).toBe(true);
    expect(Math.max(...a.fills.map((f) => Date.parse(f.created_at)))).toBeLessThanOrEqual(NOW);
  });

  it("rebuilds into trades that tell the app's story, and can be reseeded", async () => {
    const db = await getDb();
    const first = await seedDemo(db, NOW);
    const second = await seedDemo(db, NOW);
    expect(second).toEqual(first);
    expect(first.warnings).toBe(0);
    expect(first.journaled).toBeGreaterThan(5);

    const trades = await listTrades(DEMO_USER);
    const stats = computeStats(trades);
    expect(stats.trades).toBeGreaterThan(60);
    expect(stats.netPnl).toBeLessThan(0);
    const tags = Object.fromEntries(tagPerformance(trades).map((r) => [r.tag, r]));
    expect(tags["hold:scalp"].netPnl).toBeLessThan(0);
    expect(tags["moved_stop"].netPnl).toBeLessThan(0);
    expect(tags["stop_to_profit"].netPnl).toBeGreaterThan(0);
    expect(tags["stopped_out"]).toBeDefined();
  });
});
