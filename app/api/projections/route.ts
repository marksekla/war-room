import { getWeekProjections } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/projections?season=2026&weeks=4,5
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get("season"));
  const weeks = (p.get("weeks") ?? "")
    .split(",")
    .map(Number)
    .filter((w) => w >= 1 && w <= 18);
  if (!season || !weeks.length) return fail(new Error("season and weeks are required"), 400);
  try {
    return ok(await Promise.all(weeks.map((w) => getWeekProjections(season, w))), 3600);
  } catch (e) {
    return fail(e);
  }
}
