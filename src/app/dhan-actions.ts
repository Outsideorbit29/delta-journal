"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { ensureAccount } from "@/lib/accounts";
import { DhanApiError, DhanClient, tokenExpiry } from "@/lib/dhan/client";
import { checkDhanCredentials, removeBrokerCredentials, saveDhanCredentials } from "@/lib/keys/brokers";
import { sealPublicKey } from "@/lib/keys/credentials";
import { rateLimit, tooMany } from "@/lib/rate-limit";
import { currentUserId } from "@/lib/session";

export interface DhanResult {
  ok: boolean;
  message: string;
}

/**
 * Checks the token with Dhan (reading needs no whitelisted IP, so the website can), then seals and stores it.
 * The website cannot read it back; the sync server syncs with it within a minute and keeps it renewed.
 */
export async function connectDhan(clientId: string, accessToken: string): Promise<DhanResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  const publicKey = sealPublicKey();
  if (!publicKey) return { ok: false, message: "Connecting Dhan is not set up on the server yet." };
  const credentials = { clientId: String(clientId ?? "").trim(), accessToken: String(accessToken ?? "").replace(/\s+/g, "") };
  const problem = checkDhanCredentials(credentials.clientId, credentials.accessToken);
  if (problem) return { ok: false, message: problem };
  const db = await getDb();
  const limit = await rateLimit(db, userId, "dhan.connect");
  if (!limit.ok) return { ok: false, message: tooMany(limit) };

  let expiresAt: number | null;
  try {
    const profile = await new DhanClient(credentials).profile();
    if (String(profile.dhanClientId) !== credentials.clientId) {
      return { ok: false, message: "That token belongs to a different Dhan client ID. Check the client ID on your Dhan profile." };
    }
    expiresAt = tokenExpiry(profile);
  } catch (err) {
    if (err instanceof DhanApiError && err.isAuth) {
      return { ok: false, message: "Dhan didn't accept that token: it is wrong or has expired. Generate a new one on web.dhan.co." };
    }
    return { ok: false, message: "Couldn't reach Dhan to check the token. Try again in a minute." };
  }

  await ensureAccount(db, userId, "dhan");
  await saveDhanCredentials(db, userId, credentials, publicKey, { expiresAt });
  revalidatePath("/settings");
  return { ok: true, message: "Dhan accepted the token. It is locked now; your trades arrive within a minute." };
}

/** Deletes the stored token. Synced trades and journal entries stay. */
export async function disconnectDhan(): Promise<DhanResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  await removeBrokerCredentials(await getDb(), userId, "dhan");
  revalidatePath("/settings");
  return { ok: true, message: "Dhan disconnected. Syncing has stopped; your trades and journal stay." };
}
