import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import type { Broker } from "@/db/schema";
import type { DhanCredentials } from "@/lib/dhan/client";
import { open, seal } from "./sealed";

// Access to brokers other than Delta (Dhan today), sealed like Delta keys: the website seals with
// DELTA_KEYS_PUBLIC_KEY and cannot open; the sync server opens with DELTA_KEYS_PRIVATE_KEY and, after
// renewing a token, seals the new one the same way.

export type BrokerStatus = Pick<
  typeof schema.brokerCredentials.$inferSelect,
  "broker" | "keyHint" | "status" | "lastError" | "checkedAt" | "expiresAt" | "updatedAt"
>;

/** Bound to the owner and the broker, so a box moved to another user's or broker's row will not open. */
const context = (userId: string, broker: Broker) => `edgebook:${broker}:${userId}`;

const CLIENT_ID = /^\d{6,14}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** Checks the shape of a pasted Dhan client id and token. Returns an error message, or null when they look right. */
export function checkDhanCredentials(clientId: string, accessToken: string): string | null {
  if (!clientId || !accessToken) return "Paste both your Dhan client ID and the access token.";
  if (!CLIENT_ID.test(clientId)) return "That client ID does not look right: it is the number on your Dhan profile.";
  if (accessToken.length < 40 || accessToken.length > 4000 || !TOKEN.test(accessToken)) {
    return "That access token does not look right: copy the whole token from Dhan, without spaces.";
  }
  return null;
}

/** Seals and stores the user's Dhan access, replacing any earlier one. */
export async function saveDhanCredentials(
  db: Db,
  userId: string,
  credentials: DhanCredentials,
  publicKey: string,
  { expiresAt, status = "pending", now = Date.now() }: { expiresAt: number | null; status?: "pending" | "ok"; now?: number },
) {
  const update = {
    keyHint: credentials.clientId.slice(-4),
    sealed: sealDhan(userId, credentials, publicKey),
    status,
    lastError: null,
    checkedAt: status === "ok" ? now : null,
    expiresAt,
    updatedAt: now,
  };
  await db
    .insert(schema.brokerCredentials)
    .values({ userId, broker: "dhan", createdAt: now, ...update })
    .onConflictDoUpdate({ target: [schema.brokerCredentials.userId, schema.brokerCredentials.broker], set: update });
}

function sealDhan(userId: string, { clientId, accessToken }: DhanCredentials, publicKey: string) {
  return seal(publicKey, JSON.stringify({ c: clientId, t: accessToken }), context(userId, "dhan"));
}

export async function removeBrokerCredentials(db: Db, userId: string, broker: Broker) {
  await db.delete(schema.brokerCredentials).where(and(eq(schema.brokerCredentials.userId, userId), eq(schema.brokerCredentials.broker, broker)));
}

/** What the settings page shows. Never includes the sealed token. */
export async function getBrokerStatus(db: Db, userId: string, broker: Broker): Promise<BrokerStatus | null> {
  const [row] = await db
    .select({
      broker: schema.brokerCredentials.broker,
      keyHint: schema.brokerCredentials.keyHint,
      status: schema.brokerCredentials.status,
      lastError: schema.brokerCredentials.lastError,
      checkedAt: schema.brokerCredentials.checkedAt,
      expiresAt: schema.brokerCredentials.expiresAt,
      updatedAt: schema.brokerCredentials.updatedAt,
    })
    .from(schema.brokerCredentials)
    .where(and(eq(schema.brokerCredentials.userId, userId), eq(schema.brokerCredentials.broker, broker)));
  return row ?? null;
}

/** Server only: opens a stored Dhan token. */
export function openDhanCredentials(row: { userId: string; sealed: string }, privateKey: string): DhanCredentials {
  const { c, t } = JSON.parse(open(privateKey, row.sealed, context(row.userId, "dhan"))) as { c: string; t: string };
  return { clientId: c, accessToken: t };
}

/**
 * Server only: stores a renewed token in place of the old one, unless the user replaced it meanwhile.
 * Returns the new sealed box (null when the row changed under us).
 */
export async function replaceDhanToken(
  db: Db,
  row: { userId: string; sealed: string },
  credentials: DhanCredentials,
  publicKey: string,
  expiresAt: number | null,
  now = Date.now(),
): Promise<string | null> {
  const sealed = sealDhan(row.userId, credentials, publicKey);
  const updated = await db
    .update(schema.brokerCredentials)
    .set({ sealed, expiresAt, updatedAt: now })
    .where(
      and(eq(schema.brokerCredentials.userId, row.userId), eq(schema.brokerCredentials.broker, "dhan"), eq(schema.brokerCredentials.sealed, row.sealed)),
    )
    .returning({ sealed: schema.brokerCredentials.sealed });
  return updated.length ? sealed : null;
}

/** Records the outcome of a sync with the stored access. Access the user replaced meanwhile is left alone. */
export async function markBrokerChecked(db: Db, userId: string, broker: Broker, sealed: string, error: string | null, now = Date.now()) {
  await db
    .update(schema.brokerCredentials)
    .set({ status: error ? "error" : "ok", lastError: error, checkedAt: now })
    .where(and(eq(schema.brokerCredentials.userId, userId), eq(schema.brokerCredentials.broker, broker), eq(schema.brokerCredentials.sealed, sealed)));
}
