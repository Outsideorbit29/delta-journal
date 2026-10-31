// Web push to the installed phone app. The VAPID key pair proves the
// notifications come from this app; push services (Google, Apple, Mozilla)
// deliver them even when the app is closed.

import { eq, sql } from "drizzle-orm";
import webpush, { WebPushError } from "web-push";
import { schema, type Db } from "@/db";

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

export interface PushResult {
  sent: number;
  removed: number;
  failed: number;
}

/** A browser subscription as `PushSubscription.toJSON()` gives it. */
export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Drop a subscription after this many failed sends in a row. */
const MAX_FAILURES = 5;

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  if (!pushConfigured()) throw new Error("Push is not set up: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are missing.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "https://delta-journal-three.vercel.app", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export function isBrowserSubscription(v: unknown): v is BrowserSubscription {
  const s = v as BrowserSubscription;
  return (
    typeof s?.endpoint === "string" &&
    s.endpoint.startsWith("https://") &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  );
}

export async function saveSubscription(db: Db, sub: BrowserSubscription, label: string | null, now = Date.now()) {
  const values = { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label, createdAt: now, failures: 0 };
  await db.insert(schema.pushSubscriptions).values(values).onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: values });
}

export async function removeSubscription(db: Db, endpoint: string) {
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, endpoint));
}

type Sender = (sub: BrowserSubscription, payload: string) => Promise<unknown>;

/**
 * Sends a notification to every subscribed device. Subscriptions the push
 * service reports as gone (404/410), or that keep failing, are removed.
 * `send` is injectable for tests.
 */
export async function sendPush(db: Db, message: PushMessage, send?: Sender, now = Date.now()): Promise<PushResult> {
  const subs = await db.select().from(schema.pushSubscriptions);
  if (!subs.length) return { sent: 0, removed: 0, failed: 0 };
  const deliver: Sender =
    send ??
    ((sub, payload) => {
      configure();
      return webpush.sendNotification(sub, payload, { TTL: 24 * 3600, urgency: "normal" });
    });

  const payload = JSON.stringify(message);
  const result: PushResult = { sent: 0, removed: 0, failed: 0 };
  for (const s of subs) {
    try {
      await deliver({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      await db.update(schema.pushSubscriptions).set({ lastSentAt: now, failures: 0 }).where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
      result.sent++;
    } catch (err) {
      const gone = err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410);
      if (gone || s.failures + 1 >= MAX_FAILURES) {
        await removeSubscription(db, s.endpoint);
        result.removed++;
      } else {
        await db
          .update(schema.pushSubscriptions)
          .set({ failures: sql`${schema.pushSubscriptions.failures} + 1` })
          .where(eq(schema.pushSubscriptions.endpoint, s.endpoint));
        result.failed++;
      }
    }
  }
  return result;
}
