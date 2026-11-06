import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { DeltaApiError, type DeltaClient } from "@/lib/delta/client";
import type { DeltaFill } from "@/lib/delta/types";
import { generateSealKeys } from "./sealed";

const dir = mkdtempSync(path.join(tmpdir(), "hardwon-keys-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;

// Imported after DATABASE_URL is set, so syncAll's getDb() opens the temporary database.
const { getDb, schema } = await import("@/db");
const { checkDeltaKey, getDeltaKeyStatus, removeDeltaKey, saveDeltaKey } = await import("./credentials");
const { ACCOUNT_DELETED, KEY_UNREADABLE, syncStoredKeys, syncWithStoredKey } = await import("./sync-users");
const { deleteAccountData } = await import("@/lib/account");

const keys = generateSealKeys();
const T0 = Date.UTC(2026, 9, 30, 9);
let db: Db;

const fill = (id: string, side: "buy" | "sell", ts: number, price: number): DeltaFill => ({
  id,
  order_id: `o-${id}`,
  product_id: 1,
  product_symbol: "XAUTUSD",
  product: { id: 1, symbol: "XAUTUSD", contract_type: "perpetual_futures", contract_value: "0.001", notional_type: "vanilla" },
  side,
  size: 1000,
  price: String(price),
  commission: "0.4",
  credits_used: "0",
  role: "taker",
  fill_type: "normal",
  created_at: new Date(ts).toISOString(),
  meta_data: {},
});

/** A fake Delta account per API key: each key "sees" only its own fills. */
const accounts: Record<string, DeltaFill[]> = {
  AAAAAAAAAAAAAAAAkeyA: [fill("a1", "buy", T0, 4000), fill("a2", "sell", T0 + 60_000, 4010)],
  BBBBBBBBBBBBBBBBkeyB: [fill("b1", "buy", T0, 4000), fill("b2", "sell", T0 + 60_000, 3990)],
};
const seen: string[] = [];
const makeClient = ({ apiKey, apiSecret }: { apiKey: string; apiSecret: string }) =>
  ({
    async getAll(p: string) {
      seen.push(`${apiKey}:${apiSecret}`);
      if (apiKey.startsWith("C")) throw new DeltaApiError("ip_not_whitelisted_for_api_key", 401, { client_ip: "2406:da1a::1" });
      return p === "/v2/fills" ? accounts[apiKey] : [];
    },
  }) as unknown as DeltaClient;

beforeAll(async () => {
  db = await getDb();
  // Signing in creates the account row before anyone can save a key.
  await db.insert(schema.users).values(["user_a", "user_b", "user_c", "user_d", "user_gone"].map((id) => ({ id, createdAt: T0 })));
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("stored Delta keys", () => {
  it("checks the shape of a pasted key", () => {
    expect(checkDeltaKey("", "x")).toMatch("Paste both");
    expect(checkDeltaKey("short", "BBBBBBBBBBBBBBBBBBBB")).toMatch("API key does not look right");
    expect(checkDeltaKey("AAAAAAAAAAAAAAAAAAAA", "has spaces in it here")).toMatch("API secret does not look right");
    expect(checkDeltaKey("AAAAAAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAA")).toMatch("the same");
    expect(checkDeltaKey("AAAAAAAAAAAAAAAAAAAA", "BBBBBBBBBBBBBBBBBBBBBBBBBBBB")).toBeNull();
  });

  it("stores only a sealed key and shows each user only their own status", async () => {
    await saveDeltaKey(db, "user_a", { apiKey: "AAAAAAAAAAAAAAAAkeyA", apiSecret: "secretAsecretAsecretA" }, keys.publicKey, T0);
    const [row] = await db.select().from(schema.deltaCredentials);
    expect(row.sealed).not.toContain("secretA");
    expect(row.sealed).not.toContain("keyA");
    expect(await getDeltaKeyStatus(db, "user_a")).toEqual({ keyHint: "keyA", status: "pending", lastError: null, checkedAt: null, updatedAt: T0 });
    expect(await getDeltaKeyStatus(db, "user_b")).toBeNull();
  });

  it("syncs every user with their own key into their own account", async () => {
    await saveDeltaKey(db, "user_b", { apiKey: "BBBBBBBBBBBBBBBBkeyB", apiSecret: "secretBsecretBsecretB" }, keys.publicKey, T0);
    const results = await syncStoredKeys(db, keys.privateKey, { makeClient, now: T0 + 1 });
    expect(results.map((r) => [r.userId, r.summary?.fills, r.error])).toEqual([
      ["user_a", 2, undefined],
      ["user_b", 2, undefined],
    ]);
    expect(seen).toContain("AAAAAAAAAAAAAAAAkeyA:secretAsecretAsecretA");
    const owners = (await db.select({ id: schema.fills.id, userId: schema.fills.userId }).from(schema.fills)).map((f) => `${f.userId}:${f.id}`);
    expect(owners.sort()).toEqual(["user_a:a1", "user_a:a2", "user_b:b1", "user_b:b2"]);
    const trades = await db.select({ userId: schema.trades.userId, netPnl: schema.trades.netPnl }).from(schema.trades);
    expect(trades.find((t) => t.userId === "user_a")!.netPnl).toBeGreaterThan(0);
    expect(trades.find((t) => t.userId === "user_b")!.netPnl).toBeLessThan(0);
    expect((await getDeltaKeyStatus(db, "user_a"))?.status).toBe("ok");
  });

  it("records one user's failure, with the IP to whitelist, without stopping the others", async () => {
    await saveDeltaKey(db, "user_c", { apiKey: "CCCCCCCCCCCCCCCCkeyC", apiSecret: "secretCsecretCsecretC" }, keys.publicKey, T0);
    const results = await syncStoredKeys(db, keys.privateKey, { makeClient, skip: ["user_a"], now: T0 + 2 });
    expect(results.map((r) => r.userId)).toEqual(["user_b", "user_c"]);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toContain("2406:da1a::1");
    const status = await getDeltaKeyStatus(db, "user_c");
    expect(status?.status).toBe("error");
    expect(status?.lastError).toContain("Whitelist this IP");
    await expect(syncWithStoredKey(db, "user_c", keys.privateKey, makeClient)).rejects.toThrow("ip_not_whitelisted");
  });

  it("will not open a key that was moved to another user's row, or with the wrong server key", async () => {
    const [a] = await db.select().from(schema.deltaCredentials).where((await import("drizzle-orm")).eq(schema.deltaCredentials.userId, "user_a"));
    await removeDeltaKey(db, "user_b");
    await db.insert(schema.deltaCredentials).values({ ...a, userId: "user_b" });
    await expect(syncWithStoredKey(db, "user_b", keys.privateKey, makeClient)).rejects.toThrow(KEY_UNREADABLE);
    expect((await getDeltaKeyStatus(db, "user_b"))?.lastError).toBe(KEY_UNREADABLE);
    await expect(syncWithStoredKey(db, "user_a", generateSealKeys().privateKey, makeClient)).rejects.toThrow(KEY_UNREADABLE);
  });

  it("leaves a key the user replaced during a sync waiting for its own check", async () => {
    await saveDeltaKey(db, "user_d", { apiKey: "DDDDDDDDDDDDDDDDkeyD", apiSecret: "secretDsecretDsecretD" }, keys.publicKey, T0);
    const slow = (key: { apiKey: string; apiSecret: string }) =>
      ({
        async getAll() {
          await saveDeltaKey(db, "user_d", { apiKey: "EEEEEEEEEEEEEEEEkeyE", apiSecret: "secretEsecretEsecretE" }, keys.publicKey, T0 + 5);
          return makeClient(key).getAll("/v2/orders");
        },
      }) as unknown as DeltaClient;
    await syncWithStoredKey(db, "user_d", keys.privateKey, slow);
    expect(await getDeltaKeyStatus(db, "user_d")).toMatchObject({ keyHint: "keyE", status: "pending" });
  });

  it("erases what a sync wrote if the account was deleted while it ran", async () => {
    await saveDeltaKey(db, "user_gone", { apiKey: "AAAAAAAAAAAAAAAAkeyA", apiSecret: "secretAsecretAsecretA" }, keys.publicKey, T0);
    const deletedMidSync = (key: { apiKey: string; apiSecret: string }) =>
      ({
        async getAll(p: string) {
          if (p === "/v2/fills") await deleteAccountData(db, "user_gone");
          return makeClient(key).getAll(p);
        },
      }) as unknown as DeltaClient;
    await expect(syncWithStoredKey(db, "user_gone", keys.privateKey, deletedMidSync)).rejects.toThrow(ACCOUNT_DELETED);
    for (const table of [schema.fills, schema.trades, schema.deltaCredentials, schema.syncState]) {
      expect(await db.select().from(table).where(eq(table.userId, "user_gone"))).toEqual([]);
    }
  });
});
