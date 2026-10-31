import { connection } from "next/server";
import { DeltaKeyForm } from "@/components/delta-key-form";
import { PushSettings } from "@/components/push-settings";
import { getDb } from "@/db";
import { aiConfigured } from "@/lib/ai/models";
import { formatDateTime } from "@/lib/format";
import { getDeltaKeyStatus, type DeltaKeyStatus } from "@/lib/keys/credentials";
import { vapidPublicKey } from "@/lib/push";
import { getSyncStatus } from "@/lib/queries";
import { syncServerIps } from "@/lib/runtime";
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
        <div>
          <h2 className="font-semibold">Delta Exchange</h2>
          <KeyStatus status={key} syncedBefore={lastRun > 0} />
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>On Delta Exchange India, open your account&apos;s API keys page and create a new key.</li>
          <li>
            Give it the <strong>Read Data</strong> permission only. Edgebook never places orders, so never give it Trading.
          </li>
          <li>
            Whitelist our sync server&apos;s addresses on the key (Delta requires a whitelist):
            <ul className="mt-1 space-y-1">
              {syncServerIps().map((ip) => (
                <li key={ip}>
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs select-all dark:bg-zinc-800">{ip}</code>
                </li>
              ))}
            </ul>
          </li>
          <li>Paste the key and the secret below.</li>
        </ol>
        <DeltaKeyForm connected={!!key} />
        <p className="text-xs text-zinc-500">
          Your key is locked the moment you save it. This website can store it but can never unlock it; only our sync server can, and
          it only reads your trades.
        </p>
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

function KeyStatus({ status, syncedBefore }: { status: DeltaKeyStatus | null; syncedBefore: boolean }) {
  if (!status) {
    return (
      <p className="text-sm text-zinc-500">
        {syncedBefore ? "Syncing with a key set up on the server. Connect your own key below to replace it." : "Not connected yet."}
      </p>
    );
  }
  const key = <code className="text-xs">…{status.keyHint}</code>;
  if (status.status === "pending")
    return <p className="text-sm text-zinc-500">Key {key} saved. The server tries it within a minute; refresh this page to see the result.</p>;
  if (status.status === "ok")
    return (
      <p className="text-sm text-zinc-500">
        Connected with key {key}
        {status.checkedAt ? `, last synced ${formatDateTime(status.checkedAt)} IST` : ""}.
      </p>
    );
  return (
    <p className="text-sm text-rose-600 dark:text-rose-400">
      Key {key} is not working: {status.lastError}
    </p>
  );
}
