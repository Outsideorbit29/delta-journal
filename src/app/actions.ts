"use server";

import { revalidatePath } from "next/cache";
import { DeltaApiError } from "@/lib/delta/client";
import { syncAll } from "@/lib/sync";

export interface SyncResult {
  ok: boolean;
  message: string;
}

export async function syncNow(): Promise<SyncResult> {
  try {
    const s = await syncAll();
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: `Synced ${s.fills} fills, ${s.orders} orders and ${s.walletTransactions} wallet records. ${s.rebuild.trades} trades rebuilt.`,
    };
  } catch (err) {
    return { ok: false, message: explain(err) };
  }
}

function explain(err: unknown): string {
  if (err instanceof DeltaApiError) {
    if (err.code === "ip_not_whitelisted_for_api_key") {
      const ip = (err.context as { client_ip?: string } | undefined)?.client_ip;
      return `Delta rejected this IP${ip ? ` (${ip})` : ""}. Whitelist it for your API key on Delta and sync again.`;
    }
    if (err.code === "invalid_api_key" || err.code === "Signature Mismatch" || err.code === "SignatureExpired") {
      return `Delta rejected the API key (${err.code}). Check DELTA_API_KEY and DELTA_API_SECRET in .env.local.`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
