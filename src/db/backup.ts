import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { createClient, type Client, type InValue } from "@libsql/client";

// SQLite and libSQL keep their own bookkeeping in these; they are recreated by the engine.
const INTERNAL = /^(sqlite_|libsql_|_litestream|_cf_)/;
const BATCH = 200;

type SchemaRow = { type: string; name: string; sql: string };

/**
 * Copies every table of `source` (schema, rows, then indexes, triggers and views) into a new
 * SQLite file at `targetPath`, read straight from `sqlite_master`, so a table added later is
 * backed up without touching this code. The migrations table comes along, so the copy is a
 * complete database. Row counts are checked per table. Returns the rows copied per table.
 */
export async function backupDatabase(source: Client, targetPath: string): Promise<Record<string, number>> {
  if (existsSync(targetPath)) throw new Error(`${targetPath} already exists`);
  const objects = (
    await source.execute("select type, name, sql from sqlite_master where sql is not null order by rowid")
  ).rows.map((r) => ({ type: String(r.type), name: String(r.name), sql: String(r.sql) }) as SchemaRow);
  const tables = objects.filter((o) => o.type === "table" && !INTERNAL.test(o.name));
  const rest = objects.filter((o) => o.type !== "table" && !INTERNAL.test(o.name));

  const target = createClient({ url: `file:${targetPath}` });
  try {
    const copied: Record<string, number> = {};
    for (const t of tables) {
      await target.execute(t.sql);
      const q = quote(t.name);
      const { rows, columns } = await source.execute(`select * from ${q}`);
      if (rows.length) {
        const insert = `insert into ${q} (${columns.map(quote).join(", ")}) values (${columns.map(() => "?").join(", ")})`;
        for (let i = 0; i < rows.length; i += BATCH) {
          await target.batch(
            rows.slice(i, i + BATCH).map((row) => ({ sql: insert, args: columns.map((_, c) => row[c] as InValue) })),
            "write",
          );
        }
      }
      const n = Number((await target.execute(`select count(*) as n from ${q}`)).rows[0].n);
      if (n !== rows.length) throw new Error(`${t.name}: copied ${n} of ${rows.length} rows`);
      copied[t.name] = n;
    }
    for (const o of rest) await target.execute(o.sql);
    const check = String((await target.execute("pragma integrity_check")).rows[0][0]);
    if (check !== "ok") throw new Error(`The backup failed SQLite's integrity check: ${check}`);
    return copied;
  } finally {
    target.close();
  }
}

/**
 * Gzips `file` to `file.gz` (written beside it, then renamed) and removes the original. On Windows the
 * libSQL driver keeps a closed database file locked until the process exits; the original then stays
 * and `removed` is false.
 */
export async function gzipFile(file: string): Promise<{ out: string; removed: boolean }> {
  const out = `${file}.gz`;
  await pipeline(createReadStream(file), createGzip({ level: 9 }), createWriteStream(`${out}.part`));
  renameSync(`${out}.part`, out);
  try {
    rmSync(file);
    return { out, removed: true };
  } catch (err) {
    if (process.platform === "win32" && (err as NodeJS.ErrnoException).code === "EPERM") return { out, removed: false };
    throw err;
  }
}

/** Deletes `<prefix>…` files in `dir` older than `keepDays`, newest kept. Returns the names removed. */
export function pruneBackups(dir: string, prefix: string, keepDays: number, now = Date.now()): string[] {
  if (!existsSync(dir)) return [];
  const cutoff = now - keepDays * 86_400_000;
  const removed: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix)) continue;
    const file = path.join(dir, name);
    if (statSync(file).mtimeMs < cutoff) {
      rmSync(file);
      removed.push(name);
    }
  }
  return removed;
}

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

function quote(name: string) {
  return `"${name.replaceAll('"', '""')}"`;
}
