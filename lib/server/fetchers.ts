// Server-side fetchers for Sleeper and ESPN public data, with an in-memory cache.
// These run inside Next.js route handlers so the browser never hits CORS issues
// and large payloads (like the full player list) get slimmed before shipping.

import { promises as fs } from "fs";
import path from "path";
import type {
  EspnInjury,
  LeagueActivity,
  MatchupRow,
  SleeperLeague,
  SleeperRoster,
  StatLine,
  Transaction,
  Game,
  MarketValue,
  NewsItem,
  NflData,
  Player,
  PlayerMap,
  Position,
  Schedule,
  Weather,
  WeekProjections,
  WeekStats,
} from "../types";
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
  espn_id?: string | number | null;
  gsis_id?: string | null;
}

export function getPlayers(): Promise<PlayerMap> {
  return cached("players", 3 * HOUR, async () => {
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
        espnId: p.espn_id != null && String(p.espn_id).trim() ? String(p.espn_id).trim() : null,
        gsis: p.gsis_id ? String(p.gsis_id).trim() || null : null,
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

// ---------- nflverse advanced data (built nightly by GitHub Actions) ----------

function repoSlug(): string | null {
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const slug = process.env.VERCEL_GIT_REPO_SLUG;
  if (owner && slug) return `${owner}/${slug}`;
  const m = (process.env.NEXT_PUBLIC_REPO_URL || "").match(/github\.com\/([^/]+\/[^/#?]+)/);
  return m ? m[1].replace(/\.git$/, "") : null;
}

async function bundledNfl(): Promise<NflData | null> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "nfl.json"), "utf8");
    return JSON.parse(raw) as NflData;
  } catch {
    return null;
  }
}

/**
 * Newest copy of data/nfl.json. The GitHub Action commits a fresh file twice a day;
 * reading it straight from GitHub means the site picks it up even between deploys.
 */
export function getNflData(): Promise<NflData | null> {
  return cached("nfl", 30 * MIN, async () => {
    const local = await bundledNfl();
    const slug = repoSlug();
    const branch = process.env.VERCEL_GIT_COMMIT_REF || "main";
    let remote: NflData | null = null;
    if (slug) {
      remote = await getJson<NflData>(`https://raw.githubusercontent.com/${slug}/${branch}/data/nfl.json`).catch(() => null);
    }
    if (remote?.players && (!local || remote.updated > local.updated)) return remote;
    return local;
  });
}

// ---------- FantasyCalc market values (crowd-sourced from real trades) ----------

interface FcRow {
  player?: { sleeperId?: string | null; name?: string };
  value?: number;
  redraftValue?: number;
  overallRank?: number;
  positionRank?: number;
  trend30Day?: number;
  maybeTier?: number | null;
}

const nearest = (x: number, opts: number[]) => opts.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));

export function getMarketValues(teams: number, superflex: boolean, ppr: number): Promise<Record<string, MarketValue>> {
  const t = nearest(teams || 12, [8, 10, 12, 14, 16]);
  const q = superflex ? 2 : 1;
  const r = nearest(ppr, [0, 0.5, 1]);
  return cached(`fc:${t}:${q}:${r}`, 6 * HOUR, async () => {
    const rows = await getJson<FcRow[]>(
      `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=${q}&numTeams=${t}&ppr=${r}`
    );
    const out: Record<string, MarketValue> = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const sid = row.player?.sleeperId;
      const value = row.redraftValue ?? row.value;
      if (!sid || typeof value !== "number") continue;
      out[String(sid)] = {
        value,
        rank: row.overallRank ?? 0,
        posRank: row.positionRank ?? 0,
        trend: row.trend30Day ?? 0,
        tier: row.maybeTier ?? null,
      };
    }
    return out;
  });
}

// ---------- ESPN injuries (refreshed every 15 minutes) ----------

interface EspnInjuryRaw {
  status?: string;
  date?: string;
  shortComment?: string;
  athlete?: {
    id?: string | number;
    displayName?: string;
    links?: { href?: string }[];
    team?: { abbreviation?: string };
    position?: { abbreviation?: string };
  };
  details?: { type?: string; location?: string; returnDate?: string; fantasyStatus?: { description?: string } };
}

export function getInjuries(): Promise<EspnInjury[]> {
  return cached("espn-injuries", 15 * MIN, async () => {
    const j = await getJson<{ injuries?: { displayName?: string; injuries?: EspnInjuryRaw[] }[] }>(`${ESPN}/injuries`);
    const out: EspnInjury[] = [];
    for (const team of j.injuries ?? []) {
      for (const i of team.injuries ?? []) {
        const a = i.athlete ?? {};
        let espnId = a.id != null ? String(a.id) : null;
        if (!espnId) {
          for (const l of a.links ?? []) {
            const m = l.href?.match(/\/id\/(\d+)/);
            if (m) {
              espnId = m[1];
              break;
            }
          }
        }
        out.push({
          espnId,
          name: a.displayName ?? "",
          pos: a.position?.abbreviation ?? null,
          team: a.team?.abbreviation ? fixAbbr(a.team.abbreviation) : null,
          status: i.status ?? "",
          date: i.date ?? null,
          short: i.shortComment ? i.shortComment.slice(0, 400) : null,
          body: i.details?.type ?? i.details?.location ?? null,
          returnDate: i.details?.returnDate ?? null,
        });
      }
    }
    return out;
  });
}

// ---------- ESPN player news (Rotowire blurbs and ESPN stories) ----------

interface EspnNewsRaw {
  headline?: string;
  story?: string;
  description?: string;
  published?: string;
  lastModified?: string;
  type?: string;
  links?: { web?: { href?: string }; mobile?: { href?: string } };
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function getPlayerNews(espnId: string): Promise<NewsItem[]> {
  return cached(`news:${espnId}`, 20 * MIN, async () => {
    const j = await getJson<{ feed?: EspnNewsRaw[] }>(
      `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=30&playerId=${encodeURIComponent(espnId)}`
    );
    return (j.feed ?? [])
      .filter((n) => n.headline)
      .map((n) => ({
        headline: stripHtml(n.headline!),
        story: n.story ? stripHtml(n.story).slice(0, 700) : n.description ? stripHtml(n.description).slice(0, 400) : null,
        published: n.published ?? n.lastModified ?? "",
        source: n.type ?? null,
        url: n.links?.web?.href ?? null,
      }))
      .sort((a, b) => (b.published > a.published ? 1 : -1))
      .slice(0, 8);
  });
}

// ---------- Game-day weather (Open-Meteo, free, no key) ----------

interface MeteoHourly {
  time?: string[];
  temperature_2m?: (number | null)[];
  wind_speed_10m?: (number | null)[];
  wind_gusts_10m?: (number | null)[];
  precipitation_probability?: (number | null)[];
}

const INDOOR = new Set(["dome", "closed"]);

export function getWeather(week: number): Promise<Record<string, Weather>> {
  return cached(`weather:${week}`, HOUR, async () => {
    const nfl = await getNflData();
    const games = (nfl?.games ?? []).filter((g) => g.w === week);
    const out: Record<string, Weather> = {};
    const horizon = Date.now() + 15 * 24 * 3600 * 1000;
    await Promise.all(
      games.map(async (g) => {
        const base: Weather = { roof: g.roof, tempF: null, windMph: null, gustMph: null, precipPct: null, stadium: g.st };
        out[g.h] = base;
        out[g.a] = base;
        if (!g.k || g.lat == null || g.lon == null || INDOOR.has(g.roof ?? "")) return;
        const kick = new Date(g.k).getTime();
        if (kick > horizon || kick < Date.now() - 6 * 3600 * 1000) return;
        const day = g.k.slice(0, 10);
        try {
          const j = await getJson<{ hourly?: MeteoHourly }>(
            `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}` +
              `&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,precipitation_probability` +
              `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&start_date=${day}&end_date=${day}`
          );
          const h = j.hourly ?? {};
          const times = h.time ?? [];
          let idx = 0;
          let best = Infinity;
          times.forEach((t, i) => {
            const d = Math.abs(new Date(t + "Z").getTime() - (kick + 90 * 60 * 1000)); // mid-game
            if (d < best) {
              best = d;
              idx = i;
            }
          });
          const w: Weather = {
            ...base,
            tempF: h.temperature_2m?.[idx] ?? null,
            windMph: h.wind_speed_10m?.[idx] ?? null,
            gustMph: h.wind_gusts_10m?.[idx] ?? null,
            precipPct: h.precipitation_probability?.[idx] ?? null,
          };
          out[g.h] = w;
          out[g.a] = w;
        } catch {
          /* weather is optional */
        }
      })
    );
    return out;
  });
}

// ---------- ESPN weekly projections (second opinion to Sleeper's) ----------

// ESPN stat id -> Sleeper stat key, so ESPN projections score with the league's own settings.
const ESPN_STAT: Record<string, string> = {
  "0": "pass_att",
  "1": "pass_cmp",
  "3": "pass_yd",
  "4": "pass_td",
  "19": "pass_2pt",
  "20": "pass_int",
  "23": "rush_att",
  "24": "rush_yd",
  "25": "rush_td",
  "26": "rush_2pt",
  "53": "rec",
  "42": "rec_yd",
  "43": "rec_td",
  "44": "rec_2pt",
  "58": "rec_tgt",
  "72": "fum_lost",
};

interface EspnKonaPlayer {
  id?: number;
  player?: {
    id?: number;
    defaultPositionId?: number;
    stats?: { statSourceId?: number; statSplitTypeId?: number; scoringPeriodId?: number; seasonId?: number; stats?: Record<string, number> }[];
  };
}

/** ESPN projections for one week, keyed by ESPN player id, as Sleeper-style stat lines. */
export function getEspnProjections(season: number, week: number): Promise<Record<string, StatLine>> {
  return cached(`espnproj:${season}:${week}`, 2 * HOUR, async () => {
    const filter = {
      players: {
        filterSlotIds: { value: [0, 2, 4, 6] },
        limit: 1200,
        sortPercOwned: { sortPriority: 1, sortAsc: false },
      },
    };
    const res = await fetch(
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3?scoringPeriodId=${week}&view=kona_player_info`,
      { headers: { accept: "application/json", "x-fantasy-filter": JSON.stringify(filter) }, cache: "no-store" }
    );
    if (!res.ok) throw new Error(`ESPN projections ${res.status}`);
    const j = (await res.json()) as { players?: EspnKonaPlayer[] };
    const out: Record<string, StatLine> = {};
    for (const row of j.players ?? []) {
      const p = row.player;
      const id = p?.id ?? row.id;
      if (!p || id == null) continue;
      const proj = (p.stats ?? []).find(
        (x) => x.statSourceId === 1 && x.scoringPeriodId === week && x.seasonId === season && (x.statSplitTypeId ?? 1) === 1
      );
      if (!proj?.stats) continue;
      const line: StatLine = {};
      for (const [k, v] of Object.entries(proj.stats)) {
        const key = ESPN_STAT[k];
        if (key && typeof v === "number" && v) line[key] = Math.round(v * 100) / 100;
      }
      if (p.defaultPositionId === 4 && line.rec) line.bonus_rec_te = line.rec;
      if (Object.keys(line).length) out[String(id)] = line;
    }
    return out;
  });
}

// ---------- Sleeper league activity ----------

interface RawTx {
  transaction_id?: string;
  type?: string;
  status?: string;
  leg?: number;
  created?: number;
  status_updated?: number;
  roster_ids?: number[];
  adds?: Record<string, number> | null;
  drops?: Record<string, number> | null;
  settings?: { waiver_bid?: number } | null;
  draft_picks?: unknown[] | null;
}

function slimTx(rows: RawTx[] | null, week: number): Transaction[] {
  return (rows ?? [])
    .filter((t) => t?.status === "complete" && t.type)
    .map((t) => ({
      id: String(t.transaction_id ?? ""),
      type: t.type!,
      week: t.leg ?? week,
      created: t.status_updated ?? t.created ?? 0,
      rosterIds: t.roster_ids ?? [],
      adds: t.adds ?? {},
      drops: t.drops ?? {},
      bid: t.settings?.waiver_bid ?? null,
      picks: t.draft_picks?.length ?? 0,
    }));
}

function weekTx(leagueId: string, week: number, final: boolean) {
  return sleeper<RawTx[]>(`/league/${leagueId}/transactions/${week}`, final ? 6 * HOUR : 5 * MIN)
    .then((r) => slimTx(r, week))
    .catch(() => [] as Transaction[]);
}

export async function getLeagueActivity(leagueId: string, week: number): Promise<LeagueActivity> {
  const league = await sleeper<SleeperLeague>(`/league/${leagueId}`, 10 * MIN);
  const weeks = Array.from({ length: Math.max(1, Math.min(18, week)) }, (_, i) => i + 1);
  const [matchupsRaw, txByWeek] = await Promise.all([
    sleeper<{ roster_id: number; matchup_id: number | null; points?: number; starters?: string[] }[]>(
      `/league/${leagueId}/matchups/${week}`,
      2 * MIN
    ).catch(() => []),
    Promise.all(weeks.map((w) => weekTx(leagueId, w, w < week))),
  ]);
  // Last season's trades, mapped to owners so tendencies carry over even if roster ids changed.
  let lastSeasonTrades: LeagueActivity["lastSeasonTrades"] = [];
  const prevId = league?.previous_league_id;
  if (prevId && prevId !== "0") {
    try {
      const [prevRosters, ...prevWeeks] = await Promise.all([
        sleeper<SleeperRoster[]>(`/league/${prevId}/rosters`, 24 * HOUR),
        ...Array.from({ length: 18 }, (_, i) =>
          sleeper<RawTx[]>(`/league/${prevId}/transactions/${i + 1}`, 24 * HOUR).catch(() => [] as RawTx[])
        ),
      ]);
      const ownerByRoster = new Map((prevRosters as SleeperRoster[]).map((r) => [r.roster_id, r.owner_id ?? ""]));
      lastSeasonTrades = (prevWeeks as RawTx[][])
        .flatMap((rows, i) => slimTx(rows, i + 1))
        .filter((t) => t.type === "trade")
        .map((t) => ({ ...t, ownerIds: t.rosterIds.map((r) => ownerByRoster.get(r) ?? "") }));
    } catch {
      /* history is optional */
    }
  }
  const matchups: MatchupRow[] = (matchupsRaw ?? []).map((m) => ({
    rosterId: m.roster_id,
    matchupId: m.matchup_id ?? null,
    points: m.points ?? 0,
    starters: m.starters ?? [],
  }));
  return {
    week,
    matchups,
    transactions: txByWeek.flat().sort((a, b) => b.created - a.created),
    lastSeasonTrades,
  };
}
