"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPush, subscribePush, unsubscribePush, type PushActionResult } from "@/app/push-actions";
import { buttonPrimary, buttonSecondary } from "@/components/ui";

type Support = "checking" | "unsupported" | "ios-not-installed" | "ready";

/** The VAPID public key is base64url; the Push API wants raw bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${device} · ${browser}`;
}

export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [support, setSupport] = useState<Support>("checking");
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [result, setResult] = useState<PushActionResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ios = /iPhone|iPad/.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    let next: Support = "ready";
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = ios && !installed ? "ios-not-installed" : "unsupported";
    else if (ios && !installed) next = "ios-not-installed";
    void (async () => {
      if (next === "ready") {
        const reg = await navigator.serviceWorker.register("/sw.js");
        setSubscription(await reg.pushManager.getSubscription());
      }
      setSupport(next);
    })();
  }, []);

  const enable = () =>
    start(async () => {
      setResult(null);
      if (!publicKey) return setResult({ ok: false, message: "Push is not set up on the server (VAPID keys missing)." });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        return setResult({ ok: false, message: "Notifications are blocked. Allow them for this site in your browser or phone settings." });
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await subscribePush(sub.toJSON(), deviceLabel());
      if (r.ok) setSubscription(sub);
      else await sub.unsubscribe();
      setResult(r);
    });

  const disable = () =>
    start(async () => {
      if (!subscription) return;
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      setSubscription(null);
      setResult(await unsubscribePush(endpoint));
    });

  const test = () => start(async () => setResult(await sendTestPush()));

  const button = buttonPrimary;
  const secondary = buttonSecondary;

  return (
    <div className="space-y-3">
      {support === "checking" && <p className="text-sm text-zinc-500">Checking this device…</p>}
      {support === "unsupported" && <p className="text-sm text-zinc-500">This browser does not support push notifications.</p>}
      {support === "ios-not-installed" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          On iPhone, notifications only work in the installed app: tap Share → <strong>Add to Home Screen</strong>, open Edgebook from the home
          screen, and come back here.
        </p>
      )}
      {support === "ready" && (
        <div className="flex flex-wrap items-center gap-2">
          {subscription ? (
            <>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">On for this device.</span>
              <button type="button" onClick={test} disabled={pending} className={button}>
                Send a test
              </button>
              <button type="button" onClick={disable} disabled={pending} className={secondary}>
                Turn off
              </button>
            </>
          ) : (
            <button type="button" onClick={enable} disabled={pending} className={button}>
              {pending ? "Turning on…" : "Turn on notifications"}
            </button>
          )}
        </div>
      )}
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-zinc-500" : "text-rose-600 dark:text-rose-400"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
