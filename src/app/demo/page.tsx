import Link from "next/link";
import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard-view";
import { DEMO_USER } from "@/lib/demo";
import { readFilters } from "@/lib/range";

export const metadata = { title: "Demo · Edgebook" };

/** A public, read-only dashboard of made-up trades. No account needed. */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  await connection();
  return (
    <>
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        Demo account with made-up trades.{" "}
        <Link href="/waitlist" className="font-medium underline">
          Join the waitlist
        </Link>{" "}
        to see your own.
      </div>
      <DashboardView userId={DEMO_USER} filters={readFilters(await searchParams)} demo />
    </>
  );
}
