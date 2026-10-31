import { currentUser } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard-view";
import { Landing } from "@/components/landing";
import { Onboarding } from "@/components/onboarding";
import { getDb } from "@/db";
import { greeting } from "@/lib/format";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { getSyncStatus } from "@/lib/queries";
import { readFilters } from "@/lib/range";
import { currentUserId } from "@/lib/session";

/** Signed out: the landing page. A new account: connect Delta. Otherwise: the dashboard. */
export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const userId = await currentUserId();
  if (!userId) return <Landing />;

  const [key, sync] = await Promise.all([getDb().then((db) => getDeltaKeyStatus(db, userId)), getSyncStatus(userId)]);
  const syncedOnce = sync.some((s) => s.lastRunAt && !s.lastError);
  if (!syncedOnce && key?.status !== "ok") return <Onboarding status={key} />;

  const user = await currentUser();
  return <DashboardView userId={userId} filters={readFilters(await searchParams)} greeting={greeting(user?.firstName ?? user?.fullName?.split(" ")[0])} />;
}
