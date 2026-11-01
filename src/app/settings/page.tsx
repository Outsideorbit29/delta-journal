import { connection } from "next/server";
import { AutoRefresh } from "@/components/auto-refresh";
import { DeltaConnect } from "@/components/delta-connect";
import { PushSettings } from "@/components/push-settings";
import { TelegramConnect } from "@/components/telegram-connect";
import { getDb } from "@/db";
import { aiConfigured } from "@/lib/ai/models";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { vapidPublicKey } from "@/lib/push";
import { getSyncStatus } from "@/lib/queries";
import { requireUserId } from "@/lib/session";
import { explainSyncError } from "@/lib/sync-errors";
import { getTelegramLink } from "@/lib/telegram/links";

export default async function SettingsPage() {
  await connection();
  const userId = await requireUserId();
  const db = await getDb();
  const [sync, key, telegram] = await Promise.all([getSyncStatus(userId), getDeltaKeyStatus(db, userId), getTelegramLink(db, userId)]);
  const lastRun = Math.max(0, ...sync.map((s) => s.lastRunAt ?? 0));
  const error = sync.find((s) => s.lastError)?.lastError;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h2 className="font-semibold">Delta Exchange</h2>
        <DeltaConnect status={key} syncedBefore={lastRun > 0} />
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h2 className="font-semibold">Telegram</h2>
        {/* Remounts once the chat links, so the one-time link disappears. */}
        <TelegramConnect key={telegram.linkedAt ?? "none"} linked={telegram.linked} chatName={telegram.chatName} />
        {telegram.waiting && <AutoRefresh />}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div>
          <h2 className="font-semibold">Notifications on this device</h2>
          <p className="text-sm text-zinc-500">
            Get a notification when a trade closes (tap it to journal), when your weekly review is ready, and when syncing with Delta stops working.
          </p>
        </div>
        <PushSettings publicKey={vapidPublicKey()} />
      </section>

      <section className="space-y-1 p-4 text-sm rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h2 className="mb-2 font-semibold">Status</h2>
        <p>
          <span className="text-zinc-500">Last sync with Delta: </span>
          {lastRun ? `${formatDateTime(lastRun)} IST` : "never"}
          {error && <span className="block text-amber-300">{explainSyncError(error)}</span>}
        </p>
        <p>
          <span className="text-zinc-500">Syncing runs: </span>
          on the Edgebook server, every minute
        </p>
        <p>
          <span className="text-zinc-500">AI features: </span>
          {aiConfigured() ? "on" : "off (no AI_GATEWAY_API_KEY)"}
        </p>
      </section>
    </main>
  );
}
