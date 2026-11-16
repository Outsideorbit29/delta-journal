import { AutoRefresh } from "@/components/auto-refresh";
import { DhanForm } from "@/components/dhan-form";
import { formatDateTime } from "@/lib/format";
import type { BrokerStatus } from "@/lib/keys/brokers";
import { explainSyncError } from "@/lib/sync-errors";

/** How to get a Dhan access token, the form, and the connection's status. */
export function DhanConnect({ status }: { status: BrokerStatus | null }) {
  return (
    <div className="space-y-8">
      <DhanStatus status={status} />
      {status?.status === "pending" && <AutoRefresh />}
      <ol className="list-decimal space-y-3 pl-6 text-base text-ink-2 marker:font-[family-name:var(--font-display)] marker:text-ink">
        <li>
          Sign in at <strong>web.dhan.co</strong>, open your profile and choose <strong>Access DhanHQ APIs</strong>.
        </li>
        <li>Generate an access token there. It lasts 24 hours; Hardwon renews it for you from then on.</li>
        <li>Paste your client ID (the number on your profile) and the token below.</li>
      </ol>
      <DhanForm connected={!!status} />
      <p className="max-w-[60ch] text-sm text-muted">
        Hardwon only reads your trades; it never places orders, and Dhan needs no IP whitelist for that. The token is locked the moment you
        save it, and our sync server renews it each day so you paste it once. If it ever lapses, we&apos;ll tell you on Telegram.
      </p>
    </div>
  );
}

function DhanStatus({ status }: { status: BrokerStatus | null }) {
  if (!status) return <p className="face-label text-base text-ink-2">Not connected yet.</p>;
  const id = <code className="face-label text-ink">…{status.keyHint}</code>;
  if (status.status === "pending")
    return <p className="face-label text-base text-ink-2">Client {id} connected. Fetching your trades now; this page updates by itself within a minute.</p>;
  if (status.status === "ok")
    return (
      <p className="face-label text-base text-ink">
        Connected as client {id}
        {status.checkedAt ? `, last synced ${formatDateTime(status.checkedAt)} IST` : ""}.
      </p>
    );
  return (
    <div className="bg-warn-soft px-5 py-4 text-warn">
      <p className="face-label text-base font-medium">Dhan client {id} is not syncing</p>
      <p className="mt-1 text-base text-ink-2">{explainSyncError(status.lastError ?? "")}</p>
    </div>
  );
}
