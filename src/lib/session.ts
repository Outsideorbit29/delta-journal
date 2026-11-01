import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getDb, schema } from "@/db";

/** Free access for founding members lasts this long from sign-up. */
export const FOUNDER_ACCESS_DAYS = 90;
const DAY_MS = 86_400_000;

/**
 * The signed-in user's id. Every page, action and API route gets the user
 * from here and passes it to every query. Not signed in → the sign-in page.
 * The first visit creates the user's row.
 */
export const requireUserId = cache(async (): Promise<string> => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  await ensureUser(userId);
  return userId;
});

/** Like requireUserId, for server actions and API routes: null instead of a redirect. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await ensureUser(userId);
  return userId;
}

async function ensureUser(userId: string) {
  // Reading the clock needs a request first; prerendering must never fix the sign-up time.
  await connection();
  const now = Date.now();
  const db = await getDb();
  const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId));
  if (existing) return;
  await db
    .insert(schema.users)
    .values({ id: userId, createdAt: now, plan: "founder", accessUntil: now + FOUNDER_ACCESS_DAYS * DAY_MS })
    .onConflictDoNothing();
}
