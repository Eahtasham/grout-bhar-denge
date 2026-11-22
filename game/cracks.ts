// Seeded crack schedule. Pure functions, no browser APIs: the server rebuilds the
// exact same schedule from the seed to validate submitted rounds.
import {
  BOARD_H,
  BOARD_W,
  COLS,
  GOLDEN_LIFETIME_MS,
  POINTS,
  ROUND_MS,
  ROWS,
  TILE,
} from "./config";
import { createRng, type Rng } from "./rng";

export type CrackType = "normal" | "zigzag" | "problem" | "golden";
export type Point = [number, number];

export interface CrackSpec {
  id: number;
  type: CrackType;
  spawnAt: number;
  /** Golden cracks vanish at this time. */
  expiresAt?: number;
  points: Point[];
  length: number;
  base: number;
  /** Index into content/problems.json for problem cracks. */
  problem?: number;
}

const MARGIN = 34;

/** Spawn interval by elapsed time: 1.6 s, then 0.2 s faster every 10 s, down to 0.6 s at 50 s. */
export function spawnInterval(t: number): number {
  const step = Math.min(5, Math.floor(t / 10_000));
  return [1600, 1400, 1200, 1000, 800, 600][step];
}

function pickType(rng: Rng, t: number, lastGolden: number): CrackType {
  const r = rng.next();
  if (t >= 20_000 && t - lastGolden >= 6_000 && r < 0.12) return "golden";
  const r2 = rng.next();
  if (t >= 10_000 && r2 < 0.3) return "problem";
  const r3 = rng.next();
  if (t >= 15_000 && r3 < 0.38) return "zigzag";
  return "normal";
}

function inside(x: number, y: number) {
  return x >= MARGIN && x <= BOARD_W - MARGIN && y >= MARGIN && y <= BOARD_H - MARGIN;
}

/** Random walk that bounces off the board edges. `turnEvery` adds sharp zigzag bends. */
function walk(
  rng: Rng,
  start: Point,
  targetLen: number,
  jitter: number,
  turnEvery: number | null,
): Point[] {
  const pts: Point[] = [start];
  let [x, y] = start;
  let angle = rng.range(0, Math.PI * 2);
  let len = 0;
  let sinceTurn = 0;
  let nextTurn = turnEvery ? rng.range(turnEvery * 0.8, turnEvery * 1.2) : Infinity;
  let turnSign = rng.sign();
  let guard = 0;
  while (len < targetLen && guard++ < 400) {
    const seg = rng.range(14, 22);
    if (sinceTurn >= nextTurn) {
      angle += turnSign * rng.range(0.9, 1.4);
      turnSign = -turnSign;
      sinceTurn = 0;
      nextTurn = rng.range(turnEvery! * 0.8, turnEvery! * 1.2);
    } else {
      angle += rng.range(-jitter, jitter);
    }
    let nx = x + Math.cos(angle) * seg;
    let ny = y + Math.sin(angle) * seg;
    if (!inside(nx, ny)) {
      if (nx < MARGIN || nx > BOARD_W - MARGIN) angle = Math.PI - angle;
      if (ny < MARGIN || ny > BOARD_H - MARGIN) angle = -angle;
      nx = x + Math.cos(angle) * seg;
      ny = y + Math.sin(angle) * seg;
      if (!inside(nx, ny)) continue;
    }
    x = nx;
    y = ny;
    pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    len += seg;
    sinceTurn += seg;
  }
  return pts;
}

export function pathLength(points: Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) {
    l += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return l;
}

/**
 * Builds the whole round's crack schedule from a seed. The rng is consumed in a fixed
 * order, so client and server always get identical cracks.
 */
export function generateSchedule(seed: number, problemCount: number): CrackSpec[] {
  const rng = createRng(seed);
  const tiles = Array.from({ length: COLS * ROWS }, (_, i) => i);
  let bag: number[] = [];
  let problemBag: number[] = [];
  const out: CrackSpec[] = [];
  let lastGolden = -Infinity;
  let t = 500;
  let id = 0;

  while (t < ROUND_MS) {
    const type = pickType(rng, t, lastGolden);
    if (type === "golden") lastGolden = t;

    if (bag.length === 0) bag = rng.shuffle(tiles);
    const tile = bag.pop()!;
    const cx = (tile % COLS) * TILE + TILE / 2 + rng.range(-28, 28);
    const cy = Math.floor(tile / COLS) * TILE + TILE / 2 + rng.range(-28, 28);
    const start: Point = [
      Math.min(BOARD_W - MARGIN, Math.max(MARGIN, cx)),
      Math.min(BOARD_H - MARGIN, Math.max(MARGIN, cy)),
    ];

    const progress = t / ROUND_MS;
    const grow = 1 + 0.35 * progress;
    const bend = 0.35 + 0.35 * progress;

    let points: Point[];
    switch (type) {
      case "zigzag":
        points = walk(rng, start, rng.range(300, 430) * grow, 0.15, rng.range(55, 80));
        break;
      case "problem":
        points = walk(rng, start, rng.range(140, 220) * grow, bend, null);
        break;
      case "golden":
        points = walk(rng, start, rng.range(110, 150), 0.25, null);
        break;
      default:
        points = walk(rng, start, rng.range(100, 200) * grow, bend, null);
    }

    const spec: CrackSpec = {
      id: id++,
      type,
      spawnAt: Math.round(t),
      points,
      length: pathLength(points),
      base: POINTS[type],
    };
    if (type === "golden") spec.expiresAt = spec.spawnAt + GOLDEN_LIFETIME_MS;
    if (type === "problem" && problemCount > 0) {
      if (problemBag.length === 0) {
        problemBag = rng.shuffle(Array.from({ length: problemCount }, (_, i) => i));
      }
      spec.problem = problemBag.pop();
    }
    out.push(spec);
    t += spawnInterval(t);
  }
  return out;
}
