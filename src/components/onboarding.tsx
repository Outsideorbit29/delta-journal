import Link from "next/link";
import { DeltaConnect } from "@/components/delta-connect";
import type { DeltaKeyStatus } from "@/lib/keys/credentials";

/** What a new user sees until their first sync works: connect a Delta key. */
export function Onboarding({ status }: { status: DeltaKeyStatus | null }) {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Edgebook</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your Delta Exchange India account and your trades appear here within a minute, with all your history. It takes about five
          minutes.
        </p>
      </div>
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <DeltaConnect status={status} syncedBefore={false} />
      </section>
      <p className="text-sm text-zinc-500">
        Want to look around first?{" "}
        <Link href="/demo" className="underline hover:text-zinc-900 dark:hover:text-zinc-100">
          Open the demo account
        </Link>
        .
      </p>
    </main>
  );
}
