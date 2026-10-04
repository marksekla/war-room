import { getPlayerNews } from "@/lib/server/fetchers";
import { fail, ok } from "@/lib/server/respond";

// /api/news?espnId=4429795
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("espnId")?.trim();
  if (!id || !/^\d+$/.test(id)) return fail(new Error("Missing espnId"), 400);
  try {
    return ok(await getPlayerNews(id), 1200);
  } catch (e) {
    return fail(e);
  }
}
