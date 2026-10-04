// Browser-side helpers for data that is fetched on demand (news, weather).
// Results are memoized for the session so the UI and the AI agent share them.

import type { NewsItem, Weather } from "./types";

const memo = new Map<string, Promise<unknown>>();

function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fn().catch((e) => {
      memo.delete(key);
      throw e;
    });
    memo.set(key, p);
  }
  return p;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed: ${url}`);
  return body as T;
}

export const fetchNews = (espnId: string) => once(`news:${espnId}`, () => getJson<NewsItem[]>(`/api/news?espnId=${espnId}`));

export const fetchWeather = (week: number) =>
  once(`weather:${week}`, () => getJson<Record<string, Weather>>(`/api/weather?week=${week}`));

/** Short weather label when it matters for fantasy (wind, rain, cold). Null when indoors or mild. */
export function weatherNote(w: Weather | undefined | null): { label: string; severe: boolean } | null {
  if (!w || w.tempF == null) return null;
  const bits: string[] = [];
  const wind = Math.max(w.windMph ?? 0, (w.gustMph ?? 0) * 0.7);
  if (wind >= 15) bits.push(`${Math.round(w.windMph ?? 0)} mph wind`);
  if ((w.precipPct ?? 0) >= 50) bits.push(`${Math.round(w.precipPct!)}% rain/snow`);
  if (w.tempF <= 25) bits.push(`${Math.round(w.tempF)}°F`);
  if (!bits.length) return null;
  return { label: bits.join(", "), severe: wind >= 20 || (w.precipPct ?? 0) >= 70 || w.tempF <= 15 };
}
