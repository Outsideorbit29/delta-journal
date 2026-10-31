import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { open, seal } from "./sealed";

// Users' Delta API keys. The website only ever seals (DELTA_KEYS_PUBLIC_KEY);
// the sync server opens them (DELTA_KEYS_PRIVATE_KEY, never on Vercel).

export type DeltaKeyStatus = Pick<typeof schema.deltaCredentials.$inferSelect, "keyHint" | "status" | "lastError" | "checkedAt" | "updatedAt">;

export interface DeltaKey {
  apiKey: string;
  apiSecret: string;
}

export const sealPublicKey = () => process.env.DELTA_KEYS_PUBLIC_KEY?.trim() || null;
export const sealPrivateKey = () => process.env.DELTA_KEYS_PRIVATE_KEY?.trim() || null;

/** The box is bound to its owner, so a sealed key moved to another user's row will not open. */
const context = (userId: string) => `edgebook:delta:${userId}`;

const KEY_PATTERN = /^[A-Za-z0-9]{16,128}$/;

/** Checks the shape of a pasted key and secret. Returns an error message, or null when they look right. */
export function checkDeltaKey(apiKey: string, apiSecret: string): string | null {
  if (!apiKey || !apiSecret) return "Paste both the API key and the API secret.";
  if (!KEY_PATTERN.test(apiKey)) return "That API key does not look right: it should be letters and digits only.";
  if (!KEY_PATTERN.test(apiSecret)) return "That API secret does not look right: it should be letters and digits only.";
  if (apiKey === apiSecret) return "The key and the secret are the same. Paste the secret into the second box.";
  return null;
}

/** Seals and stores the user's key, replacing any earlier one. The server tests it on its next sync. */
export async function saveDeltaKey(db: Db, userId: string, key: DeltaKey, publicKey: string, now = Date.now()) {
  const update = {
    keyHint: key.apiKey.slice(-4),
    sealed: seal(publicKey, JSON.stringify({ k: key.apiKey, s: key.apiSecret }), context(userId)),
    status: "pending" as const,
    lastError: null,
    checkedAt: null,
    updatedAt: now,
  };
  // Replacing a key keeps when the user first connected one.
  await db
    .insert(schema.deltaCredentials)
    .values({ userId, createdAt: now, ...update })
    .onConflictDoUpdate({ target: schema.deltaCredentials.userId, set: update });
}

export async function removeDeltaKey(db: Db, userId: string) {
  await db.delete(schema.deltaCredentials).where(eq(schema.deltaCredentials.userId, userId));
}

/** What the settings page shows. Never includes the sealed key. */
export async function getDeltaKeyStatus(db: Db, userId: string): Promise<DeltaKeyStatus | null> {
  const [row] = await db
    .select({
      keyHint: schema.deltaCredentials.keyHint,
      status: schema.deltaCredentials.status,
      lastError: schema.deltaCredentials.lastError,
      checkedAt: schema.deltaCredentials.checkedAt,
      updatedAt: schema.deltaCredentials.updatedAt,
    })
    .from(schema.deltaCredentials)
    .where(eq(schema.deltaCredentials.userId, userId));
  return row ?? null;
}

/** Server only: opens a stored key. */
export function openDeltaKey(row: { userId: string; sealed: string }, privateKey: string): DeltaKey {
  const { k, s } = JSON.parse(open(privateKey, row.sealed, context(row.userId))) as { k: string; s: string };
  return { apiKey: k, apiSecret: s };
}

/** Records the outcome of a sync with the stored key. A key the user replaced meanwhile is left alone. */
export async function markDeltaKeyChecked(db: Db, userId: string, sealed: string, error: string | null, now = Date.now()) {
  await db
    .update(schema.deltaCredentials)
    .set({ status: error ? "error" : "ok", lastError: error, checkedAt: now })
    .where(and(eq(schema.deltaCredentials.userId, userId), eq(schema.deltaCredentials.sealed, sealed)));
}
