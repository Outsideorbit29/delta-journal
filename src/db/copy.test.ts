import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { count } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase, schema } from "@/db";
import { copyDatabase } from "./copy";

const dir = mkdtempSync(path.join(tmpdir(), "journal-copy-"));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("copyDatabase", () => {
  it("copies every row into an empty database and refuses a non-empty one", async () => {
    const from = await openDatabase(`file:${path.join(dir, "from.db")}`);
    await from.insert(schema.appState).values({ key: "k", value: "v" });
    await from.insert(schema.journalEntries).values({ tradeId: "t", emotions: ["fomo"], mistakes: [], createdAt: 1, updatedAt: 1 });
    await from.insert(schema.tradeCandles).values({ tradeId: "t", symbol: "X", resolution: "1m", startSec: 0, endSec: 60, candles: [{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5 }], fetchedAt: 1 });

    const to = await openDatabase(`file:${path.join(dir, "to.db")}`);
    const copied = await copyDatabase(from, to);
    expect(copied).toMatchObject({ app_state: 1, journal_entries: 1, trade_candles: 1, fills: 0 });
    const [candles] = await to.select().from(schema.tradeCandles);
    expect(candles.candles).toEqual([{ time: 0, open: 1, high: 2, low: 0.5, close: 1.5 }]);
    const [entry] = await to.select().from(schema.journalEntries);
    expect(entry.emotions).toEqual(["fomo"]);

    await expect(copyDatabase(from, to)).rejects.toThrow("already has data");
    const [{ n }] = await to.select({ n: count() }).from(schema.appState);
    expect(n).toBe(1);
    from.$client.close();
    to.$client.close();
  });

  // Uses your synced journal when there is one; skipped on a fresh clone.
  it.skipIf(!existsSync("data/journal.db"))("copies the real journal completely", async () => {
    const snapshot = path.join(dir, "snapshot.db");
    copyFileSync("data/journal.db", snapshot);
    const from = await openDatabase(`file:${snapshot}`);
    const to = await openDatabase(`file:${path.join(dir, "real-to.db")}`);
    const copied = await copyDatabase(from, to);
    const [{ n }] = await from.select({ n: count() }).from(schema.trades);
    expect(copied.trades).toBe(n);
    expect(n).toBeGreaterThan(0);
    from.$client.close();
    to.$client.close();
  });
});
