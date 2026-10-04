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

export type ProviderId = "anthropic" | "openai";

export interface AiSettings {
  provider: ProviderId;
  apiKey: string;
  model: string;
  webSearch: boolean;
  strategy: string;
}
