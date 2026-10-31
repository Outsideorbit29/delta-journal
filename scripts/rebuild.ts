import { getDb, schema } from "@/db";
import { rebuildTrades } from "@/lib/trades/rebuild";

async function main() {
  // Rebuild every user who has synced data (e.g. after changing the tag thresholds).
  const db = await getDb();
  const owners = await db.selectDistinct({ userId: schema.fills.userId }).from(schema.fills);
  for (const { userId } of owners) {
    const summary = await rebuildTrades(db, userId);
    console.log(
      `${userId}: rebuilt ${summary.trades} trades (${summary.open} open), ` +
        `${summary.pnlMismatches} P&L mismatches with Delta, ${summary.warnings} warnings`,
    );
  }
  if (!owners.length) console.log("No synced data yet.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
