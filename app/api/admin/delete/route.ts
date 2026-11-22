import { timingSafeEqual } from "node:crypto";
import { sql } from "@/lib/db";

/**
 * Hidden admin route to remove spam or offensive entries.
 * curl -X POST /api/admin/delete -H "x-admin-secret: $ADMIN_SECRET" -d '{"id":"abc123XY"}'
 * Pass {"nickname":"..."} instead to remove every entry with that exact nickname.
 */
export async function POST(req: Request) {
  const secret = process.env.ADMIN_SECRET ?? "";
  const given = req.headers.get("x-admin-secret") ?? "";
  const ok =
    secret.length >= 16 &&
    given.length === secret.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { id?: string; nickname?: string };
  if (body.id) {
    const rows = await sql`delete from scores where id = ${body.id} returning id`;
    return Response.json({ deleted: rows.length });
  }
  if (body.nickname) {
    const rows = await sql`delete from scores where nickname = ${body.nickname} returning id`;
    await sql`delete from player_best where nickname = ${body.nickname}`;
    return Response.json({ deleted: rows.length });
  }
  return Response.json({ error: "Pass id or nickname" }, { status: 400 });
}
