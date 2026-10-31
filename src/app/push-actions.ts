"use server";

import { getDb } from "@/db";
import { isBrowserSubscription, pushConfigured, removeSubscription, saveSubscription, sendPush } from "@/lib/push";

export interface PushActionResult {
  ok: boolean;
  message: string;
}

const NOT_SET_UP = "Push is not set up on the server (VAPID keys missing).";

export async function subscribePush(subscription: unknown, label: string): Promise<PushActionResult> {
  if (!pushConfigured()) return { ok: false, message: NOT_SET_UP };
  if (!isBrowserSubscription(subscription)) return { ok: false, message: "The browser sent an invalid subscription." };
  await saveSubscription(await getDb(), subscription, label.slice(0, 80) || null);
  return { ok: true, message: "Notifications are on for this device." };
}

export async function unsubscribePush(endpoint: string): Promise<PushActionResult> {
  await removeSubscription(await getDb(), endpoint);
  return { ok: true, message: "Notifications are off for this device." };
}

export async function sendTestPush(): Promise<PushActionResult> {
  if (!pushConfigured()) return { ok: false, message: NOT_SET_UP };
  const r = await sendPush(await getDb(), {
    title: "Delta Journal",
    body: "Test notification: closed trades, weekly reviews and sync problems will show up like this.",
    url: "/settings",
    tag: "test",
  });
  if (!r.sent) return { ok: false, message: r.removed ? "That device's subscription had expired and was removed. Turn notifications on again." : "No device is subscribed." };
  return { ok: true, message: `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}.` };
}
