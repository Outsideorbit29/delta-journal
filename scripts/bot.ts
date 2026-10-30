// The Telegram journaling bot. Runs on your machine next to the web app:
//   npm run bot
// It long-polls Telegram (no public URL needed), syncs Delta every minute,
// and messages you each newly closed trade with buttons to journal it.

import { transcribe } from "ai";
import { getDb, type Db } from "@/db";
import { AI_MODELS, aiConfigured } from "@/lib/ai/models";
import { generateReview } from "@/lib/ai/review";
import { suggestFromNote } from "@/lib/ai/suggest";
import { syncAll } from "@/lib/sync";
import { TelegramApi, TelegramError } from "@/lib/telegram/api";
import {
  COMMANDS,
  getState,
  handleUpdate,
  maybeSendWeeklyReview,
  notifyClosedTrades,
  setState,
  type BotAi,
  type BotContext,
} from "@/lib/telegram/bot";

const POLL_TIMEOUT_SEC = 25;
const SYNC_EVERY_MS = Math.max(15, Number(process.env.TELEGRAM_SYNC_SECONDS) || 60) * 1000;
const STATE_OFFSET = "telegram.update_offset";

let stopping = false;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...args: unknown[]) => console.log(new Date().toLocaleTimeString("en-IN", { hour12: false }), ...args);
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Set TELEGRAM_BOT_TOKEN in .env.local (create a bot with @BotFather in Telegram).");
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || null;

  const db = await getDb();
  const ctx: BotContext = { db, tg: new TelegramApi(token), chatId, sync: () => syncAll(), ai: aiConfigured() ? botAi(db) : null };
  await ctx.tg.setCommands(COMMANDS);

  if (!chatId) {
    log("TELEGRAM_CHAT_ID is not set. Send /start to your bot in Telegram to get it.");
  } else {
    log(`Bot running for chat ${chatId}. Syncing Delta every ${SYNC_EVERY_MS / 1000}s. Ctrl+C to stop.`);
    log(ctx.ai ? "AI features on: voice notes, note suggestions and weekly reviews." : "AI features off (no AI_GATEWAY_API_KEY).");
    void syncLoop(ctx);
  }
  await pollLoop(ctx);
}

/** Receives button taps and messages. */
async function pollLoop(ctx: BotContext) {
  let offset = Number(await getState(ctx.db, STATE_OFFSET)) || 0;
  let failures = 0;
  while (!stopping) {
    try {
      const updates = await ctx.tg.getUpdates(offset, POLL_TIMEOUT_SEC);
      failures = 0;
      for (const update of updates) {
        try {
          await handleUpdate(ctx, update);
        } catch (err) {
          log("Could not handle update:", message(err));
        }
        offset = update.update_id + 1;
        await setState(ctx.db, STATE_OFFSET, String(offset));
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

/** Pulls new data from Delta and announces newly closed trades. */
async function syncLoop(ctx: BotContext) {
  let lastError: string | null = null;
  while (!stopping) {
    try {
      await ctx.sync();
      const sent = await notifyClosedTrades(ctx);
      if (sent) log(`Sent ${sent} trade(s) to journal.`);
      if (await maybeSendWeeklyReview(ctx)) log("Sent the weekly review.");
      if (lastError) {
        await ctx.tg.sendMessage(ctx.chatId!, "Delta sync is working again.");
        lastError = null;
      }
    } catch (err) {
      const text = message(err);
      log("Sync failed:", text);
      // Tell you once per distinct problem (for example a new IP to whitelist), not every minute.
      if (text !== lastError) {
        lastError = text;
        await ctx.tg.sendMessage(ctx.chatId!, `Delta sync failed: ${text.replace(/[<>&]/g, "")}`).catch(() => {});
      }
    }
    await sleep(SYNC_EVERY_MS);
  }
}

/** The AI calls the bot makes, all through AI Gateway. */
function botAi(db: Db): BotAi {
  return {
    transcribe: async (audio) => (await transcribe({ model: AI_MODELS.transcribe, audio })).text,
    suggest: (note, trade) => suggestFromNote(note, trade),
    review: (days) => generateReview(db, days),
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
