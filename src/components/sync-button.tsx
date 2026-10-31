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
        <p role="status" className={`max-w-sm text-right text-xs ${result.ok ? "text-zinc-500" : "text-rose-600 dark:text-rose-400"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}
