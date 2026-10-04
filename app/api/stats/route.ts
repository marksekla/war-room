import { getWeekStats } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/stats?season=2026&weeks=1,2,3&current=4
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get("season"));
  const current = Number(p.get("current") ?? 0);
  const weeks = (p.get("weeks") ?? "")
    .split(",")
    .map(Number)
    .filter((w) => w >= 1 && w <= 18);
  if (!season || !weeks.length) return fail(new Error("season and weeks are required"), 400);
  try {
    const data = await Promise.all(weeks.map((w) => getWeekStats(season, w, w < current)));
    return ok(data, weeks.includes(current) ? 600 : 3600);
  } catch (e) {
    return fail(e);
  }
}
