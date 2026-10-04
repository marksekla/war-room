// Shared types for War Room.

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "DEF";
export const POSITIONS: Position[] = ["QB", "RB", "WR", "TE", "K", "DEF"];

/** Slimmed Sleeper player record. */
export interface Player {
  id: string;
  name: string;
  pos: Position;
  team: string | null;
  age: number | null;
  injury: string | null; // Questionable, Doubtful, Out, IR, PUP, Sus, NA
  injuryPart: string | null;
  depth: number | null;
  yearsExp: number | null;
  espnId?: string | null;
  gsis?: string | null;
}

export type PlayerMap = Record<string, Player>;

/** Raw Sleeper stat line (stat key -> value). */
export type StatLine = Record<string, number>;

/** stats[week][playerId] = stat line, plus the opponent that week. */
export interface WeekStats {
  week: number;
  lines: Record<string, { team: string; opp: string | null; s: StatLine }>;
}

export interface WeekProjections {
  week: number;
  lines: Record<string, { team: string; opp: string | null; s: StatLine }>;
}

export interface Game {
  week: number;
  home: string;
  away: string;
  kickoff: string; // ISO
  spread: number | null; // home spread, negative = home favored
  total: number | null;
  status: "pre" | "in" | "post";
}

export interface Schedule {
  season: number;
  games: Game[];
  /** byes[team] = week number */
  byes: Record<string, number>;
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  metadata?: { team_name?: string };
  avatar?: string | null;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  players: string[] | null;
  starters: string[] | null;
  reserve: string[] | null;
  taxi?: string[] | null;
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts?: number;
    fpts_decimal?: number;
    fpts_against?: number;
    waiver_position?: number;
    waiver_budget_used?: number;
  };
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: Record<string, number>;
  previous_league_id?: string | null;
}

export interface NflState {
  week: number;
  season: string;
  season_type: string;
  display_week?: number;
}

export interface LeagueBundle {
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  state: NflState;
}

export interface Team {
  rosterId: number;
  ownerId: string | null;
  ownerName: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
  players: string[];
  reserve: string[];
  waiverPosition: number | null;
}

export type ProviderId = "anthropic" | "openai" | "gemini" | "compat";

export interface AiSettings {
  provider: ProviderId;
  /** Key for the selected provider (kept for backwards compatibility). */
  apiKey: string;
  /** Saved keys per provider, so switching providers doesn't wipe a key. */
  keys?: Partial<Record<ProviderId, string>>;
  model: string;
  /** Base URL for OpenAI-compatible providers (OpenRouter, Groq, etc.). */
  baseUrl?: string;
  webSearch: boolean;
  strategy: string;
}

// ---------- Advanced data (nflverse, built nightly by scripts/build_nfl_data.py) ----------

export interface NflUsage {
  g: number;
  snap: number | null; // avg offensive snap share 0-1
  tgtSh: number | null;
  carSh: number | null;
  airSh: number | null;
  wopr: number | null;
  frSh: number | null; // share of team first-read targets
  rzSh: number | null; // share of team red zone opportunities
  rzT: number;
  rzC: number;
  glC: number; // carries inside the 5
  tgtPg: number | null;
  carPg: number | null;
  xfp: number | null; // expected PPR points per game
  fp: number | null; // actual PPR points per game
  adot?: number | null;
}

export interface NflPlayer {
  sid: string | null; // Sleeper id
  n: string;
  pos: string;
  tm: string | null;
  s: NflUsage | null; // season
  l3: NflUsage | null; // last 3 games
  /** [week, snap share, targets, carries, red zone opps, xFP, PPR pts] */
  wk: [number, number | null, number, number, number, number | null, number | null][];
  ngs?: { sep?: number; cush?: number; yacoe?: number; iay?: number; ryoe?: number; box8?: number; eff?: number; cpoe?: number; ttt?: number; aggr?: number };
  prac?: { w: number; st: "DNP" | "LP" | "FP" | null; rep: string | null; inj: string | null; wks: number };
}

export interface NflTeamEnv {
  g: number;
  plays: number | null;
  npr: number | null; // neutral pass rate %
  proe: number | null; // pass rate over expected, pct points (league avg about -2)
  pace: number | null; // neutral seconds per play
  epa: number | null;
  rzPg: number | null;
  rzTd: number | null;
  qbGl: number | null; // % of goal-line carries by the QB
  dPass: number | null; // EPA/play allowed (lower = better defense)
  dRush: number | null;
  ppg?: number | null;
  rk?: Partial<Record<"npr" | "proe" | "plays" | "epa" | "rzPg" | "ppg" | "pace" | "dPass" | "dRush", number>>;
}

export interface NflGame {
  w: number;
  h: string;
  a: string;
  k: string | null;
  st: string | null;
  roof: string | null;
  lat: number | null;
  lon: number | null;
  hr?: number | null; // home team days of rest
  ar?: number | null;
  surf?: string | null;
  div?: boolean;
  neutral?: boolean;
}

export interface NflStarter {
  n: string;
  pos: string; // CB, S, LB, EDGE, DL / OT, OG, C, OL
  pct: number; // snap share over last 3 games
  rep: string | null; // official game status on the latest report
  pr: "DNP" | "LP" | "FP" | null;
}

export interface NflData {
  updated: string;
  season: number;
  throughWeek: number;
  attribution: string;
  teams: Record<string, NflTeamEnv>;
  players: Record<string, NflPlayer>;
  games: NflGame[];
  /** Defensive and O-line regulars by team, with their latest injury status. */
  starters?: Record<string, { def: NflStarter[]; ol: NflStarter[] }>;
  startersReportWeek?: number | null;
}

export interface MarketValue {
  value: number;
  rank: number;
  posRank: number;
  trend: number;
  tier: number | null;
}

export interface EspnInjury {
  espnId: string | null;
  name: string;
  pos?: string | null;
  team: string | null;
  status: string;
  date: string | null;
  short: string | null;
  body: string | null;
  returnDate: string | null;
}

export interface Weather {
  roof: string | null;
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  precipPct: number | null;
  stadium: string | null;
}

export interface NewsItem {
  headline: string;
  story: string | null;
  published: string;
  source: string | null;
  url: string | null;
}

// ---------- League activity (Sleeper transactions + matchups) ----------

export interface Transaction {
  id: string;
  type: "trade" | "waiver" | "free_agent" | string;
  week: number;
  created: number; // ms
  rosterIds: number[];
  adds: Record<string, number>; // player id -> roster that got him
  drops: Record<string, number>; // player id -> roster that dropped him
  bid: number | null; // FAAB
  picks: number; // draft picks moved (trades)
}

export interface MatchupRow {
  rosterId: number;
  matchupId: number | null;
  points: number;
  starters: string[];
}

export interface LeagueActivity {
  week: number;
  matchups: MatchupRow[];
  transactions: Transaction[];
  /** Completed trades from last season in this league (same managers, matched by owner id). */
  lastSeasonTrades: (Transaction & { ownerIds: string[] })[];
}
