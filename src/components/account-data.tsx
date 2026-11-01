"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount, type AccountActionResult } from "@/app/account-actions";
import { buttonDanger, buttonSecondary, input } from "@/components/ui";

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
        <p className="text-base text-ink-2">
          Download a copy of everything Edgebook stores about you. How we use it:{" "}
          <a href="/privacy" className="link">Privacy Policy</a>.
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

      <div className="space-y-3 border-t border-rule pt-6">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className={buttonDanger}>
            Delete my account
          </button>
        ) : (
          <form onSubmit={remove} className="space-y-4 border-t-4 border-loss bg-paper-2 px-5 py-5">
            <p className="text-base text-ink">
              This deletes your trades, journal, AI reviews, Delta key, Telegram link and sign-in, permanently. It cannot be undone. Download
              your data first if you want to keep it.
            </p>
            <label className="block space-y-2">
              <span className="face-label block text-base text-ink">
                Type <strong>{confirmWord}</strong> to confirm
              </span>
              <input
                className={`${input} face-label max-w-xs`}
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
                className="face-label inline-flex min-h-10 items-center justify-center border border-loss bg-loss px-5 text-sm text-paper transition-colors duration-(--dur-short) hover:bg-error disabled:cursor-not-allowed disabled:opacity-55"
              >
                {pending ? "Deleting…" : "Delete my account"}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonSecondary}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {result && <p role="status" className={`face-label text-sm ${result.ok ? "text-muted" : "text-error"}`}>{result.message}</p>}
      </div>
    </div>
  );
}
