import Link from "next/link";
import { DeltaConnect } from "@/components/delta-connect";
import type { DeltaKeyStatus } from "@/lib/keys/credentials";

/** What a new user sees until their first sync works: connect a Delta key. */
export function Onboarding({ status }: { status: DeltaKeyStatus | null }) {
  return (
    <main id="main" className="container pt-12 pb-24">
      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)]">Welcome to Edgebook</h1>
          <p className="mt-5 max-w-[34ch] text-[clamp(1.25rem,1.6vw,1.5rem)] leading-snug text-ink">
            Connect your Delta Exchange India account and your trades appear here within a minute, with all your history. It takes about five
            minutes.
          </p>
          <p className="face-label mt-6 text-base text-ink-2">
            Want to look around first?{" "}
            <Link href="/demo" className="link">
              Open the demo account
            </Link>
          </p>
        </div>
        <section className="opens lg:col-span-7" aria-label="Connect Delta Exchange">
          <DeltaConnect status={status} syncedBefore={false} />
        </section>
      </div>
    </main>
  );
}
