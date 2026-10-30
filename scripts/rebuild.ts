import { getDb } from "@/db";
import { rebuildTrades } from "@/lib/trades/rebuild";

async function main() {
  const summary = await rebuildTrades(await getDb());
  console.log(
    `Rebuilt ${summary.trades} trades (${summary.open} open), ` +
      `${summary.pnlMismatches} P&L mismatches with Delta, ${summary.warnings} warnings`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
