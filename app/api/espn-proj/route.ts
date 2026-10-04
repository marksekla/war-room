import { getEspnProjections } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/espn-proj?season=2026&week=5  ->  ESPN weekly projections keyed by ESPN player id
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get("season"));
  const week = Number(p.get("week"));
  if (!season || !week) return fail(new Error("season and week are required"), 400);
  try {
    return ok(await getEspnProjections(season, week), 3600);
  } catch (e) {
    return fail(e);
  }
}
