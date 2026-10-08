import { getOfficialInjuries } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/official-injuries?season=2026&week=5  ->  the NFL's official injury report for that week
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get("season"));
  const week = Number(p.get("week"));
  if (!season || !week) return fail(new Error("season and week are required"), 400);
  try {
    return ok(await getOfficialInjuries(season, week), 300);
  } catch (e) {
    return fail(e);
  }
}
