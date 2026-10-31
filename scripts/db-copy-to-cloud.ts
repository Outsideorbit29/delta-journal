// Copies the local journal (data/journal.db) into the cloud database named by
// DATABASE_URL (libsql://..., with DATABASE_AUTH_TOKEN). The cloud database must
// be empty; nothing is overwritten.
//   npm run db:copy-to-cloud

import { openDatabase } from "@/db";
import { copyDatabase } from "@/db/copy";

async function main() {
  const target = process.env.DATABASE_URL;
  if (!target?.startsWith("libsql://")) throw new Error("Set DATABASE_URL to your Turso database (libsql://...) and DATABASE_AUTH_TOKEN in .env.local.");
  const copied = await copyDatabase(await openDatabase("file:data/journal.db"), await openDatabase(target));
  for (const [name, n] of Object.entries(copied)) console.log(`${name.padEnd(20)} ${n} rows`);
  console.log("Done. The cloud database now matches your local journal.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
