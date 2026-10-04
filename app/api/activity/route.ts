import { getLeagueActivity } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

// /api/activity?id=<league id>&week=5  ->  matchups, transactions, last season's trades
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const id = p.get("id")?.trim();
  const week = Number(p.get("week"));
  if (!id || !/^\d+$/.test(id) || !week) return fail(new Error("id and week are required"), 400);
  try {
    return ok(await getLeagueActivity(id, week), 120);
  } catch (e) {
    return fail(e);
  }
}
