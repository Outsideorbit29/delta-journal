import { connection } from "next/server";
import { DeltaConnect } from "@/components/delta-connect";
import { PushSettings } from "@/components/push-settings";
import { getDb } from "@/db";
import { aiConfigured } from "@/lib/ai/models";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { vapidPublicKey } from "@/lib/push";
import { getSyncStatus } from "@/lib/queries";
import { requireUserId } from "@/lib/session";

export default async function SettingsPage() {
  await connection();
  const userId = await requireUserId();
  const [sync, key] = await Promise.all([getSyncStatus(userId), getDb().then((db) => getDeltaKeyStatus(db, userId))]);
  const lastRun = Math.max(0, ...sync.map((s) => s.lastRunAt ?? 0));
  const error = sync.find((s) => s.lastError)?.lastError;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold">Delta Exchange</h2>
        <DeltaConnect status={key} syncedBefore={lastRun > 0} />
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="font-semibold">Notifications on this device</h2>
          <p className="text-sm text-zinc-500">
            Get a notification when a trade closes (tap it to journal), when your weekly review is ready, and when syncing with Delta stops working.
          </p>
        </div>
        <PushSettings publicKey={vapidPublicKey()} />
      </section>

      <section className="space-y-1 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-semibold">Status</h2>
        <p>
          <span className="text-zinc-500">Last sync with Delta: </span>
          {lastRun ? `${formatDateTime(lastRun)} IST` : "never"}
          {error && <span className="text-rose-600 dark:text-rose-400"> · failed: {error}</span>}
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
