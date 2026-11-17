import { auth, currentUser } from "@clerk/nextjs/server";
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
  const [existing] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId));
  if (existing?.email != null) return;
  // The email is for support mail, data export and deletion. Fetched from Clerk once;
  // "" marks an account without one, so Clerk is not asked again on every request.
  const email = await primaryEmail();
  if (existing) {
    if (email !== null) await db.update(schema.users).set({ email }).where(eq(schema.users.id, userId));
    return;
  }
  await db
    .insert(schema.users)
    .values({ id: userId, email, createdAt: now, plan: "founder", accessUntil: now + FOUNDER_ACCESS_DAYS * DAY_MS })
    .onConflictDoNothing();
}

/** The signed-in user's primary email from Clerk, "" if they have none, or null if Clerk could not be asked. */
async function primaryEmail(): Promise<string | null> {
  try {
    const user = await currentUser();
    return user ? (user.primaryEmailAddress?.emailAddress ?? "") : null;
  } catch {
    return null;
  }
}

/** The time of this request, for pages that show how long ago something was (reading the clock needs a request). */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
