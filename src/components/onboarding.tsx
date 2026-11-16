import Link from "next/link";
import { DeltaConnect } from "@/components/delta-connect";
import { DhanConnect } from "@/components/dhan-connect";
import type { BrokerStatus } from "@/lib/keys/brokers";
import type { DeltaKeyStatus } from "@/lib/keys/credentials";

/** What a new user sees until their first sync works: connect Delta Exchange or Dhan (or both). */
export function Onboarding({ status, dhan }: { status: DeltaKeyStatus | null; dhan: BrokerStatus | null }) {
  return (
    <main id="main" className="container pt-12 pb-24">
      <div className="grid gap-x-8 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <h1 className="text-[clamp(2.5rem,5vw,4rem)]">Welcome to Hardwon</h1>
          <p className="mt-5 max-w-[34ch] text-[clamp(1.25rem,1.6vw,1.5rem)] leading-snug text-ink">
            Connect your broker and your trades appear here within minutes, with your history: Delta Exchange for crypto, Dhan for stocks and
            F&amp;O. It takes about five minutes.
          </p>
          <p className="face-label mt-6 text-base text-ink-2">
            Want to look around first?{" "}
            <Link href="/demo" className="link">
              Open the demo account
            </Link>
          </p>
        </div>
        <div className="space-y-16 lg:col-span-7">
          <section className="opens" aria-labelledby="connect-delta">
            <h2 id="connect-delta" className="text-xl">
              Delta Exchange
            </h2>
            <div className="mt-6">
              <DeltaConnect status={status} syncedBefore={false} />
            </div>
          </section>
          <section className="opens" aria-labelledby="connect-dhan">
            <h2 id="connect-dhan" className="text-xl">
              Dhan
            </h2>
            <div className="mt-6">
              <DhanConnect status={dhan} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
