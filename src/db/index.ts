import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DEFAULT_URL = "file:data/journal.db";

function createDb(url: string) {
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return { client, db: drizzle({ client, schema }) };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Opens a database at `url` and applies migrations. */
export async function openDatabase(url: string): Promise<Db> {
  const local = url.startsWith("file:");
  if (local) mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  const { client, db } = createDb(url);
  if (local) {
    // The web app and the Telegram bot write to the same file. WAL lets them
    // read while the other writes; the busy timeout makes a writer wait for
    // the other instead of failing.
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

// Reuse one connection across Next.js hot reloads in development.
const globalForDb = globalThis as unknown as { dbReady?: Promise<Db> };

/** The app database, with migrations applied. */
export function getDb(): Promise<Db> {
  globalForDb.dbReady ??= openDatabase(process.env.DATABASE_URL ?? DEFAULT_URL).catch((err) => {
    globalForDb.dbReady = undefined;
    throw err;
  });
  return globalForDb.dbReady;
}

export { schema };
