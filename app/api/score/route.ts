import { PROBLEMS } from "@/game/content";
import { generateSchedule } from "@/game/cracks";
import { checkFills, rankFor, simulateRound } from "@/game/scoring";
import { sql } from "@/lib/db";
import { checkNickname } from "@/lib/profanity";
import { pruneRateHits, rateKey } from "@/lib/ratelimit";
import { getScore, istDay, shortId } from "@/lib/scores";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE = /^[A-Za-z0-9-]{8,64}$/;
const SESSION_MAX_AGE_MS = 10 * 60_000;
const LIMIT_PER_MIN = 10;

function bad(error: string, status = 400) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Submits a round. The client sends the list of fills (crack id, time, accuracy);
 * the server rebuilds the crack schedule from the session's seed and recomputes
 * the score itself with the same scoring code the game uses.
 *
 * Two database round trips in total:
 *   1. rate-limit + consume the session (single use) → seed
 *   2. insert score + update personal best + compute daily / all-time positions
 */
export async function POST(req: Request) {
  try {
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

    // 1) Rate limit and consume the session in one statement. Over the limit,
    //    the session is left untouched so the player can retry.
    const { key, bucket } = rateKey(req, "score");
    const [s] = await sql<{ hits: number; seed: string | null; age_ms: number | null }[]>`
      with rl as (
        insert into rate_hits (key, bucket) values (${key}, ${bucket})
        on conflict (key, bucket) do update set count = rate_hits.count + 1
        returning count
      ), consumed as (
        delete from game_sessions
        where id = ${sessionId} and (select count from rl) <= ${LIMIT_PER_MIN}
        returning seed, (extract(epoch from (now() - started_at)) * 1000)::float8 as age_ms
      )
      select (select count from rl) as hits, c.seed, c.age_ms
      from (select 1) one left join consumed c on true`;
    pruneRateHits(bucket);
    if (s.hits > LIMIT_PER_MIN) return bad("Bahut zyada submissions, ek minute ruko", 429);
    if (s.seed === null || s.age_ms === null) return bad("Session expired or already used", 409);
    if (s.age_ms > SESSION_MAX_AGE_MS) return bad("Session expired", 409);

    const schedule = generateSchedule(Number(s.seed), PROBLEMS.length);
    const check = checkFills(schedule, fills);
    if (!check.ok) return bad(`Rejected: ${check.reason}`, 422);
    const result = simulateRound(schedule, check.fills);
    if (s.age_ms < result.endMs) return bad("Rejected: round finished too fast", 422);

    const rank = rankFor(result.score);
    const id = shortId();
    const day = istDay();
    const score = result.score;

    // 2) Everything else in one statement. Positions are counted per player
    //    (device), using each player's best, so a person appears only once.
    const [out] = await sql<{ best_score: number; best_id: string; daily: number; alltime: number }[]>`
      with ins as (
        insert into scores (id, session_id, device_id, nickname, score, fills, max_combo, rank, best_problem, day)
        values (${id}, ${sessionId}, ${deviceId}, ${nick.nickname}, ${score}, ${result.fills},
                ${result.maxCombo}, ${rank}, ${result.bestProblem}, ${day})
        returning id
      ), up as (
        insert into player_best (device_id, score_id, nickname, score, rank)
        values (${deviceId}, ${id}, ${nick.nickname}, ${score}, ${rank})
        on conflict (device_id) do update set
          nickname   = excluded.nickname,
          score_id   = case when excluded.score > player_best.score then excluded.score_id else player_best.score_id end,
          rank       = case when excluded.score > player_best.score then excluded.rank else player_best.rank end,
          updated_at = case when excluded.score > player_best.score then now() else player_best.updated_at end,
          score      = greatest(player_best.score, excluded.score)
        returning score, score_id
      ), mine as (
        select
          greatest(${score}, coalesce((select max(score) from scores where day = ${day} and device_id = ${deviceId}), 0)) as today,
          greatest(${score}, coalesce((select score from player_best where device_id = ${deviceId}), 0)) as ever
      )
      select
        (select score from up) as best_score,
        (select score_id from up) as best_id,
        (select count(*)::int + 1 from (
           select max(score) as m from scores
           where day = ${day} and device_id <> ${deviceId}
           group by device_id
         ) t where t.m > (select today from mine)) as daily,
        (select count(*)::int + 1 from player_best
          where device_id <> ${deviceId} and score > (select ever from mine)) as alltime`;

    return Response.json(
      {
        id,
        score,
        rank,
        fills: result.fills,
        maxCombo: result.maxCombo,
        bestProblem: result.bestProblem,
        dailyPos: out.daily,
        allTimePos: out.alltime,
        bestScore: out.best_score,
        bestId: out.best_id,
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
