import { PROBLEMS } from "@/game/content";
import { generateSchedule } from "@/game/cracks";
import { checkFills, rankFor, simulateRound } from "@/game/scoring";
import { sql } from "@/lib/db";
import { checkNickname } from "@/lib/profanity";
import { rateLimit } from "@/lib/ratelimit";
import { getScore, istDay, shortId } from "@/lib/scores";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = /^[A-Za-z0-9-]{8,64}$/;
const SESSION_MAX_AGE_MS = 10 * 60_000;

function bad(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Submits a round. The client sends the list of fills (crack id, time, accuracy);
 * the server rebuilds the crack schedule from the session's seed and recomputes
 * the score itself with the same scoring code the game uses.
 */
export async function POST(req: Request) {
  try {
    if (!(await rateLimit(req, "score", 10))) return bad("Bahut zyada submissions, ek minute ruko", 429);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return bad("Invalid JSON");
    }
    const { sessionId, deviceId, nickname, fills } = body;
    if (typeof sessionId !== "string" || !UUID.test(sessionId)) return bad("Invalid session");
    if (typeof deviceId !== "string" || !DEVICE.test(deviceId)) return bad("Invalid device");
    const nick = checkNickname(nickname);
    if (!nick.ok) return bad(nick.reason, 422);

    // Consume the session: a session can only ever be used once.
    const [session] = await sql<{ seed: string; age_ms: number }[]>`
      delete from game_sessions where id = ${sessionId}
      returning seed, (extract(epoch from (now() - started_at)) * 1000)::float8 as age_ms`;
    if (!session) return bad("Session expired or already used", 409);
    if (session.age_ms > SESSION_MAX_AGE_MS) return bad("Session expired", 409);

    const schedule = generateSchedule(Number(session.seed), PROBLEMS.length);
    const check = checkFills(schedule, fills);
    if (!check.ok) return bad(`Rejected: ${check.reason}`, 422);
    const result = simulateRound(schedule, check.fills);
    if (session.age_ms < result.endMs) return bad("Rejected: round finished too fast", 422);

    const rank = rankFor(result.score);
    const id = shortId();
    const day = istDay();

    const out = await sql.begin(async (tx) => {
      await tx`
        insert into scores (id, session_id, device_id, nickname, score, fills, max_combo, rank, best_problem, day)
        values (${id}, ${sessionId}, ${deviceId}, ${nick.nickname}, ${result.score}, ${result.fills},
                ${result.maxCombo}, ${rank}, ${result.bestProblem}, ${day})`;
      const [best] = await tx<{ score: number; score_id: string }[]>`
        insert into player_best (device_id, score_id, nickname, score, rank)
        values (${deviceId}, ${id}, ${nick.nickname}, ${result.score}, ${rank})
        on conflict (device_id) do update
          set score_id = excluded.score_id, nickname = excluded.nickname, score = excluded.score,
              rank = excluded.rank, updated_at = now()
          where excluded.score > player_best.score
        returning score, score_id`;
      // When the new score isn't a personal best, keep the old best but refresh the nickname.
      const bestRow =
        best ??
        (
          await tx<{ score: number; score_id: string }[]>`
            update player_best set nickname = ${nick.nickname}
            where device_id = ${deviceId} returning score, score_id`
        )[0];
      const [{ daily }] = await tx<{ daily: number }[]>`
        select count(*)::int + 1 as daily from scores where day = ${day} and score > ${result.score}`;
      const [{ alltime }] = await tx<{ alltime: number }[]>`
        select count(*)::int + 1 as alltime from player_best where score > ${bestRow.score}`;
      return { daily, alltime, bestScore: bestRow.score, bestId: bestRow.score_id };
    });

    return Response.json(
      {
        id,
        score: result.score,
        rank,
        fills: result.fills,
        maxCombo: result.maxCombo,
        bestProblem: result.bestProblem,
        dailyPos: out.daily,
        allTimePos: out.alltime,
        bestScore: out.bestScore,
        bestId: out.bestId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("score error", e);
    return bad("Server busy", 500);
  }
}

/** Public info for one shared score (used by the challenge banner). */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = await getScore(id);
  if (!s) return bad("Not found", 404);
  return Response.json(
    { id: s.id, nickname: s.nickname, score: s.score, rank: s.rank },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
