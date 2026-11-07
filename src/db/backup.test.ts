import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterAll, describe, expect, it } from "vitest";
import { openDatabase, schema } from "@/db";
import { backupDatabase, gzipFile, pruneBackups } from "./backup";

const dir = mkdtempSync(path.join(tmpdir(), "journal-backup-"));
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
});

describe("backupDatabase", () => {
  it("copies every table in the schema, with rows, indexes and the migrations table", async () => {
    const srcPath = path.join(dir, "src.db");
    const db = await openDatabase(`file:${srcPath}`);
    await db.insert(schema.appState).values({ userId: "u1", key: "k", value: "v" });
    await db.insert(schema.users).values({ id: "u1", email: "a@b.c", plan: "founder", accessUntil: 1, createdAt: 1 });
    await db.insert(schema.journalEntries).values({ userId: "u1", tradeId: "t", emotions: ["fomo"], mistakes: [], createdAt: 1, updatedAt: 1 });

    const source = createClient({ url: `file:${srcPath}` });
    const out = path.join(dir, "out.db");
    const copied = await backupDatabase(source, out);
    source.close();

    // Every table the app defines is in the backup, so a new table can never be left out.
    for (const t of Object.values(schema)) if (is(t, SQLiteTable)) expect(copied).toHaveProperty(getTableName(t));
    expect(copied).toMatchObject({ app_state: 1, users: 1, journal_entries: 1, fills: 0 });
    expect(copied["__drizzle_migrations"]).toBeGreaterThan(0);

    const restored = await openDatabase(`file:${out}`); // migrations already applied: a no-op
    const [entry] = await restored.select().from(schema.journalEntries);
    expect(entry.emotions).toEqual(["fomo"]);
    const back = createClient({ url: `file:${out}` });
    const indexes = await back.execute("select count(*) as n from sqlite_master where type = 'index' and sql is not null");
    expect(Number(indexes.rows[0].n)).toBeGreaterThan(0);
    back.close();

    await expect(backupDatabase(createClient({ url: `file:${srcPath}` }), out)).rejects.toThrow(/already exists/);
  });

  it("gzips a file and prunes old backups only", async () => {
    const f = path.join(dir, "hardwon-x.db");
    writeFileSync(f, "hello");
    const { out: gz, removed } = await gzipFile(f);
    expect(removed).toBe(true);
    expect(existsSync(f)).toBe(false);
    expect(gunzipSync(readFileSync(gz)).toString()).toBe("hello");

    const old = path.join(dir, "hardwon-old.db.gz");
    const other = path.join(dir, "keep-me.txt");
    writeFileSync(old, "");
    writeFileSync(other, "");
    const longAgo = new Date(Date.now() - 40 * 86_400_000);
    utimesSync(old, longAgo, longAgo);
    utimesSync(other, longAgo, longAgo);
    expect(pruneBackups(dir, "hardwon-", 30)).toEqual(["hardwon-old.db.gz"]);
    expect(existsSync(gz) && existsSync(other)).toBe(true);
  });
});
