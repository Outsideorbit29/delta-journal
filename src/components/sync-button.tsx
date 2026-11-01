"use client";

import { useActionState } from "react";
import { syncNow, type SyncResult } from "@/app/actions";
import { buttonPrimary } from "@/components/ui";

export function SyncButton() {
  const [result, action, pending] = useActionState<SyncResult | null>(syncNow, null);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className={buttonPrimary}
      >
        {pending ? "Syncing…" : "Sync from Delta"}
      </button>
      {result && (
        <p role="status" className={`face-label max-w-sm text-right text-sm ${result.ok ? "text-muted" : "text-error"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}
