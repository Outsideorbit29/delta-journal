// Applies database migrations to DATABASE_URL (the local file or your Turso database).
//   npm run db:migrate
import { getDb } from "@/db";

getDb()
  .then(() => console.log(`Database is up to date (${(process.env.DATABASE_URL ?? "file:data/journal.db").split("?")[0].replace(/\/\/.*@/, "//")}).`))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
