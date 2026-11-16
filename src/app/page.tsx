import { currentUser } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard-view";
import { Landing } from "@/components/landing";
import { Onboarding } from "@/components/onboarding";
import { getDb } from "@/db";
import { greeting } from "@/lib/format";
import { getBrokerStatus } from "@/lib/keys/brokers";
import { getDeltaKeyStatus } from "@/lib/keys/credentials";
import { getSyncStatus } from "@/lib/queries";
import { readFilters } from "@/lib/range";
import { currentUserId } from "@/lib/session";

/** Signed out: the landing page. A new account: connect Delta or Dhan. Otherwise: the dashboard. */
export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const userId = await currentUserId();
  if (!userId) return <Landing />;

  const db = await getDb();
  const [key, dhan, sync] = await Promise.all([getDeltaKeyStatus(db, userId), getBrokerStatus(db, userId, "dhan"), getSyncStatus(userId)]);
  const syncedOnce = sync.some((s) => s.lastRunAt && !s.lastError);
  if (!syncedOnce && key?.status !== "ok" && dhan?.status !== "ok") return <Onboarding status={key} dhan={dhan} />;

  const user = await currentUser();
  return <DashboardView userId={userId} filters={readFilters(await searchParams)} greeting={greeting(user?.firstName ?? user?.fullName?.split(" ")[0])} />;
}
