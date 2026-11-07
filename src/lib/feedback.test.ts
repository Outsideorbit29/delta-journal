import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase, schema } from "@/db";
import { FEEDBACK_MAX, markFeedbackDelivered, renderFeedback, saveFeedback, undeliveredFeedback } from "./feedback";

const dir = mkdtempSync(path.join(tmpdir(), "journal-feedback-"));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("feedback", () => {
  it("saves a user's message, forwards it once with their email, and limits floods", async () => {
    const db = await openDatabase(`file:${path.join(dir, "f.db")}`);
    const t0 = 1_800_000_000_000;
    await db.insert(schema.users).values({ id: "user_a", email: "a@example.com", createdAt: t0 });

    expect((await saveFeedback(db, "user_a", "   ", "web", t0)).ok).toBe(false);
    expect((await saveFeedback(db, "user_a", "x".repeat(FEEDBACK_MAX + 1), "web", t0)).ok).toBe(false);
    expect(await saveFeedback(db, "user_a", "  The <calendar> is off by a day\r\n", "web", t0)).toEqual({ ok: true, message: expect.any(String) });
    await saveFeedback(db, "user_b", "No email yet", "telegram", t0 + 1);

    const rows = await undeliveredFeedback(db);
    expect(rows.map((r) => r.message)).toEqual(["The <calendar> is off by a day", "No email yet"]);
    expect(renderFeedback(rows[0])).toBe("💬 <b>Feedback</b> from a@example.com (via the website)\n\nThe &lt;calendar&gt; is off by a day");
    expect(renderFeedback(rows[1])).toContain("from user_b (via Telegram)");

    await markFeedbackDelivered(db, rows.map((r) => r.id), t0 + 2);
    expect(await undeliveredFeedback(db)).toHaveLength(0);

    // 10 an hour; empty and too-long messages are refused before they count.
    for (let i = 0; i < 9; i++) expect((await saveFeedback(db, "user_a", `more ${i}`, "web", t0 + 10)).ok).toBe(true);
    expect((await saveFeedback(db, "user_a", "one too many", "web", t0 + 10)).ok).toBe(false);
  });
});
