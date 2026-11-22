import content from "@/content/problems.json";
import type { RankName } from "./config";

export interface Problem {
  category: string;
  problem: string;
  fix: string;
}

export interface VoiceLine {
  id: string;
  text: string;
  /** "reel": must be cut from the original reel, never AI-generated. */
  source?: "reel";
  /** Devanagari text used for text-to-speech. */
  say?: string;
}

export const PROBLEMS: Problem[] = content.problems;
export const VOICE = content.voice as {
  start: VoiceLine[];
  fill: VoiceLine[];
  combo5: VoiceLine[];
  leak: VoiceLine[];
  rush: VoiceLine[];
  gameOver: Record<RankName, VoiceLine>;
};
export const CREDITS = content.credits;

/** Every voice clip id the game can ask for. */
export const VOICE_IDS = [
  ...VOICE.start,
  ...VOICE.fill,
  ...VOICE.combo5,
  ...VOICE.leak,
  ...VOICE.rush,
  ...Object.values(VOICE.gameOver),
].map((v) => v.id);

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
export const SHARE = content.share;

export function fillTemplate(tpl: string, vars: Record<string, string | number>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function formatScore(n: number) {
  return n.toLocaleString("en-IN");
}

export function shareText(score: number, rank: string) {
  return fillTemplate(SHARE.text, { score: formatScore(score), rank });
}
