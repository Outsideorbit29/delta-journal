// Two users in one database: every read and write path must only ever see or
// touch its own user's rows. This is the test that guards against one
// Edgebook user seeing another's trades.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { DeltaFill } from "@/lib/delta/types";

const dir = mkdtempSync(path.join(tmpdir(), "edgebook-isolation-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

// Imported after DATABASE_URL is set, so getDb() opens the temporary database.
const { getDb, schema } = await import("@/db");
const queries = await import("@/lib/queries");
const { rebuildTrades } = await import("@/lib/trades/rebuild");
const { writeChanged } = await import("@/lib/sync");
const { toFillRow } = await import("@/lib/delta/ingest");
const { saveJournalEntry, loadJournalEntry } = await import("@/lib/journal/save");
const { buildReviewInput, listReviews } = await import("@/lib/ai/review");
const { saveSubscription, removeSubscription, sendPush } = await import("@/lib/push");
const { getDeltaKeyStatus, removeDeltaKey, saveDeltaKey } = await import("@/lib/keys/credentials");
const { generateSealKeys } = await import("@/lib/keys/sealed");
const { chatForUser, createLinkCode, getTelegramLink, unlinkTelegram, redeemLinkCode, userForChat } = await import("@/lib/telegram/links");
const { handleUpdate } = await import("@/lib/telegram/bot");
type BotContext = import("@/lib/telegram/bot").BotContext;

const A = "user_A";
const B = "user_B";
const T0 = Date.UTC(2026, 9, 30, 9);
let db: Db;

function fill(id: string, side: "buy" | "sell", ts: number, price: number): DeltaFill {
  return {
    id,
    order_id: `o-${id}`,
    product_id: 131253,
    product_symbol: "XAUTUSD",
    product: { id: 131253, symbol: "XAUTUSD", contract_type: "perpetual_futures", contract_value: "0.001", notional_type: "vanilla" },
    side,
    size: 1000,
    price: String(price),
    commission: "0.4",
    credits_used: "0",
    role: "taker",
    fill_type: "normal",
    created_at: new Date(ts).toISOString(),
    meta_data: { leverage: "50" },
  };
}

beforeAll(async () => {
  db = await getDb();
  // Same symbol, same times, different accounts: A wins, B loses.
  await writeChanged(db, A, schema.fills, [fill("a1", "buy", T0, 4000), fill("a2", "sell", T0 + 60_000, 4010)].map(toFillRow), (r) => r.id);
  await writeChanged(db, B, schema.fills, [fill("b1", "buy", T0, 4000), fill("b2", "sell", T0 + 60_000, 3990)].map(toFillRow), (r) => r.id);
  await rebuildTrades(db, A);
  await rebuildTrades(db, B);
  await db.insert(schema.syncState).values([
    { userId: A, resource: "fills", lastRunAt: T0 },
    { userId: B, resource: "fills", lastRunAt: T0, lastError: "B's private error" },
  ]);
  await db.insert(schema.aiReviews).values({
    userId: B,
    periodStart: T0,
    periodEnd: T0,
    tradeCount: 1,
    model: "m",
    review: { headline: "B's review", summary: "", strengths: [], leaks: [], rules: ["r"], journaling: null },
    createdAt: T0,
  });
  await saveSubscription(db, B, { endpoint: "https://push.example/b", keys: { p256dh: "p", auth: "a" } }, "B's phone");
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("each user only sees their own data", () => {
  it("rebuilds each user's trades from their own fills", async () => {
    const a = await queries.listTrades(A);
    const b = await queries.listTrades(B);
    expect(a.map((t) => t.id)).toEqual(["a1"]);
    expect(b.map((t) => t.id)).toEqual(["b1"]);
    expect(a[0].netPnl).toBeGreaterThan(0);
    expect(b[0].netPnl).toBeLessThan(0);
  });

  it("will not open another user's trade by id", async () => {
    expect(await queries.getTrade(A, "b1")).toBeNull();
    const own = await queries.getTrade(A, "a1");
    expect(own?.legs.map((l) => l.fillId)).toEqual(["a1", "a2"]);
  });

  it("scopes symbols, sync status, unjournaled lists and tag filters", async () => {
    expect(await queries.listSymbols(A)).toEqual(["XAUTUSD"]);
    expect((await queries.getSyncStatus(A)).map((s) => s.lastError)).toEqual([null]);
    expect((await queries.listUnjournaled(A)).map((t) => t.id)).toEqual(["a1"]);
    const bTag = (await queries.listTrades(B))[0].tags[0].tag;
    expect((await queries.listTrades(A, { tag: bTag })).every((t) => t.id.startsWith("a"))).toBe(true);
  });

  it("will not journal another user's trade, and keeps each journal private", async () => {
    const attempt = await saveJournalEntry(db, A, "b1", { notes: "sneaky" });
    expect(attempt.ok).toBe(false);
    expect(await loadJournalEntry(db, B, "b1")).toBeNull();

    expect((await saveJournalEntry(db, B, "b1", { notes: "B's note", mistakes: ["no_plan"] })).ok).toBe(true);
    expect(await loadJournalEntry(db, A, "b1")).toBeNull();
    expect(await queries.getJournalEntry(A, "b1")).toBeNull();
    expect(await queries.journaledTradeIds(A)).toEqual(new Set());
    expect(await queries.journaledTradeIds(B)).toEqual(new Set(["b1"]));
  });

  it("rebuilding one user leaves the other user's trades, tags and journal alone", async () => {
    const bBefore = await queries.listTrades(B);
    await rebuildTrades(db, A);
    const bAfter = await queries.listTrades(B);
    expect(bAfter.map((t) => [t.id, t.netPnl, t.tags.length])).toEqual(bBefore.map((t) => [t.id, t.netPnl, t.tags.length]));
    expect((await loadJournalEntry(db, B, "b1"))?.notes).toBe("B's note");
  });

  it("a sync can never overwrite or take over another user's rows", async () => {
    // A's sync somehow returns a record with B's fill id.
    const stolen = { ...fill("b2", "sell", T0 + 60_000, 1), product_symbol: "XAUTUSD" };
    await writeChanged(db, A, schema.fills, [toFillRow(stolen)], (r) => r.id);
    const [row] = await db.select().from(schema.fills).where(eq(schema.fills.id, "b2"));
    expect(row.userId).toBe(B);
    expect(row.price).toBe(3990);
  });

  it("gives the AI coach only the user's own trades, and lists only their reviews", async () => {
    const input = await buildReviewInput(db, A, { start: T0 - 3_600_000, end: T0 + 3_600_000 });
    expect(input.stats.trades).toBe(1);
    expect(input.allTimeStats.trades).toBe(1);
    expect(JSON.stringify(input)).not.toContain("B's note");
    expect(await listReviews(db, A)).toEqual([]);
    expect((await listReviews(db, B)).map((r) => r.review.headline)).toEqual(["B's review"]);
  });

  it("sends phone notifications only to the user's own devices", async () => {
    const sentTo: string[] = [];
    const send = async (s: { endpoint: string }) => void sentTo.push(s.endpoint);
    expect(await sendPush(db, A, { title: "t", body: "b", url: "/" }, send)).toEqual({ sent: 0, removed: 0, failed: 0 });
    await removeSubscription(db, A, "https://push.example/b");
    expect((await sendPush(db, B, { title: "t", body: "b", url: "/" }, send)).sent).toBe(1);
    expect(sentTo).toEqual(["https://push.example/b"]);
  });

  it("keeps each user's Telegram chat separate, even after a chat moves to another account", async () => {
    const code = await createLinkCode(db, B, T0);
    expect(await redeemLinkCode(db, code, "chat-1", "@b", T0)).toBe(B);
    expect(await getTelegramLink(db, A, T0)).toMatchObject({ linked: false, chatName: null });
    expect(await chatForUser(db, A)).toBeNull();
    await unlinkTelegram(db, A, T0);
    expect(await userForChat(db, "chat-1")).toBe(B);

    // B's card in the chat, then the chat moves to A: A's taps on B's old card do nothing.
    const [bTrade] = await db.select().from(schema.trades).where(eq(schema.trades.userId, B));
    await db.insert(schema.telegramMessages).values({ chatId: "chat-1", messageId: 1, userId: B, tradeId: bTrade.id, kind: "trade", createdAt: T0 });
    expect(await redeemLinkCode(db, await createLinkCode(db, A, T0), "chat-1", "@a", T0)).toBe(A);
    const answers: (string | undefined)[] = [];
    const tg = {
      answerCallback: async (_id: string, text?: string) => void answers.push(text),
      editMessage: async () => {},
      sendMessage: async () => ({ message_id: 2, chat: { id: 1 } }),
    } as unknown as BotContext["tg"];
    const ctxA: BotContext = { userId: A, db, tg, chatId: "chat-1", sync: async () => ({ fills: 0, rebuild: null }), ai: null };
    await handleUpdate(ctxA, { update_id: 1, callback_query: { id: "q", from: { id: 1 }, data: "s:v:breakout", message: { message_id: 1, chat: { id: "chat-1" as never } } } });
    expect(answers).toEqual(["This button is no longer linked to a trade."]);
    expect((await loadJournalEntry(db, B, bTrade.id))?.setup ?? null).toBeNull();
  });

  it("shows and deletes only the user's own Delta key", async () => {
    const { publicKey } = generateSealKeys();
    await saveDeltaKey(db, B, { apiKey: "BBBBBBBBBBBBBBBBkeyB", apiSecret: "BBBBBBBBBBBBBBBBsecret" }, publicKey, T0);
    expect(await getDeltaKeyStatus(db, A)).toBeNull();
    await removeDeltaKey(db, A);
    expect((await getDeltaKeyStatus(db, B))?.keyHint).toBe("keyB");
  });
});
