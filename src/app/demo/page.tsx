import Link from "next/link";
import { connection } from "next/server";
import { DashboardView } from "@/components/dashboard-view";
import { DEMO_USER } from "@/lib/demo";
import { readFilters } from "@/lib/range";

export const metadata = { title: "Demo, Edgebook", description: "A read-only Edgebook dashboard of made-up trades: see which habits cost the demo trader money." };

/** A public, read-only dashboard of made-up trades. No account needed. */
export default async function DemoPage({ searchParams }: PageProps<"/demo">) {
  await connection();
  return (
    <>
      <div className="bg-paper-2 border-b border-rule-2">
        <p className="container face-label py-3 text-base text-ink-2">
          A demo account with made-up trades.{" "}
          <Link href="/waitlist" className="link">
            Join the waitlist
          </Link>{" "}
          to see your own.
        </p>
      </div>
      <DashboardView userId={DEMO_USER} filters={readFilters(await searchParams)} demo />
    </>
  );
}
