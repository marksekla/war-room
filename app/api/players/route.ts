import { getPlayers } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

export async function GET() {
  try {
    return ok(await getPlayers(), 3600);
  } catch (e) {
    return fail(e);
  }
}
