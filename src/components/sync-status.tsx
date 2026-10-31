import Link from "next/link";
import { getDb } from "@/db";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { getSyncStatus } from "@/lib/queries";
import { currentUserId } from "@/lib/session";
import { explainSyncError, formatAgo } from "@/lib/sync-errors";

/** A small pill in the header: synced recently (green), a problem (amber), or not connected. Links to Settings. */
export async function SyncStatus() {
  const userId = await currentUserId();
  if (!userId) return null;
  const [sync, key] = await Promise.all([getSyncStatus(userId), getDb().then((db) => getDeltaKeyStatus(db, userId))]);
  const error = sync.find((s) => s.lastError)?.lastError ?? (key?.status === "error" ? key.lastError : null);
  const lastOk = Math.max(0, ...sync.filter((s) => !s.lastError).map((s) => s.lastRunAt ?? 0));

  const [dot, label, title] = error
    ? ["bg-amber-400", "Sync problem", explainSyncError(error)]
    : lastOk
      ? ["bg-emerald-400", `Synced ${formatAgo(lastOk, undefined, formatDateTime)}`, `Last synced with Delta ${formatDateTime(lastOk)} IST`]
      : ["bg-zinc-500", "Not connected", "Connect your Delta account in Settings"];

  return (
    <Link
      href="/settings"
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
    >
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      <span className="max-sm:sr-only">{label}</span>
    </Link>
  );
}
