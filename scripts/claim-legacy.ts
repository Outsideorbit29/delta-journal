// Gives the journal's existing data (from before accounts, owner "legacy") to
// your Edgebook account. Sign in to the app once, copy your user id from the
// Clerk dashboard (user_...), then:
//   npm run claim-legacy -- user_xxx
// Afterwards set OWNER_USER_ID=user_xxx in .env.local (PC and server) so the
// bot and npm run sync keep writing to your account.

import { getDb } from "@/db";
import { claimRows } from "@/db/claim";
import { LEGACY_USER } from "@/db/schema";

async function main() {
  const to = process.argv[2]?.trim();
  if (!to?.startsWith("user_")) throw new Error("Usage: npm run claim-legacy -- user_xxx (your Clerk user id)");
  const moved = await claimRows(await getDb(), LEGACY_USER, to);
  for (const [name, n] of Object.entries(moved)) console.log(`${name.padEnd(20)} ${n} rows`);
  console.log(`Done. Now set OWNER_USER_ID=${to} in .env.local on the PC and the server.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
