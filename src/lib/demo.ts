import { eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { toFillRow, toOrderRow, toWalletRow } from "@/lib/delta/ingest";
import type { DeltaFill, DeltaOrder, DeltaWalletTransaction } from "@/lib/delta/types";
import { saveJournalEntry } from "@/lib/journal/save";
import { writeChanged } from "@/lib/sync";
import { rebuildTrades } from "@/lib/trades/rebuild";

// The public demo (/demo): made-up trades for a made-up trader, run through
// the real rebuild so the dashboard, tags and stats behave exactly as they do
// for a real account. They follow the pattern the app is built to reveal:
// scalps lose to fees, swing trades with a stop make money, stops moved while
// losing cost the most, and stops trailed into profit pay.
//
// Ids never clash with Delta's: fills and wallet records are "demo-…", orders
// have negative ids (Delta's are positive). Clerk user ids start with "user_",
// so no account can ever be the demo user.

export const DEMO_USER = "demo";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TAKER_FEE = 0.0005;

const PRODUCTS = [
  { id: 900_001, symbol: "XAUTUSD", contractValue: 0.001, price: 4000, size: [150, 600], weight: 0.6 },
  { id: 900_002, symbol: "BTCUSD", contractValue: 0.001, price: 95_000, size: [6, 25], weight: 0.25 },
  { id: 900_003, symbol: "ETHUSD", contractValue: 0.01, price: 3500, size: [15, 60], weight: 0.15 },
] as const;

type Kind = "scalp" | "swing" | "moved_stop" | "trailed" | "no_stop";
const KINDS: [Kind, number][] = [
  ["scalp", 0.35],
  ["swing", 0.25],
  ["moved_stop", 0.12],
  ["trailed", 0.13],
  ["no_stop", 0.15],
];

export interface DemoData {
  fills: DeltaFill[];
  orders: DeltaOrder[];
  wallet: DeltaWalletTransaction[];
  /** Journal answers for a few trades, keyed by the opening fill id (= trade id). */
  journal: Record<string, Record<string, unknown>>;
}

/** The same `now` and `trades` always give the same data. */
export function demoData(now: number, trades = 90): DemoData {
  const rand = mulberry32(20261101);
  const pick = <T>(items: readonly (readonly [T, number])[]) => {
    let r = rand();
    for (const [item, w] of items) if ((r -= w) <= 0) return item;
    return items[items.length - 1][0];
  };
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const iso = (ts: number) => new Date(ts).toISOString();

  const fills: DeltaFill[] = [];
  const orders: DeltaOrder[] = [];
  const journal: DemoData["journal"] = {};
  const start = now - 90 * DAY;
  const wallet: DeltaWalletTransaction[] = [
    { uuid: "demo-deposit", transaction_type: "deposit", amount: "600", balance: "600", asset_symbol: "USD", product_id: null, created_at: iso(start - DAY) },
  ];

  let orderId = 0;
  let lostLast = false;
  let t = start;
  for (let i = 0; i < trades; i++) {
    // One position at a time: the next trade opens a while after the last one closed,
    // sometimes minutes later (a burst of trades), usually the next day or so.
    t += rand() < 0.35 ? between(10, 40) * MINUTE : between(8, 30) * HOUR;
    const product = pick(PRODUCTS.map((p) => [p, p.weight] as const));
    const kind = pick(KINDS);
    const dir = rand() < 0.55 ? 1 : -1;
    const entry = round(product.price * between(0.94, 1.06), product.price > 10_000 ? 0.5 : 0.01);
    // Sizing up right after a loss happens a lot in real journals.
    const size = Math.round(between(product.size[0], product.size[1]) * (lostLast && rand() < 0.4 ? 2 : 1));

    let holdMs: number;
    let move: number; // fraction of the entry price, in the trade's favour
    let stop: { at: number; distance: number; movedTo?: number; movedAfter?: number } | null = null;
    let stoppedOut = false;
    switch (kind) {
      case "scalp":
        holdMs = between(1, 9) * MINUTE;
        move = gauss(rand) * 0.0011 - 0.0002;
        break;
      case "swing": {
        holdMs = between(2, 30) * HOUR;
        stop = { at: between(10, 40) * 1000, distance: 0.006 };
        const win = rand() < 0.42;
        move = win ? between(0.009, 0.018) : -0.006;
        stoppedOut = !win;
        break;
      }
      case "moved_stop":
        holdMs = between(1, 12) * HOUR;
        stop = { at: between(10, 40) * 1000, distance: 0.005, movedTo: -0.015, movedAfter: holdMs * between(0.2, 0.6) };
        move = -0.015;
        stoppedOut = true;
        break;
      case "trailed": {
        holdMs = between(3, 40) * HOUR;
        const locked = between(0.002, 0.006);
        stop = { at: between(10, 40) * 1000, distance: 0.006, movedTo: locked, movedAfter: holdMs * between(0.4, 0.8) };
        move = locked;
        stoppedOut = true;
        break;
      }
      default:
        holdMs = between(20, 180) * MINUTE;
        move = gauss(rand) * 0.006 - 0.001;
    }

    const exit = round(entry * (1 + dir * move), product.price > 10_000 ? 0.5 : 0.01);
    const openTs = Math.round(t);
    const closeTs = Math.round(t + holdMs);
    const openSide = dir === 1 ? "buy" : "sell";
    const closeSide = dir === 1 ? "sell" : "buy";
    const ref = { id: product.id, symbol: product.symbol, contract_type: "perpetual_futures", contract_value: String(product.contractValue), notional_type: "vanilla" };
    const fee = (price: number) => (size * product.contractValue * price * TAKER_FEE).toFixed(6);

    const openOrder = --orderId;
    orders.push(order(openOrder, product, openSide, "market_order", null, null, size, "closed", iso(openTs)));
    let closeOrder = --orderId;
    if (stop) {
      const original = round(entry * (1 - dir * stop.distance), 0.01);
      const final = stop.movedTo === undefined ? original : round(entry * (1 + dir * stop.movedTo), 0.01);
      const stopOrder: DeltaOrder & { meta_data?: unknown } = order(
        closeOrder,
        product,
        closeSide,
        "market_order",
        "stop_loss_order",
        String(final),
        size,
        stoppedOut ? "closed" : "cancelled",
        iso(openTs + stop.at),
      );
      if (stop.movedAfter !== undefined) stopOrder.meta_data = { edit_timestamp: iso(openTs + stop.movedAfter).replace("T", " ") };
      orders.push(stopOrder);
      if (!stoppedOut) {
        closeOrder = --orderId;
        orders.push(order(closeOrder, product, closeSide, "market_order", null, null, size, "closed", iso(closeTs)));
      }
    } else {
      orders.push(order(closeOrder, product, closeSide, "market_order", null, null, size, "closed", iso(closeTs)));
    }

    const id = `demo-${i + 1}`;
    fills.push({
      id,
      order_id: String(openOrder),
      product_id: product.id,
      product_symbol: product.symbol,
      product: ref,
      side: openSide,
      size,
      price: String(entry),
      commission: fee(entry),
      credits_used: "0",
      role: "taker",
      fill_type: "normal",
      created_at: iso(openTs),
      meta_data: { leverage: kind === "scalp" ? "50" : "20", source: "web", new_position: { size: dir * size } },
    });
    fills.push({
      id: `${id}-close`,
      order_id: String(closeOrder),
      product_id: product.id,
      product_symbol: product.symbol,
      product: ref,
      side: closeSide,
      size,
      price: String(exit),
      commission: fee(exit),
      credits_used: "0",
      role: "taker",
      fill_type: stoppedOut ? "stop_loss" : "normal",
      created_at: iso(closeTs),
      meta_data: { leverage: kind === "scalp" ? "50" : "20", source: "web", new_position: { size: 0 } },
    });

    t = closeTs;
    lostLast = move <= 0;
    const note = JOURNAL[kind];
    if (note && rand() < 0.35) journal[id] = note;
  }
  // Move everything so the latest trade closed about a day ago, keeping the recent filters full.
  const lastClose = Math.max(...fills.map((f) => Date.parse(f.created_at)));
  return shiftTimes({ fills, orders, wallet, journal }, now - DAY - lastClose);
}

function shiftTimes(data: DemoData, byMs: number): DemoData {
  const shift = (stamp: string) => new Date(Date.parse(stamp.replace(" ", "T")) + byMs).toISOString();
  return {
    fills: data.fills.map((f) => ({ ...f, created_at: shift(f.created_at) })),
    orders: data.orders.map((o) => {
      const meta = (o as { meta_data?: { edit_timestamp?: string } }).meta_data;
      const moved = { ...o, created_at: shift(o.created_at) };
      return meta?.edit_timestamp ? { ...moved, meta_data: { edit_timestamp: shift(meta.edit_timestamp).replace("T", " ") } } : moved;
    }),
    wallet: data.wallet.map((w) => ({ ...w, created_at: shift(w.created_at) })),
    journal: data.journal,
  };
}

/** Replaces the demo account's data with fresh demo data ending now. */
export async function seedDemo(db: Db, now = Date.now()) {
  const data = demoData(now);
  await db.transaction(async (tx) => {
    for (const table of [schema.fills, schema.orders, schema.walletTransactions, schema.trades, schema.tradeFills, schema.tradeTags, schema.journalEntries]) {
      await tx.delete(table).where(eq(table.userId, DEMO_USER));
    }
  });
  await writeChanged(db, DEMO_USER, schema.fills, data.fills.map(toFillRow), (r) => r.id);
  await writeChanged(db, DEMO_USER, schema.orders, data.orders.map(toOrderRow), (r) => r.id!);
  await writeChanged(db, DEMO_USER, schema.walletTransactions, data.wallet.map(toWalletRow), (r) => r.uuid);
  const summary = await rebuildTrades(db, DEMO_USER);
  for (const [tradeId, answers] of Object.entries(data.journal)) await saveJournalEntry(db, DEMO_USER, tradeId, answers);
  return { ...summary, journaled: Object.keys(data.journal).length };
}

const JOURNAL: Partial<Record<Kind, Record<string, unknown>>> = {
  scalp: { setup: "breakout", emotions: ["fomo", "bored"], mistakes: ["chased_entry", "overtraded"], followedPlan: false, rating: 2, notes: "Jumped in on a spike with no plan. Fees ate the little I made." },
  swing: { setup: "pullback", emotions: ["calm"], mistakes: [], followedPlan: true, rating: 4, notes: "Waited for the pullback, stop under the swing low, let it run." },
  moved_stop: { setup: "reversal", emotions: ["fear", "revenge"], mistakes: ["moved_stop", "held_too_long"], followedPlan: false, rating: 1, notes: "Moved my stop because I was sure it would turn. It didn't." },
  trailed: { setup: "breakout", emotions: ["confident"], mistakes: [], followedPlan: true, rating: 5, notes: "Trailed the stop into profit once it moved my way." },
};

function order(
  id: number,
  product: (typeof PRODUCTS)[number],
  side: string,
  orderType: string,
  stopOrderType: string | null,
  stopPrice: string | null,
  size: number,
  state: string,
  createdAt: string,
): DeltaOrder {
  return {
    id,
    product_id: product.id,
    product_symbol: product.symbol,
    side,
    order_type: orderType,
    stop_order_type: stopOrderType,
    stop_price: stopPrice,
    limit_price: null,
    bracket_stop_loss_price: null,
    bracket_take_profit_price: null,
    size,
    unfilled_size: 0,
    state,
    reduce_only: stopOrderType !== null,
    cancellation_reason: null,
    created_at: createdAt,
    updated_at: null,
  };
}

const round = (value: number, step: number) => Math.round(value / step) * step;

/** A small seeded PRNG, so the demo is the same on every seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}
