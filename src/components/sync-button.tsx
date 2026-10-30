"use client";

import { useActionState } from "react";
import { syncNow, type SyncResult } from "@/app/actions";

export function SyncButton() {
  const [result, action, pending] = useActionState<SyncResult | null>(syncNow, null);

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
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
