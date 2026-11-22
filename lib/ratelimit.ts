import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/** Fixed-window limiter stored in Postgres. Returns true if the request is allowed. */
export async function rateLimit(req: Request, route: string, limit: number, windowS = 60) {
  const ipHash = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 24);
  const key = `${route}:${ipHash}`;
  const bucket = Math.floor(Date.now() / 1000 / windowS);
  const [row] = await sql<{ count: number }[]>`
    insert into rate_hits (key, bucket) values (${key}, ${bucket})
    on conflict (key, bucket) do update set count = rate_hits.count + 1
    returning count`;
  if (Math.random() < 0.02) {
    await sql`delete from rate_hits where bucket < ${bucket - 5}`;
  }
  return row.count <= limit;
}
