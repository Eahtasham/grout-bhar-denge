// Shared tuning constants. Pure data: safe to import on client and server.

/** Logical board size. One tile = 100 units, 6 x 9 tiles in portrait. */
export const TILE = 100;
export const COLS = 6;
export const ROWS = 9;
export const BOARD_W = COLS * TILE;
export const BOARD_H = ROWS * TILE;

export const ROUND_MS = 60_000;
export const COUNTDOWN_MS = 3_000;
export const RUSH_HOUR_MS = 50_000;

/** Fixed simulation step for the seepage meter (client and server use the same step). */
export const TICK_MS = 50;

/** Seepage meter. Each open crack leaks more the longer it stays open. */
export const METER_MAX = 100;
export const LEAK_BASE_PER_S = 0.7;
export const LEAK_AGE_PER_S = 0.22; // extra leak per second of age, per crack
export const LEAK_AGE_CAP_S = 8;
export const DRAIN_PER_S = 1.5;

/** Filling. */
export const TRACE_TOLERANCE_PX = 24; // screen px around the crack path that counts
export const FILL_THRESHOLD = 0.9;

/** Combos. */
export const COMBO_WINDOW_MS = 1_500;
export const COMBO_CAP = 5;
export const ACCURACY_BONUS = 0.5;

export const GOLDEN_LIFETIME_MS = 2_000;

export const POINTS = {
  normal: 10,
  zigzag: 20,
  problem: 25,
  golden: 50,
} as const;

export const RANKS = [
  { min: 2000, name: "Grout King" },
  { min: 1200, name: "Thekedaar" },
  { min: 700, name: "Senior Mistri" },
  { min: 300, name: "Mistri" },
  { min: 0, name: "Naya Helper" },
] as const;

export type RankName = (typeof RANKS)[number]["name"];
