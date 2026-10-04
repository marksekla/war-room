import { getTrending } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export async function GET() {
  try {
    const [add, drop] = await Promise.all([getTrending("add"), getTrending("drop")]);
    return ok({ add, drop }, 1800);
  } catch (e) {
    return fail(e);
  }
}
