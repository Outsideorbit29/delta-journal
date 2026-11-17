import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import type { DhanTrade } from "@/lib/dhan/types";
import { generateSealKeys } from "./sealed";

const dir = mkdtempSync(path.join(tmpdir(), "hardwon-dhan-"));
process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
const keys = generateSealKeys();
process.env.DELTA_KEYS_PUBLIC_KEY = keys.publicKey;

// Imported after DATABASE_URL is set, so getDb() opens the temporary database.
const { getDb, schema } = await import("@/db");
const { DhanApiError, DhanClient, tokenExpiry } = await import("@/lib/dhan/client");
const { dhanInstrumentId, toDhanFillRow, toDhanFillRows } = await import("@/lib/dhan/ingest");
const { checkDhanCredentials, getBrokerStatus, openDhanCredentials, saveDhanCredentials } = await import("./brokers");
const { DHAN_EXPIRED, mergeSyncResults, syncDhanAccounts } = await import("./sync-brokers");
const { listTrades } = await import("@/lib/queries");

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 16, 6); // 11:30 IST on Monday 16 Nov 2026
const U = "user_dhan";
const CLIENT = "1100123456";
const TOKEN = (n: number) => `eyJhbGciOiJIUzUxMiJ9.eyJ0b2tlbiI6${n}abcdefghijklmnop.c2lnbmF0dXJlLXNpZ25hdHVyZQ${n}`;
let db: Db;

// The history numbers every trade "0"; today's trade book gives the exchange's trade number instead.
const trade = (order: string, side: "BUY" | "SELL", time: string, price: number, charges = true, qty = 75): DhanTrade => ({
  orderId: order,
  exchangeTradeId: charges ? "0" : String(5_000_000 + price * 100 + qty),
  transactionType: side,
  exchangeSegment: "NSE_FNO",
  productType: "INTRADAY",
  customSymbol: "NIFTY 18 NOV 24000 CALL",
  securityId: "45678",
  tradedQuantity: qty,
  tradedPrice: price,
  instrument: "OPTIDX",
  exchangeTime: time,
  ...(charges ? { brokerageCharges: 20, stt: 7.5, exchangeTransactionCharges: 3.2, sebiTax: 0.01, stampDuty: 0.3, serviceTax: 4.2 } : {}),
});

/** A fake Dhan: history (with charges), today's book (without), profile and renewal, per token. */
function fakeDhan(state: { history: DhanTrade[]; today: DhanTrade[]; renewTo?: string; failAuth?: boolean; busy?: number; calls: string[] }) {
  return ({ clientId, accessToken }: { clientId: string; accessToken: string }) =>
    new DhanClient({ clientId, accessToken }, async (url) => {
      const p = String(url).replace("https://api.dhan.co/v2", "");
      state.calls.push(p);
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
      if (state.busy) {
        state.busy--;
        return json({ errorType: "Rate_Limit", errorCode: "DH-904", errorMessage: "Too many requests on server from single user breaching rate limits. Try throttling API calls." }, 429);
      }
      if (state.failAuth) return json({ errorType: "Invalid_Authentication", errorCode: "DH-901", errorMessage: "Client ID or user generated access token is invalid or expired." }, 401);
      if (p === "/profile") return json({ dhanClientId: clientId, tokenValidity: accessToken === state.renewTo ? "17/11/2026 11:30" : "16/11/2026 13:00" });
      if (p === "/RenewToken") return json(state.renewTo ? { accessToken: state.renewTo } : {});
      if (p === "/trades") return json(state.today);
      const m = /^\/trades\/([\d-]+)\/([\d-]+)\/(\d+)$/.exec(p);
      // Each window returns its own days' trades, as Dhan does.
      const inWindow = (t: DhanTrade) => !!m && (t.exchangeTime ?? "").slice(0, 10) >= m[1] && (t.exchangeTime ?? "").slice(0, 10) <= m[2];
      if (m) return json(m[3] === "0" ? state.history.filter(inWindow) : []);
      return json({ errorCode: "DH-905", errorMessage: `unexpected ${p}` }, 400);
    }, { minGapMs: 0, retryDelaysMs: [0, 0] });
}

beforeAll(async () => {
  db = await getDb();
  await db.insert(schema.users).values({ id: U, email: "", createdAt: NOW - 30 * 24 * HOUR });
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("Dhan records", () => {
  it("become fills with their charges, in IST, matched on the ISIN for shares", () => {
    const row = toDhanFillRow(trade("o1", "BUY", "2026-11-16T09:20:05", 120));
    expect(row).toMatchObject({ id: "dhan:o1:0", side: "buy", size: 75, price: 120, contractType: "options", contractValue: 1 });
    expect(row.commission).toBeCloseTo(35.21);
    expect(row.ts).toBe(Date.UTC(2026, 10, 16, 3, 50, 5));
    // The same share on NSE and BSE has two security ids but one ISIN.
    const nse = dhanInstrumentId({ securityId: "2885", isin: "INE002A01018", instrument: "EQUITY" });
    expect(dhanInstrumentId({ securityId: "500325", isin: "INE002A01018", instrument: "EQUITY" })).toBe(nse);
    expect(dhanInstrumentId({ securityId: "45678", isin: "INE002A01018", instrument: "OPTIDX" })).toBe(45678);
  });

  it("are numbered by their place in the order, so the trade book and the history agree", () => {
    const fromBook = toDhanFillRows([trade("o9", "BUY", "2026-11-16T14:17:53", 122.6, false)]);
    const fromHistory = toDhanFillRows([trade("o9", "BUY", "2026-11-16T14:17:53", 122.6)]);
    expect(fromBook.map((r) => r.id)).toEqual(["dhan:o9:0"]);
    expect(fromHistory.map((r) => r.id)).toEqual(["dhan:o9:0"]);
    // An order filled in two parts: the history calls both trades "0", and both are kept, in time order.
    const parts = toDhanFillRows([trade("o8", "SELL", "2026-11-16T10:00:02", 131, true, 25), trade("o8", "SELL", "2026-11-16T10:00:01", 131, true, 50)]);
    expect(parts.map((r) => [r.id, r.size])).toEqual([["dhan:o8:0", 50], ["dhan:o8:1", 25]]);
  });

  it("read the token's expiry and check pasted credentials", () => {
    expect(tokenExpiry({ tokenValidity: "17/11/2026 10:36" })).toBe(Date.UTC(2026, 10, 17, 5, 6));
    expect(tokenExpiry({ tokenValidity: "" })).toBeNull();
    expect(checkDhanCredentials(CLIENT, TOKEN(1))).toBeNull();
    expect(checkDhanCredentials("abc", TOKEN(1))).toMatch(/client ID/);
    expect(checkDhanCredentials(CLIENT, "not a token")).toMatch(/access token/);
  });
});

describe("syncing Dhan accounts", () => {
  const state = {
    history: [trade("o1", "BUY", "2026-11-13T09:20:05", 120), trade("o2", "SELL", "2026-11-13T09:31:40", 131)],
    today: [] as DhanTrade[],
    renewTo: undefined as string | undefined,
    failAuth: false,
    busy: 0,
    calls: [] as string[],
  };

  it("syncs history into the user's Dhan account, in rupees, with the charges netted", async () => {
    // Dhan says "too many requests" twice: the client waits and tries again instead of failing the sync.
    state.busy = 2;
    await saveDhanCredentials(db, U, { clientId: CLIENT, accessToken: TOKEN(1) }, keys.publicKey, { expiresAt: NOW + 20 * HOUR, now: NOW });
    const [r] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: NOW });
    expect(r.error).toBeUndefined();
    expect(r.summary?.history).toBe(2);
    const [t] = await listTrades(U);
    const [account] = await db.select().from(schema.accounts).where(eq(schema.accounts.id, t.accountId));
    expect(account).toMatchObject({ userId: U, broker: "dhan", currency: "INR" });
    expect(t.grossPnl).toBeCloseTo(75 * 11);
    expect(t.netPnl).toBeCloseTo(75 * 11 - 2 * 35.21);
    expect(t.tags.map((g) => g.tag)).not.toContain("no_stop");
    expect((await getBrokerStatus(db, U, "dhan"))?.status).toBe("ok");
  });

  it("adds today's trades once, and never lets the trade book overwrite the history's copy", async () => {
    state.calls.length = 0;
    const later = NOW + 5 * 60_000;
    // Trade book: o3 (new) and o2 again without charges.
    state.today = [trade("o3", "BUY", "2026-11-16T11:00:00", 100, false), trade("o2", "SELL", "2026-11-13T09:31:40", 131, false)];
    const [r] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: later });
    expect(r.summary).toMatchObject({ history: null, today: 1 });
    expect(state.calls).not.toContain("/trades/2026-11-09/2026-11-16/0");
    const [o2] = await db.select().from(schema.fills).where(eq(schema.fills.id, "dhan:o2:0"));
    expect(o2.commission).toBeCloseTo(35.21);
    // A quiet minute writes nothing and rebuilds nothing.
    const [quiet] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: later + 60_000 });
    expect(quiet.summary).toMatchObject({ history: null, today: 0, rebuild: null });
  });

  it("stores a trade once when the trade book and the history both report it", async () => {
    const at = NOW + 30 * 60_000;
    // 14:17: a 1-lot buy shows in today's trade book first (no charges, the exchange's trade number).
    state.today = [trade("o4", "BUY", "2026-11-16T14:17:53", 122.6, false)];
    await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: at });
    // A copy stored under the old id scheme (the exchange's trade number), as on the live database.
    const [account] = await db.select().from(schema.accounts).where(and(eq(schema.accounts.userId, U), eq(schema.accounts.broker, "dhan")));
    const stale = { ...toDhanFillRow(trade("o4", "BUY", "2026-11-16T14:17:53", 122.6, false)), id: "dhan:o4:5049775", userId: U, accountId: account.id };
    await db.insert(schema.fills).values(stale);
    // Later the history reports the same trade with its charges, as trade "0".
    state.history = [...state.history, trade("o4", "BUY", "2026-11-16T14:17:53", 122.6)];
    const [r] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: at + 20 * 60_000 });
    expect(r.error).toBeUndefined();
    const o4 = await db.select().from(schema.fills).where(and(eq(schema.fills.userId, U), eq(schema.fills.orderId, "dhan:o4")));
    expect(o4.map((f) => [f.id, f.size])).toEqual([["dhan:o4:0", 75]]);
    expect(o4[0].commission).toBeCloseTo(35.21);
    // The trade book keeps reporting it all day without adding it back.
    const [quiet] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: at + 21 * 60_000 });
    expect(quiet.summary).toMatchObject({ history: null, today: 0, rebuild: null });
    // o4 adds one lot to the o3 position still open on the same contract: two lots, not three.
    const open = (await listTrades(U)).find((t) => t.id === "dhan:o3:0");
    expect(open?.maxQty).toBe(150);
    state.today = [];
  });

  it("renews the token before it runs out and keeps using the new one", async () => {
    state.renewTo = TOKEN(2);
    // 2 hours left: inside the renewal window.
    const at = NOW + 18 * HOUR;
    const [r] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: at });
    expect(r.error).toBeUndefined();
    expect(r.renewed).toBe(true);
    const [row] = await db.select().from(schema.brokerCredentials).where(and(eq(schema.brokerCredentials.userId, U), eq(schema.brokerCredentials.broker, "dhan")));
    expect(openDhanCredentials(row, keys.privateKey).accessToken).toBe(TOKEN(2));
    expect(row.expiresAt).toBe(Date.UTC(2026, 10, 17, 6, 0));
    expect(row.status).toBe("ok");
  });

  it("asks for a new token once Dhan rejects it, or once it has expired, without calling Dhan", async () => {
    state.failAuth = true;
    const [r] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: NOW + 19 * HOUR });
    expect(r.error).toBe(DHAN_EXPIRED);
    expect((await getBrokerStatus(db, U, "dhan"))?.status).toBe("error");
    state.calls.length = 0;
    const [expired] = await syncDhanAccounts(db, keys.privateKey, { makeClient: fakeDhan(state), now: NOW + 60 * HOUR });
    expect(expired.error).toBe(DHAN_EXPIRED);
    expect(state.calls).toEqual([]);
  });

  it("reports one result per user across brokers", () => {
    const merged = mergeSyncResults(
      [{ userId: "a", summary: { rebuild: null } }, { userId: "b", error: "Delta down" }],
      [{ userId: "a", summary: { history: 2, today: 0, rebuild: { trades: 1, open: 0, pnlMismatches: 0, warnings: 0 } } }, { userId: "b", error: DHAN_EXPIRED }],
    );
    expect(merged).toEqual([
      { userId: "a", rebuilt: true },
      { userId: "b", rebuilt: false, error: `Delta down\n${DHAN_EXPIRED}` },
    ]);
    expect(new DhanApiError("x", 401, "DH-901").isAuth).toBe(true);
  });
});

describe("Dhan product types and expiries", () => {
  it("are read from the raw record", async () => {
    const { dhanFillMeta } = await import("@/lib/dhan/ingest");
    const { segmentOf } = await import("@/lib/range");
    expect(dhanFillMeta({ productType: "INTRADAY", drvExpiryDate: "2026-11-20" })).toEqual({ productType: "intraday", expiryDate: "2026-11-20" });
    expect(dhanFillMeta({ productType: "CNC", drvExpiryDate: "0001-01-01" })).toEqual({ productType: "delivery", expiryDate: null });
    expect(dhanFillMeta({ productType: null })).toEqual({ productType: null, expiryDate: null });
    // Shares never expire: Dhan writes the trade's own date there, from the history and the trade book alike.
    expect(dhanFillMeta({ productType: "CNC", instrument: "EQUITY", drvExpiryDate: "2024-07-10" }).expiryDate).toBeNull();
    expect(dhanFillMeta({ productType: "CNC", exchangeSegment: "NSE_EQ", drvExpiryDate: "2024-07-10" }).expiryDate).toBeNull();
    expect(dhanFillMeta({ productType: "INTRADAY", instrument: "OPTIDX", exchangeSegment: "NSE_FNO", drvExpiryDate: "2026-11-17" }).expiryDate).toBe("2026-11-17");
    expect(segmentOf({ contractType: "options", productType: "intraday" })).toBe("options");
    expect(segmentOf({ contractType: "equity", productType: "delivery" })).toBe("delivery");
    expect(segmentOf({ contractType: "perpetual_futures", productType: null })).toBeNull();
  });
});
