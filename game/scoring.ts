// Scoring + seepage simulation. Pure functions shared by the game and the score API,
// so the server recomputes the exact score the player saw.
import {
  ACCURACY_BONUS,
  COMBO_CAP,
  COMBO_WINDOW_MS,
  DRAIN_PER_S,
  LEAK_AGE_CAP_S,
  LEAK_AGE_PER_S,
  LEAK_BASE_PER_S,
  METER_MAX,
  RANKS,
  ROUND_MS,
  TICK_MS,
  type RankName,
} from "./config";
import type { CrackSpec } from "./cracks";

/** One sealed crack: crack id, time since round start (ms), accuracy 0..1. */
export interface Fill {
  c: number;
  t: number;
  a: number;
}

export function roundAccuracy(a: number) {
  return Math.round(Math.min(1, Math.max(0, a)) * 100) / 100;
}

/** Is this crack leaking at time t? Golden cracks vanish instead of leaking. */
export function isLeakingAt(spec: CrackSpec, fillAt: number | undefined, t: number) {
  if (spec.type === "golden") return false;
  if (spec.spawnAt > t) return false;
  return fillAt === undefined || fillAt > t;
}

/** Advances the seepage meter by one fixed tick ending at time t. */
export function meterStep(
  meter: number,
  schedule: CrackSpec[],
  fillAt: ReadonlyArray<number | undefined>,
  t: number,
): number {
  const dt = TICK_MS / 1000;
  let leak = 0;
  let open = 0;
  for (const spec of schedule) {
    if (spec.spawnAt > t) break; // schedule is sorted by spawnAt
    if (!isLeakingAt(spec, fillAt[spec.id], t)) continue;
    open++;
    const age = Math.min(LEAK_AGE_CAP_S, (t - spec.spawnAt) / 1000);
    leak += (LEAK_BASE_PER_S + LEAK_AGE_PER_S * age) * dt;
  }
  const next = open === 0 ? meter - DRAIN_PER_S * dt : meter + leak - DRAIN_PER_S * dt * 0.5;
  return Math.min(METER_MAX, Math.max(0, next));
}

export interface ComboState {
  combo: number;
  lastFillT: number;
}

export function newComboState(): ComboState {
  return { combo: 0, lastFillT: -Infinity };
}

/** Points for one fill; mutates combo state. */
export function scoreFill(state: ComboState, spec: CrackSpec, fill: Fill) {
  state.combo = fill.t - state.lastFillT <= COMBO_WINDOW_MS ? Math.min(COMBO_CAP, state.combo + 1) : 1;
  state.lastFillT = fill.t;
  const bonus = Math.round(spec.base * ACCURACY_BONUS * roundAccuracy(fill.a));
  return { points: (spec.base + bonus) * state.combo, combo: state.combo, bonus };
}

export function rankFor(score: number): RankName {
  for (const r of RANKS) if (score >= r.min) return r.name;
  return "Naya Helper";
}

export function nextRank(score: number) {
  const idx = RANKS.findIndex((r) => score >= r.min);
  return idx > 0 ? RANKS[idx - 1] : null;
}

export interface RoundResult {
  endMs: number;
  score: number;
  fills: number;
  maxCombo: number;
  /** Problem index of the best-scoring problem fill. */
  bestProblem: number | null;
  validFills: Fill[];
}

/**
 * Replays a round: runs the seepage meter tick by tick to find when the round ended,
 * then scores every fill made before that.
 */
export function simulateRound(schedule: CrackSpec[], fills: Fill[]): RoundResult {
  const sorted = fills.slice().sort((x, y) => x.t - y.t || x.c - y.c);
  const fillAt: (number | undefined)[] = [];
  for (const f of sorted) fillAt[f.c] = f.t;

  let meter = 0;
  let endMs = ROUND_MS;
  for (let t = TICK_MS; t <= ROUND_MS; t += TICK_MS) {
    meter = meterStep(meter, schedule, fillAt, t);
    if (meter >= METER_MAX) {
      endMs = t;
      break;
    }
  }

  const state = newComboState();
  let score = 0;
  let maxCombo = 0;
  let best = -1;
  let bestProblem: number | null = null;
  const validFills: Fill[] = [];
  for (const f of sorted) {
    if (f.t > endMs) break;
    const spec = schedule[f.c];
    const r = scoreFill(state, spec, f);
    score += r.points;
    maxCombo = Math.max(maxCombo, r.combo);
    validFills.push(f);
    if (spec.problem !== undefined && r.points > best) {
      best = r.points;
      bestProblem = spec.problem;
    }
  }
  return { endMs, score, fills: validFills.length, maxCombo, bestProblem, validFills };
}

export type FillCheck = { ok: true; fills: Fill[] } | { ok: false; reason: string };

/** Structural checks on submitted fills against the seeded schedule. */
export function checkFills(schedule: CrackSpec[], raw: unknown): FillCheck {
  if (!Array.isArray(raw)) return { ok: false, reason: "fills must be an array" };
  if (raw.length > schedule.length) return { ok: false, reason: "too many fills" };
  const seen = new Set<number>();
  const fills: Fill[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, reason: "bad fill" };
    const { c, t, a } = item as Record<string, unknown>;
    if (!Number.isInteger(c) || !Number.isInteger(t) || typeof a !== "number" || !Number.isFinite(a)) {
      return { ok: false, reason: "bad fill fields" };
    }
    const ci = c as number;
    const ti = t as number;
    if (ci < 0 || ci >= schedule.length || seen.has(ci)) return { ok: false, reason: "bad crack id" };
    seen.add(ci);
    const spec = schedule[ci];
    if (ti < spec.spawnAt || ti > ROUND_MS) return { ok: false, reason: "fill outside crack lifetime" };
    if (spec.expiresAt !== undefined && ti >= spec.expiresAt + TICK_MS) {
      return { ok: false, reason: "golden crack already gone" };
    }
    fills.push({ c: ci, t: ti, a: roundAccuracy(a) });
  }
  return { ok: true, fills };
}
