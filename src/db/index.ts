import { mkdirSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DEFAULT_URL = "file:data/journal.db";

function createDb() {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL;
  if (url.startsWith("file:")) {
    mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return drizzle({ client, schema });
}

export type Db = ReturnType<typeof createDb>;

// Reuse one connection across Next.js hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Db; dbReady?: Promise<Db> };

/** The database, with migrations applied. */
export function getDb(): Promise<Db> {
  if (!globalForDb.dbReady) {
    const db = (globalForDb.db ??= createDb());
    globalForDb.dbReady = migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })
      .then(() => db)
      .catch((err) => {
        globalForDb.dbReady = undefined;
        throw err;
      });
  }
  return globalForDb.dbReady;
}

export { schema };
