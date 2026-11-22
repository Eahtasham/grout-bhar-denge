import { randomInt } from "node:crypto";
import { sql } from "@/lib/db";
import { pruneRateHits, rateKey } from "@/lib/ratelimit";

const LIMIT_PER_MIN = 30;

/** Starts a round: returns a session id and the seed for the crack layout. One round trip. */
export async function POST(req: Request) {
  try {
    const { key, bucket } = rateKey(req, "session");
    const seed = randomInt(1, 2 ** 32 - 1);
    const [row] = await sql<{ hits: number; id: string | null }[]>`
      with rl as (
        insert into rate_hits (key, bucket) values (${key}, ${bucket})
        on conflict (key, bucket) do update set count = rate_hits.count + 1
        returning count
      ), ins as (
        insert into game_sessions (seed)
        select ${seed} where (select count from rl) <= ${LIMIT_PER_MIN}
        returning id
      )
      select (select count from rl) as hits, (select id from ins) as id`;
    pruneRateHits(bucket);
    if (Math.random() < 0.05) {
      sql`delete from game_sessions where started_at < now() - interval '1 hour'`.catch(() => {});
    }
    if (!row.id) return Response.json({ error: "Thoda saans le lo, phir khelo" }, { status: 429 });
    return Response.json({ sessionId: row.id, seed }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("session error", e);
    return Response.json({ error: "Server busy" }, { status: 500 });
  }
}
