import { getSchedule } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

export async function GET(req: Request) {
  const season = Number(new URL(req.url).searchParams.get("season"));
  if (!season) return fail(new Error("season is required"), 400);
  try {
    return ok(await getSchedule(season), 1800);
  } catch (e) {
    return fail(e);
  }
}
