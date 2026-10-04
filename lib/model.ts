// The analytics engine. Everything here is pure and runs in the browser on data
// pulled from Sleeper and ESPN. It scores players with the league's own scoring
// settings, measures usage, rates matchups and schedules, and simulates lineups
// week by week so trades and waiver moves are judged on how many points your
// actual starting lineup gains, not on raw rankings.

import type {
  Game,
  LeagueBundle,
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

const OUT_STATUSES = new Set(["Out", "IR", "PUP", "Sus", "NA", "COV", "DNR"]);
const LONG_TERM = new Set(["IR", "PUP", "Sus", "NA"]);

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
  private gamesByTeamWeek = new Map<string, GameInfo>();

  constructor(
    readonly bundle: LeagueBundle,
    readonly players: PlayerMap,
    readonly stats: WeekStats[],
    readonly projections: WeekProjections[],
    readonly schedule: Schedule,
    readonly trending: { add: { player_id: string; count: number }[] }
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

    this.buildDvp();
    this.buildViews();
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
    const weeksOfData = this.stats.length;
    const damp = Math.min(0.45, 0.12 * weeksOfData);
    return Math.max(0.75, Math.min(1.25, 1 + damp * (f - 1)));
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

    for (const p of Object.values(this.players)) {
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
      const next = projByWeek.get(this.week)?.lines[p.id];
      const projNext = next ? scoreLine(next.s, this.scoring) : null;

      let valuePg: number;
      if (log.length >= 2) {
        valuePg = projNext != null && projNext > 0 ? 0.45 * projNext + 0.35 * last3 + 0.2 * ppg : 0.6 * last3 + 0.4 * ppg;
      } else if (log.length === 1) {
        valuePg = projNext != null && projNext > 0 ? 0.65 * projNext + 0.35 * ppg : ppg * 0.85;
      } else {
        valuePg = projNext ?? 0;
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
        snapShare: lastGame && lastGame.teamSnaps ? lastGame.snaps / lastGame.teamSnaps : null,
        targetShare: tgtTeam ? tgtSum / tgtTeam : null,
        carryShare: carTeam ? carSum / carTeam : null,
        trend: lastGame ? round1(lastGame.pts - ppg) : 0,
        trendingAdds: trend.get(p.id) ?? 0,
      });
    }

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

  // ---------- weekly expectation ----------

  /** Expected points for a player in a given week: value x matchup, zero on bye or out. */
  expected(id: string, week: number): number {
    const v = this.views.get(id);
    if (!v || !v.p.team) return 0;
    const g = this.gameFor(v.p.team, week);
    if (!g) return 0; // bye or no game
    const inj = v.p.injury;
    const ahead = week - this.week;
    if (inj && LONG_TERM.has(inj) && ahead < 4) return 0;
    if (inj === "Out" && ahead === 0) return 0;
    let mult = 1;
    if (inj === "Out" && ahead === 1) mult = 0.7;
    if (inj === "Doubtful" && ahead === 0) mult = 0.25;
    if (inj === "Questionable" && ahead === 0) mult = 0.85;
    if (inj && LONG_TERM.has(inj) && ahead >= 4) mult = 0.6;
    let base = v.valuePg;
    if (ahead === 0 && v.projNext != null && v.projNext > 0) base = 0.6 * v.projNext + 0.4 * v.valuePg;
    return base * mult * this.matchupFactor(v.p.pos, g.opp);
  }

  remainingWeeks(): number[] {
    const out: number[] = [];
    for (let w = this.week; w <= this.lastWeek; w++) out.push(w);
    return out;
  }

  rosPoints(id: string): number {
    return this.remainingWeeks().reduce((a, w) => a + this.expected(id, w), 0);
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

  teamWeekPoints(ids: string[], week: number) {
    return this.lineup(ids, (id) => this.expected(id, week)).total;
  }

  teamRos(ids: string[]) {
    return this.remainingWeeks().reduce((a, w) => a + this.teamWeekPoints(ids, w), 0);
  }

  // ---------- team needs ----------

  teamProfile(rosterId: number) {
    const t = this.team(rosterId)!;
    const ids = [...t.players];
    const lu = this.lineup(ids, (id) => this.views.get(id)?.valuePg ?? 0);
    const byPos: Record<string, number> = {};
    for (const f of lu.filled) {
      if (!f.id) continue;
      const pos = this.players[f.id].pos;
      byPos[pos] = (byPos[pos] ?? 0) + f.val;
    }
    return { team: t, lineup: lu, startersByPos: byPos };
  }

  /** Rank each team's starter strength by position (1 = strongest). */
  needsTable() {
    const profiles = this.teams.map((t) => this.teamProfile(t.rosterId));
    const positions: Position[] = ["QB", "RB", "WR", "TE"];
    const ranks = new Map<number, Record<string, number>>();
    for (const pos of positions) {
      const sorted = [...profiles].sort((a, b) => (b.startersByPos[pos] ?? 0) - (a.startersByPos[pos] ?? 0));
      sorted.forEach((pr, i) => {
        const r = ranks.get(pr.team.rosterId) ?? {};
        r[pos] = i + 1;
        ranks.set(pr.team.rosterId, r);
      });
    }
    return profiles.map((pr) => {
      const r = ranks.get(pr.team.rosterId)!;
      const benchStrength: Record<string, number> = {};
      for (const id of pr.lineup.bench) {
        const v = this.views.get(id);
        if (!v || !["RB", "WR", "TE", "QB"].includes(v.p.pos)) continue;
        if (v.vorp > 0) benchStrength[v.p.pos] = (benchStrength[v.p.pos] ?? 0) + 1;
      }
      const sortedNeeds = positions.slice().sort((a, b) => r[b] - r[a]);
      return {
        team: pr.team,
        ranks: r,
        needs: sortedNeeds.filter((p) => r[p] > this.teams.length * 0.6).slice(0, 2),
        surplus: Object.entries(benchStrength)
          .filter(([, c]) => c > 0)
          .map(([p]) => p),
        weekly: round1(pr.lineup.total),
      };
    });
  }

  // ---------- trades ----------

  evaluateTrade(myId: number, partnerId: number, give: string[], get: string[]) {
    const me = this.team(myId)!;
    const them = this.team(partnerId)!;
    const myBefore = [...me.players];
    const theirBefore = [...them.players];
    let myAfter = myBefore.filter((id) => !give.includes(id)).concat(get);
    let theirAfter = theirBefore.filter((id) => !get.includes(id)).concat(give);

    const trim = (ids: string[], protect: string[]) => {
      const drops: string[] = [];
      let list = [...ids];
      while (list.length > this.rosterLimit) {
        const keep = this.lineup(list, (id) => this.views.get(id)?.valuePg ?? 0);
        const bench = keep.bench.filter((id) => !protect.includes(id));
        if (!bench.length) break;
        bench.sort((a, b) => (this.views.get(a)?.rosPoints ?? 0) - (this.views.get(b)?.rosPoints ?? 0));
        drops.push(bench[0]);
        list = list.filter((id) => id !== bench[0]);
      }
      return { list, drops };
    };
    const myTrim = trim(myAfter, get);
    const theirTrim = trim(theirAfter, give);
    myAfter = myTrim.list;
    theirAfter = theirTrim.list;

    const weeks = this.remainingWeeks();
    const perWeek = weeks.map((w) => ({
      week: w,
      me: round1(this.teamWeekPoints(myAfter, w) - this.teamWeekPoints(myBefore, w)),
      them: round1(this.teamWeekPoints(theirAfter, w) - this.teamWeekPoints(theirBefore, w)),
    }));
    const myDelta = round1(perWeek.reduce((a, x) => a + x.me, 0));
    const theirDelta = round1(perWeek.reduce((a, x) => a + x.them, 0));
    const playoffWeeks = perWeek.filter((x) => x.week >= this.playoffStart);
    const myPlayoffDelta = round1(playoffWeeks.reduce((a, x) => a + x.me, 0));
    const nearTerm = perWeek.slice(0, 3);
    const myNearDelta = round1(nearTerm.reduce((a, x) => a + x.me, 0));

    const all = [...give, ...get].map((id) => this.views.get(id)).filter(Boolean) as PlayerView[];
    const best = all.slice().sort((a, b) => b.vorp - a.vorp)[0];
    const bestSide = best ? (get.includes(best.p.id) ? "you" : "them") : null;

    const flags: string[] = [];
    for (const v of all) {
      if (v.p.injury) flags.push(`${v.p.name}: ${v.p.injury}${v.p.injuryPart ? ` (${v.p.injuryPart})` : ""}`);
    }
    if (give.length !== get.length) {
      flags.push(
        `${Math.max(give.length, get.length)}-for-${Math.min(give.length, get.length)} trade: the side getting the best single player usually wins` +
          (bestSide ? `, and that is ${bestSide === "you" ? "you" : "them"} (${best!.p.name}).` : ".")
      );
    }
    if (this.tradeDeadline && this.week > this.tradeDeadline) flags.push("The trade deadline has passed in this league.");

    const verdict =
      myDelta > 12 ? "Win for you" : myDelta > 3 ? "Slight win for you" : myDelta >= -3 ? "Even" : myDelta >= -12 ? "Slight loss for you" : "Loss for you";
    const acceptance =
      theirDelta > 5 ? "Likely" : theirDelta >= -3 ? "Coin flip" : theirDelta >= -12 ? "Unlikely" : "Very unlikely";

    return {
      myDelta,
      theirDelta,
      myNearDelta,
      myPlayoffDelta,
      perWeek,
      verdict,
      acceptance,
      best: best ? { name: best.p.name, side: bestSide } : null,
      myDrops: myTrim.drops,
      theirDrops: theirTrim.drops,
      flags,
      give: give.map((id) => this.views.get(id)).filter(Boolean) as PlayerView[],
      get: get.map((id) => this.views.get(id)).filter(Boolean) as PlayerView[],
    };
  }

  // ---------- waivers ----------

  freeAgents(pos?: Position | "ALL") {
    const out: PlayerView[] = [];
    for (const v of this.views.values()) {
      if (v.ownerRosterId != null || !v.p.team) continue;
      if (pos && pos !== "ALL" && v.p.pos !== pos) continue;
      if (v.p.injury && LONG_TERM.has(v.p.injury)) continue;
      out.push(v);
    }
    return out.sort((a, b) => b.rosPoints + b.trendingAdds / 4000 - (a.rosPoints + a.trendingAdds / 4000));
  }

  /** Points your lineup gains for the rest of the season if you add `addId` and drop `dropId`. */
  waiverGain(myId: number, addId: string, dropId: string) {
    const me = this.team(myId)!;
    const before = me.players;
    const after = before.filter((id) => id !== dropId).concat(addId);
    return round1(this.teamRos(after) - this.teamRos(before));
  }

  dropCandidates(myId: number) {
    const me = this.team(myId)!;
    const lu = this.lineup(me.players, (id) => this.views.get(id)?.valuePg ?? 0);
    return lu.bench
      .map((id) => this.views.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.rosPoints - b!.rosPoints) as PlayerView[];
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
      if (v.p.injury === "Questionable" || v.p.injury === "Doubtful") {
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
            `${v.p.name} is ${v.p.injury} and you have no healthy bench backup playing at the same time or later. If he is ruled out late, you cannot swap him.`
          );
      }
    }
    return { lineup: lu, rows, warnings };
  }
}

export function fmtKick(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
