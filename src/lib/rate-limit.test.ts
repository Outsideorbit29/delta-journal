import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db";
import { LIMITS, rateLimit, tooMany } from "./rate-limit";

const T0 = Date.UTC(2026, 10, 1, 9);
let dir: string;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "hardwon-limits-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("rate limits", () => {
  it("allows up to the limit in a window, then refuses until the window ends", async () => {
    const { limit, windowMs } = LIMITS["push.test"];
    for (let i = 0; i < limit; i++) expect((await rateLimit(db, "u1", "push.test", T0 + i)).ok).toBe(true);
    const over = await rateLimit(db, "u1", "push.test", T0 + 1000);
    expect(over).toEqual({ ok: false, resetAt: T0 + windowMs });
    expect(tooMany(over, T0 + 1000)).toBe("Too many tries. Try again in 60 minutes.");

    // Another user and another action have their own counts.
    expect((await rateLimit(db, "u2", "push.test", T0)).ok).toBe(true);
    expect((await rateLimit(db, "u1", "telegram.link", T0)).ok).toBe(true);

    // A new window starts fresh.
    expect(await rateLimit(db, "u1", "push.test", T0 + windowMs)).toEqual({ ok: true, resetAt: T0 + 2 * windowMs });
  });

  it("says hours for long waits", () => {
    expect(tooMany({ ok: false, resetAt: T0 + 5 * 3_600_000 }, T0)).toBe("Too many tries. Try again in 5 hours.");
    expect(tooMany({ ok: false, resetAt: T0 + 30_000 }, T0)).toBe("Too many tries. Try again in 1 minute.");
  });
});
