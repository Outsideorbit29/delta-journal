import Link from "next/link";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { getSyncStatus } from "@/lib/queries";
import { currentUserId } from "@/lib/session";
import { explainSyncError, formatAgo } from "@/lib/sync-errors";

/** The sync state in the slab, in words: synced recently, a problem, or not connected. Links to Settings. */
export async function SyncStatus() {
  const userId = await currentUserId();
  if (!userId) return null;
  const [sync, key] = await Promise.all([getSyncStatus(userId), getDb().then((db) => getDeltaKeyStatus(db, userId))]);
  const error = sync.find((s) => s.lastError)?.lastError ?? (key?.status === "error" ? key.lastError : null);
  const lastOk = Math.max(0, ...sync.filter((s) => !s.lastError).map((s) => s.lastRunAt ?? 0));

  const [tone, label, title] = error
    ? ["text-warn", "Sync problem", explainSyncError(error)]
    : lastOk
      ? ["text-muted", `Synced ${formatAgo(lastOk, undefined, formatDateTime)}`, `Last synced with Delta ${formatDateTime(lastOk)} IST`]
      : ["text-muted", "Not connected", "Connect your Delta account in Settings"];

  return (
    <Link href="/settings" title={title} className={`face-label text-sm whitespace-nowrap no-underline hover:text-ink max-sm:hidden ${tone}`}>
      {label}
    </Link>
  );
}
