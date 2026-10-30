import { syncAll } from "@/lib/sync";

async function main() {
  const started = Date.now();
  const summary = await syncAll();
  console.log(`Synced ${summary.fills} fills, ${summary.orders} orders, ${summary.walletTransactions} wallet transactions`);
  console.log(
    `Rebuilt ${summary.rebuild.trades} trades (${summary.rebuild.open} open), ` +
      `${summary.rebuild.pnlMismatches} P&L mismatches with Delta, ${summary.rebuild.warnings} warnings ` +
      `in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
