import { NextResponse } from "next/server";

/** JSON response with CDN caching so Vercel's edge absorbs repeat traffic. */
export function ok(data: unknown, sMaxAge = 300) {
  return NextResponse.json(data, {
    headers: { "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 4}` },
  });
}

export function fail(err: unknown, status = 502) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: message }, { status });
}
