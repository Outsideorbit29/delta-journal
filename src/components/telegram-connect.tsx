"use client";

import { useState, useTransition } from "react";
import { connectTelegram, disconnectTelegram, type TelegramActionResult } from "@/app/telegram-actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

/**
 * Connect: makes a one-time link, which opens Telegram on the bot; tapping
 * Start there links the chat. The settings page refreshes itself until it has.
 */
export function TelegramConnect({ linked, chatName }: { linked: boolean; chatName: string | null }) {
  const [result, setResult] = useState<TelegramActionResult | null>(null);
  const [pending, start] = useTransition();

  const connect = () => start(async () => setResult(await connectTelegram()));
  const disconnect = () => start(async () => setResult(await disconnectTelegram()));

  if (linked) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-400">
          Connected{chatName ? <> to <strong className="text-zinc-200">{chatName}</strong></> : ""}. Closed trades arrive there with buttons to
          journal them; reply with text or a voice note to add a note.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={connect} disabled={pending} className={buttonSecondary}>
            Use a different chat
          </button>
          <button type="button" onClick={disconnect} disabled={pending} className={buttonSecondary}>
            Disconnect
          </button>
        </div>
        {result?.url && <OpenLink url={result.url} />}
        {result?.message && <p className="text-sm text-zinc-500">{result.message}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Get each closed trade in Telegram and journal it in a few taps, or with a voice note. Your weekly review arrives there too.
      </p>
      {result?.url ? (
        <OpenLink url={result.url} />
      ) : (
        <button type="button" onClick={connect} disabled={pending} className={buttonPrimary}>
          {pending ? "Making your link…" : "Connect Telegram"}
        </button>
      )}
      {result && !result.ok && <p className="text-sm text-rose-400">{result.message}</p>}
      {result?.message && result.ok && <p className="text-sm text-zinc-500">{result.message}</p>}
    </div>
  );
}

function OpenLink({ url }: { url: string }) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonPrimary}>
        Open Telegram
      </a>
      <p className="text-zinc-500">
        In Telegram, tap <strong className="text-zinc-300">Start</strong>. This page updates by itself once it&apos;s connected. The link works once,
        for 15 minutes.
      </p>
    </div>
  );
}
