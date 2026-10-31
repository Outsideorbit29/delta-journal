import { LEGACY_USER } from "@/db/schema";

/**
 * Syncing with Delta needs an API key whitelisted to a fixed IP, so it runs on
 * the server (the bot) or the owner's local app, never on the hosted app.
 */
export const canSyncHere = () => !process.env.VERCEL;

export const SYNC_ELSEWHERE = "Syncing with Delta runs on the Edgebook server, not here.";

/**
 * The account the PC's own Delta key (DELTA_API_KEY) belongs to: the owner's
 * Clerk user id, set as OWNER_USER_ID once the owner has signed up and claimed
 * the legacy data. Until then it is the legacy owner.
 */
export const ownerUserId = () => process.env.OWNER_USER_ID?.trim() || LEGACY_USER;
