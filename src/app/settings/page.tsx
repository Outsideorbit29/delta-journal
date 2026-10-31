import { connection } from "next/server";
import { PushSettings } from "@/components/push-settings";
import { aiConfigured } from "@/lib/ai/models";
import { formatDateTime } from "@/lib/format";
import { vapidPublicKey } from "@/lib/push";
import { getSyncStatus } from "@/lib/queries";
import { canSyncHere } from "@/lib/runtime";

export default async function SettingsPage() {
  await connection();
  const sync = await getSyncStatus();
  const lastRun = Math.max(0, ...sync.map((s) => s.lastRunAt ?? 0));
  const error = sync.find((s) => s.lastError)?.lastError;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

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
          {canSyncHere() ? "here (and in the bot)" : "on your PC (npm run bot), because your Delta key is whitelisted to its IP"}
        </p>
        <p>
          <span className="text-zinc-500">AI features: </span>
          {aiConfigured() ? "on" : "off (no AI_GATEWAY_API_KEY)"}
        </p>
      </section>
    </main>
  );
}
