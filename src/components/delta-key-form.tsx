"use client";

import { useState, useTransition } from "react";
import { connectDelta, disconnectDelta, type DeltaKeyResult } from "@/app/delta-actions";

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

  const input =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900";
  const button =
    "rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300";
  const secondary = "rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800";

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">API key</span>
        <input
          className={input}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          required
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">API secret</span>
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
        <p role="status" className={`text-sm ${result.ok ? "text-zinc-500" : "text-rose-600 dark:text-rose-400"}`}>
          {result.message}
        </p>
      )}
    </form>
  );
}
