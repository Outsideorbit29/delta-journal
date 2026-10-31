import { AutoRefresh } from "@/components/auto-refresh";
import { DeltaKeyForm } from "@/components/delta-key-form";
import { formatDateTime } from "@/lib/format";
import type { DeltaKeyStatus } from "@/lib/keys/credentials";
import { syncServerIps } from "@/lib/runtime";

/** How to create a Delta key, the IPs to whitelist, the key form and its status. Used by Settings and onboarding. */
export function DeltaConnect({ status, syncedBefore }: { status: DeltaKeyStatus | null; syncedBefore: boolean }) {
  return (
    <div className="space-y-4">
      <KeyStatus status={status} syncedBefore={syncedBefore} />
      {status?.status === "pending" && <AutoRefresh />}
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
      <DeltaKeyForm connected={!!status} />
      <p className="text-xs text-zinc-500">
        Your key is locked the moment you save it. This website can store it but can never unlock it; only our sync server can, and it
        only reads your trades.
      </p>
    </div>
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
    return <p className="text-sm text-zinc-500">Key {key} saved. Checking it with Delta now; this page updates by itself within a minute.</p>;
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
