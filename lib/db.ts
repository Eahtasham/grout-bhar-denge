import "server-only";
import postgres from "postgres";

// Supabase transaction pooler (port 6543) is IPv4 and suits serverless functions.
// prepare:false is required in transaction mode.
const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    prepare: false,
    ssl: "require",
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export const sql: postgres.Sql = globalForDb.sql ?? (globalForDb.sql = create());
