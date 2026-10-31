// Replaces the public demo account's made-up trades with a fresh set ending
// now (the dates slowly go stale, so re-run it now and then):
//   npm run demo:seed

import { getDb } from "@/db";
import { seedDemo } from "@/lib/demo";

async function main() {
  const summary = await seedDemo(await getDb());
  console.log(`Demo account: ${summary.trades} trades, ${summary.journaled} journaled, ${summary.warnings} warnings.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
