// The analytics engine. Everything here is pure and runs in the browser on data
// pulled from Sleeper and ESPN. It scores players with the league's own scoring
// settings, measures usage, rates matchups and schedules, and simulates lineups
// week by week so trades and waiver moves are judged on how many points your
// actual starting lineup gains, not on raw rankings.

import { officialReportDay, type OfficialRow } from "./officialReport";
import type {
  EspnInjury,
  PlayCalib,
  Game,
  LeagueActivity,
  LeagueBundle,
  MarketValue,
  NflData,
  NflPlayer,
  NflTeamEnv,
  Player,
  PlayerMap,
  Position,
  Schedule,
  StatLine,
  Team,
  WeekProjections,
  WeekStats,
} from "./types";

export interface GameLog {
  week: number;
  opp: string | null;
  pts: number;
  snaps: number;
  teamSnaps: number;
  carries: number;
  targets: number;
  receptions: number;
  redZone: number;
  teamCarries: number;
  teamTargets: number;
}

export interface PlayerView {
  p: Player;
  ownerRosterId: number | null;
  log: GameLog[];
  games: number;
  ppg: number;
  last3: number;
  projNext: number | null;
  valuePg: number;
  vorp: number;
  rosPoints: number;
  bye: number | null;
  snapShare: number | null; // last game played
  targetShare: number | null; // season
  carryShare: number | null; // season
  trend: number; // last game pts minus season ppg
  trendingAdds: number;
  /** nflverse advanced usage (snaps, first reads, red zone, xFP, NGS, practice report). */
  adv: NflPlayer | null;
  /** FantasyCalc redraft trade value. */
  market: MarketValue | null;
  /** Latest ESPN injury entry, if any. */
  espn: EspnInjury | null;
  /** This week's projection from each source (league scoring). projNext is their average. */
  projSleeper: number | null;
  projEspn: number | null;
  /** FantasyPros consensus projection (an average of many sites), league scoring. */
  projFp: number | null;
  /** When FantasyPros has no projection for him, the weekly expert rank his FantasyPros number came from. */
  projFpRank: number | null;
  /** FantasyPros expert consensus: rest-of-season positional rank (and spread), this week's rank. */
  ecrRos: number | null;
  ecrSd: number | null;
  ecrWeek: number | null;
  /** This week's blended projection with the matchup and Vegas effects taken back out (so they're applied once). */
  projNeutral: number | null;
  /** Points per game the expert consensus rank implies (this league's scoring). */
  ecrPg?: number | null;
}

export interface Extras {
  nfl?: NflData | null;
  values?: Record<string, MarketValue> | null;
  injuries?: EspnInjury[] | null;
  activity?: LeagueActivity | null;
  espnProj?: Record<string, StatLine> | null;
  /** Pre-game Sleeper projections for weeks already played (for "projected vs actual"). */
  projHistory?: WeekProjections[] | null;
  /** The NFL's official injury report for the current week, read live from nfl.com. */
  official?: OfficialReport | null;
}

export interface OfficialReport {
  season: number;
  week: number;
  fetchedAt: string;
  rows: OfficialRow[];
}

/** Chance a player suits up, with the evidence behind it. */
export interface PlayChance {
  p: number; // 0-1
  status: string | null; // designation used
  official: boolean; // true once the final game-status report is out
  practice: { day: string; st: "DNP" | "LP" | "FP" }[];
  injury: string | null;
  missedLast: boolean;
  note: string | null; // latest news/comment used
  why: string;
}

export interface UnitOut {
  name: string;
  pos: string;
  status: string;
  snapPct: number;
}

export interface ManagerProfile {
  rosterId: number;
  tradesThisSeason: number;
  tradesLastSeason: number;
  waiverClaims: number;
  freeAgentAdds: number;
  faabSpent: number;
  bought: Record<string, number>; // positions acquired in trades
  sold: Record<string, number>;
  activityRank: number; // 1 = most active
  lastMove: number | null;
  summary: string;
}

export interface GameInfo {
  game: Game;
  opp: string;
  home: boolean;
  teamSpread: number | null; // negative = favored
  impliedTotal: number | null;
}

export const FLEX_SLOTS: Record<string, Position[]> = {
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  IDP_FLEX: [],
};

const LONG_TERM = new Set(["IR", "PUP", "Sus", "NA"]);
const ESPN_STATUS: Record<string, string> = {
  Out: "Out",
  Doubtful: "Doubtful",
  Questionable: "Questionable",
  "Injured Reserve": "IR",
  "Physically Unable to Perform": "PUP",
  Suspension: "Sus",
};
const SEVERITY: Record<string, number> = { Questionable: 1, Doubtful: 2, Out: 3, IR: 4, PUP: 4, Sus: 4, NA: 4 };

export function scoreLine(s: StatLine | undefined, scoring: Record<string, number>): number {
  if (!s) return 0;
  let pts = 0;
  for (const k in s) {
    const mult = scoring[k];
    if (mult) pts += s[k] * mult;
  }
  return Math.round(pts * 100) / 100;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export class LeagueModel {
  readonly scoring: Record<string, number>;
  readonly season: number;
  readonly week: number; // current NFL week
  readonly lastWeek: number; // last fantasy week (championship)
  readonly playoffStart: number;
  readonly tradeDeadline: number | null;
  readonly teams: Team[];
  readonly slots: string[];
  readonly benchSlots: number;
  readonly rosterLimit: number;
  readonly ownerOf = new Map<string, number>();
  readonly views = new Map<string, PlayerView>();
  readonly dvp = new Map<string, Map<Position, { allowed: number; rank: number; factor: number }>>();
  readonly replacement = new Map<Position, number>();
  readonly nfl: NflData | null;
  private gamesByTeamWeek = new Map<string, GameInfo>();
  private advBySleeper = new Map<string, NflPlayer>();
  private advByGsis = new Map<string, NflPlayer>();
  private gsisBySleeper = new Map<string, string>();
  private espnById = new Map<string, EspnInjury>();
  private espnByName = new Map<string, EspnInjury>();
  private avgImpliedCache = new Map<number, number>();
  private playCache = new Map<string, PlayChance>();
  /** Week an injured player is expected back (ESPN return date, or a default for IR/PUP). */
  readonly returnWeek = new Map<string, number>();
  /** Teammates whose role should shrink when a better player returns from injury. */
  readonly roleShift = new Map<string, { fromWeek: number; mult: number; by: string; byPos: string }>();
  readonly activity: LeagueActivity | null;

  constructor(
    readonly bundle: LeagueBundle,
    readonly players: PlayerMap,
    readonly stats: WeekStats[],
    readonly projections: WeekProjections[],
    readonly schedule: Schedule,
    readonly trending: { add: { player_id: string; count: number }[] },
    readonly extras: Extras = {}
  ) {
    const { league, users, rosters, state } = bundle;
    this.scoring = league.scoring_settings ?? {};
    this.season = Number(league.season || state.season);
    this.week = Math.max(1, Math.min(18, Number(state.season_type === "regular" ? state.week : state.week || 1)));
    this.playoffStart = league.settings?.playoff_week_start || 15;
    this.lastWeek = Math.min(18, this.playoffStart + 2);
    this.tradeDeadline = league.settings?.trade_deadline ?? null;
    this.slots = league.roster_positions.filter((s) => !["BN", "IR", "TAXI"].includes(s));
    this.benchSlots = league.roster_positions.filter((s) => s === "BN").length;
    this.rosterLimit = this.slots.length + this.benchSlots;

    const userById = new Map(users.map((u) => [u.user_id, u]));
    this.teams = rosters.map((r) => {
      const u = r.owner_id ? userById.get(r.owner_id) : undefined;
      const fpts = (r.settings.fpts ?? 0) + (r.settings.fpts_decimal ?? 0) / 100;
      return {
        rosterId: r.roster_id,
        ownerId: r.owner_id,
        ownerName: u?.display_name ?? `Team ${r.roster_id}`,
        teamName: u?.metadata?.team_name || u?.display_name || `Team ${r.roster_id}`,
        wins: r.settings.wins ?? 0,
        losses: r.settings.losses ?? 0,
        ties: r.settings.ties ?? 0,
        pf: Math.round(fpts * 10) / 10,
        pa: r.settings.fpts_against ?? 0,
        players: (r.players ?? []).filter((id) => !(r.reserve ?? []).includes(id)),
        reserve: r.reserve ?? [],
        waiverPosition: r.settings.waiver_position ?? null,
      };
    });
    for (const t of this.teams) for (const id of [...t.players, ...t.reserve]) this.ownerOf.set(id, t.rosterId);

    for (const g of schedule.games) {
      const spreadHome = g.spread;
      const homeImplied = g.total != null && spreadHome != null ? g.total / 2 - spreadHome / 2 : null;
      const awayImplied = g.total != null && spreadHome != null ? g.total / 2 + spreadHome / 2 : null;
      this.gamesByTeamWeek.set(`${g.home}:${g.week}`, {
        game: g,
        opp: g.away,
        home: true,
        teamSpread: spreadHome,
        impliedTotal: homeImplied,
      });
      this.gamesByTeamWeek.set(`${g.away}:${g.week}`, {
        game: g,
        opp: g.home,
        home: false,
        teamSpread: spreadHome == null ? null : -spreadHome,
        impliedTotal: awayImplied,
      });
    }

    this.nfl = extras.nfl ?? null;
    this.activity = extras.activity ?? null;
    for (const [gsis, a] of Object.entries(this.nfl?.players ?? {})) {
      this.advByGsis.set(gsis, a);
      if (a.sid) {
        this.advBySleeper.set(a.sid, a);
        this.gsisBySleeper.set(a.sid, gsis);
      }
    }
    for (const i of extras.injuries ?? []) {
      if (i.espnId) this.espnById.set(i.espnId, i);
      if (i.name) this.espnByName.set(`${normName(i.name)}:${i.team ?? ""}`, i);
    }

    this.buildDvp();
    this.buildViews();
  }

  // ---------- advanced data ----------

  teamEnv(team: string | null): NflTeamEnv | null {
    return team ? this.nfl?.teams[team] ?? null : null;
  }

  private advFor(p: Player): NflPlayer | null {
    return this.advBySleeper.get(p.id) ?? (p.gsis ? this.advByGsis.get(p.gsis) : undefined) ?? null;
  }

  private espnFor(p: Player): EspnInjury | null {
    return (p.espnId ? this.espnById.get(p.espnId) : undefined) ?? this.espnByName.get(`${normName(p.name)}:${p.team ?? ""}`) ?? null;
  }

  /** FantasyPros consensus entry: by Sleeper id, team (defenses), or name + team. */
  private ecrFor(p: Player): { ros: [number, number | null] | null; wk: number | null } {
    const e = this.nfl?.ecr;
    if (!e) return { ros: null, wk: null };
    const keys = p.pos === "DEF" ? [p.id, p.team ?? ""] : [p.id, `n:${normName(p.name)}:${p.team ?? "FA"}`];
    let ros: [number, number | null] | null = null;
    let wk: number | null = null;
    for (const k of keys) {
      if (!ros && e.ros[k]) ros = e.ros[k];
      if (wk == null && e.wk[k] != null) wk = e.wk[k];
    }
    // Weekly ranks only count for the week they were made for.
    if (e.week != null && e.week !== this.week) wk = null;
    return { ros, wk };
  }

  /** FantasyPros consensus stat line for this week (only when it was made for this week). */
  private fpLine(p: Player): Record<string, number> | null {
    const f = this.nfl?.fpProj;
    if (!f || f.week !== this.week || p.pos === "DEF" || p.pos === "K") return null;
    return f.lines[p.id] ?? f.lines[`n:${normName(p.name)}:${p.team ?? "FA"}`] ?? null;
  }

  /**
   * Sleeper's injury field can lag a few hours. ESPN's injury feed refreshes every
   * 15 minutes, so a recent ESPN game designation wins when it is more serious.
   */
  private effectiveInjury(p: Player, e: EspnInjury | null): string | null {
    if (!e) return p.injury;
    const mapped = ESPN_STATUS[e.status];
    if (!mapped) return p.injury;
    const ageDays = e.date ? (Date.now() - new Date(e.date).getTime()) / 86_400_000 : 99;
    const fresh = LONG_TERM.has(mapped) ? ageDays < 60 : ageDays < 8;
    if (!fresh) return p.injury;
    if (!p.injury || (SEVERITY[mapped] ?? 0) > (SEVERITY[p.injury] ?? 0)) return mapped;
    return p.injury;
  }

  // ---------- lookups ----------

  team(rosterId: number) {
    return this.teams.find((t) => t.rosterId === rosterId);
  }

  gameFor(team: string | null, week: number): GameInfo | null {
    if (!team) return null;
    return this.gamesByTeamWeek.get(`${team}:${week}`) ?? null;
  }

  ownerName(id: string) {
    const r = this.ownerOf.get(id);
    return r == null ? "Free agent" : this.team(r)?.teamName ?? "?";
  }

  findPlayer(query: string): PlayerView | null {
    const q = query.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (!q) return null;
    let best: PlayerView | null = null;
    let bestScore = -1;
    for (const v of this.views.values()) {
      const n = v.p.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      let score = -1;
      if (n === q) score = 100;
      else if (n.endsWith(" " + q) || n.startsWith(q + " ")) score = 60;
      else if (n.includes(q)) score = 40;
      if (score < 0) continue;
      score += Math.min(20, v.valuePg); // prefer relevant players on ties
      if (score > bestScore) {
        best = v;
        bestScore = score;
      }
    }
    return best;
  }

  // ---------- defense vs position ----------

  private buildDvp() {
    const totals = new Map<string, Map<Position, { pts: number; weeks: Set<number> }>>();
    for (const wk of this.stats) {
      for (const [id, line] of Object.entries(wk.lines)) {
        const p = this.players[id];
        if (!p || !line.opp || p.pos === "DEF" || p.pos === "K") continue;
        const byPos = totals.get(line.opp) ?? new Map();
        const cur = byPos.get(p.pos) ?? { pts: 0, weeks: new Set<number>() };
        cur.pts += scoreLine(line.s, this.scoring);
        cur.weeks.add(wk.week);
        byPos.set(p.pos, cur);
        totals.set(line.opp, byPos);
      }
    }
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      const rows: [string, number][] = [];
      for (const [team, byPos] of totals) {
        const v = byPos.get(pos);
        if (v && v.weeks.size) rows.push([team, v.pts / v.weeks.size]);
      }
      rows.sort((a, b) => a[1] - b[1]);
      const mean = avg(rows.map((r) => r[1])) || 1;
      rows.forEach(([team, allowed], i) => {
        const m = this.dvp.get(team) ?? new Map();
        m.set(pos, { allowed: round1(allowed), rank: i + 1, factor: allowed / mean });
        this.dvp.set(team, m);
      });
    }
  }

  /** Matchup multiplier, damped so a few weeks of data cannot swing values wildly. */
  matchupFactor(pos: Position, opp: string | null): number {
    if (!opp) return 1;
    const f = this.dvp.get(opp)?.get(pos)?.factor;
    if (!f) return 1;
    const learned = this.extras.nfl?.calib?.matchup?.[pos]?.dvp;
    const weeksOfData = this.stats.length;
    // Learned strength when available; otherwise grow trust slowly as weeks of data pile up.
    const damp = learned != null ? (weeksOfData >= 2 ? learned : learned * 0.5) : Math.min(0.45, 0.12 * weeksOfData);
    return Math.max(0.75, Math.min(1.25, 1 + damp * (f - 1)));
  }

  /** Vegas: a team expected to score more than the week's average lifts its players. */
  vegasFactor(pos: Position, g: GameInfo | null, week: number): number {
    if (!g || g.impliedTotal == null) return 1;
    let avgImplied = this.avgImpliedCache.get(week);
    if (avgImplied == null) {
      const totals: number[] = [];
      for (const x of this.schedule.games) {
        if (x.week !== week || x.total == null || x.spread == null) continue;
        totals.push(x.total / 2);
      }
      avgImplied = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 22.5;
      this.avgImpliedCache.set(week, avgImplied);
    }
    if (pos === "DEF") {
      // Defenses score off the other team: a low opponent implied total means fewer points allowed and more sacks/turnovers.
      const oppImplied = g.game.total != null ? g.game.total - g.impliedTotal : null;
      if (oppImplied == null) return 1;
      return Math.max(0.75, Math.min(1.3, 1 + 0.6 * (1 - oppImplied / avgImplied)));
    }
    const a = this.extras.nfl?.calib?.matchup?.[pos]?.vegas ?? (pos === "K" ? 0.3 : 0.2);
    return Math.max(0.8, Math.min(1.25, 1 + a * (g.impliedTotal / avgImplied - 1)));
  }

  // ---------- player views ----------

  private buildViews() {
    const teamWeek = new Map<string, { car: number; tgt: number }>();
    for (const wk of this.stats) {
      for (const [id, line] of Object.entries(wk.lines)) {
        const p = this.players[id];
        if (!p || p.pos === "DEF") continue;
        const k = `${line.team || p.team}:${wk.week}`;
        const t = teamWeek.get(k) ?? { car: 0, tgt: 0 };
        t.car += line.s.rush_att ?? 0;
        t.tgt += line.s.rec_tgt ?? 0;
        teamWeek.set(k, t);
      }
    }
    const projByWeek = new Map(this.projections.map((p) => [p.week, p]));
    const trend = new Map(this.trending.add.map((t) => [t.player_id, t.count]));
    const pb = this.extras.nfl?.calib?.projBlend ?? null;
    const espnBackup = this.nfl?.espnProj?.week === this.week ? this.nfl.espnProj.lines : undefined;
    const srcProj = (raw: Player) => {
      const next = projByWeek.get(this.week)?.lines[raw.id];
      const espnLine = raw.espnId ? this.extras.espnProj?.[raw.espnId] ?? espnBackup?.[raw.espnId] : undefined;
      return { s: next ? scoreLine(next.s, this.scoring) : null, e: espnLine ? scoreLine(espnLine, this.scoring) : null };
    };
    // FantasyPros only publishes its top 10 projections per position for free. For everyone else,
    // its weekly expert consensus rank stands in: rank N at a position is worth what the Nth-best
    // Sleeper/ESPN projection at that position is worth this week.
    const ladder = new Map<string, number[]>();
    for (const raw of Object.values(this.players)) {
      if (!raw.team) continue;
      const { s: ps, e: pe } = srcProj(raw);
      const b = blendProjections([["sleeper", ps], ["espn", pe]], pb);
      if (b != null && b > 0) {
        if (!ladder.has(raw.pos)) ladder.set(raw.pos, []);
        ladder.get(raw.pos)!.push(b);
      }
    }
    for (const l of ladder.values()) l.sort((x, y) => y - x);
    const rankPts = (pos: string, rank: number) => {
      const l = ladder.get(pos);
      if (!l?.length || !(rank > 0)) return null;
      const r = Math.min(l.length, Math.max(1, rank)) - 1;
      const lo = Math.floor(r);
      const hi = Math.min(l.length - 1, lo + 1);
      return l[lo] + (l[hi] - l[lo]) * (r - lo);
    };

    for (const raw of Object.values(this.players)) {
      const espn = raw.pos === "DEF" ? null : this.espnFor(raw);
      const injury = this.effectiveInjury(raw, espn);
      const p: Player = injury === raw.injury ? raw : { ...raw, injury, injuryPart: raw.injuryPart ?? espn?.body ?? null };
      const adv = raw.pos === "DEF" || raw.pos === "K" ? null : this.advFor(raw);
      const log: GameLog[] = [];
      for (const wk of this.stats) {
        const line = wk.lines[p.id];
        if (!line) continue;
        const s = line.s;
        const played = p.pos === "DEF" || p.pos === "K" ? true : (s.off_snp ?? 0) > 0 || (s.gp ?? 0) > 0;
        if (!played) continue;
        const tw = teamWeek.get(`${line.team || p.team}:${wk.week}`) ?? { car: 0, tgt: 0 };
        log.push({
          week: wk.week,
          opp: line.opp,
          pts: scoreLine(s, this.scoring),
          snaps: s.off_snp ?? 0,
          teamSnaps: s.tm_off_snp ?? 0,
          carries: s.rush_att ?? 0,
          targets: s.rec_tgt ?? 0,
          receptions: s.rec ?? 0,
          redZone: (s.rush_rz_att ?? 0) + (s.rec_rz_tgt ?? 0),
          teamCarries: tw.car,
          teamTargets: tw.tgt,
        });
      }
      log.sort((a, b) => a.week - b.week);
      const owned = this.ownerOf.has(p.id);
      if (!owned && !log.length && !p.team) continue;

      const pts = log.map((g) => g.pts);
      const ppg = avg(pts);
      const last3 = avg(pts.slice(-3));
      const { s: projSleeper, e: projEspn } = srcProj(raw);
      const ecr = this.ecrFor(raw);
      const fpLine = this.fpLine(p);
      // Weekly expert ranks already drop players who might sit, and chance to play is applied
      // separately, so a rank only stands in for healthy players (no double penalty).
      const projFpRank = !fpLine && ecr.wk != null && p.team && !p.injury ? ecr.wk : null;
      const projFp = fpLine ? scoreLine(fpLine, this.scoring) : projFpRank != null ? rankPts(p.pos, projFpRank) : null;
      // Independent studies (Fantasy Football Analytics, 2015-2025) find an average of projection
      // sources beats nearly every single source. Weights are learned by calibrate.py and pulled
      // halfway toward equal, because the "best" source changes from year to year.
      const projNext = blendProjections(
        [
          ["sleeper", projSleeper],
          ["espn", projEspn],
          ["fantasypros", projFp],
        ],
        pb
      );

      // Rest-of-season value should not depend on this week's opponent: strip the matchup and
      // Vegas effects back out of this week's projection before it feeds the per-game value.
      const gNow = p.team ? this.gameFor(p.team, this.week) : null;
      const projRos =
        projNext != null && projNext > 0 && gNow
          ? projNext / Math.max(0.7, this.matchupFactor(p.pos, gNow.opp) * this.vegasFactor(p.pos, gNow, this.week))
          : projNext;
      // Learned weights (scripts/calibrate.py) when available, hand-set defaults otherwise.
      const calib = this.extras.nfl?.calib;
      const xfpRaw = adv?.s?.xfp;
      const fpRaw = adv?.s?.fp;
      const conv = fpRaw && fpRaw > 2 && ppg > 0 ? Math.max(0.6, Math.min(1.4, ppg / fpRaw)) : 1; // PPR -> league scoring
      const cw = calib?.weights?.[p.pos];
      const cwNoProj = calib?.weightsNoProj?.[p.pos];
      let learned: number | null = null;
      if (log.length >= 2 && xfpRaw) {
        if (cw && projRos != null && projRos > 0) learned = cw.proj * projRos + cw.last3 * last3 + cw.ppg * ppg + cw.xfp * xfpRaw * conv;
        else if (cwNoProj && (projRos == null || projRos <= 0)) learned = cwNoProj.last3 * last3 + cwNoProj.ppg * ppg + cwNoProj.xfp * xfpRaw * conv;
        else if (cwNoProj && projRos != null && projRos > 0)
          learned = 0.5 * projRos + 0.5 * (cwNoProj.last3 * last3 + cwNoProj.ppg * ppg + cwNoProj.xfp * xfpRaw * conv);
      }

      let valuePg: number;
      if (learned != null) {
        valuePg = learned;
      } else if (log.length >= 2) {
        valuePg = projRos != null && projRos > 0 ? 0.45 * projRos + 0.35 * last3 + 0.2 * ppg : 0.6 * last3 + 0.4 * ppg;
      } else if (log.length === 1) {
        valuePg = projRos != null && projRos > 0 ? 0.65 * projRos + 0.35 * ppg : ppg * 0.85;
      } else {
        valuePg = projRos ?? 0;
      }
      // Opportunity is stickier than efficiency: lean slightly toward expected points
      // (xFP, from nflverse/ffopportunity), converted to this league's scoring.
      if (learned == null && xfpRaw && log.length >= 2 && ["RB", "WR", "TE"].includes(p.pos)) {
        valuePg = 0.85 * valuePg + 0.15 * xfpRaw * conv;
      }

      const lastGame = log[log.length - 1];
      const carSum = log.reduce((a, g) => a + g.carries, 0);
      const carTeam = log.reduce((a, g) => a + g.teamCarries, 0);
      const tgtSum = log.reduce((a, g) => a + g.targets, 0);
      const tgtTeam = log.reduce((a, g) => a + g.teamTargets, 0);

      this.views.set(p.id, {
        p,
        ownerRosterId: this.ownerOf.get(p.id) ?? null,
        log,
        games: log.length,
        ppg: round1(ppg),
        last3: round1(last3),
        projNext: projNext == null ? null : round1(projNext),
        valuePg: round1(Math.max(0, valuePg)),
        vorp: 0,
        rosPoints: 0,
        bye: p.team ? this.schedule.byes[p.team] ?? null : null,
        snapShare:
          lastGame && lastGame.teamSnaps
            ? lastGame.snaps / lastGame.teamSnaps
            : adv?.wk.length
              ? adv.wk[adv.wk.length - 1][1]
              : null,
        targetShare: tgtTeam ? tgtSum / tgtTeam : null,
        carryShare: carTeam ? carSum / carTeam : null,
        trend: lastGame ? round1(lastGame.pts - ppg) : 0,
        trendingAdds: trend.get(p.id) ?? 0,
        adv,
        market: this.extras.values?.[p.id] ?? null,
        espn,
        projSleeper: projSleeper == null ? null : round1(projSleeper),
        projEspn: projEspn == null ? null : round1(projEspn),
        projFp: projFp == null ? null : round1(projFp),
        projFpRank: projFp == null || projFpRank == null ? null : round1(projFpRank),
        projNeutral: projRos == null ? null : round1(projRos),
        ecrRos: ecr.ros?.[0] ?? null,
        ecrSd: ecr.ros?.[1] ?? null,
        ecrWeek: ecr.wk,
      });
    }

    this.buildReturnWeeks();
    this.applyMarketPrior();
    this.applyExpertPrior();
    this.buildRoleShifts();

    // Replacement level: the best player you could realistically start after every
    // team fills its lineup. Flex slots are split across eligible positions.
    const n = this.teams.length || 12;
    const need: Record<Position, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
    for (const s of this.slots) {
      if (s in need) need[s as Position] += n;
      else if (s === "FLEX") {
        need.RB += n * 0.45;
        need.WR += n * 0.45;
        need.TE += n * 0.1;
      } else if (s === "WRRB_FLEX") {
        need.RB += n * 0.5;
        need.WR += n * 0.5;
      } else if (s === "REC_FLEX") {
        need.WR += n * 0.8;
        need.TE += n * 0.2;
      } else if (s === "SUPER_FLEX") need.QB += n * 0.9;
    }
    for (const pos of Object.keys(need) as Position[]) {
      const vals = [...this.views.values()]
        .filter((v) => v.p.pos === pos)
        .map((v) => v.valuePg)
        .sort((a, b) => b - a);
      const idx = Math.min(vals.length - 1, Math.max(0, Math.round(need[pos])));
      this.replacement.set(pos, vals[idx] ?? 0);
    }
    for (const v of this.views.values()) {
      v.vorp = round1(v.valuePg - (this.replacement.get(v.p.pos) ?? 0));
      v.rosPoints = round1(this.rosPoints(v.p.id));
    }
  }

  view(id: string) {
    return this.views.get(id);
  }


  // ---------- injury timelines ----------

  /**
   * Turns injury designations into "out until week N" using ESPN's estimated return dates
   * (default: 4 weeks for IR/PUP/suspension, 1 week for Out). Then, when a clearly better
   * player at the same position is coming back, his replacement's role is marked to shrink
   * from that week, so expiring roles show up in trades and rest-of-season values.
   */
  private buildReturnWeeks() {
    const firstWeekOnOrAfter = (team: string, iso: string) => {
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return null;
      for (let w = this.week; w <= 18; w++) {
        const g = this.gameFor(team, w);
        if (g && new Date(g.game.kickoff).getTime() >= t - 12 * 3600 * 1000) return w;
      }
      return 19; // not back this season
    };
    for (const v of this.views.values()) {
      const inj = v.p.injury;
      if (!inj || !v.p.team || v.p.pos === "DEF") continue;
      const long = LONG_TERM.has(inj);
      if (!long && inj !== "Out") continue;
      let back: number | null = null;
      if (v.espn?.returnDate) back = firstWeekOnOrAfter(v.p.team, v.espn.returnDate);
      // ESPN updates faster than Sleeper: an "Out" player ESPN expects back for this week's game isn't out.
      if (!long && back != null && back <= this.week) continue;
      if (back == null) back = this.week + (long ? 4 : 1);
      back = Math.max(back, this.week + 1);
      this.returnWeek.set(v.p.id, back);
    }
  }

  private buildRoleShifts() {
    // Expiring roles: a returning player who is clearly better takes work back from his fill-in.
    for (const [id, back] of this.returnWeek) {
      const p = this.views.get(id);
      if (!p || !["RB", "WR", "TE"].includes(p.p.pos) || back > this.lastWeek) continue;
      const pv = p.market?.value ?? 0;
      if (pv < 2500 && p.valuePg < 9) continue; // only players who'd reclaim a real role
      for (const t of this.views.values()) {
        if (t.p.id === id || t.p.team !== p.p.team || t.p.pos !== p.p.pos) continue;
        if (t.p.injury && LONG_TERM.has(t.p.injury)) continue;
        const tv = t.market?.value ?? 0;
        const better = pv && tv ? pv > tv * 1.15 : p.valuePg > t.valuePg * 1.1;
        const filling = (t.adv?.l3?.snap ?? t.snapShare ?? 0) >= 0.45 || t.p.depth === 1;
        if (!better || !filling) continue;
        const mult = p.p.pos === "RB" ? 0.7 : 0.85;
        const cur = this.roleShift.get(t.p.id);
        if (!cur || back < cur.fromWeek) this.roleShift.set(t.p.id, { fromWeek: back, mult, by: p.p.name, byPos: p.p.pos });
      }
    }
  }

  /** What a player was projected to score before a past week (Sleeper's pre-game projection, league scoring). */
  pastProjection(id: string, week: number): number | null {
    const wk = this.extras.projHistory?.find((x) => x.week === week);
    const line = wk?.lines[id];
    return line ? round1(scoreLine(line.s, this.scoring)) : null;
  }

  // ---------- weekly expectation ----------

  /** Expected points for a player in a given week: value x matchup, zero on bye or out. */
  expected(id: string, week: number): number {
    const v = this.views.get(id);
    if (!v || !v.p.team) return 0;
    const g = this.gameFor(v.p.team, week);
    if (!g) return 0; // bye or no game
    const inj = v.p.injury;
    const ahead = week - this.week;
    let mult = 1;
    const back = this.returnWeek.get(id);
    if (back != null) {
      if (week < back) return 0;
      // First games back usually come with limited snaps; long absences also carry setback risk.
      const long = inj != null && LONG_TERM.has(inj);
      if (week === back) mult = long ? 0.75 : 0.85;
      else if (week === back + 1 && long) mult = 0.9;
    } else if (ahead === 0 && v.p.pos !== "DEF") {
      // Learned chance to play from the designation, practice reports and news.
      mult = this.playChance(id).p;
    }
    const shift = this.roleShift.get(id);
    if (shift && week >= shift.fromWeek) mult *= shift.mult;
    let base = v.valuePg;
    if (ahead === 0 && v.projNeutral != null && v.projNeutral > 0) {
      // Projections react to depth-chart news within hours; lean on them harder when a teammate
      // at the same position is unlikely to play (his work has to go somewhere). The matchup and
      // Vegas factors below are applied once, so use the projection with them taken out.
      // FantasyPros' weekly consensus is already one of the projection's three sources.
      const w = this.teammateOut(id) ? 0.85 : 0.6;
      base = w * v.projNeutral + (1 - w) * v.valuePg;
    }
    return base * mult * this.matchupFactor(v.p.pos, g.opp) * this.vegasFactor(v.p.pos, g, week);
  }

  /** True when a better teammate at the same position is unlikely to play this week. */
  private tmOutCache = new Map<string, boolean>();
  private teammateOut(id: string): boolean {
    const hit = this.tmOutCache.get(id);
    if (hit != null) return hit;
    const r = this.computeTeammateOut(id);
    this.tmOutCache.set(id, r);
    return r;
  }

  private computeTeammateOut(id: string): boolean {
    const v = this.views.get(id);
    if (!v || !v.p.team || !["RB", "WR", "TE"].includes(v.p.pos)) return false;
    for (const t of this.views.values()) {
      if (t.p.id === id || t.p.team !== v.p.team || t.p.pos !== v.p.pos || t.valuePg <= v.valuePg) continue;
      if (t.valuePg < 6) continue;
      const out = (this.returnWeek.get(t.p.id) ?? 0) > this.week || this.playChance(t.p.id).p < 0.3;
      if (out) return true;
    }
    return false;
  }

  private rankPtsCache = new Map<string, number[]>();
  /** Points a given weekly positional rank usually means this week (from this week's projections). */
  private weeklyRankPoints(pos: Position, rank: number): number {
    let vals = this.rankPtsCache.get(pos);
    if (!vals) {
      vals = [...this.views.values()]
        .filter((v) => v.p.pos === pos && v.projNext != null && v.projNext > 0)
        .map((v) => v.projNext!)
        .sort((a, b) => b - a);
      this.rankPtsCache.set(pos, vals);
    }
    if (!vals.length) return 0;
    const i = Math.max(0, Math.min(vals.length - 1, Math.round(rank) - 1));
    return vals[i];
  }

  /**
   * Chance a player suits up for his next game. Uses the model learned from past seasons'
   * official injury reports (designation, last practice, missed last game, injury type,
   * position), then this week's evidence: day-by-day practice reports, ESPN's live injury
   * notes (practice participation, "expected to play", "ruled out", game-time decision),
   * and once the game starts, whether he actually logged stats.
   */
  playChance(id: string): PlayChance {
    const hit = this.playCache.get(id);
    if (hit) return hit;
    const v = this.views.get(id);
    const res = this.computePlayChance(v);
    this.playCache.set(id, res);
    return res;
  }

  private officialMap: Map<string, OfficialRow> | null = null;
  /** This player's line on the official injury report, matched by name and team. */
  officialFor(id: string): OfficialRow | null {
    const rep = this.extras.official;
    if (!rep || rep.week !== this.week || !rep.rows?.length) return null;
    if (!this.officialMap) {
      const m = new Map<string, OfficialRow>();
      const byName = new Map<string, Player[]>();
      for (const p of Object.values(this.players)) {
        if (!p.team || p.pos === "DEF") continue;
        const k = normName(p.name);
        byName.set(k, [...(byName.get(k) ?? []), p]);
      }
      // Each table's team: the players in it outvote the heading text.
      const votes = new Map<number, Map<string, number>>();
      for (const r of rep.rows) {
        const c = byName.get(normName(r.name));
        if (c?.length !== 1) continue;
        const t = votes.get(r.tbl) ?? new Map<string, number>();
        t.set(c[0].team!, (t.get(c[0].team!) ?? 0) + 1);
        votes.set(r.tbl, t);
      }
      const tblTeam = new Map<number, string | null>();
      for (const [tbl, t] of votes) {
        const [top, n] = [...t.entries()].sort((a, b) => b[1] - a[1])[0];
        const total = [...t.values()].reduce((a, b) => a + b, 0);
        tblTeam.set(tbl, n >= 2 && n / total >= 0.6 ? top : null);
      }
      for (const r of rep.rows) {
        const team = tblTeam.get(r.tbl) ?? r.contextTeam;
        const c = (byName.get(normName(r.name)) ?? []).filter((p) => !team || p.team === team);
        if (c.length === 1) m.set(c[0].id, r);
      }
      this.officialMap = m;
    }
    return this.officialMap.get(id) ?? null;
  }

  private computePlayChance(v: PlayerView | undefined): PlayChance {
    const base: PlayChance = { p: 0.98, status: null, official: false, practice: [], injury: null, missedLast: false, note: null, why: "No injury designation." };
    if (!v || !v.p.team) return { ...base, p: 0, why: "Not on an NFL team." };
    const g = this.gameFor(v.p.team, this.week);
    if (!g) return { ...base, p: 0, why: "Bye week." };
    const kick = new Date(g.game.kickoff).getTime();
    const now = Date.now();
    // Game already started: the box score answers the question.
    if (now > kick + 20 * 60 * 1000) {
      const played = v.log.some((x) => x.week === this.week);
      if (played) return { ...base, p: 1, official: true, why: "Active: he has stats in this game." };
      if (now > kick + 4.5 * 3600 * 1000) return { ...base, p: 0, official: true, why: "Did not play in this game." };
    }
    const calib = this.nfl?.calib?.play ?? DEFAULT_PLAY;
    const status = v.p.injury;
    const e = v.espn;
    const injury = v.p.injuryPart ?? this.officialFor(v.p.id)?.injury ?? v.adv?.prac?.inj ?? e?.body ?? null;

    // Evidence window: anything after his team's previous game.
    let prevKick = 0;
    for (let w = this.week - 1; w >= 1; w--) {
      const pg = this.gameFor(v.p.team, w);
      if (pg) {
        prevKick = new Date(pg.game.kickoff).getTime();
        break;
      }
    }
    const missedLast = (() => {
      for (let w = this.week - 1; w >= 1; w--) {
        if (!this.gameFor(v.p.team, w)) continue; // skip byes
        return v.log.length > 0 && !v.log.some((x) => x.week === w);
      }
      return false;
    })();

    // Practice participation this week: War Room's daily log, ESPN notes, and the latest nflverse row.
    const days = new Map<string, "DNP" | "LP" | "FP">();
    const gsis = v.p.gsis ?? this.gsisBySleeper.get(v.p.id);
    const log = this.nfl?.pracLog;
    if (log && log.w === this.week && gsis && log.p[gsis]) for (const [d, st] of Object.entries(log.p[gsis])) days.set(d, st);
    const eDate = e?.date ? new Date(e.date).getTime() : 0;
    const fresh = e && eDate > prevKick && now - eDate < 8 * 86_400_000;
    const news = fresh && e?.short ? parseInjuryNote(e.short) : null;
    if (news) for (const d of news.days) days.set(d.day, d.st);
    const pr = v.adv?.prac;
    const prThisWeek = pr && pr.w === this.week ? pr : null;
    // The official report, read live: its latest practice status belongs to the most recent practice
    // day whose report should be out by now.
    const off = this.officialFor(v.p.id);
    if (off?.practice) {
      const d = officialReportDay(v.p.team, kick, now);
      if (d) days.set(d, off.practice);
      else if (!days.size) days.set("Latest", off.practice);
    }
    // A practice can't be reported before it happens: drop any day later than what's possible right now.
    for (const d of [...days.keys()]) if (!practiceDayHappened(d, kick, now)) days.delete(d);
    if (prThisWeek?.st && !days.size) days.set("Latest", prThisWeek.st);
    const practice = [...days.entries()].map(([day, st]) => ({ day, st })).sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
    const last = practice.length ? practice[practice.length - 1].st : null;

    // Is the final game-status report out? (nflverse game status, or ESPN noting the designation.)
    const official = !!off?.game || !!(prThisWeek?.rep) || !!(news && (news.listed || news.ruledOut) && kick - eDate < 3 * 86_400_000);
    const desig = off?.game ?? prThisWeek?.rep ?? (news?.ruledOut ? "Out" : status);
    const hoursToKick = (kick - now) / 3_600_000;

    let p: number;
    const parts: string[] = [];
    if (status && LONG_TERM.has(status)) {
      const back = e?.returnDate ? new Date(e.returnDate).getTime() : null;
      p = back != null && back <= kick ? 0.25 : 0.01;
      parts.push(`${status === "IR" ? "On injured reserve" : status === "PUP" ? "On PUP" : status === "Sus" ? "Suspended" : "Not active"}`);
    } else if (news?.ruledOut || desig === "Out") {
      const back = e?.returnDate ? new Date(e.returnDate).getTime() : null;
      p = official || news?.ruledOut ? calib.rates.Out?.all ?? 0.003 : back != null && back <= kick ? 0.45 : 0.06;
      parts.push(news?.ruledOut ? "Ruled out" : official ? "Officially out" : "Listed out");
    } else if (desig === "Doubtful") {
      p = official ? calib.rates.Doubtful?.[last ?? "all"] ?? calib.rates.Doubtful?.all ?? 0.03 : 0.12;
      parts.push("Doubtful");
    } else if (!desig && /rest|not injury|personal/i.test(injury ?? "") && !missedLast) {
      p = 0.96;
      parts.push("Rest or personal day, not an injury");
    } else if (desig === "Questionable" || (last && last !== "FP") || (missedLast && !!injury)) {
      const q = calib.q ?? DEFAULT_PLAY.q!;
      const grp = injuryGroup(injury);
      let z =
        q.intercept +
        (last === "DNP" ? q.dnp : last === "FP" ? q.fp : 0) +
        (missedLast ? q.prevOut : 0) +
        (q[grp] ?? 0) +
        (v.p.pos === "QB" || v.p.pos === "RB" || v.p.pos === "TE" ? q[v.p.pos] ?? 0 : 0);
      if (desig !== "Questionable") {
        // No designation (yet). After the final report that usually means he's fine.
        if (official) z = logit(calib.rates.None?.[last ?? "all"] ?? 0.97);
        else z += 0.6;
      }
      let modelP = 1 / (1 + Math.exp(-z));
      if (!official) {
        // Before the final report, practice so far is only part of the story: shrink toward typical outcomes.
        const known = practice.length ? Math.min(1, 0.45 + 0.2 * practice.length) : 0.3;
        const prior = missedLast ? 0.45 : desig === "Questionable" ? 0.66 : 0.85;
        modelP = known * modelP + (1 - known) * prior;
      }
      p = modelP;
      parts.push(desig === "Questionable" ? (official ? "Questionable" : "Questionable so far") : "On the practice report");
    } else {
      p = calib.rates.None?.[last ?? "FP"] ?? 0.98;
      if (last === "FP") parts.push("Full practice");
    }
    if (news) {
      if (news.expected) {
        const odds = (p / (1 - p)) * 4;
        p = Math.max(0.85, odds / (1 + odds));
      }
      if (news.gtd) p = 0.5 * p + 0.5 * 0.55;
      if (news.doubtful && !news.questionable) p = Math.min(p, 0.2);
    }
    p = Math.max(0.01, Math.min(0.99, p));
    if (injury) parts[0] = `${parts[0] ?? "Injury"} (${injury.toLowerCase()})`;
    if (practice.length) parts.push(practice.map((x) => `${x.st === "DNP" ? "no practice" : x.st === "LP" ? "limited" : "full"} ${x.day === "Latest" ? "on the latest report" : x.day}`).join(", "));
    if (missedLast) parts.push("missed his last game");
    if (news?.expected) parts.push("news says he's expected to play");
    if (news?.gtd) parts.push("game-time decision");
    if (!official && hoursToKick > 0 && status) parts.push("final status not out yet");
    return {
      p: Math.round(p * 100) / 100,
      status: desig ?? null,
      official,
      practice,
      injury,
      missedLast,
      note: fresh ? e?.short ?? null : null,
      why: parts.filter(Boolean).join(", ") + ".",
    };
  }

  /**
   * War Room's projection for a player in a week: the one number shown everywhere (player card,
   * start/sit, trades, waivers, AI agent). Blends Sleeper, ESPN and FantasyPros, season-long usage,
   * matchup and Vegas, times his chance to play.
   */
  projection(id: string, week = this.week): number {
    return round1(this.expected(id, week));
  }

  remainingWeeks(): number[] {
    const out: number[] = [];
    for (let w = this.week; w <= this.lastWeek; w++) out.push(w);
    return out;
  }

  rosPoints(id: string): number {
    const v = this.views.get(id);
    return this.remainingWeeks().reduce((a, w) => a + this.expected(id, w) * (v ? this.availability(v, w) : 1), 0);
  }

  /**
   * Chance a player is active in a future week, from typical NFL weekly availability by
   * position, adjusted for age (RBs) and injuries that keep showing up on the report.
   * The current week uses the actual injury designation instead (see expected()).
   */
  availability(v: PlayerView, week: number): number {
    if (week <= this.week) return 1;
    const base: Record<string, number> = { QB: 0.95, RB: 0.9, WR: 0.93, TE: 0.93, K: 0.99, DEF: 1 };
    let p = this.nfl?.calib?.avail?.[v.p.pos] ?? base[v.p.pos] ?? 0.93;
    if (v.p.pos === "RB" && (v.p.age ?? 0) >= 29) p -= 0.02;
    const pr = v.adv?.prac;
    if (pr && pr.wks >= 3 && pr.inj && !/rest|not injury/i.test(pr.inj)) p -= 0.04;
    return p;
  }

  /**
   * Outside values (trade market, expert ranks) are season totals that already discount games a
   * player will miss. Our per-game values must not, because weekly expectations zero out the
   * missed weeks separately. So for an injured player, scale them back up to a healthy per-game rate.
   */
  private healthyFactor(v: PlayerView): number {
    const back = this.returnWeek.get(v.p.id);
    if (back == null) return 1;
    const weeks = this.remainingWeeks();
    const avail = weeks.filter((w) => w >= back).length;
    if (!avail) return 1;
    return Math.min(3, weeks.length / avail);
  }

  /** Injured with almost no games this season: our own numbers have nothing to go on. */
  private noOwnData(v: PlayerView) {
    return v.games < 2 && this.returnWeek.has(v.p.id);
  }

  /**
   * Early-season stats are noisy. FantasyCalc values come from thousands of real trades and
   * bake in talent, role and health, so they act as a prior: we map market value to points
   * per game by position (fit on this league's own numbers) and blend it in.
   */
  private applyMarketPrior() {
    if (!this.extras.values) return;
    for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
      const rows = [...this.views.values()].filter((v) => v.p.pos === pos && v.market && v.games >= 2 && v.valuePg > 0);
      if (rows.length < 8) continue;
      const xs = rows.map((v) => Math.sqrt(v.market!.value));
      const ys = rows.map((v) => v.valuePg);
      const mx = avg(xs);
      const my = avg(ys);
      let num = 0;
      let den = 0;
      xs.forEach((x, i) => {
        num += (x - mx) * (ys[i] - my);
        den += (x - mx) ** 2;
      });
      if (den <= 0) continue;
      const b = num / den;
      const a = my - b * mx;
      if (b <= 0) continue;
      for (const v of this.views.values()) {
        if (v.p.pos !== pos || !v.market) continue;
        const top = a + b * Math.sqrt(Math.max(...rows.map((r) => r.market!.value)));
        const implied = Math.min(Math.max(0, a + b * Math.sqrt(v.market.value)) * this.healthyFactor(v), top * 1.05);
        const learned = this.extras.nfl?.calib?.market?.[pos];
        const w =
          learned != null
            ? Math.min(0.6, v.games >= 2 ? learned : learned * 1.5)
            : v.games >= 4
              ? 0.2
              : v.games >= 2
                ? 0.3
                : 0.5; // less data = lean on the market more
        const wt = this.noOwnData(v) ? 1 : w;
        v.valuePg = round1(Math.max(0, (1 - wt) * v.valuePg + wt * implied));
      }
    }
  }

  /**
   * FantasyPros rest-of-season expert consensus (100+ analysts, refreshed daily) as a second prior. Ranks map
   * to points per game by position through log(rank), fit on this league's own numbers, then
   * blend in with a learned weight (scripts/calibrate.py) or a sensible default. This is what
   * keeps rest-of-season values from swinging on one or two big weeks.
   */
  private applyExpertPrior() {
    if (!this.nfl?.ecr) return;
    for (const pos of ["QB", "RB", "WR", "TE", "K", "DEF"] as Position[]) {
      const rows = [...this.views.values()].filter(
        (v) => v.p.pos === pos && v.ecrRos != null && v.games >= 2 && v.valuePg > 0 && !(v.p.injury && (LONG_TERM.has(v.p.injury) || v.p.injury === "Out"))
      );
      if (rows.length < 8) continue;
      const xs = rows.map((v) => Math.log(Math.max(1, v.ecrRos!)));
      const ys = rows.map((v) => v.valuePg);
      const mx = avg(xs);
      const my = avg(ys);
      let num = 0;
      let den = 0;
      xs.forEach((x, i) => {
        num += (x - mx) * (ys[i] - my);
        den += (x - mx) ** 2;
      });
      if (den <= 0) continue;
      const b = num / den;
      if (b >= 0) continue; // better rank must mean more points
      const a = my - b * mx;
      const learned = this.nfl.calib?.ecr?.[pos];
      for (const v of this.views.values()) {
        if (v.p.pos !== pos || v.ecrRos == null) continue;
        // Scaled up for missed games, but never above what the #1 player at the position implies.
        const implied = Math.min(Math.max(0, a + b * Math.log(Math.max(1, v.ecrRos))) * this.healthyFactor(v), a * 1.05);
        v.ecrPg = round1(implied);
        // Consensus first: research on rest-of-season prediction finds the crowd (betting markets,
        // expert consensus) beats any one model, so the experts carry about half the value by default.
        let w = learned != null ? Math.min(0.75, v.games >= 2 ? learned : learned * 1.5) : v.games >= 4 ? 0.5 : v.games >= 2 ? 0.55 : 0.65;
        // Injured with no games of his own: the market already set his value above, so split evenly with the experts.
        if (this.noOwnData(v)) w = v.market ? 0.5 : 1;
        v.valuePg = round1(Math.max(0, (1 - w) * v.valuePg + w * implied));
      }
    }
  }

  // ---------- lineups ----------

  /** Greedy optimal lineup. Fixed slots first, then flexes from what is left. */
  lineup(ids: string[], value: (id: string) => number) {
    const pool = ids
      .map((id) => ({ id, pos: this.players[id]?.pos, val: value(id) }))
      .filter((x): x is { id: string; pos: Position; val: number } => !!x.pos)
      .sort((a, b) => b.val - a.val);
    const used = new Set<string>();
    const filled: { slot: string; id: string | null; val: number }[] = [];
    const fixed = this.slots.filter((s) => !(s in FLEX_SLOTS));
    const flex = this.slots.filter((s) => s in FLEX_SLOTS).sort((a, b) => FLEX_SLOTS[a].length - FLEX_SLOTS[b].length);
    for (const slot of fixed) {
      const pick = pool.find((x) => !used.has(x.id) && x.pos === slot);
      if (pick) used.add(pick.id);
      filled.push({ slot, id: pick?.id ?? null, val: pick?.val ?? 0 });
    }
    for (const slot of flex) {
      const pick = pool.find((x) => !used.has(x.id) && FLEX_SLOTS[slot].includes(x.pos));
      if (pick) used.add(pick.id);
      filled.push({ slot, id: pick?.id ?? null, val: pick?.val ?? 0 });
    }
    const total = filled.reduce((a, f) => a + f.val, 0);
    return { filled, total, bench: ids.filter((id) => !used.has(id)) };
  }

  /**
   * Expected lineup points for a week. The current week uses known statuses. Future weeks
   * account for the chance any starter misses time and a bench player fills in, so roster
   * depth has real value (this is what makes 2-for-1 trades fair to judge).
   */
  teamWeekPoints(ids: string[], week: number) {
    if (week <= this.week) return this.lineup(ids, (id) => this.expected(id, week)).total;
    const pool = ids
      .map((id) => {
        const v = this.views.get(id);
        return v ? { id, pos: v.p.pos, val: this.expected(id, week), p: this.availability(v, week) } : null;
      })
      .filter((x): x is { id: string; pos: Position; val: number; p: number } => !!x && x.val > 0)
      .sort((a, b) => b.val - a.val);
    const used = new Map<string, number>();
    const fixed = this.slots.filter((s) => !(s in FLEX_SLOTS));
    const flex = this.slots.filter((s) => s in FLEX_SLOTS).sort((a, b) => FLEX_SLOTS[a].length - FLEX_SLOTS[b].length);
    let total = 0;
    for (const slot of [...fixed, ...flex]) {
      const eligible = slot in FLEX_SLOTS ? FLEX_SLOTS[slot] : [slot as Position];
      let remaining = 1; // chance nobody better has filled this slot yet
      for (const c of pool) {
        if (!eligible.includes(c.pos)) continue;
        const free = c.p - (used.get(c.id) ?? 0);
        if (free <= 0.001) continue;
        const take = remaining * free;
        total += take * c.val;
        used.set(c.id, (used.get(c.id) ?? 0) + take);
        remaining *= 1 - free;
        if (remaining < 0.01) break;
      }
    }
    return total;
  }

  teamRos(ids: string[]) {
    return this.remainingWeeks().reduce((a, w) => a + this.teamWeekPoints(ids, w), 0);
  }

  // ---------- team needs ----------

  /** All of a team's players, including those parked on IR (they count from their return week). */
  rosterAll(rosterId: number): string[] {
    const t = this.team(rosterId);
    return t ? [...t.players, ...t.reserve.filter((id) => !t.players.includes(id))] : [];
  }

  private rosRankCache = new Map<string, Map<string, number>>();
  /** War Room's own rest-of-season positional rank (by rest-of-season points, injuries and byes included). */
  rosRank(id: string): number | null {
    const v = this.views.get(id);
    if (!v) return null;
    let m = this.rosRankCache.get(v.p.pos);
    if (!m) {
      m = new Map();
      [...this.views.values()]
        .filter((x) => x.p.pos === v.p.pos && x.rosPoints > 0)
        .sort((a, b) => b.rosPoints - a.rosPoints)
        .forEach((x, i) => m!.set(x.p.id, i + 1));
      this.rosRankCache.set(v.p.pos, m);
    }
    return m.get(id) ?? null;
  }

  /** Rest-of-season points per week a player is worth: expected points x availability, byes and injuries included. */
  rosPerWeek(id: string): number {
    const v = this.views.get(id);
    return v ? v.rosPoints / Math.max(1, this.remainingWeeks().length) : 0;
  }

  private slotCountCache: Record<string, number> | null = null;
  private slotCounts(): Record<string, number> {
    if (!this.slotCountCache) {
      const c: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
      for (const s of this.slots) if (s in c) c[s] += 1;
      if (this.slots.includes("SUPER_FLEX")) c.QB += 1;
      this.slotCountCache = c;
    }
    return this.slotCountCache;
  }

  /**
   * Rest-of-season strength of a group of players at each position: the starters a team needs at
   * that spot (QB1, RB1-2, WR1-2, TE1 for a standard lineup) at full weight, plus the next one or
   * two backups at partial weight, because flex spots, byes and injuries mean depth gets played.
   * Uses rest-of-season points per week, so a player on IR counts only for the weeks he's back.
   */
  positionStrength(ids: string[]): Record<string, number> {
    const k = this.slotCounts();
    const depthW: Record<string, number> = { QB: 0.1, RB: 0.35, WR: 0.3, TE: 0.15 };
    const out: Record<string, number> = {};
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const vals = ids
        .filter((id) => this.players[id]?.pos === pos)
        .map((id) => this.rosPerWeek(id))
        .sort((a, b) => b - a);
      const n = Math.max(1, k[pos] ?? 1);
      let sum = 0;
      for (let i = 0; i < n; i++) sum += vals[i] ?? 0;
      sum += depthW[pos] * (vals[n] ?? 0) + 0.5 * depthW[pos] * (vals[n + 1] ?? 0);
      out[pos] = sum;
    }
    return out;
  }

  teamProfile(rosterId: number) {
    const t = this.team(rosterId)!;
    const ids = this.rosterAll(rosterId);
    const lu = this.lineup(t.players, (id) => this.views.get(id)?.valuePg ?? 0);
    return { team: t, lineup: lu, startersByPos: this.positionStrength(ids), ids };
  }

  private needsCache: ReturnType<LeagueModel["computeNeeds"]> | null = null;
  /** League-median rest-of-season strength by position (points per week), set with the needs table. */
  private medianStrength: Record<string, number> = {};

  /**
   * Rank each team's starters by position for the rest of the season (1 = strongest), and call
   * a position a need only when the starters there are clearly below the league's typical team.
   * Values are season-long per-game values blended with FantasyPros rest-of-season consensus and
   * trade-market values, with long injuries discounted, so one big week doesn't flip a need.
   */
  needsTable() {
    if (!this.needsCache) this.needsCache = this.computeNeeds();
    return this.needsCache;
  }

  teamNeeds(rosterId: number): Position[] {
    return this.needsTable().find((n) => n.team.rosterId === rosterId)?.needs ?? [];
  }

  private computeNeeds() {
    const profiles = this.teams.map((t) => this.teamProfile(t.rosterId));
    const positions: Position[] = ["QB", "RB", "WR", "TE"];
    const k = this.slotCounts();
    const ranks = new Map<number, Record<string, number>>();
    const median: Record<string, number> = {};
    const medianStarter: Record<string, number> = {};
    for (const pos of positions) {
      const sorted = [...profiles].sort((a, b) => (b.startersByPos[pos] ?? 0) - (a.startersByPos[pos] ?? 0));
      sorted.forEach((pr, i) => {
        const r = ranks.get(pr.team.rosterId) ?? {};
        r[pos] = i + 1;
        ranks.set(pr.team.rosterId, r);
      });
      const vals = sorted.map((pr) => pr.startersByPos[pos] ?? 0);
      median[pos] = vals[Math.floor(vals.length / 2)] ?? 0;
      // The typical team's weakest starter at this spot: a bench player better than him is a real trade chip.
      const weakest = profiles
        .map((pr) => {
          const v = pr.ids.filter((id) => this.players[id]?.pos === pos).map((id) => this.rosPerWeek(id)).sort((a, b) => b - a);
          return v[Math.max(0, (k[pos] || 1) - 1)] ?? 0;
        })
        .sort((a, b) => a - b);
      medianStarter[pos] = weakest[Math.floor(weakest.length / 2)] ?? 0;
      this.medianStrength[pos] = median[pos];
    }
    return profiles.map((pr) => {
      const r = ranks.get(pr.team.rosterId)!;
      // Deficit vs the median team, as a share of a typical starter group there.
      const gap: Record<string, number> = {};
      for (const pos of positions) gap[pos] = median[pos] > 0 ? (median[pos] - (pr.startersByPos[pos] ?? 0)) / median[pos] : 0;
      const needs = positions
        .filter((pos) => gap[pos] > 0.04 && r[pos] > this.teams.length / 2)
        .sort((a, b) => gap[b] - gap[a])
        .slice(0, 2);
      // Surplus: a backup who would start for the typical team at that position.
      const surplus: string[] = [];
      for (const pos of positions) {
        if (needs.includes(pos)) continue;
        const v = pr.ids.filter((id) => this.players[id]?.pos === pos).map((id) => this.rosPerWeek(id)).sort((a, b) => b - a);
        const backup = v[k[pos] || 1] ?? 0;
        if (backup > 0 && backup >= medianStarter[pos] * 0.9) surplus.push(pos);
      }
      return {
        team: pr.team,
        ranks: r,
        gap,
        strength: pr.startersByPos,
        needs,
        surplus,
        weekly: round1(pr.lineup.total),
      };
    });
  }

  /**
   * How badly a roster is short at each position, weighted by how hard each position is to fix:
   * starting RBs and WRs are scarce on waivers and in trades, QBs and TEs much less so.
   */
  rosterHoles(rosterId: number, ids: string[]) {
    this.needsTable(); // make sure league medians exist
    const scarcity: Record<string, number> = { RB: 1.4, WR: 1.1, TE: 0.8, QB: 0.6 };
    const strength = this.positionStrength(ids);
    const ranks = this.rankAgainstLeague(rosterId, ids);
    let score = 0;
    const gaps: Record<string, number> = {};
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const med = this.medianStrength[pos] || 1;
      gaps[pos] = (med - strength[pos]) / med;
      score += scarcity[pos] * Math.max(0, gaps[pos]);
    }
    return { score, gaps, ranks };
  }

  /** Where a set of players would rank at each position against the rest of the league (1 = best). */
  private rankAgainstLeague(rosterId: number, ids: string[]): Record<string, number> {
    const mine = this.positionStrength(ids);
    const others = this.needsTable().filter((n) => n.team.rosterId !== rosterId);
    const out: Record<string, number> = {};
    for (const pos of ["QB", "RB", "WR", "TE"]) out[pos] = 1 + others.filter((o) => (o.strength[pos] ?? 0) > mine[pos]).length;
    return out;
  }

  // ---------- trades ----------

  evaluateTrade(myId: number, partnerId: number, give: string[], get: string[]) {
    const me = this.team(myId)!;
    const them = this.team(partnerId)!;
    // IR players count too: they can be traded and they play once they're back.
    const myBefore = this.rosterAll(myId);
    const theirBefore = this.rosterAll(partnerId);
    let myAfter = myBefore.filter((id) => !give.includes(id)).concat(get);
    let theirAfter = theirBefore.filter((id) => !get.includes(id)).concat(give);

    // Too many players: drop the least valuable bench player. Too few: the open spot gets the
    // best free agent, because that spot has real value in a 2-for-1.
    const fa = this.freeAgents("ALL").filter((v) => !["K", "DEF"].includes(v.p.pos));
    const irSlots = Number(this.bundle.league.settings?.reserve_slots ?? this.bundle.league.roster_positions.filter((r) => r === "IR").length) || 0;
    // Players on IR (or IR-eligible) sit in IR slots and don't take a bench spot.
    const activeCount = (ids: string[]) => {
      const onIr = ids.filter((id) => {
        const inj = this.views.get(id)?.p.injury;
        return !!inj && LONG_TERM.has(inj);
      }).length;
      return ids.length - Math.min(onIr, irSlots);
    };
    const fit = (ids: string[], protect: string[]) => {
      const drops: string[] = [];
      const adds: string[] = [];
      let list = [...ids];
      while (activeCount(list) > this.rosterLimit) {
        const keep = this.lineup(list, (id) => this.views.get(id)?.valuePg ?? 0);
        const bench = keep.bench.filter((id) => !protect.includes(id) && !(this.views.get(id)?.p.injury && LONG_TERM.has(this.views.get(id)!.p.injury!)));
        if (!bench.length) break;
        bench.sort((a, b) => (this.views.get(a)?.rosPoints ?? 0) - (this.views.get(b)?.rosPoints ?? 0));
        drops.push(bench[0]);
        list = list.filter((id) => id !== bench[0]);
      }
      while (activeCount(list) < this.rosterLimit) {
        // The open spot goes to the free agent who helps this lineup most (a third QB helps nobody).
        const base = this.lineup(list, (id) => this.views.get(id)?.valuePg ?? 0).total;
        let pick: PlayerView | null = null;
        let bestGain = -1;
        for (const v of fa.slice(0, 25)) {
          if (list.includes(v.p.id) || adds.includes(v.p.id)) continue;
          // Ties (nobody would start) go to a flex-eligible depth piece, not a third QB.
          const depth = ["RB", "WR", "TE"].includes(v.p.pos) ? 0.05 : 0;
          const gain = this.lineup([...list, v.p.id], (id) => this.views.get(id)?.valuePg ?? 0).total - base + depth + v.rosPoints / 10000;
          if (gain > bestGain) {
            bestGain = gain;
            pick = v;
          }
        }
        if (!pick) break;
        adds.push(pick.p.id);
        list.push(pick.p.id);
      }
      return { list, drops, adds };
    };
    const myFit = fit(myAfter, get);
    const theirFit = fit(theirAfter, give);
    myAfter = myFit.list;
    theirAfter = theirFit.list;
    // Fill any spots that are already open today the same way, so only the trade's change is measured.
    const myBase = fit(myBefore, []);
    const theirBase = fit(theirBefore, []);
    const myBeforeFull = myBase.list;
    const theirBeforeFull = theirBase.list;
    myFit.adds = myFit.adds.filter((id) => !myBase.adds.includes(id));

    const weeks = this.remainingWeeks();
    const perWeek = weeks.map((w) => ({
      week: w,
      me: round1(this.teamWeekPoints(myAfter, w) - this.teamWeekPoints(myBeforeFull, w)),
      them: round1(this.teamWeekPoints(theirAfter, w) - this.teamWeekPoints(theirBeforeFull, w)),
    }));
    const myDelta = round1(perWeek.reduce((a, x) => a + x.me, 0));
    const theirDelta = round1(perWeek.reduce((a, x) => a + x.them, 0));
    const playoffWeeks = perWeek.filter((x) => x.week >= this.playoffStart);
    const myPlayoffDelta = round1(playoffWeeks.reduce((a, x) => a + x.me, 0));
    const nearTerm = perWeek.slice(0, 3);
    const myNearDelta = round1(nearTerm.reduce((a, x) => a + x.me, 0));
    const restDelta = round1(myDelta - myNearDelta);

    const all = [...give, ...get].map((id) => this.views.get(id)).filter(Boolean) as PlayerView[];
    const best = all.slice().sort((a, b) => b.vorp - a.vorp)[0];
    const bestSide = best ? (get.includes(best.p.id) ? "you" : "them") : null;

    // Market check (FantasyCalc values come from real trades). Stars get a premium,
    // so values are raised to a power before summing, like most trade calculators.
    const mv = (ids: string[]) => ids.map((id) => this.views.get(id)?.market?.value ?? 0);
    const giveVals = mv(give);
    const getVals = mv(get);
    const adj = (vals: number[]) => vals.reduce((a, v) => a + Math.pow(Math.max(0, v), 1.3), 0);
    const hasMarket = giveVals.some((v) => v > 0) && getVals.some((v) => v > 0);
    const marketRatio = hasMarket ? adj(giveVals) / Math.max(1, adj(getVals)) : null; // >1 = you give more value

    // Expert check: FantasyPros rest-of-season consensus, as points over a replacement starter
    // for the weeks each player is expected to play, with the same star premium.
    const share = (id: string) => {
      const back = this.returnWeek.get(id);
      return back == null || !weeks.length ? 1 : weeks.filter((w) => w >= back).length / weeks.length;
    };
    const xv = (ids: string[]) =>
      ids.map((id) => {
        const v = this.views.get(id);
        if (!v || v.ecrPg == null) return 0;
        return Math.max(0, v.ecrPg - (this.replacement.get(v.p.pos) ?? 0)) * share(id);
      });
    const giveX = xv(give);
    const getX = xv(get);
    const hasExpert = giveX.some((v) => v > 0) && getX.some((v) => v > 0);
    const adjX = (vals: number[]) => vals.reduce((a, v) => a + Math.pow(Math.max(0, v), 1.3), 0);
    const expertRatio = hasExpert ? adjX(giveX) / Math.max(0.01, adjX(getX)) : null;
    // Consensus value ratio: both outside views agree more often than either alone.
    const consensusRatio =
      marketRatio != null && expertRatio != null ? Math.sqrt(marketRatio * expertRatio) : marketRatio ?? expertRatio;

    // Verdict: average weekly change, with playoff weeks counting 1.5x because they decide titles.
    const weight = (w: number) => (w >= this.playoffStart ? 1.5 : 1);
    const wSum = perWeek.reduce((a, x) => a + weight(x.week), 0) || 1;
    const perWk = perWeek.reduce((a, x) => a + x.me * weight(x.week), 0) / wSum;
    const scale = ["Loss for you", "Slight loss for you", "Even", "Slight win for you", "Win for you"];
    let level = perWk > 1.5 ? 4 : perWk > 0.5 ? 3 : perWk >= -0.5 ? 2 : perWk >= -1.5 ? 1 : 0;
    const overpay = consensusRatio != null && consensusRatio > 1.4;
    // Context beats raw value: paying extra to fix a real hole is often right, so only knock the
    // verdict down for overpaying when the deal doesn't fill one of your needs.
    const myNeeds = this.teamNeeds(myId);
    const fillsMyNeed = get.some((id) => myNeeds.includes(this.players[id]?.pos as Position));
    if (overpay && level >= 3 && !(fillsMyNeed && perWk >= 1)) level -= 1; // you could likely get the same upgrade for less
    let verdict = scale[level];

    // Plain-English reasons so the number isn't a black box.
    const reasons: string[] = [];
    const flags: string[] = [];
    const nm = (ids: string[]) => ids.map((id) => this.views.get(id)?.p.name ?? id).join(", ");
    reasons.push(
      `Your best lineup changes by ${fmtSigned(perWk)} pts per week on average (${fmtSigned(myDelta)} total through week ${this.lastWeek}).`
    );
    if (Math.abs(myNearDelta) >= 3 && Math.sign(myNearDelta) !== Math.sign(restDelta) && Math.abs(restDelta) >= 3)
      reasons.push(
        `Most of the swing is short term: ${fmtSigned(myNearDelta)} over the next 3 weeks, then ${fmtSigned(restDelta)} after that.`
      );
    if (playoffWeeks.length) reasons.push(`Playoff weeks (${this.playoffStart}-${this.lastWeek}): ${fmtSigned(myPlayoffDelta)} pts.`);
    // Roster context: where each position group ranks in the league before and after.
    const rankShift = (rid: number, before: string[], after: string[]) => {
      const b = this.rankAgainstLeague(rid, before);
      const a = this.rankAgainstLeague(rid, after);
      return (["QB", "RB", "WR", "TE"] as const)
        .filter((pos) => a[pos] !== b[pos])
        .map((pos) => `${pos} ${ordinal(b[pos])} → ${ordinal(a[pos])}`);
    };
    // Post-trade roster balance: fixing one spot by opening a worse hole somewhere else is a trap,
    // especially at RB/WR where replacements are scarce.
    const n = this.teams.length;
    const holesBefore = this.rosterHoles(myId, myBeforeFull);
    const holesAfter = this.rosterHoles(myId, myAfter);
    const created = (["RB", "WR", "QB", "TE"] as const).filter(
      (pos) => holesAfter.ranks[pos] >= n - 2 && holesAfter.ranks[pos] - holesBefore.ranks[pos] >= 3 && holesAfter.gaps[pos] > 0.08
    );
    const myShift = rankShift(myId, myBeforeFull, myAfter);
    if (myShift.length) reasons.push(`Your position groups vs the league (rest of season): ${myShift.join(", ")}.`);
    if (fillsMyNeed) {
      const filled = [...new Set(get.map((id) => this.players[id]?.pos).filter((p) => myNeeds.includes(p as Position)))];
      reasons.push(
        perWk > 0
          ? `This fills your biggest need (${filled.join(", ")}).${overpay ? " You pay more than market value, but fixing a real hole is often worth it." : ""}`
          : `It fills your ${filled.join(", ")} need, but the lineup math still says you lose more than you gain. Look for a cheaper way to fix it.`
      );
    }
    // A trade that opens a bottom-of-the-league hole is at best even, however the points add up today.
    if (created.length && level > 2) {
      level = created.some((p) => p === "RB" || p === "WR") ? 2 : Math.max(2, level - 1);
      verdict = scale[level];
    }
    for (const pos of created)
      flags.push(
        `This leaves your ${pos}s ${ordinal(holesAfter.ranks[pos])} of ${n}${pos === "RB" || pos === "WR" ? `, and starting ${pos}s are the hardest thing to find on waivers or in trades` : ""}. You'd be trading one need for a bigger one.`
      );
    const theirShift = rankShift(partnerId, theirBeforeFull, theirAfter);
    if (theirShift.length) reasons.push(`Their groups: ${theirShift.join(", ")}.`);
    const worst = perWeek.slice().sort((a, b) => a.me - b.me)[0];
    if (worst && worst.me <= -5) {
      const byes = get.filter((id) => !this.gameFor(this.players[id]?.team ?? null, worst.week)).map((id) => this.players[id]?.name);
      reasons.push(`Week ${worst.week} is the weak spot (${fmtSigned(worst.me)})${byes.length ? `: ${byes.join(", ")} on bye` : ""}.`);
    }
    if (give.length > get.length) {
      const pos = [...new Set(give.map((id) => this.players[id]?.pos))].filter(Boolean);
      for (const p of pos) {
        const left = myAfter.filter((id) => this.players[id]?.pos === p).map((id) => this.views.get(id)!).sort((a, b) => b.valuePg - a.valuePg);
        reasons.push(`Your ${p} depth after: ${left.map((v) => v.p.name).join(", ") || "none"}.`);
      }
    }
    if (myFit.adds.length)
      reasons.push(`The open roster spot gets filled from waivers (best fit: ${nm(myFit.adds)}). That depth is counted.`);
    if (myFit.drops.length) reasons.push(`You'd have to drop ${nm(myFit.drops)} to fit everyone.`);
    if (theirFit.drops.length) flags.push(`They would have to drop ${nm(theirFit.drops)}.`);
    if (give.length !== get.length && best)
      flags.push(
        `${Math.max(give.length, get.length)}-for-${Math.min(give.length, get.length)} trade: the side getting the best single player usually wins, and that is ${bestSide === "you" ? "you" : "them"} (${best.p.name}).`
      );
    for (const id of give) {
      const v = this.views.get(id);
      if (!v) continue;
      const recurring = v.adv?.prac && v.adv.prac.wks >= 3 && !/rest|not injury/i.test(v.adv.prac.inj ?? "");
      if (v.p.injury && !LONG_TERM.has(v.p.injury) && !recurring)
        flags.push(
          `Selling ${v.p.name} while he's hurt (${v.p.injury}) is selling low${v.market && v.market.trend < 0 ? ` (market value down ${Math.abs(v.market.trend)} in 30 days)` : ""}. Unless the injury lingers, his value usually comes back.`
        );
      if (v.p.injury && recurring) flags.push(`${v.p.name} keeps showing up on the injury report (${v.adv!.prac!.inj}). Moving him now is reasonable.`);
    }
    for (const id of get) {
      const v = this.views.get(id);
      if (!v) continue;
      if (v.p.injury) flags.push(`${v.p.name}: ${v.p.injury}${v.p.injuryPart ? ` (${v.p.injuryPart})` : ""}.`);
      const pr = v.adv?.prac;
      if (pr && pr.wks >= 3 && !/rest|not injury/i.test(pr.inj ?? "")) flags.push(`${v.p.name} has been on the injury report ${pr.wks} weeks (${pr.inj}). Recurring risk.`);
      if (v.adv?.s?.fp != null && v.adv.s.xfp != null && v.adv.s.fp - v.adv.s.xfp >= 4)
        flags.push(`${v.p.name} is scoring ${(v.adv.s.fp - v.adv.s.xfp).toFixed(1)} pts/game above his expected points. Some regression is likely.`);
    }
    for (const id of [...give, ...get]) {
      const v = this.views.get(id);
      if (!v) continue;
      const side = give.includes(id) ? "give" : "get";
      const back = this.returnWeek.get(id);
      if (back != null && (v.p.injury ? LONG_TERM.has(v.p.injury) : false))
        reasons.push(`${v.p.name} is expected back ${back > 18 ? "after this season" : `in week ${back}`}, so he counts as zero until then.`);
      const shift = this.roleShift.get(id);
      if (shift && shift.fromWeek <= this.lastWeek) {
        if (side === "give")
          reasons.push(`Good timing: ${v.p.name}'s role likely shrinks from week ${shift.fromWeek} when ${shift.by} returns, and that's already priced in.`);
        else flags.push(`${v.p.name}'s role likely shrinks from week ${shift.fromWeek} when ${shift.by} returns (counted in the numbers).`);
      }
    }
    if (overpay) flags.push("By trade market and expert rankings you're giving up a lot more than you get. You could probably land the same upgrade for less.");
    if (consensusRatio != null && consensusRatio < 0.75) flags.push("By trade market and expert rankings you're getting a lot more than you give. Expect pushback.");
    if (marketRatio != null && expertRatio != null && (marketRatio - 1) * (expertRatio - 1) < 0 && Math.abs(marketRatio - expertRatio) > 0.35)
      flags.push(
        `The trade market and the experts disagree here: market says ${marketRatio > 1 ? "you overpay" : "you win"}, FantasyPros rankings say ${expertRatio > 1 ? "you overpay" : "you win"}.`
      );

    // What an experienced manager would check before hitting send.
    const myStartersAfter = this.lineup(myAfter, (id) => this.views.get(id)?.valuePg ?? 0).filled.map((f) => f.id).filter((x): x is string => !!x);
    for (const id of get) {
      const v = this.views.get(id);
      if (!v) continue;
      if (v.bye && v.bye >= this.week) {
        const same = myStartersAfter.filter((o) => o !== id && this.views.get(o)?.bye === v.bye).length;
        if (same >= 2 && myStartersAfter.includes(id)) flags.push(`${v.p.name}'s bye (week ${v.bye}) stacks with ${same} of your other starters.`);
      }
      if (v.p.pos === "RB" && v.carryShare != null && v.carryShare < 0.45 && v.games >= 2 && (v.adv?.l3?.snap ?? v.snapShare ?? 0) < 0.6)
        flags.push(`${v.p.name} is in a committee (${Math.round(v.carryShare * 100)}% of team carries). Lower floor.`);
      if (v.p.pos === "RB" && (v.p.age ?? 0) >= 28) flags.push(`${v.p.name} is ${v.p.age}. Running backs this age fade late in the season more often.`);
      const env = this.teamEnv(v.p.team);
      if (env?.rk?.ppg != null && env.rk.ppg >= 26) flags.push(`${v.p.team}'s offense ranks ${env.rk.ppg}th in points per game, which caps his ceiling.`);
      if ((v.p.yearsExp ?? 1) === 0 && v.log.length >= 3) {
        const snaps = v.log.slice(-3).map((g) => (g.teamSnaps ? g.snaps / g.teamSnaps : 0));
        if (snaps[snaps.length - 1] > snaps[0] + 0.1) reasons.push(`${v.p.name} is a rookie whose snaps are climbing, so there's upside the numbers haven't caught yet.`);
      }
    }
    // Playoff schedule (weeks that decide titles).
    const pWeeks = weeks.filter((w) => w >= this.playoffStart);
    if (pWeeks.length) {
      const sched = (id: string) => {
        const v = this.views.get(id);
        if (!v || ["K", "DEF"].includes(v.p.pos)) return null;
        const fs = pWeeks.map((w) => {
          const g = this.gameFor(v.p.team, w);
          return g ? this.matchupFactor(v.p.pos, g.opp) : 0;
        });
        if (fs.some((f) => f === 0)) return { v, label: `bye in week ${pWeeks[fs.indexOf(0)]}` };
        const m = avg(fs);
        return m >= 1.06 ? { v, label: "an easy playoff schedule" } : m <= 0.94 ? { v, label: "a tough playoff schedule" } : null;
      };
      for (const id of [...give, ...get]) {
        const r = sched(id);
        if (r) reasons.push(`${r.v.p.name} has ${r.label} (weeks ${pWeeks[0]}-${pWeeks[pWeeks.length - 1]}).`);
      }
    }
    // Where the model and the experts disagree on a player, say so.
    for (const id of [...give, ...get]) {
      const v = this.views.get(id);
      if (!v || v.ecrRos == null || !["QB", "RB", "WR", "TE"].includes(v.p.pos)) continue;
      const modelRank = [...this.views.values()].filter((o) => o.p.pos === v.p.pos && o.valuePg > v.valuePg).length + 1;
      if (Math.abs(modelRank - v.ecrRos) >= 12 && v.games >= 3)
        reasons.push(
          `${v.p.name}: experts rank him ${v.p.pos}${Math.round(v.ecrRos)} rest of season, War Room's usage model has him ${v.p.pos}${modelRank}. The value above blends both.`
        );
    }
    if (this.tradeDeadline && this.week > this.tradeDeadline) flags.push("The trade deadline has passed in this league.");

    // Would they accept? Their lineup change, how the deal looks on value, and whether it fills a need of theirs.
    const theirPerWk = theirDelta / Math.max(1, weeks.length);
    const lineupScore = theirPerWk > 0.4 ? 1 : theirPerWk >= -0.25 ? 0 : theirPerWk >= -1 ? -1 : -2;
    const marketScore =
      consensusRatio == null ? null : consensusRatio >= 1.1 ? 1 : consensusRatio >= 0.9 ? 0 : consensusRatio >= 0.75 ? -1 : -2;
    const theirNeeds = this.teamNeeds(partnerId);
    const fillsNeed = give.some((id) => theirNeeds.includes(this.players[id]?.pos as Position));
    const score = (marketScore == null ? lineupScore * 2 : lineupScore + marketScore) + (fillsNeed ? 1 : 0);
    const acceptance = score >= 1 ? "Likely" : score >= 0 ? "Coin flip" : score >= -2 ? "Unlikely" : "Very unlikely";

    return {
      myDelta,
      theirDelta,
      myNearDelta,
      myPlayoffDelta,
      perWeekAvg: round1(perWk),
      perWeek,
      verdict,
      acceptance,
      reasons,
      best: best ? { name: best.p.name, side: bestSide } : null,
      market: hasMarket
        ? { give: Math.round(giveVals.reduce((a, b) => a + b, 0)), get: Math.round(getVals.reduce((a, b) => a + b, 0)), ratio: Math.round(marketRatio! * 100) / 100 }
        : null,
      expert: hasExpert
        ? {
            ratio: Math.round(expertRatio! * 100) / 100,
            give: give.map((id) => this.views.get(id)).filter((v): v is PlayerView => !!v).map((v) => ({ name: v.p.name, rank: v.ecrRos != null ? `${v.p.pos}${Math.round(v.ecrRos)}` : "unranked" })),
            get: get.map((id) => this.views.get(id)).filter((v): v is PlayerView => !!v).map((v) => ({ name: v.p.name, rank: v.ecrRos != null ? `${v.p.pos}${Math.round(v.ecrRos)}` : "unranked" })),
          }
        : null,
      consensusRatio: consensusRatio == null ? null : Math.round(consensusRatio * 100) / 100,
      theirPerWeekAvg: round1(theirPerWk),
      fillsTheirNeed: fillsNeed,
      fillsMyNeed,
      holesCreated: created as string[],
      needScoreBefore: Math.round(holesBefore.score * 100) / 100,
      needScoreAfter: Math.round(holesAfter.score * 100) / 100,
      myDrops: myFit.drops,
      theirDrops: theirFit.drops,
      myAdds: myFit.adds,
      rosters: { mine: myAfter, theirs: theirAfter },
      flags,
      give: give.map((id) => this.views.get(id)).filter(Boolean) as PlayerView[],
      get: get.map((id) => this.views.get(id)).filter(Boolean) as PlayerView[],
    };
  }


  /**
   * Trade finder for one partner, built to find deals both managers would actually take:
   * - targets players of theirs who'd start for you, preferring positions you need;
   * - offers your players at positions they need, from your surplus first;
   * - keeps only offers that are fair on consensus value (FantasyCalc market + FantasyPros ROS
   *   rankings), improve your lineup for the rest of the season, and don't make theirs worse;
   * - runs every candidate through the full week-by-week simulator (depth, byes, injuries,
   *   schedule, playoffs). Locked players are never offered.
   */
  findTradesWith(myId: number, partnerId: number, need: Position | "ANY", locked: string[] = []) {
    const me = this.team(myId);
    const them = this.team(partnerId);
    if (!me || !them) return [];
    const skill: Position[] = ["QB", "RB", "WR", "TE"];
    const myNeeds = this.teamNeeds(myId);
    const theirNeeds = this.teamNeeds(partnerId);
    const wantPos = need === "ANY" ? skill : [need];
    // Consensus trade value (market + experts), so packages look fair before we simulate.
    const val = (id: string) => {
      const v = this.views.get(id);
      if (!v) return 0;
      const m = v.market?.value ?? 0;
      const x = v.ecrPg != null ? Math.max(0, v.ecrPg - (this.replacement.get(v.p.pos) ?? 0)) * 900 : 0; // ~market scale
      return m && x ? Math.sqrt(m * x) : m || x;
    };
    const myIdeal = this.lineup(me.players, (id) => this.views.get(id)?.valuePg ?? 0);
    const weakest: Record<string, number> = {};
    for (const f of myIdeal.filled) {
      if (!f.id) continue;
      const pos = this.players[f.id]?.pos;
      if (pos) weakest[pos] = Math.min(weakest[pos] ?? Infinity, f.val);
    }
    const targets = this.rosterAll(partnerId)
      .map((id) => this.views.get(id))
      .filter((v): v is PlayerView => !!v && wantPos.includes(v.p.pos) && val(v.p.id) > 0)
      .filter((v) => !(v.p.injury && LONG_TERM.has(v.p.injury) && (this.returnWeek.get(v.p.id) ?? 99) > this.playoffStart))
      .filter((v) => v.valuePg > (weakest[v.p.pos] ?? 0) * 1.05) // would actually upgrade a starting spot
      .sort((a, b) => (myNeeds.includes(b.p.pos) ? 1 : 0) - (myNeeds.includes(a.p.pos) ? 1 : 0) || b.valuePg - a.valuePg)
      .slice(0, 5);
    if (!targets.length) return [];
    const mine = this.rosterAll(myId)
      .filter((id) => !locked.includes(id) && skill.includes(this.players[id]?.pos as Position) && val(id) > 0)
      // Offer what they need first, then your bench, then everything else.
      .sort((a, b) => {
        const score = (id: string) =>
          (theirNeeds.includes(this.players[id]?.pos as Position) ? 2 : 0) + (myIdeal.bench.includes(id) ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, 9);
    const packages: string[][] = [];
    for (let i = 0; i < mine.length; i++) {
      packages.push([mine[i]]);
      for (let j = i + 1; j < mine.length; j++) packages.push([mine[i], mine[j]]);
    }
    // Their depth pieces you could take back to balance a deal where you give more.
    const theirExtras = this.rosterAll(partnerId)
      .map((id) => this.views.get(id))
      .filter((v): v is PlayerView => !!v && skill.includes(v.p.pos) && val(v.p.id) > 0)
      .sort((a, b) => b.valuePg - a.valuePg)
      .slice(0, 8)
      .map((v) => v.p.id);
    const ideas: {
      partnerId: number;
      give: string[];
      get: string[];
      result: ReturnType<LeagueModel["evaluateTrade"]>;
      score: number;
    }[] = [];
    const adj = (ids: string[]) => ids.reduce((a, id) => a + Math.pow(val(id), 1.3), 0);
    for (const t of targets) {
      const gets: string[][] = [[t.p.id], ...theirExtras.filter((x) => x !== t.p.id).map((x) => [t.p.id, x])];
      const candidates: { pk: string[]; get: string[]; ratio: number }[] = [];
      for (const g of gets) {
        const tv = adj(g);
        for (const pk of packages) {
          if (pk.some((id) => g.includes(id))) continue;
          if (g.length === 2 && pk.length === 2) continue; // keep offers simple
          const ratio = adj(pk) / tv;
          if (ratio >= 0.88 && ratio <= 1.25) candidates.push({ pk, get: g, ratio });
        }
      }
      candidates.sort((a, b) => Math.abs(a.ratio - 1.03) - Math.abs(b.ratio - 1.03));
      for (const { pk, get } of candidates.slice(0, 8)) {
        const r = this.evaluateTrade(myId, partnerId, pk, get);
        // Both sides must come out fine for the rest of the season, and it has to look fair.
        if (r.perWeekAvg < 0.3) continue;
        if (r.theirPerWeekAvg < -0.25) continue;
        if (r.consensusRatio != null && (r.consensusRatio < 0.85 || r.consensusRatio > 1.3)) continue;
        if (r.acceptance === "Very unlikely" || r.acceptance === "Unlikely") continue;
        // Never suggest fixing one need by opening a bigger hole.
        if (r.holesCreated.length) continue;
        if (r.needScoreAfter > r.needScoreBefore + 0.05) continue;
        const playoffAvg = r.myPlayoffDelta / Math.max(1, this.lastWeek - this.playoffStart + 1);
        const score =
          r.perWeekAvg +
          0.4 * playoffAvg +
          0.5 * Math.max(0, Math.min(1.5, r.theirPerWeekAvg)) + // deals that help them too get done
          (r.acceptance === "Likely" ? 0.5 : 0) +
          (r.fillsTheirNeed ? 0.3 : 0) +
          2 * (r.needScoreBefore - r.needScoreAfter) - // leaves your roster more balanced
          (r.consensusRatio != null ? 1.5 * Math.abs(r.consensusRatio - 1) : 0);
        ideas.push({ partnerId, give: pk, get, result: r, score });
      }
    }
    // One best package per target keeps the list varied.
    const best = new Map<string, (typeof ideas)[number]>();
    for (const i of ideas) {
      const cur = best.get(i.get[0]);
      if (!cur || i.score > cur.score) best.set(i.get[0], i);
    }
    return [...best.values()].sort((a, b) => b.score - a.score);
  }

  // ---------- waivers ----------

  freeAgents(pos?: Position | "ALL") {
    const out: PlayerView[] = [];
    for (const v of this.views.values()) {
      if (v.ownerRosterId != null || !v.p.team) continue;
      if (pos && pos !== "ALL" && v.p.pos !== pos) continue;
      // Injured free agents only make the list if they're due back in time to matter (stash candidates).
      if (v.p.injury && LONG_TERM.has(v.p.injury)) {
        const back = this.returnWeek.get(v.p.id);
        if (back == null || back > this.playoffStart || !v.market) continue;
      }
      out.push(v);
    }
    return out.sort((a, b) => b.rosPoints + b.trendingAdds / 4000 - (a.rosPoints + a.trendingAdds / 4000));
  }


  /**
   * Handcuff / stash value. If a backup is next in line behind a better teammate, estimate what he'd
   * score per game if that starter misses time, the chance the starter misses at least one game the
   * rest of the season, and the expected extra points that would add to a given lineup.
   */
  contingentValue(id: string, rosterId?: number) {
    const v = this.views.get(id);
    if (!v || !v.p.team || !["RB", "WR", "TE"].includes(v.p.pos)) return null;
    const mates = [...this.views.values()]
      .filter((t) => t.p.team === v.p.team && t.p.pos === v.p.pos && t.p.id !== id && !(t.p.injury && LONG_TERM.has(t.p.injury)))
      .sort((a, b) => b.valuePg - a.valuePg);
    const starter = mates.find((t) => t.valuePg > v.valuePg * 1.25 && t.valuePg >= 8);
    if (!starter) return null;
    // He has to be the next man up: nobody else between him and the starter.
    const between = mates.filter((t) => t !== starter && t.valuePg > v.valuePg && t.valuePg < starter.valuePg);
    if (between.length) return null;
    const transfer: Record<string, number> = { RB: 0.75, TE: 0.6, WR: 0.45 };
    const ifOut = Math.max(v.valuePg, transfer[v.p.pos] * starter.valuePg + 0.25 * v.valuePg);
    const weeks = this.remainingWeeks().filter((w) => w > this.week && (this.returnWeek.get(starter.p.id) ?? 0) <= w);
    if (!weeks.length || ifOut <= v.valuePg + 1) return null;
    const missProbs = weeks.map((w) => 1 - this.availability(starter, w));
    const expMissed = missProbs.reduce((a, b) => a + b, 0);
    const missChance = 1 - missProbs.reduce((a, q) => a * (1 - q), 1);
    // Extra points for this lineup: only what beats the player he'd replace in your lineup.
    let bar = 0;
    if (rosterId != null) {
      const t = this.team(rosterId);
      if (t) {
        const lu = this.lineup(t.players, (x) => this.views.get(x)?.valuePg ?? 0);
        const eligible = lu.filled.filter((f) => f.slot === v.p.pos || (f.slot in FLEX_SLOTS && FLEX_SLOTS[f.slot].includes(v.p.pos)));
        bar = Math.min(...eligible.map((f) => f.val), Infinity);
        if (!Number.isFinite(bar)) bar = 0;
      }
    }
    return {
      starter: starter.p.name,
      starterId: starter.p.id,
      ifOutPg: round1(ifOut),
      missChance: Math.round(missChance * 100),
      pts: round1(expMissed * Math.max(0, ifOut - Math.max(bar, v.valuePg))),
    };
  }

  /** FAAB bid suggestion: share of your remaining budget scaled by lineup gain, tuned to how this league bids. */
  faab(myId: number) {
    const st = this.bundle.league.settings ?? {};
    if (st.waiver_type !== 2) return null;
    const budget = st.waiver_budget || 100;
    const used = this.bundle.rosters.find((r) => r.roster_id === myId)?.settings.waiver_budget_used ?? 0;
    const remaining = Math.max(0, budget - used);
    const bids = (this.activity?.transactions ?? []).filter((t) => t.type === "waiver" && (t.bid ?? 0) > 0).map((t) => t.bid!) ;
    bids.sort((a, b) => a - b);
    const median = bids.length ? bids[Math.floor(bids.length / 2)] : null;
    const top = bids.length ? bids[bids.length - 1] : null;
    // Leagues that bid big need bigger bids to win; scale against a "normal" median of ~5% of budget.
    const scale = median ? Math.max(0.6, Math.min(1.8, median / (budget * 0.05))) : 1;
    const suggest = (gain: number) => {
      if (gain <= 2) return 0;
      const pct = gain < 6 ? 0.02 : gain < 12 ? 0.06 : gain < 20 ? 0.12 : gain < 35 ? 0.2 : 0.3;
      return Math.min(remaining, Math.max(1, Math.round(remaining * pct * scale)));
    };
    return { budget, remaining, median, top, claims: bids.length, suggest };
  }

  /** Points your lineup gains for the rest of the season if you add `addId` and drop `dropId`. */
  waiverGain(myId: number, addId: string, dropId: string) {
    const me = this.team(myId)!;
    const before = me.players;
    const after = before.filter((id) => id !== dropId).concat(addId);
    return round1(this.teamRos(after) - this.teamRos(before));
  }

  private streamCache = new Map<number, Map<string, { id: string; val: number }[]>>();
  /** Best two free agents at each position for a week (what you could stream in for that week). */
  private streamers(week: number) {
    let m = this.streamCache.get(week);
    if (!m) {
      m = new Map();
      for (const v of this.views.values()) {
        if (v.ownerRosterId != null || !v.p.team) continue;
        const val = this.expected(v.p.id, week);
        if (val <= 0) continue;
        const l = m.get(v.p.pos) ?? [];
        l.push({ id: v.p.id, val });
        l.sort((a, b) => b.val - a.val);
        if (l.length > 2) l.length = 2;
        m.set(v.p.pos, l);
      }
      this.streamCache.set(week, m);
    }
    return m;
  }

  /**
   * What a waiver move is really worth: extra points in the lineups you'd actually start, week by
   * week through the championship, compared with simply streaming the best free agent at a spot when
   * you need one. A backup who only fills one bye week, or only matters if your starter gets hurt,
   * barely moves this, because you could grab a fill-in that week anyway. A player who earns starts does.
   */
  waiverPlan(myId: number, addId: string, dropId: string) {
    const me = this.team(myId)!;
    const before = me.players;
    const after = before.filter((id) => id !== dropId).concat(addId);
    let gain = 0;
    let starts = 0;
    const weeks = this.remainingWeeks();
    for (const w of weeks) {
      // A streamer pick costs a little (waiver priority, the guess); count it at 90%.
      const stream = [...this.streamers(w).values()].map((l) => l.find((x) => x.id !== addId)).filter((x): x is { id: string; val: number } => !!x);
      const sv = new Map(stream.map((x) => [x.id, x.val * 0.9]));
      const val = (id: string) => sv.get(id) ?? this.expected(id, w);
      const ids = (r: string[]) => r.concat(stream.map((x) => x.id).filter((x) => !r.includes(x)));
      const b = this.lineup(ids(before), val);
      const a = this.lineup(ids(after), val);
      gain += a.total - b.total;
      if (a.filled.some((f) => f.id === addId) && this.expected(addId, w) > 0) starts++;
    }
    return { gain: round1(gain), starts, weeks: weeks.length };
  }

  dropCandidates(myId: number) {
    const me = this.team(myId)!;
    const lu = this.lineup(me.players, (id) => this.views.get(id)?.valuePg ?? 0);
    return lu.bench
      .map((id) => this.views.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.rosPoints - b!.rosPoints) as PlayerView[];
  }

  // ---------- head-to-head ----------

  /** This week's fantasy opponent from Sleeper matchups. */
  opponentOf(rosterId: number): Team | null {
    const rows = this.activity?.matchups ?? [];
    const mine = rows.find((r) => r.rosterId === rosterId);
    if (!mine || mine.matchupId == null) return null;
    const opp = rows.find((r) => r.matchupId === mine.matchupId && r.rosterId !== rosterId);
    return opp ? this.team(opp.rosterId) ?? null : null;
  }

  /** Projected score for both teams and a rough win probability (normal approximation). */
  headToHead(rosterId: number, week = this.week) {
    const opp = this.opponentOf(rosterId);
    const me = this.team(rosterId);
    if (!opp || !me) return null;
    const mine = this.teamWeekPoints(me.players, week);
    const theirs = this.teamWeekPoints(opp.players, week);
    const z = (mine - theirs) / Math.sqrt(this.weekSd(me.players, week, mine) ** 2 + this.weekSd(opp.players, week, theirs) ** 2);
    const live = this.activity?.matchups.filter((r) => r.rosterId === rosterId || r.rosterId === opp.rosterId) ?? [];
    return {
      opponent: opp,
      myProj: round1(mine),
      oppProj: round1(theirs),
      winProb: Math.round(normCdf(z) * 100),
      liveMine: live.find((r) => r.rosterId === rosterId)?.points ?? 0,
      liveTheirs: live.find((r) => r.rosterId === opp.rosterId)?.points ?? 0,
    };
  }


  /** Spread of a team's weekly score: learned per-position error summed across the starting lineup. */
  weekSd(ids: string[], week: number, total?: number): number {
    const sdPos = this.nfl?.calib?.sd;
    const t = total ?? this.teamWeekPoints(ids, week);
    if (!sdPos) return Math.max(15, 0.22 * t);
    const lu = this.lineup(ids, (id) => this.expected(id, week));
    const varSum = lu.filled.reduce((a, f) => {
      if (!f.id) return a;
      const pos = this.players[f.id]?.pos ?? "WR";
      const s = sdPos[pos] ?? (pos === "K" ? 4 : pos === "DEF" ? 5.5 : 6.5);
      return a + s * s;
    }, 0);
    return Math.sqrt(varSum) || Math.max(15, 0.22 * t);
  }

  // ---------- playoff odds ----------

  /**
   * Simulates the rest of the season thousands of times: every remaining head-to-head game
   * from Sleeper's schedule, each team's projected lineup (depth, byes and injuries included)
   * with a realistic spread, then seeds and plays out the bracket. Tiebreak: points for.
   * `rosters` lets you swap in post-trade rosters to see how a deal moves the odds.
   */
  playoffOdds(rosters?: Map<number, string[]>, sims = 4000) {
    const st = this.bundle.league.settings ?? {};
    const nPlayoff = Math.max(2, Math.min(this.teams.length, Number(st.playoff_teams) || 6));
    const schedule = this.activity?.schedule ?? {};
    const regWeeks = Object.keys(schedule)
      .map(Number)
      .filter((w) => w >= this.week && w < this.playoffStart)
      .sort((a, b) => a - b);
    const playoffWeeks: number[] = [];
    for (let w = this.playoffStart; w <= this.lastWeek; w++) playoffWeeks.push(w);
    const ids = new Map(this.teams.map((t) => [t.rosterId, rosters?.get(t.rosterId) ?? this.rosterAll(t.rosterId)]));
    const weeks = [...regWeeks, ...playoffWeeks];
    const mean = new Map<string, number>();
    const sd = new Map<string, number>();
    for (const t of this.teams) {
      for (const w of weeks) {
        const list = ids.get(t.rosterId)!;
        const m = this.teamWeekPoints(list, w);
        mean.set(`${t.rosterId}:${w}`, m);
        sd.set(`${t.rosterId}:${w}`, this.weekSd(list, w, m));
      }
    }
    // Seeded random numbers so results don't jump around between refreshes.
    let seed = 1234567;
    const rand = () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
      const u = Math.max(1e-9, rand());
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    // Each simulated season also draws how good every team really is (projections can be off by
    // several percent for a whole season), not just week-to-week noise. Without this, odds come
    // out overconfident. The uncertainty shrinks as fewer games remain.
    const strengthSd = 0.08 * Math.sqrt(Math.max(1, regWeeks.length + playoffWeeks.length) / 17);
    let strength = new Map<number, number>();
    const score = (r: number, w: number) =>
      Math.max(0, (mean.get(`${r}:${w}`) ?? 0) * (strength.get(r) ?? 1) + normal() * (sd.get(`${r}:${w}`) ?? 20));

    const tally = new Map(this.teams.map((t) => [t.rosterId, { wins: 0, playoffs: 0, bye: 0, title: 0, seed1: 0 }]));
    const slots = 2 ** Math.ceil(Math.log2(nPlayoff));
    const byes = slots - nPlayoff;
    for (let s = 0; s < sims; s++) {
      strength = new Map(this.teams.map((t) => [t.rosterId, Math.max(0.7, 1 + normal() * strengthSd)]));
      const rec = new Map(this.teams.map((t) => [t.rosterId, { w: t.wins + t.ties / 2, pf: t.pf }]));
      for (const w of regWeeks) {
        for (const [a, b] of schedule[String(w)] ?? []) {
          const sa = score(a, w);
          const sb = score(b, w);
          const ra = rec.get(a);
          const rb = rec.get(b);
          if (!ra || !rb) continue;
          ra.pf += sa;
          rb.pf += sb;
          if (sa > sb) ra.w += 1;
          else rb.w += 1;
        }
      }
      const order = [...rec.entries()].sort((x, y) => y[1].w - x[1].w || y[1].pf - x[1].pf).map((x) => x[0]);
      order.forEach((r, i) => {
        const t = tally.get(r)!;
        t.wins += rec.get(r)!.w;
        if (i === 0) t.seed1++;
        if (i < nPlayoff) t.playoffs++;
        if (i < byes) t.bye++;
      });
      // Bracket: byes sit out round 1; each round the best seed left plays the worst.
      let alive = order.slice(0, nPlayoff);
      let resting = alive.slice(0, byes);
      let playing = alive.slice(byes);
      let wi = 0;
      while (resting.length + playing.length > 1) {
        const w = playoffWeeks[Math.min(wi, playoffWeeks.length - 1)] ?? this.lastWeek;
        const winners: number[] = [];
        const seeds = playing.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
        while (seeds.length > 1) {
          const hi = seeds.shift()!;
          const lo = seeds.pop()!;
          winners.push(score(hi, w) >= score(lo, w) ? hi : lo);
        }
        if (seeds.length) winners.push(seeds[0]);
        alive = [...resting, ...winners];
        resting = [];
        playing = alive;
        wi++;
      }
      if (alive[0] != null) tally.get(alive[0])!.title++;
    }
    return this.teams.map((t) => {
      const x = tally.get(t.rosterId)!;
      return {
        rosterId: t.rosterId,
        projWins: Math.round((x.wins / sims) * 10) / 10,
        playoffPct: Math.round((100 * x.playoffs) / sims),
        byePct: byes ? Math.round((100 * x.bye) / sims) : null,
        titlePct: Math.round((100 * x.title) / sims),
        seed1Pct: Math.round((100 * x.seed1) / sims),
      };
    });
  }

  /** How a trade moves your playoff and title odds (same random draws before and after). */
  tradePlayoffImpact(myId: number, partnerId: number, give: string[], get: string[]) {
    if (!this.activity?.schedule) return null;
    const r = this.evaluateTrade(myId, partnerId, give, get);
    const before = this.playoffOdds(undefined, 3000).find((x) => x.rosterId === myId);
    const after = this.playoffOdds(
      new Map([
        [myId, r.rosters.mine],
        [partnerId, r.rosters.theirs],
      ]),
      3000
    ).find((x) => x.rosterId === myId);
    if (!before || !after) return null;
    return { before, after };
  }

  // ---------- league activity ----------

  managerProfile(rosterId: number): ManagerProfile {
    const tx = this.activity?.transactions ?? [];
    const t = this.team(rosterId);
    const mine = tx.filter((x) => x.rosterIds.includes(rosterId));
    const trades = mine.filter((x) => x.type === "trade");
    const bought: Record<string, number> = {};
    const sold: Record<string, number> = {};
    for (const tr of trades) {
      for (const [pid, r] of Object.entries(tr.adds)) if (r === rosterId) bought[this.players[pid]?.pos ?? "?"] = (bought[this.players[pid]?.pos ?? "?"] ?? 0) + 1;
      for (const [pid, r] of Object.entries(tr.drops)) if (r === rosterId) sold[this.players[pid]?.pos ?? "?"] = (sold[this.players[pid]?.pos ?? "?"] ?? 0) + 1;
    }
    const waivers = mine.filter((x) => x.type === "waiver" && Object.values(x.adds).includes(rosterId));
    const fas = mine.filter((x) => x.type === "free_agent" && Object.values(x.adds).includes(rosterId));
    const faab = waivers.reduce((a, x) => a + (x.bid ?? 0), 0);
    const lastSeason = (this.activity?.lastSeasonTrades ?? []).filter((x) => t?.ownerId && x.ownerIds.includes(t.ownerId)).length;
    const moves = (id: number) => (this.activity?.transactions ?? []).filter((x) => x.rosterIds.includes(id)).length;
    const activityRank = this.teams.map((x) => moves(x.rosterId)).filter((n) => n > mine.length).length + 1;
    const fmt = (o: Record<string, number>) =>
      Object.entries(o)
        .sort((a, b) => b[1] - a[1])
        .map(([pos, n]) => `${n} ${pos}`)
        .join(", ");
    const bits = [
      `${trades.length} trade${trades.length === 1 ? "" : "s"} this season${lastSeason ? ` (${lastSeason} last season)` : ""}`,
      trades.length ? `bought ${fmt(bought) || "-"}; sold ${fmt(sold) || "-"}` : null,
      `${waivers.length + fas.length} adds${faab ? `, $${faab} FAAB spent` : ""}`,
      `#${activityRank} most active`,
    ].filter(Boolean);
    return {
      rosterId,
      tradesThisSeason: trades.length,
      tradesLastSeason: lastSeason,
      waiverClaims: waivers.length,
      freeAgentAdds: fas.length,
      faabSpent: faab,
      bought,
      sold,
      activityRank,
      lastMove: mine[0]?.created ?? null,
      summary: bits.join(" · "),
    };
  }

  /** Recent league moves in plain words, newest first. */
  recentMoves(limit = 12) {
    const name = (id: string) => this.players[id]?.name ?? (id.match(/^[A-Z]{2,3}$/) ? `${id} DEF` : "Unknown");
    return (this.activity?.transactions ?? []).slice(0, limit).map((x) => {
      if (x.type === "trade") {
        const parts = x.rosterIds.map((r) => {
          const got = Object.entries(x.adds)
            .filter(([, to]) => to === r)
            .map(([pid]) => name(pid));
          return `${this.team(r)?.teamName ?? r} gets ${got.join(", ") || (x.picks ? "draft picks" : "nothing")}`;
        });
        return { created: x.created, week: x.week, type: "trade", teams: x.rosterIds, text: parts.join(" | ") };
      }
      const r = x.rosterIds[0];
      const adds = Object.keys(x.adds).map(name);
      const drops = Object.keys(x.drops).map(name);
      const text = [adds.length ? `adds ${adds.join(", ")}${x.bid ? ` ($${x.bid})` : ""}` : null, drops.length ? `drops ${drops.join(", ")}` : null]
        .filter(Boolean)
        .join(", ");
      return { created: x.created, week: x.week, type: x.type, teams: [r], text: `${this.team(r)?.teamName ?? r} ${text}` };
    });
  }

  // ---------- trenches: defenders and linemen out ----------

  /** Regular starters (60%+ of snaps) on a team's defense or O-line who are hurt this week. */
  unitOut(team: string | null, unit: "def" | "ol"): UnitOut[] {
    if (!team) return [];
    const list = this.nfl?.starters?.[team]?.[unit] ?? [];
    const reportIsCurrent = this.nfl?.startersReportWeek === this.week;
    const out: UnitOut[] = [];
    for (const s of list) {
      const e = this.espnByName.get(`${normName(s.n)}:${team}`);
      let status: string | null = null;
      if (e) {
        const mapped = ESPN_STATUS[e.status];
        const age = e.date ? (Date.now() - new Date(e.date).getTime()) / 86_400_000 : 99;
        if (mapped && (LONG_TERM.has(mapped) ? age < 60 : age < 8)) status = mapped;
      }
      if (!status && reportIsCurrent && s.rep && ["Out", "Doubtful", "Questionable"].includes(s.rep)) status = s.rep;
      if (status) out.push({ name: s.n, pos: s.pos, status, snapPct: Math.round(s.pct * 100) });
    }
    return out;
  }

  /** Rest days, surface and other game context from the nflverse schedule. */
  gameContext(team: string | null, week: number) {
    if (!team) return null;
    const g = this.nfl?.games.find((x) => x.w === week && (x.h === team || x.a === team));
    if (!g) return null;
    const home = g.h === team;
    return {
      rest: (home ? g.hr : g.ar) ?? null,
      oppRest: (home ? g.ar : g.hr) ?? null,
      surface: g.surf ?? null,
      roof: g.roof,
      divisional: !!g.div,
      neutralSite: !!g.neutral,
      stadium: g.st,
    };
  }


  // ---------- compare ----------

  /** Projection with a realistic range: 10th to 90th percentile outcomes (learned error size per position). */
  range(id: string, week = this.week) {
    const v = this.views.get(id);
    const exp = this.expected(id, week);
    const pos = v?.p.pos ?? "WR";
    const sdBase = this.nfl?.calib?.sd?.[pos] ?? ({ QB: 8, RB: 7, WR: 7, TE: 5.5, K: 4, DEF: 5.5 } as Record<string, number>)[pos] ?? 7;
    const typical = ({ QB: 18, RB: 12, WR: 12, TE: 9, K: 8, DEF: 7 } as Record<string, number>)[pos] ?? 12;
    const sd = exp > 0 ? sdBase * Math.max(0.6, Math.min(1.3, Math.sqrt(exp / typical))) : 0;
    return { exp: round1(exp), floor: round1(Math.max(0, exp - 1.28 * sd)), ceiling: round1(exp + 1.28 * sd), sd: round1(sd) };
  }

  /** Side-by-side start/sit call, with a tiebreak that depends on whether you're favored this week. */
  compare(myId: number, ids: string[], week = this.week) {
    const rows = ids
      .map((id) => this.views.get(id))
      .filter((v): v is PlayerView => !!v)
      .map((v) => {
        const g = this.gameFor(v.p.team, week);
        const d = g ? this.dvp.get(g.opp)?.get(v.p.pos) : undefined;
        return {
          v,
          g,
          range: this.range(v.p.id, week),
          dvpRank: d?.rank ?? null,
          defOut: g && week === this.week ? this.unitOut(g.opp, "def") : [],
          olOut: g && week === this.week ? this.unitOut(v.p.team, "ol") : [],
        };
      });
    if (rows.length < 2) return { rows, pick: null as string | null, why: "" };
    const h2h = week === this.week ? this.headToHead(myId, week) : null;
    const byExp = rows.slice().sort((a, b) => b.range.exp - a.range.exp);
    const [a, b] = byExp;
    const gap = a.range.exp - b.range.exp;
    const avgSd = (a.range.sd + b.range.sd) / 2 || 1;
    let pick = a;
    let why = `${a.v.p.name} projects ${gap.toFixed(1)} pts higher.`;
    if (gap < 0.3 * avgSd) {
      if (h2h && h2h.winProb < 45) {
        pick = rows.slice().sort((x, y) => y.range.ceiling - x.range.ceiling)[0];
        why = `Basically a coin flip. You're the underdog this week (${h2h.winProb}% to win), so take the higher ceiling: ${pick.v.p.name}.`;
      } else if (h2h && h2h.winProb > 60) {
        pick = rows.slice().sort((x, y) => y.range.floor - x.range.floor)[0];
        why = `Basically a coin flip. You're favored (${h2h.winProb}% to win), so take the safer floor: ${pick.v.p.name}.`;
      } else {
        why = `Basically a coin flip (${gap.toFixed(1)} pts apart). ${a.v.p.name} has the slight edge; check late news.`;
      }
    }
    return { rows, pick: pick.v.p.id, why };
  }


  // ---------- weekly to-do ----------

  /** The few things worth doing this week, most urgent first. */
  actionItems(myId: number) {
    type Item = { kind: string; text: string; tab?: "lineup" | "waivers" | "trades"; playerId?: string; tone: "rose" | "amber" | "lime" | "cyan" };
    const items: Item[] = [];
    const me = this.team(myId);
    if (!me) return items;
    const name = (id: string) => this.views.get(id)?.p.name ?? id;
    const ss = this.startSit(myId);
    const optimal = ss.lineup.filled.map((f) => f.id).filter((x): x is string => !!x);

    // 1) Your saved Sleeper lineup vs the best lineup.
    const actual = (this.bundle.rosters.find((r) => r.roster_id === myId)?.starters ?? []).filter((id) => id && id !== "0");
    if (actual.length) {
      const dead = new Map<string, string>(); // starters who can't score: id -> reason
      for (const id of actual) {
        const v = this.views.get(id);
        if (!v) continue;
        const g = this.gameFor(v.p.team, this.week);
        if (!g) dead.set(id, "on bye");
        else if (v.p.injury === "Out" || (v.p.injury && LONG_TERM.has(v.p.injury))) dead.set(id, `ruled out (${v.p.injury})`);
      }
      const benchedStarters = optimal.filter((id) => !actual.includes(id));
      const sittingIn = actual.filter((id) => !optimal.includes(id));
      for (const inId of benchedStarters) {
        const pos = this.players[inId]?.pos;
        const swap = sittingIn
          .filter((o) => this.players[o]?.pos === pos || (["RB", "WR", "TE"].includes(pos ?? "") && ["RB", "WR", "TE"].includes(this.players[o]?.pos ?? "")))
          .sort((a, b) => this.expected(a, this.week) - this.expected(b, this.week))[0];
        if (!swap) continue;
        const gain = this.expected(inId, this.week) - this.expected(swap, this.week);
        if (gain >= 1) {
          const why = dead.get(swap);
          items.push({
            kind: "lineup",
            text: why
              ? `${name(swap)} is in your Sleeper lineup but ${why}. Start ${name(inId)} instead (+${gain.toFixed(1)}).`
              : `Start ${name(inId)} over ${name(swap)} (+${gain.toFixed(1)} projected).`,
            tab: "lineup",
            tone: why ? "rose" : "amber",
          });
          dead.delete(swap);
          sittingIn.splice(sittingIn.indexOf(swap), 1);
        }
      }
      for (const [id, why] of dead)
        items.unshift({ kind: "lineup", text: `${name(id)} is in your Sleeper lineup but ${why}, and you have no good replacement. Check waivers.`, tab: "waivers", tone: "rose" });
      items.sort((a, b) => (a.tone === "rose" ? 0 : 1) - (b.tone === "rose" ? 0 : 1));
    }
    // 2) Lineup-lock and injury alerts.
    for (const w of ss.warnings.slice(0, 2)) items.push({ kind: "alert", text: w, tab: "lineup", tone: "amber" });

    // 3) Best waiver move: the add that earns real starts, not a bench body (see waiverPlan).
    const drops = this.dropCandidates(myId)
      .filter((d) => (this.contingentValue(d.p.id, myId)?.pts ?? 0) < 2) // keep real handcuff stashes
      .slice(0, 3);
    let best: { v: PlayerView; drop: PlayerView; plan: ReturnType<LeagueModel["waiverPlan"]> } | null = null;
    for (const v of this.freeAgents("ALL").filter((x) => !["K", "DEF"].includes(x.p.pos)).slice(0, 25))
      for (const drop of drops) {
        // Never cut someone the trade market or the experts rate clearly above the pickup.
        if (drop.market && v.market && drop.market.value > v.market.value * 1.1) continue;
        if (drop.market && !v.market) continue;
        if (drop.ecrRos != null && drop.p.pos === v.p.pos && (v.ecrRos == null || drop.ecrRos < v.ecrRos * 0.85)) continue;
        const plan = this.waiverPlan(myId, v.p.id, drop.p.id);
        if (!best || plan.gain > best.plan.gain) best = { v, drop, plan };
      }
    if (best && best.plan.gain >= 3 && best.plan.starts >= 2)
      items.push({
        kind: "waiver",
        text: `Add ${best.v.p.name}, drop ${best.drop.p.name}: he'd start about ${best.plan.starts} of your ${best.plan.weeks} remaining weeks (+${best.plan.gain.toFixed(0)} pts in lineups you'd actually play).`,
        tab: "waivers",
        playerId: best.v.p.id,
        tone: "lime",
      });
    // 4) Bye-week or injury holes coming up.
    const core = this.lineup(me.players, (id) => this.views.get(id)?.valuePg ?? 0).filled;
    for (let w = this.week + 1; w <= Math.min(this.lastWeek, this.week + 2); w++) {
      const lu = this.lineup(me.players, (id) => this.expected(id, w));
      const weak = lu.filled.filter((f, i) => (core[i]?.val ?? 0) >= 1 && (!f.id || f.val < 1));
      if (weak.length) {
        // Name the fill-in for that week. Single-week holes are cheapest to stream right before the week.
        const picks = weak
          .map((f) => {
            const pos = (f.slot in FLEX_SLOTS ? FLEX_SLOTS[f.slot] : [f.slot]) as string[];
            const top = pos
              .flatMap((p) => this.streamers(w).get(p) ?? [])
              .sort((a, b) => b.val - a.val)[0];
            return top ? `${this.views.get(top.id)?.p.name} (${top.val.toFixed(1)} proj)` : null;
          })
          .filter(Boolean);
        const slots = weak.map((f) => f.slot.replace("_", " ")).join(", ");
        items.push({
          kind: "bye",
          text: `Week ${w}: no real starter at ${slots}.${picks.length ? ` Best free agent that week: ${picks.join(", ")}.` : " Check waivers for a fill-in."} ${
            w === this.week + 1 ? "Claim one this week." : "Grab one the week before; no need to hold a bench spot now."
          }`,
          tab: "waivers",
          tone: "amber",
        });
        break;
      }
    }
    // 5) Roles about to shrink on your roster.
    for (const id of me.players) {
      const sh = this.roleShift.get(id);
      if (sh && sh.fromWeek <= this.week + 4)
        items.push({ kind: "role", text: `${name(id)}'s role likely shrinks from week ${sh.fromWeek} when ${sh.by} returns. Sell or plan around it.`, tab: "trades", playerId: id, tone: "amber" });
    }
    // 6) Sell high / buy low from expected points.
    const luck = (v: PlayerView) => (v.adv?.s?.fp != null && v.adv.s.xfp != null && v.games >= 3 ? v.adv.s.fp - v.adv.s.xfp : 0);
    const sellHigh = me.players.map((id) => this.views.get(id)!).filter((v) => v && luck(v) >= 4).sort((a, b) => luck(b) - luck(a))[0];
    if (sellHigh)
      items.push({
        kind: "sell",
        text: `Sell-high window: ${sellHigh.p.name} is scoring ${luck(sellHigh).toFixed(1)} pts/game above his expected points.`,
        tab: "trades",
        playerId: sellHigh.p.id,
        tone: "cyan",
      });
    const needs = this.needsTable().find((n) => n.team.rosterId === myId)?.needs ?? [];
    const buyLow = [...this.views.values()]
      .filter((v) => v.ownerRosterId != null && v.ownerRosterId !== myId && needs.includes(v.p.pos) && v.market && luck(v) <= -3.5)
      .sort((a, b) => luck(a) - luck(b))[0];
    if (buyLow)
      items.push({
        kind: "buy",
        text: `Buy-low target: ${buyLow.p.name} (${this.ownerName(buyLow.p.id)}) is scoring ${Math.abs(luck(buyLow)).toFixed(1)} below his expected points. The opportunity is there.`,
        tab: "trades",
        playerId: buyLow.p.id,
        tone: "cyan",
      });
    // 7) Your injured players coming back soon.
    for (const id of [...me.players, ...me.reserve]) {
      const back = this.returnWeek.get(id);
      const v = this.views.get(id);
      if (back != null && v?.p.injury && LONG_TERM.has(v.p.injury) && back <= this.week + 2)
        items.push({ kind: "return", text: `${v.p.name} is expected back week ${back}. Keep a roster spot ready.`, playerId: id, tone: "lime" });
    }
    return items.slice(0, 7);
  }

  // ---------- start / sit ----------

  startSit(myId: number, week = this.week) {
    const me = this.team(myId)!;
    const value = (id: string) => this.expected(id, week);
    const lu = this.lineup(me.players, value);
    const rows = me.players.map((id) => {
      const v = this.views.get(id)!;
      const g = this.gameFor(v?.p.team ?? null, week);
      return { v, g, exp: round1(value(id)) };
    });
    const warnings: string[] = [];
    for (const f of lu.filled) {
      if (!f.id) {
        warnings.push(`No eligible player for your ${f.slot} slot.`);
        continue;
      }
      const v = this.views.get(f.id)!;
      const g = this.gameFor(v.p.team, week);
      if (!g) {
        warnings.push(`${v.p.name} is on bye.`);
        continue;
      }
      const pr = v.adv?.prac;
      if (pr && pr.w === week && pr.st === "DNP" && !v.p.injury && !/rest|not injury/i.test(pr.inj ?? "") && !(week === this.week && this.playChance(f.id).p < 0.85))
        warnings.push(`${v.p.name} did not practice (${pr.inj ?? "injury"}) on the latest report. Watch for a designation.`);
      if (pr && pr.w >= week - 1 && pr.wks >= 3 && pr.inj && !/rest|not injury/i.test(pr.inj))
        warnings.push(`${v.p.name} has been on the injury report ${pr.wks} weeks with ${pr.inj}. Recurring issue.`);
      const pc = week === this.week ? this.playChance(f.id) : null;
      if (pc && pc.p < 0.85 && !(v.p.injury && (v.p.injury === "Out" || LONG_TERM.has(v.p.injury)))) {
        const kick = new Date(g.game.kickoff).getTime();
        const eligible = f.slot in FLEX_SLOTS ? FLEX_SLOTS[f.slot] : [f.slot as Position];
        const lateBackup = lu.bench.some((id) => {
          const b = this.views.get(id);
          if (!b || !eligible.includes(b.p.pos) || b.p.injury) return false;
          const bg = this.gameFor(b.p.team, week);
          return !!bg && new Date(bg.game.kickoff).getTime() >= kick;
        });
        if (!lateBackup)
          warnings.push(
            `${v.p.name} has a ${Math.round(pc.p * 100)}% chance to play and you have no healthy bench backup playing at the same time or later. If he is ruled out late, you cannot swap him.`
          );
        else if (pc.p < 0.6)
          warnings.push(`${v.p.name} is only ${Math.round(pc.p * 100)}% to play (${pc.why.replace(/\.$/, "")}). Watch the final report.`);
      }
    }
    return { lineup: lu, rows, warnings };
  }
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtSigned(n: number) {
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}`;
}

/** Standard normal CDF (Abramowitz-Stegun approximation). */
function normCdf(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Fallback chance-to-play model (fit on 2023-26 injury reports) until the nightly calibration ships one. */
const DEFAULT_PLAY: PlayCalib = {
  n: 3252,
  rates: {
    Out: { all: 0.002, DNP: 0, LP: 0, FP: 0.001 },
    Doubtful: { all: 0.021, DNP: 0.003, LP: 0.037, FP: 0.011 },
    Questionable: { all: 0.677, DNP: 0.517, LP: 0.67, FP: 0.865 },
    None: { all: 0.967, DNP: 0.84, LP: 0.979, FP: 0.977 },
  },
  q: { intercept: 1.078, dnp: -0.863, fp: 1.204, prevOut: -0.634, soft: -0.369, lower: 0.107, concussion: -0.387, nonInjury: 0.105, QB: -1.265, RB: 0.082, TE: 0.084 },
};

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Latest"];

function logit(p: number) {
  const x = Math.max(0.001, Math.min(0.999, p));
  return Math.log(x / (1 - x));
}

export function injuryGroup(s: string | null | undefined): "soft" | "concussion" | "lower" | "nonInjury" | "upper" | "none" {
  const t = (s ?? "").toLowerCase();
  if (!t) return "none";
  if (/hamstring|calf|groin|quad|pectoral|oblique|abdom|adductor/.test(t)) return "soft";
  if (/concussion|head/.test(t)) return "concussion";
  if (/ankle|knee|foot|toe|hip|achilles|heel|shin|fibula|tibia/.test(t)) return "lower";
  if (/illness|not injury|personal|rest/.test(t)) return "nonInjury";
  return "upper";
}

const WEEKDAY: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun" };

/** Reads an ESPN/Rotowire injury note for practice participation by day and status language. */
const ET_FMT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false });

function etParts(t: number) {
  const p = Object.fromEntries(ET_FMT.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { wd: p.weekday as string, y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24 };
}

/**
 * Whether a practice day in this game's week has happened yet. The day is matched to its date in the
 * week leading up to kickoff; reports for it can exist from about 10am ET that day (beat reporters
 * post who's missing from the open part of practice; the official report follows in the afternoon).
 */
export function practiceDayHappened(day: string, kick: number, now: number): boolean {
  if (!DAY_ORDER.includes(day) || day === "Latest") return true;
  for (let k = 0; k < 8; k++) {
    const t = kick - k * 86_400_000;
    const e = etParts(t);
    if (e.wd !== day) continue;
    const off = (new Date(t).getUTCHours() - e.h + 24) % 24; // 4 in summer, 5 in winter
    const tenAm = Date.UTC(e.y, e.m - 1, e.d, 10 + off);
    return now >= tenAm;
  }
  return true;
}

export function parseInjuryNote(text: string) {
  const out = {
    days: [] as { day: string; st: "DNP" | "LP" | "FP" }[],
    ruledOut: false,
    expected: false,
    gtd: false,
    doubtful: false,
    questionable: false,
    listed: false,
  };
  const t = text.replace(/\s+/g, " ");
  for (const sentence of t.split(/(?<=[.!?])\s+/)) {
    const s = sentence.toLowerCase();
    let st: "DNP" | "LP" | "FP" | null = null;
    // "Isn't expected to practice Thursday" / "will be limited Friday" predict a practice, they don't report one.
    const future = /\b(expected to|set to|slated to|will|won't|plans to|planning to|likely to|could|may|might|hopes to|hoping to|going to|projected to)\s+(\w+\s+){0,2}(practice|practicing|be limited|participate|work out|return to practice|sit out)/.test(s);
    if (future) {
      // skip: not a practice report
    } else if (/(didn't|did not|wasn't able to|was unable to|unable to|sat out|held out of|absent from|not seen at|missed)\s+(\w+\s+)?(practice|practicing|session|workout)|did not participate|non-participant|\bdnp\b/.test(s))
      st = "DNP";
    else if (/\blimited\b/.test(s)) st = "LP";
    else if (/practiced fully|full participant|full participation|fully participated|full practice|practiced in full|without limitations|no limitations/.test(s)) st = "FP";
    if (st) {
      const m = s.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
      out.days.push({ day: m ? WEEKDAY[m[1]] : "Latest", st });
    }
    if (/\b(ruled out|won't play|will not play|will miss|won't suit up|is out for|has been ruled|inactive for|placed on (injured reserve|ir)|out for (sunday|monday|thursday|saturday))\b/.test(s) && !/\bnot (been )?ruled out\b/.test(s))
      out.ruledOut = true;
    const negated = /\b(not|n't|isn't|unlikely)\s+(expected|likely|going|set)\s+to\s+(play|suit up|go)\b|\bunlikely to play\b/.test(s);
    if (negated) out.doubtful = true;
    else if (/(expected to play|will play|on track to play|good to go|has been cleared|will suit up|plans to play|is active|no injury designation|without an injury designation|removed from the injury report|not listed on the injury report|off the injury report)/.test(s))
      out.expected = true;
    if (/game-time decision|gametime decision|game time decision/.test(s)) out.gtd = true;
    if (/\bdoubtful\b/.test(s)) out.doubtful = true;
    if (/\bquestionable\b/.test(s)) out.questionable = true;
    if (/(listed as|designated|carries a|carrying a|given a|status of|officially)\s+(questionable|doubtful|out)|(questionable|doubtful) for (sunday|monday|thursday|saturday|the game|week)/.test(s))
      out.listed = true;
  }
  // Keep one status per day (the last mentioned wins).
  const byDay = new Map<string, "DNP" | "LP" | "FP">();
  for (const d of out.days) byDay.set(d.day, d.st);
  out.days = [...byDay.entries()].map(([day, st]) => ({ day, st }));
  return out;
}

type ProjSource = "sleeper" | "espn" | "fantasypros";

/**
 * Weighted average of the projection sources that have a number for this player. Zeros are left
 * out (a source that hasn't caught up on a role change or a ruling); chance to play handles outs.
 * Weights: calibrate.py's when it has learned all three, otherwise its two-source weights shrunk
 * halfway toward an equal three-way split.
 */
export function blendProjections(
  vals: [ProjSource, number | null][],
  pb: { sleeper: number; espn: number; fantasypros?: number } | null
): number | null {
  const eq = 1 / 3;
  let w: Record<ProjSource, number>;
  if (pb && pb.fantasypros != null) w = { sleeper: pb.sleeper, espn: pb.espn, fantasypros: pb.fantasypros };
  else if (pb && pb.sleeper + pb.espn > 0) {
    const t = pb.sleeper + pb.espn;
    w = {
      sleeper: 0.5 * eq + 0.5 * ((pb.sleeper / t) * (2 / 3)),
      espn: 0.5 * eq + 0.5 * ((pb.espn / t) * (2 / 3)),
      fantasypros: eq,
    };
  } else w = { sleeper: eq, espn: eq, fantasypros: eq };
  let num = 0;
  let den = 0;
  for (const [k, v] of vals) {
    if (v == null || !(v > 0) || !(w[k] > 0)) continue;
    num += w[k] * v;
    den += w[k];
  }
  if (den > 0) return num / den;
  const any = vals.find(([, v]) => v != null);
  return any ? any[1] : null;
}

function normName(n: string) {
  return n.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z]/g, "");
}

export function fmtKick(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
