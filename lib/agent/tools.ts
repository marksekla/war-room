// Tools the AI agent can call. They run in the browser against the loaded
// LeagueModel, so the agent always works from live league data.

import { fmtKick, type LeagueModel, type PlayerView } from "../model";
import type { Position } from "../types";

export interface ToolDef {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  label: (args: Record<string, unknown>) => string;
  run: (m: LeagueModel, myId: number, args: Record<string, unknown>) => unknown;
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
    note: "oppRankVsPos: 1 = stingiest defense vs this position, 32 = most generous (league scoring, this season).",
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
        .map((g) => ({
          game: `${g.away} @ ${g.home}`,
          kickoff: fmtKick(g.kickoff),
          homeSpread: g.spread,
          total: g.total,
          status: g.status,
        }));
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
      return {
        week: w,
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
          };
        }),
        bench: r.lineup.bench.map((id) => ({ player: m.view(id)?.p.name, expected: Math.round(m.expected(id, w) * 10) / 10 })),
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
