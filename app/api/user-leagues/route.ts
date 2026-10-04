import { sleeper } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";
import type { NflState } from "@/lib/types";

export async function GET(req: Request) {
  const username = new URL(req.url).searchParams.get("username")?.trim();
  if (!username) return fail(new Error("Missing username"), 400);
  try {
    const user = await sleeper<{ user_id: string; display_name: string } | null>(
      `/user/${encodeURIComponent(username)}`
    );
    if (!user?.user_id) return fail(new Error("Sleeper user not found"), 404);
    const state = await sleeper<NflState>(`/state/nfl`, 10 * 60_000);
    const leagues = await sleeper<{ league_id: string; name: string; season: string; total_rosters: number }[]>(
      `/user/${user.user_id}/leagues/nfl/${state.season}`
    );
    return ok(
      {
        userId: user.user_id,
        displayName: user.display_name,
        leagues: (leagues ?? []).map((l) => ({ id: l.league_id, name: l.name, season: l.season, teams: l.total_rosters })),
      },
      300
    );
  } catch (e) {
    return fail(e);
  }
}
