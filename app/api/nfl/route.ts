import { getNflData } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

export async function GET() {
  try {
    const data = await getNflData();
    if (!data) return fail(new Error("Advanced data not built yet"), 404);
    return ok(data, 1800);
  } catch (e) {
    return fail(e);
  }
}
