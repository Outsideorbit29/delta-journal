import { DeltaClient } from "@/lib/delta/client";
import { ownerUserId } from "@/lib/runtime";
import { syncAll } from "@/lib/sync";

async function main() {
  const started = Date.now();
  // DELTA_API_KEY in .env.local belongs to the owner, so this syncs the owner's account.
  const summary = await syncAll(ownerUserId(), DeltaClient.fromEnv());
  console.log(
    `Wrote ${summary.fills} new fills, ${summary.orders} new or changed orders, ${summary.walletTransactions} new wallet transactions`,
  );
  const r = summary.rebuild;
  console.log(
    r
      ? `Rebuilt ${r.trades} trades (${r.open} open), ${r.pnlMismatches} P&L mismatches with Delta, ${r.warnings} warnings ` +
          `in ${((Date.now() - started) / 1000).toFixed(1)}s`
      : "Nothing changed on Delta, so trades were left as they were.",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
