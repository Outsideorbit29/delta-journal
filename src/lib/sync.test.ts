import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDatabase, schema, type Db } from "@/db";
import { toOrderRow } from "@/lib/delta/ingest";
import type { DeltaOrder } from "@/lib/delta/types";
import { canonicalJson, writeChanged } from "./sync";

let dir: string;
let db: Db;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "journal-sync-"));
  db = await openDatabase(`file:${path.join(dir, "test.db")}`);
});

afterAll(() => {
  db.$client.close();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

const order = (id: number, state = "open"): DeltaOrder => ({
  id,
  product_id: 1,
  product_symbol: "XAUTUSD",
  side: "buy",
  order_type: "market_order",
  stop_order_type: "stop_loss_order",
  stop_price: "3930",
  limit_price: null,
  bracket_stop_loss_price: null,
  bracket_take_profit_price: null,
  size: 500,
  unfilled_size: 500,
  state,
  reduce_only: true,
  cancellation_reason: null,
  created_at: "2026-10-30T15:00:00Z",
  updated_at: null,
});

describe("writeChanged", () => {
  it("writes new and changed records only, so re-syncing costs no writes", async () => {
    const write = (orders: DeltaOrder[]) => writeChanged(db, "u1", schema.orders, orders.map(toOrderRow), (r) => r.id!);

    expect(await write([order(1), order(2)])).toBe(2);
    expect(await write([order(1), order(2)])).toBe(0);
    // The stop triggered: only that order is rewritten.
    expect(await write([order(1, "closed"), order(2)])).toBe(1);
    const rows = await db.select().from(schema.orders);
    expect(rows.find((r) => r.id === 1)?.state).toBe("closed");
  });

  it("treats a record whose fields arrive in a different order as unchanged", async () => {
    const shuffled = Object.fromEntries(Object.entries(order(2)).reverse()) as unknown as DeltaOrder;
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(order(2)));
    expect(await writeChanged(db, "u1", schema.orders, [toOrderRow(shuffled)], (r) => r.id!)).toBe(0);
    expect(canonicalJson({ b: 1, a: { d: [{ y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[{"x":2,"y":1}]},"b":1}');
  });

  it("handles the same record twice in one batch", async () => {
    expect(await writeChanged(db, "u1", schema.orders, [order(3), order(3, "closed")].map(toOrderRow), (r) => r.id!)).toBe(1);
    const rows = await db.select().from(schema.orders);
    expect(rows.find((r) => r.id === 3)?.state).toBe("closed");
  });
});
