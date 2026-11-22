import { randomInt } from "node:crypto";
import { sql } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

/** Starts a round: returns a session id and the seed for the crack layout. */
export async function POST(req: Request) {
  try {
    if (!(await rateLimit(req, "session", 30))) {
      return Response.json({ error: "Thoda saans le lo, phir khelo" }, { status: 429 });
    }
    const seed = randomInt(1, 2 ** 32 - 1);
    const [row] = await sql<{ id: string }[]>`
      insert into game_sessions (seed) values (${seed}) returning id`;
    if (Math.random() < 0.05) {
      await sql`delete from game_sessions where started_at < now() - interval '1 hour'`;
    }
    return Response.json({ sessionId: row.id, seed }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("session error", e);
    return Response.json({ error: "Server busy" }, { status: 500 });
  }
}
