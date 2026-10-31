"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { checkDeltaKey, removeDeltaKey, saveDeltaKey, sealPublicKey } from "@/lib/keys/credentials";
import { currentUserId } from "@/lib/session";

export interface DeltaKeyResult {
  ok: boolean;
  message: string;
}

/** Seals and stores the user's Delta key. The website cannot read it back; the sync server tests it within a minute. */
export async function connectDelta(apiKey: string, apiSecret: string): Promise<DeltaKeyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  const publicKey = sealPublicKey();
  if (!publicKey) return { ok: false, message: "Connecting Delta keys is not set up on the server yet." };
  const key = { apiKey: String(apiKey ?? "").trim(), apiSecret: String(apiSecret ?? "").trim() };
  const problem = checkDeltaKey(key.apiKey, key.apiSecret);
  if (problem) return { ok: false, message: problem };
  await saveDeltaKey(await getDb(), userId, key, publicKey);
  revalidatePath("/settings");
  return { ok: true, message: "Key saved and locked. The server will try it within a minute." };
}

/** Deletes the stored key. Synced trades and journal entries stay. */
export async function disconnectDelta(): Promise<DeltaKeyResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  await removeDeltaKey(await getDb(), userId);
  revalidatePath("/settings");
  return { ok: true, message: "Key deleted. Syncing has stopped; your trades and journal stay." };
}
