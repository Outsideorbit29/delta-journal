"use client";

import { useState, useTransition } from "react";
import { connectDelta, disconnectDelta, type DeltaKeyResult } from "@/app/delta-actions";
import { buttonPrimary, buttonSecondary, input as inputClass } from "@/components/ui";

/** Paste a Delta key and secret; they are sealed on the server and never shown again. */
export function DeltaKeyForm({ connected }: { connected: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [result, setResult] = useState<DeltaKeyResult | null>(null);
  const [pending, start] = useTransition();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await connectDelta(apiKey, apiSecret);
      setResult(r);
      if (r.ok) {
        setApiKey("");
        setApiSecret("");
      }
    });
  };

  const disconnect = () => start(async () => setResult(await disconnectDelta()));

  const input = `${inputClass} face-label`;
  const button = buttonPrimary;
  const secondary = buttonSecondary;

  return (
    <form onSubmit={save} className="space-y-5">
      <label className="block space-y-2">
        <span className="face-label block text-base text-ink">API key</span>
        <input
          className={input}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label className="block space-y-2">
        <span className="face-label block text-base text-ink">API secret</span>
        <input
          className={input}
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          required
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={button}>
          {pending ? "Saving…" : connected ? "Replace key" : "Connect"}
        </button>
        {connected && (
          <button type="button" onClick={disconnect} disabled={pending} className={secondary}>
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
