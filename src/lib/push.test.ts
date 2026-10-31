import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebPushError } from "web-push";
import { openDatabase, schema, type Db } from "@/db";
import { isBrowserSubscription, removeSubscription, saveSubscription, sendPush, type BrowserSubscription } from "./push";

let dir: string;
let db: Db;
const sub = (n: number): BrowserSubscription => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` } });
const message = { title: "XAUTUSD short closed · -$2.08", body: "Tap to journal", url: "/trades/t1", tag: "trade-t1" };
const gone = () => new WebPushError("Gone", 410, {}, "", "");

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "journal-push-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("push", () => {
  it("only accepts real browser subscriptions", () => {
    expect(isBrowserSubscription(sub(1))).toBe(true);
    expect(isBrowserSubscription({ endpoint: "http://insecure", keys: { p256dh: "x", auth: "y" } })).toBe(false);
    expect(isBrowserSubscription({ endpoint: "https://x" })).toBe(false);
    expect(isBrowserSubscription(null)).toBe(false);
  });

  it("sends the message to every device and drops devices the push service says are gone", async () => {
    await saveSubscription(db, sub(1), "Android · Chrome");
    await saveSubscription(db, sub(2), "iPhone/iPad · Safari");
    const delivered: string[] = [];
    const result = await sendPush(db, message, async (s, payload) => {
      if (s.endpoint.endsWith("/2")) throw gone();
      delivered.push(`${s.endpoint} ${payload}`);
    });
    expect(result).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(delivered).toEqual([`https://push.example/1 ${JSON.stringify(message)}`]);
    expect((await db.select().from(schema.pushSubscriptions)).map((s) => s.endpoint)).toEqual(["https://push.example/1"]);
  });

  it("keeps a device through temporary failures but drops it after five in a row", async () => {
    const failing = async () => {
      throw new WebPushError("Unavailable", 503, {}, "", "");
    };
    for (let i = 0; i < 4; i++) expect(await sendPush(db, message, failing)).toEqual({ sent: 0, removed: 0, failed: 1 });
    expect(await sendPush(db, message, failing)).toEqual({ sent: 0, removed: 1, failed: 0 });
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });

  it("does nothing without subscriptions, and re-subscribing replaces the keys", async () => {
    expect(await sendPush(db, message, async () => {})).toEqual({ sent: 0, removed: 0, failed: 0 });
    await saveSubscription(db, sub(3), null);
    await saveSubscription(db, { ...sub(3), keys: { p256dh: "new", auth: "new" } }, "Windows · Edge");
    const rows = await db.select().from(schema.pushSubscriptions);
    expect(rows).toMatchObject([{ endpoint: "https://push.example/3", p256dh: "new", label: "Windows · Edge" }]);
    await removeSubscription(db, sub(3).endpoint);
    expect(await db.select().from(schema.pushSubscriptions)).toHaveLength(0);
  });
});
