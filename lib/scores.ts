import "server-only";
import { randomBytes } from "node:crypto";
import { cacheLife } from "next/cache";
import { sql } from "./db";

const ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

export function shortId(len = 8) {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/** Today's date in India (IST), as YYYY-MM-DD. The daily board resets at midnight IST. */
export function istDay(d = new Date()) {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export interface PublicScore {
  id: string;
  nickname: string;
  score: number;
  rank: string;
  fills: number;
  maxCombo: number;
  bestProblem: number | null;
  day: string;
}

export async function getScore(id: string): Promise<PublicScore | null> {
  "use cache";
  cacheLife("hours");
  if (!/^[A-Za-z0-9]{6,12}$/.test(id)) return null;
  const rows = await sql`
    select id, nickname, score, rank, fills, max_combo, best_problem, to_char(day, 'YYYY-MM-DD') as day
    from scores where id = ${id}`;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    nickname: r.nickname,
    score: r.score,
    rank: r.rank,
    fills: r.fills,
    maxCombo: r.max_combo,
    bestProblem: r.best_problem,
    day: r.day,
  };
}

export interface BoardEntry {
  pos: number;
  id: string;
  nickname: string;
  score: number;
  rank: string;
}

export async function getLeaderboard(scope: "daily" | "all", limit = 50): Promise<BoardEntry[]> {
  // One row per player: their best score of the day, shown with their current nickname.
  const rows =
    scope === "daily"
      ? await sql`
          select t.id, coalesce(pb.nickname, t.nickname) as nickname, t.score, t.rank
          from (
            select distinct on (device_id) id, device_id, nickname, score, rank, created_at
            from scores
            where day = ${istDay()}
            order by device_id, score desc, created_at asc
          ) t
          left join player_best pb on pb.device_id = t.device_id
          order by t.score desc, t.created_at asc
          limit ${limit}`
      : await sql`
          select score_id as id, nickname, score, rank from player_best
          order by score desc, updated_at asc
          limit ${limit}`;
  return rows.map((r, i) => ({ pos: i + 1, id: r.id, nickname: r.nickname, score: r.score, rank: r.rank }));
}
