import { sleeper } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";
import type { LeagueBundle, NflState, SleeperLeague, SleeperRoster, SleeperUser } from "@/lib/types";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id || !/^\d+$/.test(id)) return fail(new Error("Missing or invalid league id"), 400);
  try {
    const [league, users, rosters, state] = await Promise.all([
      sleeper<SleeperLeague>(`/league/${id}`, 2 * 60_000),
      sleeper<SleeperUser[]>(`/league/${id}/users`, 2 * 60_000),
      sleeper<SleeperRoster[]>(`/league/${id}/rosters`, 60_000),
      sleeper<NflState>(`/state/nfl`, 10 * 60_000),
    ]);
    if (!league) return fail(new Error("League not found"), 404);
    const bundle: LeagueBundle = { league, users, rosters, state };
    return ok(bundle, 60);
  } catch (e) {
    return fail(e);
  }
}
