import { getMarketValues } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

// /api/values?teams=12&sf=0&ppr=1  ->  FantasyCalc redraft trade values keyed by Sleeper id
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  try {
    return ok(await getMarketValues(Number(p.get("teams")) || 12, p.get("sf") === "1", Number(p.get("ppr") ?? 1)), 21600);
  } catch (e) {
    return fail(e);
  }
}
