import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { schema, type Db } from "@/db";

// Every Edgebook user shares one Telegram bot. A user links their private chat
// by opening a one-time link from Settings (t.me/<bot>?start=<code>): the bot
// receives "/start <code>" from that chat and ties the chat to the user.
// Only the code's hash is stored, and a code works once, for 15 minutes.

export const LINK_CODE_TTL_MS = 15 * 60_000;

/**
 * The per-user watermark for trade notifications. Linking or unlinking a chat
 * resets it to "now", so a newly linked chat is not flooded with old trades.
 */
export const STATE_NOTIFY_SINCE = "telegram.notify_since";

/** The bot's @username, for t.me links. The website never holds the bot token. */
export const telegramBotUsername = () => process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") || "Jornalling_bot";

export const linkUrl = (code: string) => `https://t.me/${telegramBotUsername()}?start=${code}`;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/** Telegram allows 1-64 characters of A-Z, a-z, 0-9, _ and - after /start. */
const CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export interface TelegramLinkStatus {
  chatName: string | null;
  linkedAt: number | null;
  linked: boolean;
  /** A link code was made and has not expired or been used yet. */
  waiting: boolean;
}

/** Makes a new one-time code for the user, replacing any earlier one. A linked chat stays linked until the code is used. */
export async function createLinkCode(db: Db, userId: string, now = Date.now()): Promise<string> {
  const code = randomBytes(16).toString("base64url");
  const update = { codeHash: hash(code), codeExpiresAt: now + LINK_CODE_TTL_MS };
  await db
    .insert(schema.telegramLinks)
    .values({ userId, ...update })
    .onConflictDoUpdate({ target: schema.telegramLinks.userId, set: update });
  return code;
}

/**
 * Uses a code sent from a chat: the chat becomes the code owner's, and leaves
 * any other user it was linked to. Returns the user, or null for an unknown,
 * used or expired code.
 */
export async function redeemLinkCode(db: Db, code: string, chatId: string, chatName: string | null, now = Date.now()): Promise<string | null> {
  if (!CODE_PATTERN.test(code)) return null;
  const [row] = await db
    .select({ userId: schema.telegramLinks.userId })
    .from(schema.telegramLinks)
    .where(and(eq(schema.telegramLinks.codeHash, hash(code)), gt(schema.telegramLinks.codeExpiresAt, now)));
  if (!row) return null;
  await db.transaction(async (tx) => {
    const previous = await tx
      .select({ userId: schema.telegramLinks.userId })
      .from(schema.telegramLinks)
      .where(eq(schema.telegramLinks.chatId, chatId));
    for (const p of previous) if (p.userId !== row.userId) await clearChat(tx, p.userId, now);
    await tx
      .update(schema.telegramLinks)
      .set({ chatId, chatName, linkedAt: now, codeHash: null, codeExpiresAt: null })
      .where(eq(schema.telegramLinks.userId, row.userId));
    await resetNotifications(tx, row.userId, now);
  });
  return row.userId;
}

/** The user a chat is linked to, or null. */
export async function userForChat(db: Db, chatId: string): Promise<string | null> {
  const [row] = await db.select({ userId: schema.telegramLinks.userId }).from(schema.telegramLinks).where(eq(schema.telegramLinks.chatId, chatId));
  return row?.userId ?? null;
}

/** The user's linked chat, or null. */
export async function chatForUser(db: Db, userId: string): Promise<string | null> {
  const [row] = await db.select({ chatId: schema.telegramLinks.chatId }).from(schema.telegramLinks).where(eq(schema.telegramLinks.userId, userId));
  return row?.chatId ?? null;
}

/** What Settings shows. Never includes the chat id or the code. */
export async function getTelegramLink(db: Db, userId: string, now = Date.now()): Promise<TelegramLinkStatus> {
  const [row] = await db.select().from(schema.telegramLinks).where(eq(schema.telegramLinks.userId, userId));
  return {
    chatName: row?.chatId ? row.chatName : null,
    linkedAt: row?.chatId ? row.linkedAt : null,
    linked: !!row?.chatId,
    waiting: !!row?.codeHash && (row.codeExpiresAt ?? 0) > now,
  };
}

/** Disconnects the user's chat and drops any waiting code. The journal stays. */
export async function unlinkTelegram(db: Db, userId: string, now = Date.now()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(schema.telegramLinks).where(eq(schema.telegramLinks.userId, userId));
    await resetNotifications(tx, userId, now);
  });
}

/**
 * Before accounts could link chats, the bot served one chat (TELEGRAM_CHAT_ID)
 * for the owner. This links that chat to the owner once, without resetting
 * their notifications, unless either is already linked.
 */
export async function adoptOwnerChat(db: Db, userId: string, chatId: string, now = Date.now()): Promise<boolean> {
  if ((await chatForUser(db, userId)) || (await userForChat(db, chatId))) return false;
  const update = { chatId, linkedAt: now };
  await db
    .insert(schema.telegramLinks)
    .values({ userId, ...update })
    .onConflictDoUpdate({ target: schema.telegramLinks.userId, set: update });
  return true;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function clearChat(tx: Tx, userId: string, now: number) {
  await tx.update(schema.telegramLinks).set({ chatId: null, chatName: null, linkedAt: null }).where(eq(schema.telegramLinks.userId, userId));
  await resetNotifications(tx, userId, now);
}

async function resetNotifications(tx: Tx, userId: string, now: number) {
  await tx
    .insert(schema.appState)
    .values({ userId, key: STATE_NOTIFY_SINCE, value: String(now) })
    .onConflictDoUpdate({ target: [schema.appState.userId, schema.appState.key], set: { value: String(now) } });
}
