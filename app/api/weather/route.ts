import { getWeather } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

// /api/weather?week=5  ->  forecast at kickoff for outdoor games, keyed by team
export async function GET(req: Request) {
  const week = Number(new URL(req.url).searchParams.get("week"));
  if (!week || week < 1 || week > 18) return fail(new Error("week is required"), 400);
  try {
    return ok(await getWeather(week), 3600);
  } catch (e) {
    return fail(e);
  }
}
