// Two users in one database: every read and write path must only ever see or
// touch its own user's rows. This is the test that guards against one
// Hardwon user seeing another's trades.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq, getTableName } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { DeltaFill } from "@/lib/delta/types";

const dir = mkdtempSync(path.join(tmpdir(), "hardwon-isolation-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

// Imported after DATABASE_URL is set, so getDb() opens the temporary database.
const { getDb, schema } = await import("@/db");
const queries = await import("@/lib/queries");
const { rebuildTrades } = await import("@/lib/trades/rebuild");
const { writeChanged } = await import("@/lib/sync");
const { adoptUnassigned, ensureAccount, listAccounts } = await import("@/lib/accounts");
const { toFillRow } = await import("@/lib/delta/ingest");
const { saveJournalEntry, loadJournalEntry } = await import("@/lib/journal/save");
const { buildReviewInput, listReviews } = await import("@/lib/ai/review");
const { saveSubscription, removeSubscription, sendPush } = await import("@/lib/push");
const { getDeltaKeyStatus, removeDeltaKey, saveDeltaKey } = await import("@/lib/keys/credentials");
const { generateSealKeys } = await import("@/lib/keys/sealed");
const { chatForUser, createLinkCode, getTelegramLink, unlinkTelegram, redeemLinkCode, userForChat } = await import("@/lib/telegram/links");
const { handleUpdate } = await import("@/lib/telegram/bot");
const { deleteAccountData, exportAccount, tradesCsv } = await import("@/lib/account");
const { OWNED } = await import("@/db/claim");
const { rateLimit } = await import("@/lib/rate-limit");
const { saveFeedback } = await import("@/lib/feedback");
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
  const ownerA = { userId: A, accountId: (await ensureAccount(db, A, "delta")).id };
  const ownerB = { userId: B, accountId: (await ensureAccount(db, B, "delta")).id };
  await writeChanged(db, ownerA, schema.fills, [fill("a1", "buy", T0, 4000), fill("a2", "sell", T0 + 60_000, 4010)].map(toFillRow), (r) => r.id);
  await writeChanged(db, ownerB, schema.fills, [fill("b1", "buy", T0, 4000), fill("b2", "sell", T0 + 60_000, 3990)].map(toFillRow), (r) => r.id);
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

  it("keeps each user's trading accounts, and their trades, apart", async () => {
    const [accountA] = await listAccounts(db, A);
    const [accountB] = await listAccounts(db, B);
    expect((await listAccounts(db, A)).map((x) => x.id)).toEqual([accountA.id]);
    expect(accountA.id).not.toBe(accountB.id);
    expect((await queries.listTrades(A))[0].accountId).toBe(accountA.id);
    expect((await queries.listTrades(B))[0].accountId).toBe(accountB.id);
    // Asking again never makes a second Delta account.
    expect((await ensureAccount(db, A, "delta")).id).toBe(accountA.id);
    // A row of B's from before accounts existed goes to B's account, and adopting touches nothing of A's.
    await db.update(schema.fills).set({ accountId: "" }).where(eq(schema.fills.id, "b2"));
    expect(await adoptUnassigned(db, A)).toBe(0);
    // The fill, and B's AI review from the test setup (written without an account).
    expect(await adoptUnassigned(db, B)).toBe(2);
    const [b2] = await db.select().from(schema.fills).where(eq(schema.fills.id, "b2"));
    expect(b2.accountId).toBe(accountB.id);
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
    // The Journal tab's count: only A's own unjournaled trade (B's, closed at the same time, is not counted).
    expect(await queries.countToJournal(A, 7, T0 + 3_600_000)).toBe(1);
    const [accountA] = await listAccounts(db, A);
    expect(await queries.countJournaled(A, accountA.id)).toBe(0);
    expect(await queries.listSegments(A, accountA.id)).toEqual([]);
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
    await writeChanged(db, { userId: A, accountId: (await ensureAccount(db, A, "delta")).id }, schema.fills, [toFillRow(stolen)], (r) => r.id);
    const [row] = await db.select().from(schema.fills).where(eq(schema.fills.id, "b2"));
    expect(row.userId).toBe(B);
    expect(row.price).toBe(3990);
  });

  it("gives the AI coach only the user's own trades, and lists only their reviews", async () => {
    const input = await buildReviewInput(db, A, (await ensureAccount(db, A, "delta")).id, { start: T0 - 3_600_000, end: T0 + 3_600_000 });
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

  it("exports only the user's own rows, without secrets", async () => {
    await saveFeedback(db, A, "feedback from A", "web", T0);
    await saveFeedback(db, B, "feedback from B", "telegram", T0);
    const a = await exportAccount(db, A, T0);
    const b = await exportAccount(db, B, T0);
    const rows = (x: typeof a) => Object.values(x.tables).flat();
    expect(rows(a).length).toBeGreaterThan(0);
    expect(rows(a).every((r) => r.userId === A)).toBe(true);
    expect(rows(b).every((r) => r.userId === B)).toBe(true);
    expect(Object.keys(a.tables).sort()).toEqual(OWNED.map((t) => getTableName(t)).sort());
    expect(a.tables.feedback.map((r) => r.message)).toEqual(["feedback from A"]);

    const json = JSON.stringify(b);
    expect(b.tables.delta_credentials).toEqual([expect.objectContaining({ keyHint: "keyB" })]);
    expect(json).not.toContain("sealed");
    expect(b.tables.push_subscriptions.length + b.tables.telegram_links.length).toBeGreaterThan(0);
    for (const secret of ['"p256dh"', '"auth"', '"codeHash"']) expect(json).not.toContain(secret);

    const csvA = await tradesCsv(db, A);
    const [aTrade] = await db.select().from(schema.trades).where(eq(schema.trades.userId, A));
    const [bTrade] = await db.select().from(schema.trades).where(eq(schema.trades.userId, B));
    expect(csvA).toContain(aTrade.id);
    expect(csvA).not.toContain(bTrade.id);
  });

  it("deleting an account erases every row of that user and nothing of anyone else", async () => {
    await db.insert(schema.users).values([{ id: A, createdAt: T0 }, { id: B, createdAt: T0 }]);
    await rateLimit(db, A, "push.test", T0);
    await rateLimit(db, B, "push.test", T0);
    const before = await exportAccount(db, B, T0);
    const deleted = await deleteAccountData(db, A);
    expect(deleted.users).toBe(1);
    expect(deleted.trades).toBeGreaterThan(0);
    expect(deleted.rate_limits).toBe(2); // push.test here, feedback.send in the export test

    const left = await exportAccount(db, A, T0);
    expect(left.account).toBeNull();
    expect(Object.values(left.tables).flat()).toEqual([]);
    expect(await exportAccount(db, B, T0)).toEqual(before);
  });
});
