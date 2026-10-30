import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { suggestionsFor } from "@/lib/journal/entry";
import { EMPTY_ENTRY, loadJournalEntry, saveJournalEntry } from "@/lib/journal/save";
import { formatMoney, formatPercent } from "@/lib/format";
import { istDate } from "@/lib/stats";
import type { TelegramClient, TgCallbackQuery, TgMessage, TgUpdate } from "./api";
import { applyCallback, changesEntry, escapeHtml, parseCallback, renderTradeCard, type Stage } from "./render";

export interface BotContext {
  db: Db;
  tg: TelegramClient;
  /** The only chat the bot answers. Null until configured, when it only helps you find your chat id. */
  chatId: string | null;
  /** Pulls new data from Delta; injected so tests do not call the exchange. */
  sync: () => Promise<{ fills: number; rebuild: { trades: number } }>;
  now?: () => number;
}

export const COMMANDS = [
  { command: "journal", description: "Journal your recent un-journaled trades" },
  { command: "today", description: "Today's P&L (IST)" },
  { command: "sync", description: "Sync with Delta now" },
  { command: "help", description: "What this bot does" },
];

const HELP = [
  "I message you when a trade closes so you can journal it in a few taps.",
  "",
  "Reply to a trade message with text to add a note.",
  "/journal: your recent trades that still need journaling",
  "/today: today's P&L",
  "/sync: sync with Delta now",
].join("\n");

const MAX_CARDS_PER_RUN = 10;
const JOURNAL_COMMAND_LIMIT = 5;
const JOURNAL_COMMAND_DAYS = 7;
const DAY_MS = 86_400_000;

const STATE_NOTIFY_SINCE = "telegram.notify_since";

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
    .select({ id: schema.trades.id })
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

  for (const t of due) await sendTradeCard(ctx, t.id);
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
    if (tradeId) return addNote(ctx, tradeId, msg);
  }
  if (msg.voice) {
    await ctx.tg.sendMessage(chatId, "Voice notes are not supported yet. Please reply to the trade message with a typed note.");
    return;
  }

  const command = text.split(/\s+/)[0].split("@")[0].toLowerCase();
  if (command === "/journal") return journalCommand(ctx);
  if (command === "/today") return todayCommand(ctx);
  if (command === "/sync") return syncCommand(ctx);
  await ctx.tg.sendMessage(chatId, HELP);
}

async function addNote(ctx: BotContext, tradeId: string, msg: TgMessage) {
  const chatId = ctx.chatId!;
  const note = msg.text?.trim();
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
  const [card] = await ctx.db
    .select({ messageId: schema.telegramMessages.messageId })
    .from(schema.telegramMessages)
    .where(and(eq(schema.telegramMessages.chatId, chatId), eq(schema.telegramMessages.tradeId, tradeId), eq(schema.telegramMessages.kind, "trade")))
    .orderBy(desc(schema.telegramMessages.createdAt))
    .limit(1);
  if (card) await editTradeCard(ctx, card.messageId, tradeId, "done");
  await ctx.tg.sendMessage(chatId, "Note saved.");
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
    await ctx.tg.sendMessage(ctx.chatId!, `Synced: ${s.fills} fills, ${s.rebuild.trades} trades.${sent ? ` ${sent} new to journal.` : ""}`);
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

async function recordMessage(ctx: BotContext, messageId: number, tradeId: string, kind: "trade" | "note_prompt") {
  await ctx.db.insert(schema.telegramMessages).values({ chatId: ctx.chatId!, messageId, tradeId, kind, createdAt: ctx.now?.() ?? Date.now() });
}

export async function getState(db: Db, key: string): Promise<string | null> {
  const [row] = await db.select().from(schema.appState).where(eq(schema.appState.key, key));
  return row?.value ?? null;
}

export async function setState(db: Db, key: string, value: string): Promise<void> {
  await db.insert(schema.appState).values({ key, value }).onConflictDoUpdate({ target: schema.appState.key, set: { value } });
}
