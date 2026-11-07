// Backs up the whole database named by DATABASE_URL (Turso) into
// data/backups/hardwon-<UTC date and time>.db.gz, checking every table's row count,
// and deletes backups older than BACKUP_KEEP_DAYS (default 30).
// Runs daily on the server from the delta-journal-backup timer.
//   npm run db:backup
// Restore: gunzip the file, check it with sqlite3, then load it into a new Turso database
// (turso db create <name> --from-file <file>.db) and point DATABASE_URL at it.

import { rmSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { backupDatabase, ensureDir, gzipFile, pruneBackups } from "@/db/backup";

const DIR = path.resolve("data/backups");
const PREFIX = "hardwon-";

async function main() {
  const url = process.env.DATABASE_URL ?? "file:data/journal.db";
  const keepDays = Math.max(1, Number(process.env.BACKUP_KEEP_DAYS) || 30);
  ensureDir(DIR);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = path.join(DIR, `${PREFIX}${stamp}.db`);

  const source = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  const started = Date.now();
  try {
    const copied = await backupDatabase(source, file);
    const gz = await gzipFile(file);
    const rows = Object.values(copied).reduce((a, b) => a + b, 0);
    const removed = pruneBackups(DIR, PREFIX, keepDays);
    console.log(
      `Backup ${path.basename(gz.out)}: ${Object.keys(copied).length} tables, ${rows} rows, ` +
        `${((Date.now() - started) / 1000).toFixed(1)} s` +
        (removed.length ? `; removed ${removed.length} older than ${keepDays} days` : ""),
    );
    if (!gz.removed) console.log(`(Windows kept ${path.basename(file)} locked; delete it once this exits.)`);
  } catch (err) {
    rmSync(file, { force: true });
    rmSync(`${file}.gz.part`, { force: true });
    throw err;
  } finally {
    source.close();
  }
}

main().catch((err) => {
  console.error("Backup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
