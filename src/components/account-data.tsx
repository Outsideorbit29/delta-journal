"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount, type AccountActionResult } from "@/app/account-actions";
import { buttonSecondary } from "@/components/ui";

/** Download your data, or delete your account (typing the confirmation word first). */
export function AccountData({ confirmWord }: { confirmWord: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [pending, start] = useTransition();

  const remove = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await deleteMyAccount(typed);
      setResult(r);
      // The sign-in is gone: a full page load (not a client navigation) drops Clerk's cached session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (r.ok) window.location.assign("/");
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm text-zinc-400">
          Download a copy of everything Edgebook stores about you. How we use it:{" "}
          <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export" className={buttonSecondary}>
            All my data (JSON)
          </a>
          <a href="/api/export?format=csv" className={buttonSecondary}>
            Trades and journal (CSV)
          </a>
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-4">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-sm text-rose-400 hover:underline">
            Delete my account…
          </button>
        ) : (
          <form onSubmit={remove} className="space-y-3 rounded-md border border-rose-900/60 bg-rose-950/30 p-3">
            <p className="text-sm text-rose-200">
              This deletes your trades, journal, AI reviews, Delta key, Telegram link and sign-in, permanently. It cannot be undone. Download
              your data first if you want to keep it.
            </p>
            <label className="block space-y-1 text-sm">
              <span className="text-rose-200/80">
                Type <strong>{confirmWord}</strong> to confirm
              </span>
              <input
                className="w-full rounded-md border border-rose-900/60 bg-zinc-950 px-3 py-2 text-sm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending || typed.trim() !== confirmWord}
                className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete my account"}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonSecondary}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {result && <p className={`text-sm ${result.ok ? "text-zinc-400" : "text-rose-400"}`}>{result.message}</p>}
      </div>
    </div>
  );
}
