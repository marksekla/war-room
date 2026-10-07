import { getProjectionHistory } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/proj-history?season=2026&weeks=1,2,3,4  -> pre-game projections for finished weeks
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const season = Number(p.get("season"));
  const weeks = (p.get("weeks") ?? "")
    .split(",")
    .map(Number)
    .filter((w) => w >= 1 && w <= 18);
  if (!season || !weeks.length) return fail(new Error("season and weeks are required"), 400);
  try {
    const out = await Promise.all(weeks.map((w) => getProjectionHistory(season, w).catch(() => ({ week: w, lines: {} }))));
    return ok(out, 6 * 3600);
  } catch (e) {
    return fail(e);
  }
}
