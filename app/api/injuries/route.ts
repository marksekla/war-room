import { getInjuries } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export async function GET() {
  try {
    return ok(await getInjuries(), 900);
  } catch (e) {
    return fail(e);
  }
}
