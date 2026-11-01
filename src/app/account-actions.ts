"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { DELETE_CONFIRMATION, deleteAccountData } from "@/lib/account";
import { currentUserId } from "@/lib/session";

export interface AccountActionResult {
  ok: boolean;
  message: string;
}

/**
 * Erases all of the user's data, then their sign-in. The data goes first: if
 * removing the sign-in fails, they are left with an empty account they can
 * delete again, never with data and no way in.
 */
export async function deleteMyAccount(confirmation: string): Promise<AccountActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, message: "Sign in first." };
  if (String(confirmation ?? "").trim() !== DELETE_CONFIRMATION) return { ok: false, message: `Type ${DELETE_CONFIRMATION} to confirm.` };
  await deleteAccountData(await getDb(), userId);
  try {
    await (await clerkClient()).users.deleteUser(userId);
  } catch {
    return { ok: false, message: "Your data was deleted, but your sign-in could not be removed. Try again, or email us to finish it." };
  }
  return { ok: true, message: "Your account and all its data are deleted." };
}
