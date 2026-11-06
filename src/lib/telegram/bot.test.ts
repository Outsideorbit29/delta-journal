import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, schema, type Db } from "@/db";
import type { ReplyMarkup, TelegramClient, TgMessage, TgUpdate } from "./api";
import {
  getState,
  handleUpdate,
  maybeSendWeeklyReview,
  notifyClosedTrades,
  notifySyncProblem,
  routeUpdate,
  type BotAi,
  type BotContext,
  type SharedBot,
} from "./bot";
import { createLinkCode, STATE_NOTIFY_SINCE, userForChat } from "./links";

const CHAT = "1001";
const STRANGER = "666";
const T0 = Date.UTC(2026, 9, 30, 9, 0);

interface Sent {
  chatId: string;
  text: string;
  markup?: ReplyMarkup;
  messageId: number;
}

// Telegram message ids are unique within a chat, so they keep counting across fakes.
let nextMessageId = 100;

/** Records what the bot would send to Telegram. */
class FakeTelegram implements TelegramClient {
  sent: Sent[] = [];
  edits: Sent[] = [];
  answers: { id: string; text?: string }[] = [];
  async getUpdates() {
    return [];
  }
  async sendMessage(chatId: string, text: string, markup?: ReplyMarkup): Promise<TgMessage> {
    const messageId = nextMessageId++;
    this.sent.push({ chatId, text, markup, messageId });
    return { message_id: messageId, chat: { id: Number(chatId) } };
  }
  async editMessage(chatId: string, messageId: number, text: string, markup?: ReplyMarkup) {
    this.edits.push({ chatId, text, markup, messageId });
  }
  async answerCallback(id: string, text?: string) {
    this.answers.push({ id, text });
  }
  async setCommands() {}
  async downloadFile(fileId: string) {
    return new TextEncoder().encode(`audio:${fileId}`);
  }
}

let dir: string;
let db: Db;
let now = T0;
let updateId = 1;

const tap = (messageId: number, data: string, chatId = CHAT): TgUpdate => ({
  update_id: updateId++,
  callback_query: { id: `cb${updateId}`, from: { id: Number(chatId) }, data, message: { message_id: messageId, chat: { id: Number(chatId) } } },
});
const say = (text: string, opts: { chatId?: string; replyTo?: number } = {}): TgUpdate => ({
  update_id: updateId++,
  message: {
    message_id: updateId + 5000,
    chat: { id: Number(opts.chatId ?? CHAT) },
    text,
    reply_to_message: opts.replyTo ? { message_id: opts.replyTo, chat: { id: Number(opts.chatId ?? CHAT) } } : undefined,
  },
});

function ctx(tg: FakeTelegram, chatId: string | null = CHAT, ai: BotAi | null = null): BotContext {
  return { userId: "u1", db, tg, chatId, sync: async () => ({ fills: 0, rebuild: { trades: 0 } }), ai, now: () => now };
}

async function insertTrade(id: string, closedTs: number, netPnl = -4.75, userId = "u1") {
  await db.insert(schema.trades).values({
    id,
    userId,
    productId: 1,
    symbol: "XAUTUSD",
    contractType: "perpetual_futures",
    direction: "short",
    status: "closed",
    openedTs: closedTs - 600_000,
    closedTs,
    holdSeconds: 600,
    entryQty: 500,
    exitQty: 500,
    maxQty: 500,
    contractValue: 0.001,
    avgEntry: 3920,
    avgExit: 3929.5,
    maxNotional: 1960,
    leverage: 50,
    grossPnl: netPnl + 0.5,
    fees: 0.5,
    feeCredits: 0,
    funding: 0,
    liquidationFees: 0,
    netPnl,
    fillCount: 2,
    addCount: 0,
    reduceCount: 0,
    exitReason: "stop",
    warnings: [],
  });
  await db.insert(schema.tradeTags).values([
    { tradeId: id, userId, tag: "after_loss", source: "auto", detail: null },
    { tradeId: id, userId, tag: "moved_stop", source: "auto", detail: null },
  ]);
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "journal-bot-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  // Windows can hold the WAL files briefly after close; leftover temp files are harmless.
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("Telegram bot", () => {
  it("does not announce history on its first run, then announces each new close once", async () => {
    const tg = new FakeTelegram();
    await insertTrade("old", T0 - 3_600_000);
    expect(await notifyClosedTrades(ctx(tg))).toBe(0);

    now = T0 + 60_000;
    await insertTrade("t1", T0 + 30_000);
    expect(await notifyClosedTrades(ctx(tg))).toBe(1);
    expect(await notifyClosedTrades(ctx(tg))).toBe(0);

    expect(tg.sent).toHaveLength(1);
    expect(tg.sent[0].text).toContain("XAUTUSD short");
    expect(tg.sent[0].text).toContain("-$4.75");
    expect(tg.sent[0].text).toContain("⚠️ After a loss · Moved stop");
  });

  it("journals a trade in a few taps and keeps the card in step", async () => {
    const tg = new FakeTelegram();
    const [card] = await db.select().from(schema.telegramMessages).where(eq(schema.telegramMessages.tradeId, "t1"));
    for (const data of ["s:v:breakout", "e:t:revenge", "e:n", "m:t:moved_stop", "m:n", "p:n", "r:v:2"]) {
      await handleUpdate(ctx(tg), tap(card.messageId, data));
    }

    const [entry] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t1"));
    expect(entry).toMatchObject({ setup: "breakout", emotions: ["revenge"], mistakes: ["moved_stop"], followedPlan: false, rating: 2 });

    const tags = (await db.select().from(schema.tradeTags).where(eq(schema.tradeTags.tradeId, "t1"))).map((t) => `${t.source}:${t.tag}`).sort();
    expect(tags).toEqual(
      ["auto:after_loss", "auto:moved_stop", "user:emotion:revenge", "user:mistake:moved_stop", "user:plan:broken", "user:setup:breakout"].sort(),
    );

    // Every tap is acknowledged and the card is edited in place.
    expect(tg.answers).toHaveLength(7);
    expect(tg.edits.every((e) => e.messageId === card.messageId)).toBe(true);
    const last = tg.edits.at(-1)!;
    expect(last.text).toContain("<b>Journal:</b> Breakout · felt Revenge · mistakes: Moved stop · broke plan · execution 2/5");
    expect(last.text).toContain("Saved. Reply to this message to add a note.");
  });

  it("saves replies to a trade message as notes, appending each one", async () => {
    const tg = new FakeTelegram();
    const [card] = await db.select().from(schema.telegramMessages).where(eq(schema.telegramMessages.tradeId, "t1"));
    await handleUpdate(ctx(tg), say("Moved my stop because I hoped it would turn", { replyTo: card.messageId }));
    await handleUpdate(ctx(tg), say("Should have taken the loss", { replyTo: card.messageId }));

    const [entry] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t1"));
    expect(entry.notes).toBe("Moved my stop because I hoped it would turn\nShould have taken the loss");
    expect(entry.rating).toBe(2);
    expect(tg.sent.map((s) => s.text)).toEqual(["Note saved.", "Note saved."]);
  });

  it("links the Add note prompt to its trade", async () => {
    const tg = new FakeTelegram();
    await insertTrade("t2", T0 + 120_000);
    now = T0 + 180_000;
    await notifyClosedTrades(ctx(tg));
    const card = tg.sent[0];
    await handleUpdate(ctx(tg), tap(card.messageId, "d:note"));
    const prompt = tg.sent[1];
    expect(prompt.markup).toMatchObject({ force_reply: true });

    await handleUpdate(ctx(tg), say("FOMO entry", { replyTo: prompt.messageId }));
    const [entry] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t2"));
    expect(entry.notes).toBe("FOMO entry");
  });

  it("a user's context ignores every other chat", async () => {
    const tg = new FakeTelegram();
    const [card] = await db.select().from(schema.telegramMessages).where(eq(schema.telegramMessages.tradeId, "t2"));
    await handleUpdate(ctx(tg), say("/today", { chatId: STRANGER }));
    await handleUpdate(ctx(tg), tap(card.messageId, "s:v:range", STRANGER));

    expect(tg.sent).toHaveLength(0);
    expect(tg.edits).toHaveLength(0);
    const [entry] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t2"));
    expect(entry.setup).toBeNull();
  });

  it("without a chat or a phone, announces nothing", async () => {
    const tg = new FakeTelegram();
    await handleUpdate(ctx(tg, null), say("/today", { chatId: STRANGER }));
    expect(tg.sent).toHaveLength(0);
    expect(await notifyClosedTrades(ctx(tg, null))).toBe(0);
  });

  it("reports today's P&L and lists trades still to journal", async () => {
    const tg = new FakeTelegram();
    await handleUpdate(ctx(tg), say("/today"));
    expect(tg.sent[0].text).toContain("Today: -$14.25");
    expect(tg.sent[0].text).toContain("3 trades · 0 won");

    await handleUpdate(ctx(tg), say("/journal"));
    // t1 and t2 are journaled; "old" closed within the last week and is not.
    expect(tg.sent.slice(1).map((s) => s.text.split("\n")[0])).toEqual(["<b>XAUTUSD short</b> · <b>-$4.75</b>"]);
  });
});

describe("Telegram bot with AI", () => {
  const review = {
    headline: "Moving stops cost you most this week",
    summary: "3 trades, all losses.",
    strengths: [],
    leaks: [{ pattern: "Moving the stop", evidence: "2 trades, -$9.50", costUsd: -9.5 }],
    rules: ["Never widen a stop once placed"],
    journaling: null,
  };
  const calls: string[] = [];
  const fakeAi: BotAi = {
    transcribe: async (audio) => {
      calls.push(`transcribe:${new TextDecoder().decode(audio)}`);
      return "jumped in late, felt fomo, moved my stop";
    },
    suggest: async (note) => {
      calls.push(`suggest:${note}`);
      return { setup: null, emotions: ["fomo", "revenge"], mistakes: ["chased_entry"], followedPlan: false };
    },
    review: async (days) => {
      calls.push(`review:${days}`);
      return { id: 1, userId: "u1", periodStart: T0 - 7 * 86_400_000, periodEnd: T0, tradeCount: 3, model: "fake", review, inputTokens: 1, outputTokens: 1, createdAt: T0 };
    },
  };
  const voice = (replyTo: number): TgUpdate => ({
    update_id: updateId++,
    message: {
      message_id: updateId + 5000,
      chat: { id: Number(CHAT) },
      voice: { file_id: "file-1", duration: 4 },
      reply_to_message: { message_id: replyTo, chat: { id: Number(CHAT) } },
    },
  });

  it("transcribes a voice reply, saves it as a note and offers only new answers", async () => {
    const tg = new FakeTelegram();
    await insertTrade("t3", T0 + 200_000);
    now = T0 + 240_000;
    await notifyClosedTrades(ctx(tg, CHAT, fakeAi));
    const card = tg.sent[0];
    // Already answered "revenge", so only fomo and chased_entry are new.
    await handleUpdate(ctx(tg, CHAT, fakeAi), tap(card.messageId, "s:v:breakout"));
    await handleUpdate(ctx(tg, CHAT, fakeAi), tap(card.messageId, "e:t:revenge"));

    await handleUpdate(ctx(tg, CHAT, fakeAi), voice(card.messageId));
    expect(calls).toContain("transcribe:audio:file-1");
    const [entry] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t3"));
    expect(entry.notes).toBe("jumped in late, felt fomo, moved my stop");

    const offer = tg.sent.at(-1)!;
    expect(offer.text).toBe("From your note: <b>felt FOMO · mistakes: Chased entry · broke plan</b>");
    expect(tg.sent.at(-2)!.text).toContain("Note saved from your voice");

    await handleUpdate(ctx(tg, CHAT, fakeAi), tap(offer.messageId, "a:y"));
    const [after] = await db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tradeId, "t3"));
    expect(after).toMatchObject({ setup: "breakout", emotions: ["revenge", "fomo"], mistakes: ["chased_entry"], followedPlan: false });
    expect(tg.edits.find((e) => e.messageId === offer.messageId)?.text).toContain("Added:");
  });

  it("says AI is off instead of failing when there is no key", async () => {
    const tg = new FakeTelegram();
    const [card] = await db.select().from(schema.telegramMessages).where(eq(schema.telegramMessages.tradeId, "t3"));
    await handleUpdate(ctx(tg), voice(card.messageId));
    await handleUpdate(ctx(tg), say("/review"));
    expect(tg.sent.map((s) => s.text)).toEqual([expect.stringContaining("AI_GATEWAY_API_KEY"), expect.stringContaining("AI_GATEWAY_API_KEY")]);
  });

  it("sends the review on request and once on Sunday evening IST", async () => {
    const tg = new FakeTelegram();
    await handleUpdate(ctx(tg, CHAT, fakeAi), say("/review"));
    expect(tg.sent.at(-1)!.text).toContain("<b>Moving stops cost you most this week</b>");
    expect(tg.sent.at(-1)!.text).toContain("1. Never widen a stop once placed");

    const sentBefore = tg.sent.length;
    now = Date.UTC(2026, 10, 1, 14, 0); // Sunday 19:30 IST: too early
    expect(await maybeSendWeeklyReview(ctx(tg, CHAT, fakeAi))).toBe(false);
    now = Date.UTC(2026, 10, 1, 14, 31); // Sunday 20:01 IST
    expect(await maybeSendWeeklyReview(ctx(tg, CHAT, fakeAi))).toBe(true);
    expect(await maybeSendWeeklyReview(ctx(tg, CHAT, fakeAi))).toBe(false);
    now = Date.UTC(2026, 10, 2, 14, 31); // Monday
    expect(await maybeSendWeeklyReview(ctx(tg, CHAT, fakeAi))).toBe(false);
    expect(tg.sent.length).toBe(sentBefore + 1);
  });
});

describe("phone notifications from the bot", () => {
  it("pushes each newly closed trade with a link to journal it, alongside the Telegram card", async () => {
    const tg = new FakeTelegram();
    const pushed: unknown[] = [];
    const withPush = { ...ctx(tg), push: async (m: unknown) => void pushed.push(m) };
    await insertTrade("t9", now + 1_000, 3.5);
    now += 60_000;
    expect(await notifyClosedTrades(withPush)).toBe(1);
    expect(tg.sent).toHaveLength(1);
    expect(pushed).toEqual([{ title: "XAUTUSD short closed · +$3.50", body: "Tap to journal it while it's fresh.", url: "/trades/t9", tag: "trade-t9" }]);
  });

  it("never lets a push failure stop the Telegram card", async () => {
    const tg = new FakeTelegram();
    const broken = {
      ...ctx(tg),
      push: async () => {
        throw new Error("push service down");
      },
    };
    await insertTrade("t10", now + 1_000, -1);
    now += 60_000;
    expect(await notifyClosedTrades(broken)).toBe(1);
    expect(tg.sent).toHaveLength(1);
  });
});

describe("phone-only users (no Telegram chat)", () => {
  it("pushes each new close once and moves their starting point past it", async () => {
    const tg = new FakeTelegram();
    const pushed: { url: string }[] = [];
    const phoneOnly: BotContext = { ...ctx(tg, null), userId: "p1", push: async (m) => void pushed.push(m) };
    expect(await notifyClosedTrades(phoneOnly)).toBe(0); // first run: starting point only
    const closedTs = now + 1_000;
    await insertTrade("p-1", closedTs, 2, "p1");
    now += 60_000;
    expect(await notifyClosedTrades(phoneOnly)).toBe(1);
    expect(await notifyClosedTrades(phoneOnly)).toBe(0);
    expect(pushed.map((m) => m.url)).toEqual(["/trades/p-1"]);
    expect(tg.sent).toHaveLength(0);
    expect(await getState(db, STATE_NOTIFY_SINCE, "p1")).toBe(String(closedTs + 1));
  });

  it("gets the weekly review on their phone", async () => {
    const pushed: { url: string }[] = [];
    const ai: BotAi = {
      transcribe: async () => "",
      suggest: async () => ({ setup: null, emotions: [], mistakes: [], followedPlan: null }),
      review: async () => ({ id: 2, userId: "p1", periodStart: 0, periodEnd: 0, tradeCount: 1, model: "fake", review: {} as never, inputTokens: 1, outputTokens: 1, createdAt: 0 }),
    };
    now = Date.UTC(2026, 10, 8, 14, 31); // Sunday 20:01 IST
    const phoneOnly: BotContext = { ...ctx(new FakeTelegram(), null, ai), userId: "p1", push: async (m) => void pushed.push(m) };
    expect(await maybeSendWeeklyReview(phoneOnly)).toBe(true);
    expect(pushed.map((m) => m.url)).toEqual(["/review"]);
  });
});

describe("sync problems", () => {
  it("tells the user once per distinct problem, in plain words, and when it works again", async () => {
    const tg = new FakeTelegram();
    const pushed: { title: string }[] = [];
    const c: BotContext = { ...ctx(tg), push: async (m) => void pushed.push(m) };
    const ipError = 'Delta GET /v2/fills failed (401): {"error":{"code":"ip_not_whitelisted_for_api_key"}}';
    await notifySyncProblem(c, ipError, null);
    await notifySyncProblem(c, ipError, ipError);
    await notifySyncProblem(c, null, ipError);
    await notifySyncProblem(c, null, null);
    expect(tg.sent.map((s) => s.text)).toEqual([expect.stringContaining("IP whitelist"), "Delta sync is working again."]);
    expect(pushed.map((m) => m.title)).toEqual(["Delta sync stopped working"]);
  });
});

describe("one bot shared by every user", () => {
  const ALICE_CHAT = "5001";
  const BOB_CHAT = "5002";
  const contexts: string[] = [];
  const shared = (tg: FakeTelegram): SharedBot => ({
    db,
    tg,
    now: () => now,
    context: (userId, chatId) => {
      contexts.push(`${userId}@${chatId}`);
      return { userId, db, tg, chatId, sync: async () => ({ fills: 0, rebuild: null }), ai: null, now: () => now };
    },
  });
  const message = (text: string, chatId: string, type: "private" | "group" = "private"): TgUpdate => ({
    update_id: updateId++,
    message: { message_id: updateId + 9000, chat: { id: Number(chatId), type }, from: { id: Number(chatId), username: `u${chatId}` }, text },
  });

  it("only explains itself to chats that are not linked, and never in groups", async () => {
    const tg = new FakeTelegram();
    await routeUpdate(shared(tg), message("/start", ALICE_CHAT));
    await routeUpdate(shared(tg), message("hello", ALICE_CHAT));
    await routeUpdate(shared(tg), message("/today", ALICE_CHAT, "group"));
    expect(tg.sent.map((s) => s.text)).toEqual([expect.stringContaining("<b>Settings</b> → <b>Telegram</b>")]);
    expect(contexts).toEqual([]);

    await routeUpdate(shared(tg), tap(1, "s:v:range", ALICE_CHAT));
    expect(tg.answers.at(-1)?.text).toBe("This chat is not connected to Hardwon.");
  });

  it("links each chat to its own account and routes it there", async () => {
    const tg = new FakeTelegram();
    await insertTrade("alice-1", now - 1_000, 7, "alice");
    await insertTrade("bob-1", now - 1_000, -9, "bob");

    // A link opened in a group is refused, and the code still works afterwards in a private chat.
    const aliceCode = await createLinkCode(db, "alice", now);
    await routeUpdate(shared(tg), message(`/start ${aliceCode}`, "-77", "group"));
    expect(await userForChat(db, "-77")).toBeNull();
    await routeUpdate(shared(tg), message(`/start ${aliceCode}`, ALICE_CHAT));
    await routeUpdate(shared(tg), message(`/start ${await createLinkCode(db, "bob", now)}`, BOB_CHAT));
    expect(tg.sent.filter((s) => s.text.includes("Connected to Hardwon")).map((s) => s.chatId)).toEqual([ALICE_CHAT, BOB_CHAT]);
    expect(await userForChat(db, ALICE_CHAT)).toBe("alice");

    tg.sent = [];
    await routeUpdate(shared(tg), message("/today", ALICE_CHAT));
    await routeUpdate(shared(tg), message("/today", BOB_CHAT));
    expect(contexts).toEqual([`alice@${ALICE_CHAT}`, `bob@${BOB_CHAT}`]);
    expect(tg.sent.map((s) => [s.chatId, s.text.split("\n")[0]])).toEqual([
      [ALICE_CHAT, "<b>Today: +$7.00</b>"],
      [BOB_CHAT, "<b>Today: -$9.00</b>"],
    ]);

    // A used code cannot take over a chat.
    await routeUpdate(shared(tg), message(`/start ${aliceCode}`, BOB_CHAT));
    expect(await userForChat(db, BOB_CHAT)).toBe("bob");
    expect(tg.sent.at(-1)!.text).toContain("expired or was already used");
  });

  it("limits replies to unlinked chats and floods from linked ones", async () => {
    const tg = new FakeTelegram();
    for (let i = 0; i < 12; i++) await routeUpdate(shared(tg), message("/start", "7777"));
    expect(tg.sent).toHaveLength(10);

    tg.sent = [];
    contexts.length = 0;
    now += 60_000; // past the minute the earlier tests used
    for (let i = 0; i < 61; i++) await routeUpdate(shared(tg), message("/help", ALICE_CHAT));
    expect(contexts).toHaveLength(60);
    now += 60_000; // a new minute
    await routeUpdate(shared(tg), message("/help", ALICE_CHAT));
    expect(contexts).toHaveLength(61);
  });

  it("limits /sync to 20 an hour", async () => {
    const tg = new FakeTelegram();
    for (let i = 0; i < 21; i++) await handleUpdate({ ...ctx(tg), userId: "alice", chatId: ALICE_CHAT }, message("/sync", ALICE_CHAT));
    expect(tg.sent.filter((s) => s.text.startsWith("Synced")).length).toBe(20);
    expect(tg.sent.at(-1)!.text).toBe("Too many tries. Try again in 60 minutes.");
  });

  it("disconnects a chat on /disconnect", async () => {
    const tg = new FakeTelegram();
    await routeUpdate(shared(tg), message("/disconnect", BOB_CHAT));
    expect(await userForChat(db, BOB_CHAT)).toBeNull();
    expect(tg.sent[0].text).toContain("Disconnected");
    await routeUpdate(shared(tg), message("/today", BOB_CHAT));
    expect(tg.sent.at(-1)!.text).toContain("Connect Telegram");
  });
});
