import { getInjuries } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export const maxDuration = 60;

export async function GET() {
  try {
    return ok(await getInjuries(), 900);
  } catch (e) {
    return fail(e);
  }
}
