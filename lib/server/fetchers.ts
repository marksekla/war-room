// Server-side fetchers for Sleeper and ESPN public data, with an in-memory cache.
// These run inside Next.js route handlers so the browser never hits CORS issues
// and large payloads (like the full player list) get slimmed before shipping.

import type { Game, Player, PlayerMap, Position, Schedule, WeekProjections, WeekStats } from "../types";
import { POSITIONS } from "../types";

const SLEEPER = "https://api.sleeper.app/v1";
const SLEEPER_STATS = "https://api.sleeper.com";
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

type Entry = { value: unknown; expires: number };
const cache = new Map<string, Entry>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

const MIN = 60_000;
const HOUR = 60 * MIN;

// ---------- Sleeper core ----------

export function sleeper<T = unknown>(path: string, ttl = 5 * MIN) {
  return cached<T>(`sleeper:${path}`, ttl, () => getJson<T>(`${SLEEPER}${path}`));
}

interface RawPlayer {
  player_id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  fantasy_positions?: string[] | null;
  team?: string | null;
  age?: number | null;
  injury_status?: string | null;
  injury_body_part?: string | null;
  depth_chart_order?: number | null;
  years_exp?: number | null;
  active?: boolean;
}

export function getPlayers(): Promise<PlayerMap> {
  return cached("players", 6 * HOUR, async () => {
    const raw = await getJson<Record<string, RawPlayer>>(`${SLEEPER}/players/nfl`);
    const out: PlayerMap = {};
    for (const [id, p] of Object.entries(raw)) {
      const pos = (p.position || p.fantasy_positions?.[0]) as Position | undefined;
      if (!pos || !POSITIONS.includes(pos)) continue;
      if (!p.team && !p.active) continue;
      const name =
        pos === "DEF"
          ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || id
          : p.full_name || `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
      const player: Player = {
        id,
        name,
        pos,
        team: p.team ?? null,
        age: p.age ?? null,
        injury: p.injury_status ?? null,
        injuryPart: p.injury_body_part ?? null,
        depth: p.depth_chart_order ?? null,
        yearsExp: p.years_exp ?? null,
      };
      out[id] = player;
    }
    return out;
  });
}

interface RawStatRow {
  player_id: string;
  team?: string;
  opponent?: string | null;
  stats?: Record<string, number> | null;
}

function slimRows(rows: RawStatRow[]) {
  const lines: WeekStats["lines"] = {};
  for (const r of rows) {
    if (!r?.player_id || !r.stats) continue;
    const s: Record<string, number> = {};
    let any = false;
    for (const [k, v] of Object.entries(r.stats)) {
      if (typeof v === "number" && v !== 0) {
        s[k] = Math.round(v * 100) / 100;
        any = true;
      }
    }
    if (!any) continue;
    lines[r.player_id] = { team: r.team ?? "", opp: r.opponent ?? null, s };
  }
  return lines;
}

const POS_QUERY = POSITIONS.map((p) => `position[]=${p}`).join("&");

export function getWeekStats(season: number, week: number, final: boolean): Promise<WeekStats> {
  // Finished weeks are cached for a day; the live week refreshes every 10 minutes.
  return cached(`stats:${season}:${week}`, final ? 24 * HOUR : 10 * MIN, async () => {
    const rows = await getJson<RawStatRow[]>(
      `${SLEEPER_STATS}/stats/nfl/${season}/${week}?season_type=regular&${POS_QUERY}`
    );
    return { week, lines: slimRows(Array.isArray(rows) ? rows : []) };
  });
}

export function getWeekProjections(season: number, week: number): Promise<WeekProjections> {
  return cached(`proj:${season}:${week}`, 2 * HOUR, async () => {
    const rows = await getJson<RawStatRow[]>(
      `${SLEEPER_STATS}/projections/nfl/${season}/${week}?season_type=regular&${POS_QUERY}`
    );
    return { week, lines: slimRows(Array.isArray(rows) ? rows : []) };
  });
}

export function getTrending(type: "add" | "drop" = "add") {
  return cached(`trend:${type}`, 30 * MIN, () =>
    getJson<{ player_id: string; count: number }[]>(
      `${SLEEPER}/players/nfl/trending/${type}?lookback_hours=48&limit=60`
    )
  );
}

// ---------- ESPN schedule + odds ----------

const ESPN_TO_SLEEPER: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR" };
const fixAbbr = (a: string) => ESPN_TO_SLEEPER[a] ?? a;

interface EspnEvent {
  date: string;
  status?: { type?: { state?: string } };
  competitions?: {
    competitors?: { homeAway: string; team: { abbreviation: string } }[];
    odds?: { details?: string; overUnder?: number }[];
  }[];
}

function parseSpread(details: string | undefined, home: string, away: string): number | null {
  if (!details || /even|pk/i.test(details)) return details ? 0 : null;
  const m = details.match(/^([A-Z]{2,4})\s+([+-]?\d+(\.\d+)?)/);
  if (!m) return null;
  const team = fixAbbr(m[1]);
  const val = parseFloat(m[2]);
  if (team === home) return val;
  if (team === away) return -val;
  return null;
}

export function getSchedule(season: number): Promise<Schedule> {
  return cached(`schedule:${season}`, 3 * HOUR, async () => {
    const weeks = Array.from({ length: 18 }, (_, i) => i + 1);
    const results = await Promise.all(
      weeks.map((w) =>
        getJson<{ events?: EspnEvent[] }>(
          `${ESPN}/scoreboard?seasontype=2&week=${w}&dates=${season}`
        ).catch(() => ({ events: [] as EspnEvent[] }))
      )
    );
    const games: Game[] = [];
    results.forEach((r, i) => {
      for (const e of r.events ?? []) {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find((c) => c.homeAway === "home");
        const away = comp?.competitors?.find((c) => c.homeAway === "away");
        if (!home || !away) continue;
        const h = fixAbbr(home.team.abbreviation);
        const a = fixAbbr(away.team.abbreviation);
        const odds = comp?.odds?.[0];
        const state = e.status?.type?.state;
        games.push({
          week: weeks[i],
          home: h,
          away: a,
          kickoff: e.date,
          spread: parseSpread(odds?.details, h, a),
          total: typeof odds?.overUnder === "number" ? odds.overUnder : null,
          status: state === "post" ? "post" : state === "in" ? "in" : "pre",
        });
      }
    });
    const teams = new Set<string>();
    games.forEach((g) => {
      teams.add(g.home);
      teams.add(g.away);
    });
    // Only trust weeks that actually loaded (a failed fetch would look like a league-wide bye).
    const loaded = new Set(weeks.filter((w) => games.filter((g) => g.week === w).length >= 10));
    const byes: Record<string, number> = {};
    for (const t of teams) {
      for (let w = 4; w <= 15; w++) {
        if (!loaded.has(w)) continue;
        if (!games.some((g) => g.week === w && (g.home === t || g.away === t))) {
          byes[t] = w;
          break;
        }
      }
    }
    return { season, games, byes };
  });
}
