import "server-only";
import { createHash } from "node:crypto";
import { sql } from "./db";

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

/**
 * Fixed-window rate-limit key for this request. Routes fold the counter update into
 * their own query (one round trip instead of two) using `rate_hits`.
 */
export function rateKey(req: Request, route: string, windowS = 60) {
  const ipHash = createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 24);
  return { key: `${route}:${ipHash}`, bucket: Math.floor(Date.now() / 1000 / windowS) };
}

/** Occasionally clears old rate-limit windows. Fire-and-forget. */
export function pruneRateHits(bucket: number) {
  if (Math.random() < 0.02) {
    sql`delete from rate_hits where bucket < ${bucket - 5}`.catch(() => {});
  }
}
