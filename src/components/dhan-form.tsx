"use client";

import { useState, useTransition } from "react";
import { connectDhan, disconnectDhan, type DhanResult } from "@/app/dhan-actions";
import { buttonPrimary, buttonSecondary, input as inputClass } from "@/components/ui";

/** Paste a Dhan client ID and access token; they are checked with Dhan, sealed, and never shown again. */
export function DhanForm({ connected }: { connected: boolean }) {
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [result, setResult] = useState<DhanResult | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectDhan(clientId, token);
      setResult(r);
      if (r.ok) {
        setClientId("");
        setToken("");
      }
    });
  };

  const disconnect = () => start(async () => setResult(await disconnectDhan()));
  const input = `${inputClass} face-label`;

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block space-y-2">
        <span className="face-label block text-base text-ink">Client ID</span>
        <input
          className={input}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label className="block space-y-2">
        <span className="face-label block text-base text-ink">Access token</span>
        <input
          className={input}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonPrimary}>
          {pending ? "Checking with Dhan…" : connected ? "Replace token" : "Connect"}
        </button>
        {connected && (
          <button type="button" onClick={disconnect} disabled={pending} className={buttonSecondary}>
            Disconnect
          </button>
        )}
      </div>
      {result && (
        <p role="status" className={`face-label text-sm ${result.ok ? "text-muted" : "text-error"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}
