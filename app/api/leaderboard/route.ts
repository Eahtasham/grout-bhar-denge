import { getLeaderboard, istDay } from "@/lib/scores";

/** GET /api/leaderboard?scope=daily|all — top 50, cached 30 s at the edge. */
export async function GET(req: Request) {
  const scopeParam = new URL(req.url).searchParams.get("scope");
  const scope = scopeParam === "all" ? "all" : "daily";
  try {
    const entries = await getLeaderboard(scope);
    return Response.json(
      { scope, day: istDay(), entries },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } },
    );
  } catch (e) {
    console.error("leaderboard error", e);
    return Response.json({ error: "Server busy" }, { status: 500 });
  }
}
