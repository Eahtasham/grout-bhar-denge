// Applies db/schema.sql. Usage: npm run db:migrate  (reads DATABASE_URL from .env.local)
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, ssl: "require", max: 1 });
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
try {
  await sql.unsafe(schema);
  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('game_sessions','scores','player_best','rate_hits')
    order by table_name`;
  console.log("Schema applied. Tables:", tables.map((t) => t.table_name).join(", "));
} finally {
  await sql.end();
}
