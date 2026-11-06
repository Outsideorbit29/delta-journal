// Moves data to an Hardwon account.
//   npm run claim-legacy -- user_xxx                  the pre-accounts data (owner "legacy")
//   npm run claim-legacy -- user_new --from user_old  a whole account to a new Clerk id, for example
//                                                     from the development instance to the production one
// The target must have signed in once and have no synced data. A stored Delta key
// cannot move (it is sealed to its owner), so its owner connects it again.
// Afterwards set OWNER_USER_ID in .env.local (PC and server) if the owner moved.

import { getDb } from "@/db";
import { claimRows } from "@/db/claim";
import { LEGACY_USER } from "@/db/schema";

async function main() {
  const args = process.argv.slice(2);
  const to = args[0]?.trim();
  const fromAt = args.indexOf("--from");
  const from = fromAt >= 0 ? args[fromAt + 1]?.trim() : LEGACY_USER;
  if (!to?.startsWith("user_") || !from) throw new Error("Usage: npm run claim-legacy -- user_new [--from user_old]");
  const moved = await claimRows(await getDb(), from, to);
  for (const [name, n] of Object.entries(moved)) console.log(`${name.padEnd(20)} ${n} rows`);
  if (moved.delta_credentials_dropped) console.log("The stored Delta key could not move (it is sealed to the old id): connect it again in Settings.");
  console.log(`Done. If this was the owner, set OWNER_USER_ID=${to} in .env.local on the PC and the server.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
