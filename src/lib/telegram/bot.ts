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
import type { TelegramClient, TgCallbackQuery, TgMessage, TgUpdate } from "./api";
import { applyCallback, changesEntry, escapeHtml, parseCallback, renderReview, renderTradeCard, suggestionSummary, type Stage } from "./render";

/** AI features the bot uses; null when no AI Gateway key is configured. Injected so tests use fakes. */
export interface BotAi {
  transcribe(audio: Uint8Array): Promise<string>;
  suggest(note: string, trade: { symbol: string; direction: string; netPnl: number }): Promise<NoteSuggestion>;
  review(days: number): Promise<ReviewRow | null>;
}

export interface BotContext {
  db: Db;
  tg: TelegramClient;
  /** The only chat the bot answers. Null until configured, when it only helps you find your chat id. */
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
].join("\n");

const MAX_CARDS_PER_RUN = 10;
const JOURNAL_COMMAND_LIMIT = 5;
const JOURNAL_COMMAND_DAYS = 7;
const DAY_MS = 86_400_000;

const STATE_NOTIFY_SINCE = "telegram.notify_since";
const STATE_WEEKLY_REVIEW = "telegram.weekly_review_for";
const IST_OFFSET_MS = 330 * 60_000;
/** The automatic review goes out on Sunday from this hour (IST). */
const WEEKLY_REVIEW_HOUR = 20;

// --- entry points --------------------------------------------------------------

export async function handleUpdate(ctx: BotContext, update: TgUpdate): Promise<void> {
  if (update.callback_query) await handleCallback(ctx, update.callback_query);
  else if (update.message) await handleMessage(ctx, update.message);
}

/**
 * Sends a journaling card for each trade that closed since the bot was first
 * set up and has neither a card nor a journal entry yet. The first run only
 * records the starting point, so your history does not flood the chat.
 */
export async function notifyClosedTrades(ctx: BotContext): Promise<number> {
  if (!ctx.chatId) return 0;
  const now = ctx.now?.() ?? Date.now();
  const since = await getState(ctx.db, STATE_NOTIFY_SINCE);
  if (since === null) {
    await setState(ctx.db, STATE_NOTIFY_SINCE, String(now));
    return 0;
  }

  const carded = ctx.db.select({ id: schema.telegramMessages.tradeId }).from(schema.telegramMessages).where(eq(schema.telegramMessages.kind, "trade"));
  const journaled = ctx.db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries);
  const due = await ctx.db
    .select({ id: schema.trades.id, symbol: schema.trades.symbol, direction: schema.trades.direction, netPnl: schema.trades.netPnl })
    .from(schema.trades)
    .where(
      and(
        eq(schema.trades.status, "closed"),
        gte(schema.trades.closedTs, Number(since)),
        notInArray(schema.trades.id, carded),
        notInArray(schema.trades.id, journaled),
      ),
    )
    .orderBy(schema.trades.closedTs)
    .limit(MAX_CARDS_PER_RUN);

  for (const t of due) {
    await sendTradeCard(ctx, t.id);
    await notifyPhone(ctx, {
      title: `${t.symbol} ${t.direction} closed · ${formatMoney(t.netPnl, { sign: true })}`,
      body: "Tap to journal it while it's fresh.",
      url: `/trades/${encodeURIComponent(t.id)}`,
      tag: `trade-${t.id}`,
    });
  }
  return due.length;
}

// --- messages -------------------------------------------------------------------

async function handleMessage(ctx: BotContext, msg: TgMessage) {
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim() ?? "";

  if (!ctx.chatId) {
    if (text.startsWith("/start")) {
      await ctx.tg.sendMessage(
        chatId,
        `Your chat id is <code>${chatId}</code>.\nAdd <code>TELEGRAM_CHAT_ID=${chatId}</code> to .env.local and restart <code>npm run bot</code>.`,
      );
    }
    return;
  }
  // Everyone else gets no answer at all.
  if (chatId !== ctx.chatId) return;

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
  await ctx.tg.sendMessage(chatId, HELP);
}

async function addVoiceNote(ctx: BotContext, tradeId: string, fileId: string) {
  if (!ctx.ai) {
    await ctx.tg.sendMessage(ctx.chatId!, `Voice notes need AI to transcribe them. ${AI_NOT_CONFIGURED}`);
    return;
  }
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
  const entry = (await loadJournalEntry(ctx.db, tradeId)) ?? EMPTY_ENTRY;
  const notes = entry.notes ? `${entry.notes}\n${note}` : note;
  const result = await saveJournalEntry(ctx.db, tradeId, { ...entry, notes });
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
  if (!ctx.ai) return;
  const [trade] = await ctx.db.select().from(schema.trades).where(eq(schema.trades.id, tradeId));
  if (!trade) return;
  let suggestion: NoteSuggestion;
  try {
    suggestion = await ctx.ai.suggest(note, trade);
  } catch {
    return; // Suggestions are a nicety; the note itself is already saved.
  }
  const entry = (await loadJournalEntry(ctx.db, tradeId)) ?? EMPTY_ENTRY;
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
  const entry = (await loadJournalEntry(ctx.db, row.tradeId)) ?? EMPTY_ENTRY;
  const result = await saveJournalEntry(ctx.db, row.tradeId, {
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
  await ctx.tg.sendMessage(ctx.chatId!, "Writing your review of the last 7 days…");
  await sendReview(ctx);
}

async function sendReview(ctx: BotContext): Promise<boolean> {
  try {
    const row = await ctx.ai!.review(7);
    if (!row) {
      await ctx.tg.sendMessage(ctx.chatId!, "No closed trades in the last 7 days, so there is nothing to review.");
      return false;
    }
    await ctx.tg.sendMessage(ctx.chatId!, renderReview(row.review, row));
    return true;
  } catch (err) {
    await ctx.tg.sendMessage(ctx.chatId!, escapeHtml(explainAiError(err)));
    return false;
  }
}

/** Sends the weekly review once, on Sunday evening IST. Safe to call every minute. */
export async function maybeSendWeeklyReview(ctx: BotContext): Promise<boolean> {
  if (!ctx.ai || !ctx.chatId) return false;
  const now = ctx.now?.() ?? Date.now();
  const ist = new Date(now + IST_OFFSET_MS);
  if (ist.getUTCDay() !== 0 || ist.getUTCHours() < WEEKLY_REVIEW_HOUR) return false;
  const week = istDate(now);
  if ((await getState(ctx.db, STATE_WEEKLY_REVIEW)) === week) return false;
  // Marked before sending, so a failure is not retried every minute; /review can be used instead.
  await setState(ctx.db, STATE_WEEKLY_REVIEW, week);
  const sent = await sendReview(ctx);
  if (sent) await notifyPhone(ctx, { title: "Your weekly trading review is ready", body: "See the habits that cost you most this week.", url: "/review", tag: "weekly-review" });
  return sent;
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
  const journaled = ctx.db.select({ id: schema.journalEntries.tradeId }).from(schema.journalEntries);
  const due = await ctx.db
    .select({ id: schema.trades.id })
    .from(schema.trades)
    .where(and(eq(schema.trades.status, "closed"), gte(schema.trades.closedTs, since), notInArray(schema.trades.id, journaled)))
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
    .where(and(eq(schema.trades.status, "closed"), gte(schema.trades.closedTs, since)));
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

  const current = (await loadJournalEntry(ctx.db, tradeId)) ?? EMPTY_ENTRY;
  const { entry, stage } = applyCallback(current, cb);
  if (changesEntry(cb)) {
    const result = await saveJournalEntry(ctx.db, tradeId, { ...entry });
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
  const [trade] = await ctx.db.select().from(schema.trades).where(eq(schema.trades.id, tradeId));
  if (!trade) return null;
  const tags = await ctx.db.select({ tag: schema.tradeTags.tag, source: schema.tradeTags.source }).from(schema.tradeTags).where(eq(schema.tradeTags.tradeId, tradeId));
  const autoTags = tags.filter((t) => t.source === "auto").map((t) => t.tag);
  return renderTradeCard(trade, autoTags, await loadJournalEntry(ctx.db, tradeId), stage, suggestionsFor(autoTags));
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
    .where(and(eq(schema.telegramMessages.chatId, ctx.chatId!), eq(schema.telegramMessages.messageId, messageId)));
  return row?.tradeId ?? null;
}

async function recordMessage(ctx: BotContext, messageId: number, tradeId: string, kind: "trade" | "note_prompt" | "suggestion", payload?: unknown) {
  await ctx.db
    .insert(schema.telegramMessages)
    .values({ chatId: ctx.chatId!, messageId, tradeId, kind, payload: payload ?? null, createdAt: ctx.now?.() ?? Date.now() });
}

/** The most recent journaling card sent for a trade. */
async function latestCard(ctx: BotContext, tradeId: string): Promise<number | null> {
  const [card] = await ctx.db
    .select({ messageId: schema.telegramMessages.messageId })
    .from(schema.telegramMessages)
    .where(and(eq(schema.telegramMessages.chatId, ctx.chatId!), eq(schema.telegramMessages.tradeId, tradeId), eq(schema.telegramMessages.kind, "trade")))
    .orderBy(desc(schema.telegramMessages.createdAt))
    .limit(1);
  return card?.messageId ?? null;
}

export async function getState(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, key));
  return row?.value ?? null;
}

export async function setState(db: Db, key: string, value: string): Promise<void> {
  await db.insert(schema.appState).values({ key, value }).onConflictDoUpdate({ target: schema.appState.key, set: { value } });
}
