import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db";
import { readHealth, recordHeartbeat, STALE_AFTER_MS } from "./health";

const T0 = Date.UTC(2026, 10, 1, 9);
let dir: string;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "hardwon-health-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("health", () => {
  it("is not ok before the sync server has ever run", async () => {
    expect(await readHealth(db, T0)).toMatchObject({ ok: false, database: "ok", syncServer: "never" });
  });

  it("is ok while heartbeats are fresh, and stale once they stop", async () => {
    await recordHeartbeat(db, { at: T0, users: 3, failing: 1 });
    expect(await readHealth(db, T0 + 61_000)).toEqual({
      ok: true,
      database: "ok",
      syncServer: "ok",
      lastRoundSecondsAgo: 61,
      users: 3,
      failing: 1,
    });
    expect(await readHealth(db, T0 + STALE_AFTER_MS + 1)).toMatchObject({ ok: false, syncServer: "stale" });
  });
});
