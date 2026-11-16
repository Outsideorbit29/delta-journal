// The Hardwon Telegram bot and sync worker. Runs on the fixed-IP server:
//   npm run bot
// It long-polls Telegram (no public URL needed) for every user's linked chat,
// syncs every connected Delta account each minute, and tells each user about
// their own newly closed trades, weekly review and sync problems, by Telegram
// and phone notification.

import { transcribe } from "ai";
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "@/db";
import { AI_MODELS, aiConfigured } from "@/lib/ai/models";
import { generateReview } from "@/lib/ai/review";
import { suggestFromNote } from "@/lib/ai/suggest";
import { DeltaClient } from "@/lib/delta/client";
import { errorsToAlert, markAlerted, pruneAppErrors, renderErrorAlert } from "@/lib/app-errors";
import { markFeedbackDelivered, renderFeedback, undeliveredFeedback } from "@/lib/feedback";
import { recordHeartbeat } from "@/lib/health";
import { sealPrivateKey } from "@/lib/keys/credentials";
import { mergeSyncResults, syncDhanAccounts, type SyncOutcome } from "@/lib/keys/sync-brokers";
import { hasStoredKey, syncStoredKeys, syncWithStoredKey, type UserSyncResult } from "@/lib/keys/sync-users";
import { pushConfigured, sendPush } from "@/lib/push";
import { ownerUserId } from "@/lib/runtime";
import { syncAll } from "@/lib/sync";
import { TelegramApi, TelegramError } from "@/lib/telegram/api";
import {
  COMMANDS,
  MAX_CARDS_PER_RUN,
  getState,
  maybeSendJournalReminder,
  maybeSendWeeklyReview,
  notifyClosedTrades,
  notifySyncProblem,
  routeUpdate,
  setState,
  type BotAi,
  type BotContext,
  type SharedBot,
} from "@/lib/telegram/bot";
import { adoptOwnerChat, chatForUser } from "@/lib/telegram/links";

const POLL_TIMEOUT_SEC = 25;
const SYNC_EVERY_MS = Math.max(15, Number(process.env.TELEGRAM_SYNC_SECONDS) || 60) * 1000;
/**
 * How far the bot has read Telegram's updates. Update ids count per bot, so the
 * key carries the bot's id (the token's number before the colon): a new bot
 * starts from zero instead of skipping its first updates.
 */
const offsetKey = (token: string) => `telegram.update_offset:${token.split(":")[0]}`;

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...args: unknown[]) => console.log(new Date().toLocaleTimeString("en-IN", { hour12: false }), ...args);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in .env.local (create a bot with @BotFather in Telegram).");

  const db = await getDb();
  const tg = new TelegramApi(token);
  const owner = ownerUserId();
  const ai = aiConfigured();
  const push = pushConfigured();
  const context = (userId: string, chatId: string | null): BotContext => ({
    userId,
    db,
    tg,
    chatId,
    sync: () => syncUser(db, userId, owner),
    ai: ai ? botAi(db, userId) : null,
    push: push ? (m) => sendPush(db, userId, m) : null,
  });
  const bot: SharedBot = { db, tg, context };
  await tg.setCommands(COMMANDS);

  // The chat the bot served before accounts could link their own becomes the owner's.
  const legacyChat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (legacyChat && (await adoptOwnerChat(db, owner, legacyChat))) log(`Linked TELEGRAM_CHAT_ID to the owner (${owner}).`);

  log(`Bot running. Syncing Delta every ${SYNC_EVERY_MS / 1000}s; the owner is ${owner}. Ctrl+C to stop.`);
  log(ai ? "AI features on: voice notes, note suggestions and weekly reviews." : "AI features off (no AI_GATEWAY_API_KEY).");
  log(push ? "Phone notifications on." : "Phone notifications off (no VAPID keys).");
  log(sealPrivateKey() ? "Syncing every user who connected a Delta key." : "Only syncing the owner (no DELTA_KEYS_PRIVATE_KEY).");
  void syncLoop(db, owner, context);
  await pollLoop(bot, token);
}

/** Receives every chat's button taps and messages. */
async function pollLoop(bot: SharedBot, token: string) {
  const STATE_OFFSET = offsetKey(token);
  let offset = Number(await getState(bot.db, STATE_OFFSET)) || 0;
  let failures = 0;
  while (!stopping) {
    try {
      const updates = await bot.tg.getUpdates(offset, POLL_TIMEOUT_SEC);
      failures = 0;
      for (const update of updates) {
        try {
          await routeUpdate(bot, update);
        } catch (err) {
          log("Could not handle update:", message(err));
        }
        offset = update.update_id + 1;
        await setState(bot.db, STATE_OFFSET, String(offset));
      }
    } catch (err) {
      if (err instanceof TelegramError && err.code === 401) throw new Error("Telegram rejected TELEGRAM_BOT_TOKEN. Check it in .env.local.");
      if (err instanceof TelegramError && err.code === 409) throw new Error("Another copy of the bot is already running. Stop it first.");
      failures++;
      log("Telegram poll failed:", message(err));
      await sleep(Math.min(60_000, 2_000 * 2 ** Math.min(failures, 5)));
    }
  }
}

/**
 * Syncs one user. The owner uses their own stored key once they connect one
 * in Settings, and until then the server's key from .env.local (DELTA_API_KEY).
 */
async function syncUser(db: Db, userId: string, owner: string) {
  const privateKey = sealPrivateKey();
  if (privateKey && (await hasStoredKey(db, userId))) return syncWithStoredKey(db, userId, privateKey);
  if (userId === owner) return syncAll(userId, DeltaClient.fromEnv());
  throw new Error("No Delta key is connected. Connect one in Hardwon → Settings.");
}

/**
 * The owner first, then everyone else who connected a Delta key, then every connected Dhan account; one result
 * per user. One user's failure never stops the others.
 */
async function syncEveryone(db: Db, owner: string): Promise<SyncOutcome[]> {
  const results: UserSyncResult[] = [];
  try {
    results.push({ userId: owner, summary: await syncUser(db, owner, owner) });
  } catch (err) {
    results.push({ userId: owner, error: message(err) });
  }
  const privateKey = sealPrivateKey();
  if (privateKey) results.push(...(await syncStoredKeys(db, privateKey, { skip: [owner] })));
  const dhan = privateKey ? await syncDhanAccounts(db, privateKey) : [];
  for (const r of dhan) if (r.renewed) log(`Renewed the Dhan token for ${r.userId}.`);
  return mergeSyncResults(results, dhan);
}

/**
 * Each minute: sync everyone, then tell each user about their own new closes,
 * sync problems and (on Sunday evening) their weekly review.
 */
async function syncLoop(db: Db, owner: string, context: (userId: string, chatId: string | null) => BotContext) {
  // The last sync error each user was told about. Seeded from the stored keys,
  // so a restart does not repeat a problem users already know about.
  const told = new Map<string, string>();
  const lastErrors = new Map<string, string[]>();
  for (const k of await db.select().from(schema.deltaCredentials).where(eq(schema.deltaCredentials.status, "error"))) {
    if (k.lastError) lastErrors.set(k.userId, [k.lastError]);
  }
  for (const k of await db.select().from(schema.brokerCredentials).where(eq(schema.brokerCredentials.status, "error"))) {
    if (k.lastError) lastErrors.set(k.userId, [...(lastErrors.get(k.userId) ?? []), k.lastError]);
  }
  for (const [userId, errors] of lastErrors) told.set(userId, errors.join("\n"));
  // Users whose closes still need checking: everyone once after a start, then
  // only after a sync wrote something, or when the last check hit its cap.
  const unchecked = new Set<string>();
  const seen = new Set<string>();

  while (!stopping) {
    let results: SyncOutcome[] = [];
    try {
      results = await syncEveryone(db, owner);
    } catch (err) {
      log("Sync round failed:", message(err));
    }
    for (const r of results) {
      try {
        const ctx = context(r.userId, await chatForUser(db, r.userId));
        if (!ctx.push || !(await hasDevice(db, r.userId))) ctx.push = null;

        const error = r.error ?? null;
        const previous = told.get(r.userId) ?? null;
        if (error !== previous) log(error ? `Sync failed for ${r.userId}: ${error}` : `Sync works again for ${r.userId}.`);
        await notifySyncProblem(ctx, error, previous);
        if (error) told.set(r.userId, error);
        else told.delete(r.userId);

        if (!seen.has(r.userId)) {
          seen.add(r.userId);
          unchecked.add(r.userId);
        }
        if (r.rebuilt) unchecked.add(r.userId);
        if (unchecked.has(r.userId)) {
          const sent = await notifyClosedTrades(ctx);
          if (sent) log(`Announced ${sent} closed trade(s) to ${r.userId}.`);
          if (sent < MAX_CARDS_PER_RUN) unchecked.delete(r.userId);
        }
        if (await maybeSendWeeklyReview(ctx)) log(`Sent the weekly review to ${r.userId}.`);
        const toJournal = await maybeSendJournalReminder(ctx);
        if (toJournal) log(`Reminded ${r.userId} about ${toJournal} trade(s) to journal.`);
      } catch (err) {
        log(`Notifying ${r.userId} failed:`, message(err));
      }
    }
    // For /api/health: an outside monitor alerts when these stop.
    await recordHeartbeat(db, { at: Date.now(), users: results.length, failing: results.filter((r) => r.error).length }).catch((err) =>
      log("Could not record the heartbeat:", message(err)),
    );
    await alertOwnerOfErrors(db, owner, context).catch((err) => log("Could not check website errors:", message(err)));
    await forwardFeedback(db, owner, context).catch((err) => log("Could not forward feedback:", message(err)));
    await sleep(SYNC_EVERY_MS);
  }
}

/** Tells the owner on Telegram about new server errors on the website (recorded by src/instrumentation.ts). */
async function alertOwnerOfErrors(db: Db, owner: string, context: (userId: string, chatId: string | null) => BotContext) {
  await pruneAppErrors(db);
  const rows = await errorsToAlert(db);
  if (!rows.length) return;
  const chatId = await chatForUser(db, owner);
  if (!chatId) return; // kept until the owner links a chat
  await context(owner, chatId).tg.sendMessage(chatId, renderErrorAlert(rows));
  await markAlerted(db, rows.map((r) => r.key));
  log(`Told the owner about ${rows.length} website error(s).`);
}

/** Sends the owner each new piece of user feedback on Telegram, once (from Settings → Feedback or /feedback). */
async function forwardFeedback(db: Db, owner: string, context: (userId: string, chatId: string | null) => BotContext) {
  const rows = await undeliveredFeedback(db);
  if (!rows.length) return;
  const chatId = await chatForUser(db, owner);
  if (!chatId) return; // kept until the owner links a chat
  const tg = context(owner, chatId).tg;
  for (const row of rows) {
    await tg.sendMessage(chatId, renderFeedback(row));
    await markFeedbackDelivered(db, [row.id]);
  }
  log(`Forwarded ${rows.length} feedback message(s) to the owner.`);
}

/** Whether the user turned on phone notifications on any device. */
async function hasDevice(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ endpoint: schema.pushSubscriptions.endpoint })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId))
    .limit(1);
  return !!row;
}

/** The AI calls the bot makes for one user, all through AI Gateway. */
function botAi(db: Db, userId: string): BotAi {
  return {
    transcribe: async (audio) => (await transcribe({ model: AI_MODELS.transcribe, audio })).text,
    suggest: (note, trade) => suggestFromNote(note, trade),
    review: (days) => generateReview(db, userId, days),
  };
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("Stopping.");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(message(err));
  process.exit(1);
});
