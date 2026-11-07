import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { AI_NOT_CONFIGURED, explainAiError } from "@/lib/ai/models";
import type { ReviewRow } from "@/lib/ai/review";
import type { PushMessage } from "@/lib/push";
import { isEmptySuggestion, newSuggestions, type NoteSuggestion } from "@/lib/ai/suggest";
import { suggestionsFor } from "@/lib/journal/entry";
import { EMPTY_ENTRY, loadJournalEntry, saveJournalEntry } from "@/lib/journal/save";
import { formatMoney, formatPercent } from "@/lib/format";
import { istDate } from "@/lib/stats";
import { rateLimit, tooMany, type LimitedAction } from "@/lib/rate-limit";
import { saveFeedback } from "@/lib/feedback";
import { explainSyncError } from "@/lib/sync-errors";
import type { TelegramClient, TgCallbackQuery, TgMessage, TgUpdate } from "./api";
import { STATE_NOTIFY_SINCE, unlinkTelegram, redeemLinkCode, userForChat } from "./links";
import { applyCallback, changesEntry, escapeHtml, parseCallback, renderReview, renderTradeCard, suggestionSummary, type Stage } from "./render";

/** AI features the bot uses; null when no AI Gateway key is configured. Injected so tests use fakes. */
export interface BotAi {
  transcribe(audio: Uint8Array): Promise<string>;
  suggest(note: string, trade: { symbol: string; direction: string; netPnl: number }): Promise<NoteSuggestion>;
  review(days: number): Promise<ReviewRow | null>;
}

/** One user's view of the shared bot. */
export interface BotContext {
  /** The Hardwon user this context acts for. */
  userId: string;
  db: Db;
  tg: TelegramClient;
  /** The user's linked Telegram chat, or null when they have not linked one (phone notifications only). */
  chatId: string | null;
  /** Pulls new data from Delta; injected so tests do not call the exchange. */
  sync: () => Promise<{ fills: number; rebuild: { trades: number } | null }>;
  ai: BotAi | null;
  /** Sends a phone notification to every subscribed device; null when push is not set up. */
  push?: ((message: PushMessage) => Promise<unknown>) | null;
  now?: () => number;
}

export const COMMANDS = [
  { command: "journal", description: "Journal your recent un-journaled trades" },
  { command: "today", description: "Today's P&L (IST)" },
  { command: "sync", description: "Sync with Delta now" },
  { command: "review", description: "AI coaching review of the last 7 days" },
  { command: "reminders", description: "Turn the evening journaling reminder on or off" },
  { command: "feedback", description: "Send a message to the founder" },
  { command: "disconnect", description: "Disconnect this chat from Hardwon" },
  { command: "help", description: "What this bot does" },
];

const HELP = [
  "I message you when a trade closes so you can journal it in a few taps.",
  "",
  "Reply to a trade message with text or a voice note to add a note.",
  "/journal: your recent trades that still need journaling",
  "/today: today's P&L",
  "/sync: sync with Delta now",
  "/review: AI coaching review of the last 7 days (also sent on Sunday evenings)",
  "/reminders: turn the evening reminder about un-journaled trades on or off",
  "/feedback <message>: tell the founder about a bug or an idea",
  "/disconnect: stop messages here (your journal stays in Hardwon)",
].join("\n");

/** Shown to a chat that is not linked to an account. */
const NOT_LINKED = [
  "This is the Hardwon bot. It messages you when a trade closes so you can journal it in a few taps.",
  "",
  "To connect it, open Hardwon → <b>Settings</b> → <b>Telegram</b> and tap <b>Connect Telegram</b>.",
].join("\n");

const LINK_FAILED = "That link has expired or was already used. In Hardwon, open Settings → Telegram and tap Connect Telegram again.";

/** At most this many trades are announced per user per run; the rest wait for the next. */
export const MAX_CARDS_PER_RUN = 10;
const JOURNAL_COMMAND_LIMIT = 5;
const JOURNAL_COMMAND_DAYS = 7;
const DAY_MS = 86_400_000;

const STATE_WEEKLY_REVIEW = "telegram.weekly_review_for";
const IST_OFFSET_MS = 330 * 60_000;
/** The automatic review goes out on Sunday from this hour (IST). */
const WEEKLY_REVIEW_HOUR = 20;

const STATE_REMINDER = "telegram.reminder_for";
const STATE_REMINDERS_OFF = "telegram.reminders_off";
/** The daily journaling reminder goes out from this hour (IST), about the last 24 hours' trades. */
export const REMINDER_HOUR = 21;
const REMINDER_GO = "n:go";
const REMINDER_OFF = "n:off";

// --- entry points --------------------------------------------------------------

/** The one bot every user shares: it finds the user behind each chat. */
export interface SharedBot {
  db: Db;
  tg: TelegramClient;
  /** Builds the context for a user and their linked chat. */
  context: (userId: string, chatId: string) => BotContext;
  now?: () => number;
}

/**
 * Routes an update to the user whose chat sent it. A chat that is not linked
 * can only link itself ("/start <code>" from Settings) or ask what the bot is.
 */
export async function routeUpdate(bot: SharedBot, update: TgUpdate): Promise<void> {
  const msg = update.message ?? update.callback_query?.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);

  const now = bot.now?.() ?? Date.now();

  const code = update.message?.text?.trim().match(/^\/start(?:@\w+)?\s+(\S+)$/)?.[1];
  if (code) {
    if (!(await rateLimit(bot.db, `chat:${chatId}`, "bot.stranger", now)).ok) return;
    return linkChat(bot, update.message!, code);
  }

  const userId = await userForChat(bot.db, chatId);
  if (userId) {
    // A flood of messages is dropped (taps are still acknowledged, so buttons stop spinning).
    if ((await rateLimit(bot.db, userId, "bot.update", now)).ok) return handleUpdate(bot.context(userId, chatId), update);
    if (update.callback_query) await bot.tg.answerCallback(update.callback_query.id, "Slow down a little.");
    return;
  }

  if (update.callback_query) return bot.tg.answerCallback(update.callback_query.id, "This chat is not connected to Hardwon.");
  // Only private chats are answered, and only for commands, so the bot cannot be used to spam a group.
  if (msg.chat.type !== "private" || !update.message?.text?.startsWith("/")) return;
  if ((await rateLimit(bot.db, `chat:${chatId}`, "bot.stranger", now)).ok) await bot.tg.sendMessage(chatId, NOT_LINKED);
}

/** Counts an attempt for the user; when over the limit, says so in their chat and returns false. */
async function allowed(ctx: BotContext, action: LimitedAction, { quiet = false } = {}): Promise<boolean> {
  const now = ctx.now?.() ?? Date.now();
  const result = await rateLimit(ctx.db, ctx.userId, action, now);
  if (!result.ok && !quiet && ctx.chatId) await ctx.tg.sendMessage(ctx.chatId, tooMany(result, now));
  return result.ok;
}

async function linkChat(bot: SharedBot, msg: TgMessage, code: string) {
  const chatId = String(msg.chat.id);
  // A group would show one person's trades to everyone in it.
  if (msg.chat.type !== "private") {
    await bot.tg.sendMessage(chatId, "Hardwon only connects to a private chat. Open the link from Settings on your phone instead.");
    return;
  }
  const name = msg.from?.username ? `@${msg.from.username}` : (msg.from?.first_name ?? null);
  const userId = await redeemLinkCode(bot.db, code, chatId, name, bot.now?.() ?? Date.now());
  if (!userId) {
    await bot.tg.sendMessage(chatId, LINK_FAILED);
    return;
  }
  await bot.tg.sendMessage(
    chatId,
    ["<b>Connected to Hardwon ✓</b>", "", "From now on I'll message you here when a trade closes, so you can journal it in a few taps.", "", HELP].join("\n"),
  );
}

export async function handleUpdate(ctx: BotContext, update: TgUpdate): Promise<void> {
  if (update.callback_query) await handleCallback(ctx, update.callback_query);
  else if (update.message) await handleMessage(ctx, update.message);
}

/**
 * Announces each trade that closed since the user's starting point (their
 * first run, or when they last linked or unlinked a chat) and is not yet
 * journaled: a journaling card in their chat and a phone notification. The
 * first run only records the starting point, so history does not flood in.
 * Without a chat, the starting point moves past each trade once it is pushed.
 */
export async function notifyClosedTrades(ctx: BotContext): Promise<number> {
  if (!ctx.chatId && !ctx.push) return 0;
  const now = ctx.now?.() ?? Date.now();
  const since = await getState(ctx.db, STATE_NOTIFY_SINCE, ctx.userId);
  if (since === null) {
    await setState(ctx.db, STATE_NOTIFY_SINCE, String(now), ctx.userId);
    return 0;
  }

  const carded = ctx.db
    .select({ id: schema.telegramMessages.tradeId })
    .from(schema.telegramMessages)
    .where(and(eq(schema.telegramMessages.userId, ctx.userId), eq(schema.telegramMessages.kind, "trade")));
  const journaled = ctx.db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries).where(eq(schema.journalEntries.userId, ctx.userId));
  const due = await ctx.db
    .select({
      id: schema.trades.id,
      symbol: schema.trades.symbol,
      direction: schema.trades.direction,
      netPnl: schema.trades.netPnl,
      closedTs: schema.trades.closedTs,
    })
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.userId, ctx.userId),
        eq(schema.trades.status, "closed"),
        gte(schema.trades.closedTs, Number(since)),
        ctx.chatId ? notInArray(schema.trades.id, carded) : undefined,
        notInArray(schema.trades.id, journaled),
      ),
    )
    .orderBy(schema.trades.closedTs)
    .limit(MAX_CARDS_PER_RUN);

  for (const t of due) {
    if (ctx.chatId) await sendTradeCard(ctx, t.id);
    await notifyPhone(ctx, {
      title: `${t.symbol} ${t.direction} closed · ${formatMoney(t.netPnl, { sign: true })}`,
      body: "Tap to journal it while it's fresh.",
      url: `/trades/${encodeURIComponent(t.id)}`,
      tag: `trade-${t.id}`,
    });
  }
  // With a chat the cards mark what was sent; without one, the starting point does.
  const last = due.at(-1)?.closedTs;
  if (!ctx.chatId && last != null) await setState(ctx.db, STATE_NOTIFY_SINCE, String(last + 1), ctx.userId);
  return due.length;
}

/**
 * Tells the user when their sync starts failing (once per distinct problem,
 * not every minute) and when it works again. `previous` is the last error
 * they were told about.
 */
export async function notifySyncProblem(ctx: BotContext, error: string | null, previous: string | null): Promise<void> {
  if (error === previous) return;
  if (!error) {
    if (ctx.chatId) await ctx.tg.sendMessage(ctx.chatId, "Delta sync is working again.").catch(() => {});
    return;
  }
  const plain = explainSyncError(error);
  if (ctx.chatId) await ctx.tg.sendMessage(ctx.chatId, `<b>Delta sync stopped working</b>\n${escapeHtml(plain)}`).catch(() => {});
  await notifyPhone(ctx, { title: "Delta sync stopped working", body: plain, url: "/settings", tag: "sync-error" });
}

// --- messages -------------------------------------------------------------------

async function handleMessage(ctx: BotContext, msg: TgMessage) {
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim() ?? "";

  // A context only ever answers the user's own linked chat.
  if (!ctx.chatId || chatId !== ctx.chatId) return;

  if (msg.reply_to_message) {
    const tradeId = await tradeForMessage(ctx, msg.reply_to_message.message_id);
    if (tradeId) return msg.voice ? addVoiceNote(ctx, tradeId, msg.voice.file_id) : addNote(ctx, tradeId, msg.text);
  }
  if (msg.voice) {
    await ctx.tg.sendMessage(chatId, "Reply to a trade message with your voice note, so I know which trade it is about.");
    return;
  }

  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  if (command === "/journal") return journalCommand(ctx);
  if (command === "/today") return todayCommand(ctx);
  if (command === "/sync") return syncCommand(ctx);
  if (command === "/review") return reviewCommand(ctx);
  if (command === "/disconnect") return disconnectCommand(ctx);
  if (command === "/reminders") return remindersCommand(ctx);
  if (command === "/feedback") return feedbackCommand(ctx, text.slice(text.split(/\s+/)[0].length));
  await ctx.tg.sendMessage(chatId, HELP);
}

async function feedbackCommand(ctx: BotContext, text: string) {
  if (!text.trim()) {
    await ctx.tg.sendMessage(ctx.chatId!, "Write your message after the command, for example:\n/feedback the calendar shows the wrong day");
    return;
  }
  const result = await saveFeedback(ctx.db, ctx.userId, text, "telegram", ctx.now?.() ?? Date.now());
  await ctx.tg.sendMessage(ctx.chatId!, escapeHtml(result.message));
}

async function remindersCommand(ctx: BotContext) {
  const off = (await getState(ctx.db, STATE_REMINDERS_OFF, ctx.userId)) === "1";
  await setState(ctx.db, STATE_REMINDERS_OFF, off ? "0" : "1", ctx.userId);
  await ctx.tg.sendMessage(
    ctx.chatId!,
    off
      ? `Evening reminders are on. At ${REMINDER_HOUR}:00 IST I'll tell you if any of the day's trades still need journaling.`
      : "Evening reminders are off. Send /reminders to turn them back on.",
  );
}

async function disconnectCommand(ctx: BotContext) {
  await unlinkTelegram(ctx.db, ctx.userId, ctx.now?.() ?? Date.now());
  await ctx.tg.sendMessage(
    ctx.chatId!,
    "Disconnected. I won't message you here any more; your trades and journal stay in Hardwon. Connect again any time from Settings → Telegram.",
  );
}

async function addVoiceNote(ctx: BotContext, tradeId: string, fileId: string) {
  if (!ctx.ai) {
    await ctx.tg.sendMessage(ctx.chatId!, `Voice notes need AI to transcribe them. ${AI_NOT_CONFIGURED}`);
    return;
  }
  if (!(await allowed(ctx, "ai.transcribe"))) return;
  let text: string;
  try {
    text = (await ctx.ai.transcribe(await ctx.tg.downloadFile(fileId))).trim();
  } catch (err) {
    await ctx.tg.sendMessage(ctx.chatId!, escapeHtml(explainAiError(err)));
    return;
  }
  if (!text) {
    await ctx.tg.sendMessage(ctx.chatId!, "I couldn't make out any words in that voice note.");
    return;
  }
  await addNote(ctx, tradeId, text, { transcribed: true });
}

async function addNote(ctx: BotContext, tradeId: string, text: string | undefined, opts: { transcribed?: boolean } = {}) {
  const chatId = ctx.chatId!;
  const note = text?.trim();
  if (!note) {
    await ctx.tg.sendMessage(chatId, "Notes need to be typed text.");
    return;
  }
  const entry = (await loadJournalEntry(ctx.db, ctx.userId, tradeId)) ?? EMPTY_ENTRY;
  const notes = entry.notes ? `${entry.notes}\n${note}` : note;
  const result = await saveJournalEntry(ctx.db, ctx.userId, tradeId, { ...entry, notes });
  if (!result.ok) {
    await ctx.tg.sendMessage(chatId, `Not saved: ${escapeHtml(result.message)}`);
    return;
  }
  // Refresh the latest card for this trade so it shows the note.
  const card = await latestCard(ctx, tradeId);
  if (card) await editTradeCard(ctx, card, tradeId, "done");
  await ctx.tg.sendMessage(chatId, opts.transcribed ? `Note saved from your voice:\n<i>${escapeHtml(note)}</i>` : "Note saved.");
  await offerSuggestions(ctx, tradeId, note);
}

/** Asks the AI which journal answers the note implies, and offers the new ones as one tap. */
async function offerSuggestions(ctx: BotContext, tradeId: string, note: string) {
  if (!ctx.ai || !(await allowed(ctx, "ai.suggest", { quiet: true }))) return;
  const [trade] = await ctx.db.select().from(schema.trades).where(and(eq(schema.trades.userId, ctx.userId), eq(schema.trades.id, tradeId)));
  if (!trade) return;
  let suggestion: NoteSuggestion;
  try {
    suggestion = await ctx.ai.suggest(note, trade);
  } catch {
    return; // Suggestions are a nicety; the note itself is already saved.
  }
  const entry = (await loadJournalEntry(ctx.db, ctx.userId, tradeId)) ?? EMPTY_ENTRY;
  const fresh = newSuggestions(suggestion, entry);
  if (isEmptySuggestion(fresh)) return;
  const sent = await ctx.tg.sendMessage(ctx.chatId!, `From your note: <b>${escapeHtml(suggestionSummary(fresh))}</b>`, {
    inline_keyboard: [[{ text: "✓ Add these", callback_data: "a:y" }, { text: "No thanks", callback_data: "a:n" }]],
  });
  await recordMessage(ctx, sent.message_id, tradeId, "suggestion", fresh);
}

async function handleSuggestionTap(ctx: BotContext, cq: TgCallbackQuery, accept: boolean) {
  const messageId = cq.message!.message_id;
  const [row] = await ctx.db
    .select()
    .from(schema.telegramMessages)
    .where(
      and(
        eq(schema.telegramMessages.userId, ctx.userId),
        eq(schema.telegramMessages.chatId, ctx.chatId!),
        eq(schema.telegramMessages.messageId, messageId),
        eq(schema.telegramMessages.kind, "suggestion"),
      ),
    );
  if (!row?.payload) {
    await ctx.tg.answerCallback(cq.id, "This suggestion has expired.");
    return;
  }
  const s = row.payload as NoteSuggestion;
  if (!accept) {
    await ctx.tg.editMessage(ctx.chatId!, messageId, `<s>From your note: ${escapeHtml(suggestionSummary(s))}</s>`);
    await ctx.tg.answerCallback(cq.id);
    return;
  }
  const entry = (await loadJournalEntry(ctx.db, ctx.userId, row.tradeId)) ?? EMPTY_ENTRY;
  const result = await saveJournalEntry(ctx.db, ctx.userId, row.tradeId, {
    ...entry,
    setup: entry.setup ?? s.setup,
    emotions: [...new Set([...entry.emotions, ...s.emotions])],
    mistakes: [...new Set([...entry.mistakes, ...s.mistakes])],
    followedPlan: entry.followedPlan ?? s.followedPlan,
  });
  if (!result.ok) {
    await ctx.tg.answerCallback(cq.id, result.message);
    return;
  }
  await ctx.tg.editMessage(ctx.chatId!, messageId, `Added: <b>${escapeHtml(suggestionSummary(s))}</b>`);
  const card = await latestCard(ctx, row.tradeId);
  if (card) await editTradeCard(ctx, card, row.tradeId, "done");
  await ctx.tg.answerCallback(cq.id, "Added");
}

async function reviewCommand(ctx: BotContext) {
  if (!ctx.ai) {
    await ctx.tg.sendMessage(ctx.chatId!, AI_NOT_CONFIGURED);
    return;
  }
  if (!(await allowed(ctx, "ai.review"))) return;
  await ctx.tg.sendMessage(ctx.chatId!, "Writing your review of the last 7 days…");
  await sendReview(ctx);
}

/** Writes a review of the last 7 days and sends it to the chat, if there is one. `quiet` skips "nothing to review". */
async function sendReview(ctx: BotContext, { quiet = false } = {}): Promise<boolean> {
  try {
    const row = await ctx.ai!.review(7);
    if (!row) {
      if (ctx.chatId && !quiet) await ctx.tg.sendMessage(ctx.chatId, "No closed trades in the last 7 days, so there is nothing to review.");
      return false;
    }
    if (ctx.chatId) await ctx.tg.sendMessage(ctx.chatId, renderReview(row.review, row));
    return true;
  } catch (err) {
    if (ctx.chatId) await ctx.tg.sendMessage(ctx.chatId, escapeHtml(explainAiError(err)));
    return false;
  }
}

/**
 * Writes the weekly review once, on Sunday evening IST, and sends it to the
 * user's chat and phone. Weeks without trades are skipped quietly. Safe to call every minute.
 */
export async function maybeSendWeeklyReview(ctx: BotContext): Promise<boolean> {
  if (!ctx.ai || (!ctx.chatId && !ctx.push)) return false;
  const now = ctx.now?.() ?? Date.now();
  const ist = new Date(now + IST_OFFSET_MS);
  if (ist.getUTCDay() !== 0 || ist.getUTCHours() < WEEKLY_REVIEW_HOUR) return false;
  const week = istDate(now);
  if ((await getState(ctx.db, STATE_WEEKLY_REVIEW, ctx.userId)) === week) return false;
  // Marked before sending, so a failure is not retried every minute; /review can be used instead.
  await setState(ctx.db, STATE_WEEKLY_REVIEW, week, ctx.userId);
  const sent = await sendReview(ctx, { quiet: true });
  if (sent) await notifyPhone(ctx, { title: "Your weekly trading review is ready", body: "See the habits that cost you most this week.", url: "/review", tag: "weekly-review" });
  return sent;
}

/**
 * Once a day from 21:00 IST (REMINDER_HOUR): if trades closed in the last 24 hours (since the user's
 * starting point) are still not journaled, says how many, with a button that sends their cards and
 * one that turns the reminder off. Only for users with a linked chat, so it can always be turned off
 * where it arrives. Safe to call every minute.
 */
export async function maybeSendJournalReminder(ctx: BotContext): Promise<number> {
  if (!ctx.chatId) return 0;
  const now = ctx.now?.() ?? Date.now();
  if (new Date(now + IST_OFFSET_MS).getUTCHours() < REMINDER_HOUR) return 0;
  const day = istDate(now);
  if ((await getState(ctx.db, STATE_REMINDER, ctx.userId)) === day) return 0;
  if ((await getState(ctx.db, STATE_REMINDERS_OFF, ctx.userId)) === "1") return 0;
  // Marked first, so a failure is not retried every minute.
  await setState(ctx.db, STATE_REMINDER, day, ctx.userId);

  const since = Math.max(now - DAY_MS, Number(await getState(ctx.db, STATE_NOTIFY_SINCE, ctx.userId)) || 0);
  const journaled = ctx.db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries).where(eq(schema.journalEntries.userId, ctx.userId));
  const due = await ctx.db
    .select({ id: schema.trades.id })
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.userId, ctx.userId),
        eq(schema.trades.status, "closed"),
        gte(schema.trades.closedTs, since),
        notInArray(schema.trades.id, journaled),
      ),
    );
  if (!due.length) return 0;

  const what = due.length === 1 ? "1 trade from the last 24 hours isn't" : `${due.length} trades from the last 24 hours aren't`;
  await ctx.tg.sendMessage(ctx.chatId, `📝 <b>${what} journaled yet.</b>\nA minute now, while you remember why you took them, is what makes your habit insights right.`, {
    inline_keyboard: [[{ text: "Journal them", callback_data: REMINDER_GO }], [{ text: "Turn off these reminders", callback_data: REMINDER_OFF }]],
  });
  await notifyPhone(ctx, { title: `${what} journaled yet`, body: "Tap to journal them while they're fresh.", url: "/journal", tag: "journal-reminder" });
  return due.length;
}

async function handleReminderTap(ctx: BotContext, cq: TgCallbackQuery) {
  if (cq.data === REMINDER_OFF) {
    await setState(ctx.db, STATE_REMINDERS_OFF, "1", ctx.userId);
    await ctx.tg.editMessage(ctx.chatId!, cq.message!.message_id, "Evening reminders are off. Send /reminders to turn them back on.");
    await ctx.tg.answerCallback(cq.id, "Reminders off");
    return;
  }
  await ctx.tg.answerCallback(cq.id);
  await journalCommand(ctx);
}

/** Phone notifications are a bonus: a failure must never break the bot's own work. */
export async function notifyPhone(ctx: BotContext, message: PushMessage): Promise<void> {
  if (!ctx.push) return;
  try {
    await ctx.push(message);
  } catch {
    // Ignored: Telegram already has the message.
  }
}

async function journalCommand(ctx: BotContext) {
  const since = (ctx.now?.() ?? Date.now()) - JOURNAL_COMMAND_DAYS * DAY_MS;
  const journaled = ctx.db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries).where(eq(schema.journalEntries.userId, ctx.userId));
  const due = await ctx.db
    .select({ id: schema.trades.id })
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.userId, ctx.userId),
        eq(schema.trades.status, "closed"),
        gte(schema.trades.closedTs, since),
        notInArray(schema.trades.id, journaled),
      ),
    )
    .orderBy(desc(schema.trades.closedTs))
    .limit(JOURNAL_COMMAND_LIMIT);
  if (!due.length) {
    await ctx.tg.sendMessage(ctx.chatId!, `Nothing to journal from the last ${JOURNAL_COMMAND_DAYS} days.`);
    return;
  }
  for (const t of due.reverse()) await sendTradeCard(ctx, t.id);
}

async function todayCommand(ctx: BotContext) {
  const today = istDate(ctx.now?.() ?? Date.now());
  const since = Date.parse(`${today}T00:00:00+05:30`);
  const trades = await ctx.db
    .select({ netPnl: schema.trades.netPnl })
    .from(schema.trades)
    .where(and(eq(schema.trades.userId, ctx.userId), eq(schema.trades.status, "closed"), gte(schema.trades.closedTs, since)));
  if (!trades.length) {
    await ctx.tg.sendMessage(ctx.chatId!, "No closed trades today.");
    return;
  }
  const net = trades.reduce((a, t) => a + t.netPnl, 0);
  const wins = trades.filter((t) => t.netPnl > 0).length;
  await ctx.tg.sendMessage(
    ctx.chatId!,
    `<b>Today: ${formatMoney(net, { sign: true })}</b>\n${trades.length} trades · ${wins} won (${formatPercent(wins / trades.length)})`,
  );
}

async function syncCommand(ctx: BotContext) {
  if (!(await allowed(ctx, "bot.sync"))) return;
  try {
    const s = await ctx.sync();
    const sent = await notifyClosedTrades(ctx);
    const what = s.rebuild ? `${s.fills} new fills, ${s.rebuild.trades} trades.` : "nothing new on Delta.";
    await ctx.tg.sendMessage(ctx.chatId!, `Synced: ${what}${sent ? ` ${sent} new to journal.` : ""}`);
  } catch (err) {
    await ctx.tg.sendMessage(ctx.chatId!, `Sync failed: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

// --- buttons --------------------------------------------------------------------

async function handleCallback(ctx: BotContext, cq: TgCallbackQuery) {
  const msg = cq.message;
  if (!ctx.chatId || !msg || String(msg.chat.id) !== ctx.chatId) {
    await ctx.tg.answerCallback(cq.id);
    return;
  }
  if (cq.data === "a:y" || cq.data === "a:n") return handleSuggestionTap(ctx, cq, cq.data === "a:y");
  if (cq.data === REMINDER_GO || cq.data === REMINDER_OFF) return handleReminderTap(ctx, cq);
  const tradeId = await tradeForMessage(ctx, msg.message_id);
  const cb = parseCallback(cq.data);
  if (!tradeId || !cb) {
    await ctx.tg.answerCallback(cq.id, "This button is no longer linked to a trade.");
    return;
  }

  if (cb.kind === "note") {
    const prompt = await ctx.tg.sendMessage(ctx.chatId, "Type your note for this trade:", {
      force_reply: true,
      input_field_placeholder: "What happened, and why?",
    });
    await recordMessage(ctx, prompt.message_id, tradeId, "note_prompt");
    await ctx.tg.answerCallback(cq.id);
    return;
  }

  const current = (await loadJournalEntry(ctx.db, ctx.userId, tradeId)) ?? EMPTY_ENTRY;
  const { entry, stage } = applyCallback(current, cb);
  if (changesEntry(cb)) {
    const result = await saveJournalEntry(ctx.db, ctx.userId, tradeId, { ...entry });
    if (!result.ok) {
      await ctx.tg.answerCallback(cq.id, result.message);
      return;
    }
  }
  await editTradeCard(ctx, msg.message_id, tradeId, stage);
  await ctx.tg.answerCallback(cq.id, stage === "done" && cb.kind === "rating" ? "Journaled" : undefined);
}

// --- helpers -------------------------------------------------------------------

async function renderCard(ctx: BotContext, tradeId: string, stage: Stage) {
  const [trade] = await ctx.db.select().from(schema.trades).where(and(eq(schema.trades.userId, ctx.userId), eq(schema.trades.id, tradeId)));
  if (!trade) return null;
  const tags = await ctx.db.select({ tag: schema.tradeTags.tag, source: schema.tradeTags.source }).from(schema.tradeTags)
    .where(and(eq(schema.tradeTags.userId, ctx.userId), eq(schema.tradeTags.tradeId, tradeId)));
  const autoTags = tags.filter((t) => t.source === "auto").map((t) => t.tag);
  return renderTradeCard(trade, autoTags, await loadJournalEntry(ctx.db, ctx.userId, tradeId), stage, suggestionsFor(autoTags));
}

export async function sendTradeCard(ctx: BotContext, tradeId: string): Promise<void> {
  const card = await renderCard(ctx, tradeId, "setup");
  if (!card || !ctx.chatId) return;
  const sent = await ctx.tg.sendMessage(ctx.chatId, card.text, card.markup);
  await recordMessage(ctx, sent.message_id, tradeId, "trade");
}

async function editTradeCard(ctx: BotContext, messageId: number, tradeId: string, stage: Stage) {
  const card = await renderCard(ctx, tradeId, stage);
  if (card) await ctx.tg.editMessage(ctx.chatId!, messageId, card.text, card.markup);
}

async function tradeForMessage(ctx: BotContext, messageId: number): Promise<string | null> {
  const [row] = await ctx.db
    .select({ tradeId: schema.telegramMessages.tradeId })
    .from(schema.telegramMessages)
    .where(
      and(eq(schema.telegramMessages.userId, ctx.userId), eq(schema.telegramMessages.chatId, ctx.chatId!), eq(schema.telegramMessages.messageId, messageId)),
    );
  return row?.tradeId ?? null;
}

async function recordMessage(ctx: BotContext, messageId: number, tradeId: string, kind: "trade" | "note_prompt" | "suggestion", payload?: unknown) {
  await ctx.db
    .insert(schema.telegramMessages)
    .values({ chatId: ctx.chatId!, messageId, tradeId, userId: ctx.userId, kind, payload: payload ?? null, createdAt: ctx.now?.() ?? Date.now() });
}

/** The most recent journaling card sent for a trade. */
async function latestCard(ctx: BotContext, tradeId: string): Promise<number | null> {
  const [card] = await ctx.db
    .select({ messageId: schema.telegramMessages.messageId })
    .from(schema.telegramMessages)
    .where(
      and(
        eq(schema.telegramMessages.userId, ctx.userId),
        eq(schema.telegramMessages.chatId, ctx.chatId!),
        eq(schema.telegramMessages.tradeId, tradeId),
        eq(schema.telegramMessages.kind, "trade"),
      ),
    )
    .orderBy(desc(schema.telegramMessages.createdAt))
    .limit(1);
  return card?.messageId ?? null;
}

/** Process state; pass a userId for per-user state, or leave it "" for process-wide state. */
export async function getState(db: Db, key: string, userId = ""): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.appState)
    .where(and(eq(schema.appState.userId, userId), eq(schema.appState.key, key)));
  return row?.value ?? null;
}

export async function setState(db: Db, key: string, value: string, userId = ""): Promise<void> {
  await db
    .insert(schema.appState)
    .values({ userId, key, value })
    .onConflictDoUpdate({ target: [schema.appState.userId, schema.appState.key], set: { value } });
}
