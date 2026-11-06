import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "@/db";
import { getState } from "./bot";
import {
  LINK_CODE_TTL_MS,
  STATE_NOTIFY_SINCE,
  adoptOwnerChat,
  chatForUser,
  createLinkCode,
  getTelegramLink,
  linkUrl,
  unlinkTelegram,
  redeemLinkCode,
  userForChat,
} from "./links";

const T0 = Date.UTC(2026, 10, 1, 9);
let dir: string;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "hardwon-links-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("Telegram account linking", () => {
  it("links a private chat with a one-time code, and the code works only once", async () => {
    const code = await createLinkCode(db, "alice", T0);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(linkUrl(code)).toBe(`https://t.me/Jornalling_bot?start=${code}`);
    expect(await getTelegramLink(db, "alice", T0)).toEqual({ chatName: null, linkedAt: null, linked: false, waiting: true });

    expect(await redeemLinkCode(db, code, "111", "@alice", T0 + 1000)).toBe("alice");
    expect(await userForChat(db, "111")).toBe("alice");
    expect(await chatForUser(db, "alice")).toBe("111");
    expect(await getTelegramLink(db, "alice", T0 + 1000)).toEqual({ chatName: "@alice", linkedAt: T0 + 1000, linked: true, waiting: false });
    // Linking restarts trade notifications from now, so old trades do not flood the chat.
    expect(await getState(db, STATE_NOTIFY_SINCE, "alice")).toBe(String(T0 + 1000));

    expect(await redeemLinkCode(db, code, "222", "@mallory", T0 + 2000)).toBeNull();
    expect(await userForChat(db, "222")).toBeNull();
  });

  it("refuses expired, unknown and malformed codes", async () => {
    const code = await createLinkCode(db, "bob", T0);
    expect(await redeemLinkCode(db, code, "333", null, T0 + LINK_CODE_TTL_MS + 1)).toBeNull();
    expect(await redeemLinkCode(db, "A".repeat(22), "333", null, T0)).toBeNull();
    expect(await redeemLinkCode(db, "bad code!", "333", null, T0)).toBeNull();
    expect(await chatForUser(db, "bob")).toBeNull();
  });

  it("a new code replaces the old one and keeps the linked chat until it is used", async () => {
    const first = await createLinkCode(db, "alice", T0 + 3000);
    const second = await createLinkCode(db, "alice", T0 + 3000);
    expect(await chatForUser(db, "alice")).toBe("111");
    expect(await redeemLinkCode(db, first, "444", null, T0 + 4000)).toBeNull();
    expect(await redeemLinkCode(db, second, "444", "Alice", T0 + 4000)).toBe("alice");
    expect(await chatForUser(db, "alice")).toBe("444");
    expect(await userForChat(db, "111")).toBeNull();
  });

  it("moves a chat to the account whose code it used", async () => {
    const code = await createLinkCode(db, "bob", T0 + 5000);
    expect(await redeemLinkCode(db, code, "444", "@shared", T0 + 6000)).toBe("bob");
    expect(await userForChat(db, "444")).toBe("bob");
    expect(await getTelegramLink(db, "alice", T0 + 6000)).toMatchObject({ linked: false });
    expect(await getState(db, STATE_NOTIFY_SINCE, "alice")).toBe(String(T0 + 6000));
  });

  it("unlinks, and adopts the old single-user chat for the owner only once", async () => {
    await unlinkTelegram(db, "bob", T0 + 7000);
    expect(await userForChat(db, "444")).toBeNull();
    expect(await getTelegramLink(db, "bob", T0 + 7000)).toEqual({ chatName: null, linkedAt: null, linked: false, waiting: false });

    expect(await adoptOwnerChat(db, "owner", "999", T0)).toBe(true);
    expect(await adoptOwnerChat(db, "owner", "999", T0)).toBe(false);
    expect(await adoptOwnerChat(db, "carol", "999", T0)).toBe(false);
    expect(await userForChat(db, "999")).toBe("owner");
    // Adopting keeps the owner's notification history as it was.
    expect(await getState(db, STATE_NOTIFY_SINCE, "owner")).toBeNull();
  });
});
