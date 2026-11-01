import { AutoRefresh } from "@/components/auto-refresh";
import { DeltaKeyForm } from "@/components/delta-key-form";
import { formatDateTime } from "@/lib/format";
import type { DeltaKeyStatus } from "@/lib/keys/credentials";
import { syncServerIps } from "@/lib/runtime";
import { explainSyncError } from "@/lib/sync-errors";

/** How to create a Delta key, the IPs to whitelist, the key form and its status. Used by Settings and onboarding. */
export function DeltaConnect({ status, syncedBefore }: { status: DeltaKeyStatus | null; syncedBefore: boolean }) {
  return (
    <div className="space-y-8">
      <KeyStatus status={status} syncedBefore={syncedBefore} />
      {status?.status === "pending" && <AutoRefresh />}
      <ol className="list-decimal space-y-3 pl-6 text-base text-ink-2 marker:font-[family-name:var(--font-display)] marker:text-ink">
        <li>On Delta Exchange India, open your account&apos;s API keys page and create a new key.</li>
        <li>
          Give it the <strong>Read Data</strong> permission only. Edgebook never places orders, so never give it Trading.
        </li>
        <li>
          Whitelist our sync server&apos;s addresses on the key (Delta requires a whitelist):
          <ul className="mt-1 space-y-1">
            {syncServerIps().map((ip) => (
              <li key={ip}>
                <code className="face-label inline-block bg-paper-2 px-2 py-1 text-sm text-ink select-all">{ip}</code>
              </li>
            ))}
          </ul>
        </li>
        <li>Paste the key and the secret below.</li>
      </ol>
      <DeltaKeyForm connected={!!status} />
      <p className="max-w-[60ch] text-sm text-muted">
        Your key is locked the moment you save it. This website can store it but can never unlock it; only our sync server can, and it
        only reads your trades.
      </p>
    </div>
  );
}

function KeyStatus({ status, syncedBefore }: { status: DeltaKeyStatus | null; syncedBefore: boolean }) {
  if (!status) {
    return (
      <p className="face-label text-base text-ink-2">
        {syncedBefore ? "Syncing with a key set up on the server. Connect your own key below to replace it." : "Not connected yet."}
      </p>
    );
  }
  const key = <code className="face-label text-ink">…{status.keyHint}</code>;
  if (status.status === "pending")
    return <p className="face-label text-base text-ink-2">Key {key} saved. Checking it with Delta now; this page updates by itself within a minute.</p>;
  if (status.status === "ok")
    return (
      <p className="face-label text-base text-ink">
        Connected with key {key}
        {status.checkedAt ? `, last synced ${formatDateTime(status.checkedAt)} IST` : ""}.
      </p>
    );
  return (
    <div className="bg-warn-soft px-5 py-4 text-warn">
      <p className="face-label text-base font-medium">Key {key} is not working</p>
      <p className="mt-1 text-base text-ink-2">{explainSyncError(status.lastError ?? "")}</p>
    </div>
  );
}
