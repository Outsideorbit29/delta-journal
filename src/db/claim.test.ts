import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase, schema } from "@/db";
import { toFillRow } from "@/lib/delta/ingest";
import { LEGACY_USER } from "./schema";
import { claimRows } from "./claim";

const dir = mkdtempSync(path.join(tmpdir(), "edgebook-claim-"));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("claimRows", () => {
  it("moves the legacy data to a signed-up user, leaving global state and other users alone", async () => {
    const db = await openDatabase(`file:${path.join(dir, "claim.db")}`);
    await db.insert(schema.journalEntries).values([
      { tradeId: "t1", emotions: [], mistakes: [], createdAt: 1, updatedAt: 1 },
      { tradeId: "t2", userId: "someone_else", emotions: [], mistakes: [], createdAt: 1, updatedAt: 1 },
    ]);
    await db.insert(schema.appState).values([
      { userId: "", key: "telegram.update_offset", value: "5" },
      { userId: LEGACY_USER, key: "telegram.notify_since", value: "1" },
    ]);
    await db.insert(schema.syncState).values({ resource: "fills", lastRunAt: 1 });

    await expect(claimRows(db, LEGACY_USER, "user_new")).rejects.toThrow("Sign in to the app once first");
    await db.insert(schema.users).values({ id: "user_new", createdAt: 1, plan: "founder", accessUntil: 2 });

    const moved = await claimRows(db, LEGACY_USER, "user_new");
    expect(moved).toMatchObject({ journal_entries: 1, app_state: 1, sync_state: 1, fills: 0 });
    const owners = (await db.select().from(schema.journalEntries)).map((e) => [e.tradeId, e.userId]);
    expect(owners).toEqual([["t1", "user_new"], ["t2", "someone_else"]]);
    const state = (await db.select().from(schema.appState)).map((s) => [s.userId, s.key]);
    expect(state).toEqual([["", "telegram.update_offset"], ["user_new", "telegram.notify_since"]]);
    db.$client.close();
  });

  it("moves a whole account to a new Clerk id: data, Telegram, founder dates; the sealed key is dropped", async () => {
    const db = await openDatabase(`file:${path.join(dir, "move.db")}`);
    await db.insert(schema.users).values([
      { id: "user_dev", email: "a@example.com", createdAt: 100, plan: "founder", accessUntil: 900 },
      { id: "user_prod", createdAt: 500, plan: "founder", accessUntil: 5000 },
    ]);
    await db.insert(schema.journalEntries).values({ tradeId: "t1", userId: "user_dev", emotions: [], mistakes: [], createdAt: 1, updatedAt: 1 });
    await db.insert(schema.telegramLinks).values({ userId: "user_dev", chatId: "42", linkedAt: 1 });
    await db.insert(schema.deltaCredentials).values({ userId: "user_dev", keyHint: "abcd", sealed: "box", status: "ok", createdAt: 1, updatedAt: 1 });
    // The new account's own first visit left state that would collide.
    await db.insert(schema.appState).values([
      { userId: "user_dev", key: "telegram.notify_since", value: "1" },
      { userId: "user_prod", key: "telegram.notify_since", value: "9" },
    ]);

    const moved = await claimRows(db, "user_dev", "user_prod");
    expect(moved).toMatchObject({ journal_entries: 1, telegram_links: 1, delta_credentials_dropped: 1, delta_credentials: 0, account_moved: 1 });
    expect((await db.select().from(schema.journalEntries))[0].userId).toBe("user_prod");
    expect((await db.select().from(schema.telegramLinks))[0]).toMatchObject({ userId: "user_prod", chatId: "42" });
    expect(await db.select().from(schema.deltaCredentials)).toEqual([]);
    expect((await db.select().from(schema.appState)).map((r) => [r.userId, r.value])).toEqual([["user_prod", "1"]]);
    const users = await db.select().from(schema.users);
    expect(users).toEqual([expect.objectContaining({ id: "user_prod", createdAt: 100, plan: "founder", accessUntil: 900 })]);
    db.$client.close();
  });

  it("refuses to merge into a user who already has synced data", async () => {
    const db = await openDatabase(`file:${path.join(dir, "busy.db")}`);
    await db.insert(schema.users).values({ id: "u", createdAt: 1, plan: "founder", accessUntil: 2 });
    const fill = toFillRow({
      id: "f", order_id: "o", product_id: 1, product_symbol: "X", side: "buy", size: 1, price: "1", commission: "0",
      credits_used: "0", role: "taker", fill_type: "normal", created_at: new Date(0).toISOString(), meta_data: {},
      product: { id: 1, symbol: "X", contract_type: "perpetual_futures", contract_value: "1", notional_type: "vanilla" },
    });
    await db.insert(schema.fills).values({ ...fill, userId: "u" });
    await expect(claimRows(db, LEGACY_USER, "u")).rejects.toThrow("refusing to mix");
    db.$client.close();
  });
});
