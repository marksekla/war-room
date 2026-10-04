// Tools the AI agent can call. They run in the browser against the loaded
// LeagueModel, so the agent always works from live league data.

import { fmtKick, type LeagueModel, type PlayerView } from "../model";
import { fetchNews, fetchWeather, weatherNote } from "../live";
import type { NflUsage, Position } from "../types";

export interface ToolDef {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  label: (args: Record<string, unknown>) => string;
  run: (m: LeagueModel, myId: number, args: Record<string, unknown>) => unknown | Promise<unknown>;
}

const pct = (x: number | null) => (x == null ? null : Math.round(x * 100));

export function playerSummary(m: LeagueModel, v: PlayerView, detail = false) {
  const base = {
    name: v.p.name,
    pos: v.p.pos,
    team: v.p.team,
    age: v.p.age,
    injury: v.p.injury ? `${v.p.injury}${v.p.injuryPart ? ` (${v.p.injuryPart})` : ""}` : null,
    owner: m.ownerName(v.p.id),
    bye: v.bye,
    games: v.games,
    ppg: v.ppg,
    last3: v.last3,
    projThisWeek: v.projNext,
    valuePerGame: v.valuePg,
    valueOverReplacement: v.vorp,
    restOfSeasonPts: v.rosPoints,
    lastSnapPct: pct(v.snapShare),
    targetSharePct: pct(v.targetShare),
    carrySharePct: pct(v.carryShare),
    trendingAdds48h: v.trendingAdds || undefined,
    marketValue: v.market ? { value: v.market.value, overallRank: v.market.rank, posRank: v.market.posRank, trend30d: v.market.trend } : undefined,
    practice: practiceLine(m, v),
    xfpPerGame: v.adv?.s?.xfp ?? undefined,
  };
  if (!detail) return base;
  const upcoming = m.remainingWeeks().slice(0, 18).map((w) => {
    const g = m.gameFor(v.p.team, w);
    if (!g) return { week: w, opp: "BYE" };
    const d = m.dvp.get(g.opp)?.get(v.p.pos);
    return {
      week: w,
      opp: `${g.home ? "" : "@"}${g.opp}`,
      oppRankVsPos: d?.rank ?? null,
      expectedPts: Math.round(m.expected(v.p.id, w) * 10) / 10,
    };
  });
  return {
    ...base,
    depthChart: v.p.depth,
    gameLog: v.log.map((g) => ({
      week: g.week,
      opp: g.opp,
      pts: g.pts,
      snapPct: g.teamSnaps ? Math.round((100 * g.snaps) / g.teamSnaps) : null,
      carries: g.carries,
      targets: g.targets,
      rec: g.receptions,
      redZoneOpps: g.redZone,
      teamCarrySharePct: g.teamCarries ? Math.round((100 * g.carries) / g.teamCarries) : null,
      teamTargetSharePct: g.teamTargets ? Math.round((100 * g.targets) / g.teamTargets) : null,
    })),
    schedule: upcoming,
    advanced: v.adv
      ? {
          season: usage(v.adv.s),
          last3Games: usage(v.adv.l3),
          weekly: v.adv.wk.map(([week, snap, tgt, car, rz, xfp, fp]) => ({ week, snapPct: pct(snap), targets: tgt, carries: car, redZoneOpps: rz, xfp, pprPts: fp })),
          nextGenStats: v.adv.ngs,
          note: "Shares are 0-100. firstReadSharePct = share of the team's first-read targets (FTN). xfp = expected PPR points from opportunity; pprPts minus xfp = luck/efficiency.",
        }
      : "No nflverse data for this player yet.",
    espnInjury: v.espn ? { status: v.espn.status, updated: v.espn.date, comment: v.espn.short, returnDate: v.espn.returnDate } : null,
    projectionSources: { sleeper: v.projSleeper, espn: v.projEspn, blended: v.projNext },
    thisWeekContext: weekContext(m, v, m.week),
    teamEnvironment: teamEnvSummary(m, v.p.team),
    note: "oppRankVsPos: 1 = stingiest defense vs this position, 32 = most generous (league scoring, this season).",
  };
}

export function weekContext(m: LeagueModel, v: PlayerView, week: number) {
  const g = m.gameFor(v.p.team, week);
  if (!g) return null;
  const ctx = m.gameContext(v.p.team, week);
  const cur = week === m.week;
  return {
    opponent: g.opp,
    restDays: ctx?.rest ?? null,
    opponentRestDays: ctx?.oppRest ?? null,
    surface: ctx?.surface ?? null,
    divisional: ctx?.divisional ?? null,
    neutralSite: ctx?.neutralSite || undefined,
    opponentDefendersOut: cur ? m.unitOut(g.opp, "def") : "only known for the current week",
    ownOffensiveLineOut: cur ? m.unitOut(v.p.team, "ol") : "only known for the current week",
  };
}

function usage(u: NflUsage | null) {
  if (!u) return null;
  return {
    games: u.g,
    snapPct: pct(u.snap),
    targetSharePct: pct(u.tgtSh),
    firstReadSharePct: pct(u.frSh),
    airYardsSharePct: u.airSh != null ? pct(Math.max(0, u.airSh)) : null,
    wopr: u.wopr,
    aDOT: u.adot ?? undefined,
    carrySharePct: pct(u.carSh),
    redZoneSharePct: pct(u.rzSh),
    redZoneTargets: u.rzT,
    redZoneCarries: u.rzC,
    goalLineCarries: u.glC,
    targetsPerGame: u.tgtPg,
    carriesPerGame: u.carPg,
    xfpPerGame: u.xfp,
    pprPerGame: u.fp,
  };
}

function practiceLine(m: LeagueModel, v: PlayerView) {
  const pr = v.adv?.prac;
  if (!pr || pr.w < m.week - 1) return undefined;
  return `Week ${pr.w}: ${pr.st ?? "?"}${pr.inj ? ` (${pr.inj})` : ""}${pr.rep ? `, game status ${pr.rep}` : ""}${pr.wks > 1 ? `, on report ${pr.wks} weeks this season` : ""}`;
}

export function teamEnvSummary(m: LeagueModel, team: string | null) {
  const e = m.teamEnv(team);
  if (!e) return null;
  const r = e.rk ?? {};
  return {
    team,
    neutralPassRatePct: e.npr,
    neutralPassRateRank: r.npr,
    passRateOverExpectedPct: e.proe,
    proeRank: r.proe,
    neutralSecondsPerPlay: e.pace,
    paceRank: r.pace,
    playsPerGame: e.plays,
    pointsPerGame: e.ppg,
    pointsRank: r.ppg,
    offenseEpaPerPlay: e.epa,
    redZoneTripsPerGame: e.rzPg,
    redZoneTdPct: e.rzTd,
    qbShareOfGoalLineCarriesPct: e.qbGl,
    defensePassEpaAllowed: e.dPass,
    defensePassRank: r.dPass,
    defenseRushEpaAllowed: e.dRush,
    defenseRushRank: r.dRush,
    ranksNote: "Ranks 1-32. Offense: 1 = most/fastest. Defense: 1 = stingiest.",
  };
}

function resolvePlayers(m: LeagueModel, names: unknown): { ids: string[]; missing: string[] } {
  const list = Array.isArray(names) ? names.map(String) : [];
  const ids: string[] = [];
  const missing: string[] = [];
  for (const n of list) {
    const v = m.findPlayer(n);
    if (v) ids.push(v.p.id);
    else missing.push(n);
  }
  return { ids, missing };
}

function resolveTeam(m: LeagueModel, q: unknown) {
  const s = String(q ?? "").toLowerCase().trim();
  if (!s) return null;
  return (
    m.teams.find((t) => t.teamName.toLowerCase() === s || t.ownerName.toLowerCase() === s) ??
    m.teams.find((t) => t.teamName.toLowerCase().includes(s) || t.ownerName.toLowerCase().includes(s)) ??
    null
  );
}

function teamDump(m: LeagueModel, rosterId: number) {
  const prof = m.teamProfile(rosterId);
  const needs = m.needsTable().find((n) => n.team.rosterId === rosterId);
  return {
    team: prof.team.teamName,
    owner: prof.team.ownerName,
    record: `${prof.team.wins}-${prof.team.losses}${prof.team.ties ? `-${prof.team.ties}` : ""}`,
    pointsFor: prof.team.pf,
    waiverPriority: prof.team.waiverPosition,
    positionRanks: needs?.ranks,
    likelyNeeds: needs?.needs,
    benchSurplus: needs?.surplus,
    bestLineup: prof.lineup.filled.map((f) => ({
      slot: f.slot,
      player: f.id ? m.view(f.id)?.p.name : null,
      valuePerGame: Math.round(f.val * 10) / 10,
    })),
    roster: prof.team.players
      .map((id) => m.view(id))
      .filter(Boolean)
      .map((v) => playerSummary(m, v!)),
    injuredReserve: prof.team.reserve.map((id) => m.view(id)?.p.name).filter(Boolean),
    managerTendencies: m.activity ? m.managerProfile(rosterId) : "League activity not loaded",
  };
}

export const TOOLS: ToolDef[] = [
  {
    name: "get_league_overview",
    description:
      "League settings (scoring, roster slots, playoff weeks, trade deadline), standings, and replacement-level values by position. Call this first in a new conversation.",
    parameters: { type: "object", properties: {} },
    label: () => "Reading league settings",
    run: (m) => ({
      league: m.bundle.league.name,
      season: m.season,
      currentWeek: m.week,
      playoffWeeks: `${m.playoffStart}-${m.lastWeek}`,
      tradeDeadlineWeek: m.tradeDeadline,
      rosterSlots: m.slots,
      benchSlots: m.benchSlots,
      scoring: Object.fromEntries(
        Object.entries(m.scoring).filter(([k, v]) =>
          v !== 0 &&
          ["pass_td", "pass_yd", "pass_int", "rec", "rec_yd", "rec_td", "rush_yd", "rush_td", "bonus_rec_te", "fum_lost", "pass_2pt"].includes(k)
        )
      ),
      replacementValuePerGame: Object.fromEntries(m.replacement),
      standings: m.teams
        .slice()
        .sort((a, b) => b.wins - a.wins || b.pf - a.pf)
        .map((t) => ({ team: t.teamName, owner: t.ownerName, record: `${t.wins}-${t.losses}`, pf: t.pf })),
    }),
  },
  {
    name: "get_my_team",
    description: "The user's own roster with usage, values, byes, injuries, best lineup, position ranks, needs and surplus.",
    parameters: { type: "object", properties: {} },
    label: () => "Loading your roster",
    run: (m, myId) => teamDump(m, myId),
  },
  {
    name: "get_team",
    description: "Another team's roster, needs and surplus. Match by team name or owner name (partial is fine).",
    parameters: { type: "object", properties: { team: { type: "string" } }, required: ["team"] },
    label: (a) => `Scouting ${a.team}`,
    run: (m, _me, a) => {
      const t = resolveTeam(m, a.team);
      return t ? teamDump(m, t.rosterId) : { error: `No team matching "${a.team}". Teams: ${m.teams.map((x) => x.teamName).join(", ")}` };
    },
  },
  {
    name: "get_player",
    description:
      "Full profile for one player: weekly game log with snap %, carry and target share, red-zone usage, injury, owner, bye, and remaining schedule with matchup ranks.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    label: (a) => `Pulling ${a.name}`,
    run: (m, _me, a) => {
      const v = m.findPlayer(String(a.name));
      return v ? playerSummary(m, v, true) : { error: `Player "${a.name}" not found` };
    },
  },
  {
    name: "get_free_agents",
    description: "Best available free agents, optionally by position, with rest-of-season value and how many points they would add to the user's lineup.",
    parameters: {
      type: "object",
      properties: { position: { type: "string", enum: ["ALL", "QB", "RB", "WR", "TE", "K", "DEF"] }, limit: { type: "number" } },
    },
    label: (a) => `Scanning waivers${a.position && a.position !== "ALL" ? ` (${a.position})` : ""}`,
    run: (m, myId, a) => {
      const pos = (a.position as Position | "ALL") ?? "ALL";
      const limit = Math.min(25, Number(a.limit) || 12);
      const drop = m.dropCandidates(myId)[0];
      return {
        suggestedDropIfNeeded: drop?.p.name ?? null,
        players: m
          .freeAgents(pos)
          .slice(0, limit)
          .map((v) => ({ ...playerSummary(m, v), lineupGainIfAdded: drop ? m.waiverGain(myId, v.p.id, drop.p.id) : null })),
      };
    },
  },
  {
    name: "get_matchups",
    description: "NFL games for a week with kickoff time, spread and total. Defaults to the current week.",
    parameters: { type: "object", properties: { week: { type: "number" } } },
    label: (a) => `Checking week ${a.week ?? "current"} lines`,
    run: (m, _me, a) => {
      const w = Number(a.week) || m.week;
      return m.schedule.games
        .filter((g) => g.week === w)
        .map((g) => {
          const c = m.gameContext(g.home, w);
          return {
            game: `${g.away} @ ${g.home}`,
            kickoff: fmtKick(g.kickoff),
            homeSpread: g.spread,
            total: g.total,
            status: g.status,
            homeRestDays: c?.rest ?? null,
            awayRestDays: c?.oppRest ?? null,
            surface: c?.surface ?? null,
            roof: c?.roof ?? null,
            divisional: c?.divisional ?? null,
          };
        });
    },
  },
  {
    name: "get_defense_vs_position",
    description: "Fantasy points allowed per game by every defense to a position this season, ranked (1 = stingiest).",
    parameters: { type: "object", properties: { position: { type: "string", enum: ["QB", "RB", "WR", "TE"] } }, required: ["position"] },
    label: (a) => `Ranking defenses vs ${a.position}`,
    run: (m, _me, a) => {
      const pos = String(a.position) as Position;
      const rows: { team: string; allowedPerGame: number; rank: number }[] = [];
      for (const [team, byPos] of m.dvp) {
        const d = byPos.get(pos);
        if (d) rows.push({ team, allowedPerGame: d.allowed, rank: d.rank });
      }
      return rows.sort((x, y) => x.rank - y.rank);
    },
  },
  {
    name: "evaluate_trade",
    description:
      "Simulates a trade week by week through the fantasy championship. Returns the points each side's best lineup gains or loses (including byes, injuries and forced drops), near-term and playoff impact, the best player in the deal, and acceptance odds.",
    parameters: {
      type: "object",
      properties: {
        give: { type: "array", items: { type: "string" }, description: "Player names the user sends" },
        get: { type: "array", items: { type: "string" }, description: "Player names the user receives" },
      },
      required: ["give", "get"],
    },
    label: () => "Simulating the trade",
    run: (m, myId, a) => {
      const give = resolvePlayers(m, a.give);
      const get = resolvePlayers(m, a.get);
      if (give.missing.length || get.missing.length) return { error: `Could not find: ${[...give.missing, ...get.missing].join(", ")}` };
      const partner = get.ids.map((id) => m.ownerOf.get(id)).find((r) => r != null && r !== myId);
      if (partner == null) return { error: "The players you receive must be on another team's roster." };
      const r = m.evaluateTrade(myId, partner, give.ids, get.ids);
      return {
        partner: m.team(partner)?.teamName,
        verdict: r.verdict,
        yourLineupGainRestOfSeason: r.myDelta,
        yourGainNext3Weeks: r.myNearDelta,
        yourGainPlayoffWeeks: r.myPlayoffDelta,
        theirLineupGainRestOfSeason: r.theirDelta,
        acceptanceOdds: r.acceptance,
        bestPlayerInDeal: r.best,
        yourForcedDrops: r.myDrops.map((id) => m.view(id)?.p.name),
        theirForcedDrops: r.theirDrops.map((id) => m.view(id)?.p.name),
        flags: r.flags,
        marketValue: r.market
          ? { youSend: r.market.give, youGet: r.market.get, note: "FantasyCalc redraft values from real trades. They count stars more than depth." }
          : null,
        weekByWeek: r.perWeek,
        youGive: r.give.map((v) => playerSummary(m, v)),
        youGet: r.get.map((v) => playerSummary(m, v)),
      };
    },
  },
  {
    name: "get_start_sit",
    description: "Optimal lineup for a week with expected points, matchups, Vegas lines, kickoff times and lineup-lock warnings.",
    parameters: { type: "object", properties: { week: { type: "number" } } },
    label: () => "Building your lineup",
    run: (m, myId, a) => {
      const w = Number(a.week) || m.week;
      const r = m.startSit(myId, w);
      const h2h = w === m.week ? m.headToHead(myId, w) : null;
      return {
        week: w,
        headToHead: h2h
          ? { opponent: h2h.opponent.teamName, yourProjection: h2h.myProj, theirProjection: h2h.oppProj, winProbabilityPct: h2h.winProb }
          : null,
        warnings: r.warnings,
        starters: r.lineup.filled.map((f) => {
          const v = f.id ? m.view(f.id) : null;
          const g = v ? m.gameFor(v.p.team, w) : null;
          return {
            slot: f.slot,
            player: v?.p.name ?? null,
            expected: Math.round(f.val * 10) / 10,
            injury: v?.p.injury ?? null,
            game: g ? `${g.home ? "vs" : "@"} ${g.opp}, ${fmtKick(g.game.kickoff)}` : "BYE",
            teamSpread: g?.teamSpread ?? null,
            impliedTeamTotal: g?.impliedTotal ?? null,
            projections: v ? { sleeper: v.projSleeper, espn: v.projEspn } : null,
            context: v && w === m.week ? weekContext(m, v, w) : undefined,
          };
        }),
        bench: r.lineup.bench.map((id) => ({ player: m.view(id)?.p.name, expected: Math.round(m.expected(id, w) * 10) / 10 })),
      };
    },
  },
  {
    name: "get_player_news",
    description:
      "Latest news blurbs for a player (Rotowire via ESPN): injuries, practice notes, role changes, coach quotes. Use before any start/sit, trade or waiver call that depends on health or role.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    label: (a) => `Reading news on ${a.name}`,
    run: async (m, _me, a) => {
      const v = m.findPlayer(String(a.name));
      if (!v) return { error: `Player "${a.name}" not found` };
      if (!v.p.espnId) return { error: `No news id for ${v.p.name}. Use web search instead.` };
      try {
        const items = await fetchNews(v.p.espnId);
        return { player: v.p.name, news: items.slice(0, 6) };
      } catch (e) {
        return { error: `News unavailable: ${e instanceof Error ? e.message : e}` };
      }
    },
  },
  {
    name: "get_team_environment",
    description:
      "Offense and defense environment for one NFL team or all 32: neutral pass rate, pass rate over expected (league avg about -2%), pace, plays and points per game, red zone trips and TD rate, QB share of goal-line carries, and defensive EPA allowed vs pass and run, with ranks.",
    parameters: { type: "object", properties: { team: { type: "string", description: "NFL team abbreviation like DET, or ALL" } } },
    label: (a) => `Checking ${a.team && a.team !== "ALL" ? a.team : "every"} offense`,
    run: (m, _me, a) => {
      if (!m.nfl) return { error: "Advanced team data is not loaded." };
      const t = String(a.team ?? "ALL").toUpperCase();
      if (t !== "ALL") return teamEnvSummary(m, t) ?? { error: `Unknown team ${t}` };
      return { throughWeek: m.nfl.throughWeek, teams: Object.keys(m.nfl.teams).sort().map((k) => teamEnvSummary(m, k)) };
    },
  },
  {
    name: "get_weather",
    description: "Kickoff forecast (wind, rain/snow chance, temperature) for outdoor games in a week. Wind 20+ mph hurts passing and kickers.",
    parameters: { type: "object", properties: { week: { type: "number" } } },
    label: (a) => `Checking week ${a.week ?? "current"} weather`,
    run: async (m, _me, a) => {
      const w = Number(a.week) || m.week;
      try {
        const data = await fetchWeather(w);
        const seen = new Set<string>();
        const rows = [];
        for (const g of m.schedule.games.filter((x) => x.week === w)) {
          const wx = data[g.home];
          if (!wx || seen.has(g.home)) continue;
          seen.add(g.home);
          rows.push({
            game: `${g.away} @ ${g.home}`,
            stadium: wx.stadium,
            roof: wx.roof,
            tempF: wx.tempF,
            windMph: wx.windMph,
            gustMph: wx.gustMph,
            precipChancePct: wx.precipPct,
            fantasyNote: weatherNote(wx)?.label ?? (wx.roof === "dome" || wx.roof === "closed" ? "Indoors" : "No weather concerns"),
          });
        }
        return { week: w, games: rows, note: "Forecasts are only available about two weeks out." };
      } catch (e) {
        return { error: `Weather unavailable: ${e instanceof Error ? e.message : e}` };
      }
    },
  },
  {
    name: "get_injury_report",
    description:
      "Current injury designations and practice participation for fantasy-relevant players, from ESPN (refreshed every 15 min) and the official NFL practice report. Optionally filter to the user's roster or one NFL team.",
    parameters: {
      type: "object",
      properties: { scope: { type: "string", description: "'mine' for the user's roster, an NFL team abbreviation, or 'all'" } },
    },
    label: (a) => `Checking injury report${a.scope && a.scope !== "all" ? ` (${a.scope})` : ""}`,
    run: (m, myId, a) => {
      const scope = String(a.scope ?? "mine");
      const ids =
        scope === "mine"
          ? m.team(myId)?.players ?? []
          : [...m.views.keys()].filter((id) => scope.toLowerCase() === "all" || m.view(id)?.p.team === scope.toUpperCase());
      return ids
        .map((id) => m.view(id))
        .filter((v): v is PlayerView => !!v && (!!v.p.injury || !!v.adv?.prac || !!v.espn) && (scope === "mine" || v.valuePg >= 5))
        .filter((v) => v.p.injury || (v.adv?.prac && v.adv.prac.w >= m.week - 1) || v.espn)
        .slice(0, 60)
        .map((v) => ({
          player: v.p.name,
          team: v.p.team,
          owner: m.ownerName(v.p.id),
          status: v.p.injury,
          practice: practiceLine(m, v) ?? null,
          espn: v.espn ? `${v.espn.status}${v.espn.short ? `: ${v.espn.short}` : ""}` : null,
        }));
    },
  },
  {
    name: "get_league_activity",
    description:
      "Recent adds, drops, waiver claims (with FAAB) and trades in this league, plus each manager's tendencies: trades this and last season, positions they bought and sold, waiver activity. Use it to find active trade partners and to see who is chasing which positions.",
    parameters: {
      type: "object",
      properties: { team: { type: "string", description: "Optional team or owner name to focus on" }, limit: { type: "number" } },
    },
    label: (a) => `Reading league activity${a.team ? ` for ${a.team}` : ""}`,
    run: (m, _me, a) => {
      if (!m.activity) return { error: "League activity is not loaded." };
      const t = a.team ? resolveTeam(m, a.team) : null;
      const limit = Math.min(40, Number(a.limit) || 15);
      const moves = m.recentMoves(200).filter((x) => !t || x.teams.includes(t.rosterId)).slice(0, limit);
      return {
        recentMoves: moves.map((x) => ({ week: x.week, type: x.type, what: x.text, when: new Date(x.created).toLocaleDateString() })),
        managers: (t ? [t] : m.teams).map((tm) => ({ team: tm.teamName, owner: tm.ownerName, ...m.managerProfile(tm.rosterId) })),
      };
    },
  },
  {
    name: "get_my_matchup",
    description: "This week's head-to-head fantasy matchup: opponent, both projected lineups, win probability and live scores.",
    parameters: { type: "object", properties: {} },
    label: () => "Sizing up this week's matchup",
    run: (m, myId) => {
      const h = m.headToHead(myId);
      if (!h) return { error: "No head-to-head matchup found for this week." };
      const lineup = (rosterId: number) =>
        m.startSit(rosterId).lineup.filled.map((f) => ({ slot: f.slot, player: f.id ? m.view(f.id)?.p.name : null, expected: Math.round(f.val * 10) / 10 }));
      return {
        opponent: h.opponent.teamName,
        opponentOwner: h.opponent.ownerName,
        yourProjection: h.myProj,
        theirProjection: h.oppProj,
        winProbabilityPct: h.winProb,
        liveScore: h.liveMine || h.liveTheirs ? { you: h.liveMine, them: h.liveTheirs } : null,
        yourLineup: lineup(myId),
        theirLineup: lineup(h.opponent.rosterId),
      };
    },
  },
  {
    name: "get_league_needs",
    description: "Every team's starter strength rank by position, likely needs and bench surplus. Use it to find trade partners.",
    parameters: { type: "object", properties: {} },
    label: () => "Mapping every team's needs",
    run: (m) =>
      m.needsTable().map((n) => ({
        team: n.team.teamName,
        owner: n.team.ownerName,
        record: `${n.team.wins}-${n.team.losses}`,
        positionRanks: n.ranks,
        needs: n.needs,
        surplus: n.surplus,
      })),
  },
];
