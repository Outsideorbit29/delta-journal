import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase } from "@/db";
import { REALERT_AFTER_MS, errorInfo, errorsToAlert, markAlerted, pruneAppErrors, recordAppError, renderErrorAlert } from "./app-errors";

const dir = mkdtempSync(path.join(tmpdir(), "journal-errors-"));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

const ctx = { routePath: "/trades/[id]", routeType: "render" };

describe("errorInfo", () => {
  it("cuts database parameters and query strings, and groups repeats", () => {
    const a = errorInfo(new Error('Failed query: select * from trades where user_id = ?\nparams: user_secret123,x'), { path: "/trades/123?tab=1", method: "GET" }, ctx);
    expect(a.message).toBe("Failed query: select * from trades where user_id = ?");
    expect(a.message).not.toContain("user_secret");
    expect(a.path).toBe("/trades/123");
    const b = errorInfo(new Error("Trade 456 not found"), { path: "/trades/456", method: "GET" }, ctx);
    const c = errorInfo(new Error("Trade 789 not found"), { path: "/trades/789", method: "GET" }, ctx);
    expect(b.key).toBe(c.key);
    expect(b.key).not.toBe(a.key);
    expect(errorInfo("boom", { path: "/", method: "POST" }, {}).routePath).toBe("?");
  });
});

describe("app error alerts", () => {
  it("alerts once per error, again only after an hour with new repeats, and prunes old ones", async () => {
    const db = await openDatabase(`file:${path.join(dir, "e.db")}`);
    const t0 = 1_800_000_000_000;
    const info = errorInfo(new Error("Database <down>"), { path: "/", method: "GET" }, { routePath: "/", routeType: "render" });
    await recordAppError(db, info, t0);
    await recordAppError(db, info, t0 + 1000);

    let rows = await errorsToAlert(db, t0 + 2000);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
    expect(renderErrorAlert(rows)).toContain("<b>2×</b> GET / (render)");
    expect(renderErrorAlert(rows)).toContain("Database &lt;down&gt;");
    await markAlerted(db, [info.key], t0 + 2000);

    await recordAppError(db, info, t0 + 3000);
    expect(await errorsToAlert(db, t0 + 4000)).toHaveLength(0); // within the hour
    rows = await errorsToAlert(db, t0 + 2000 + REALERT_AFTER_MS);
    expect(rows).toHaveLength(1);
    expect(renderErrorAlert(rows)).toContain("<b>1×</b>"); // only the repeats since the last alert
    await markAlerted(db, [info.key], t0 + 2000 + REALERT_AFTER_MS);
    expect(await errorsToAlert(db, t0 + 10 * REALERT_AFTER_MS)).toHaveLength(0); // no new repeats

    await pruneAppErrors(db, t0 + 31 * 86_400_000);
    await recordAppError(db, info, t0 + 31 * 86_400_000);
    expect((await errorsToAlert(db, t0 + 31 * 86_400_000))[0].count).toBe(1); // forgotten, so new again
  });
});
