"use client";

// Fantasy depth charts for every NFL team, ordered by FantasyPros expert consensus
// (this week's ranks when current, rest-of-season otherwise), with each player's
// status in your league: on your roster, taken by someone else, or available.

import { useMemo, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { usePlayerDrawer } from "./PlayerDrawer";
import { InjuryTag, Panel } from "./ui";

const TEAM_NAMES: Record<string, string> = {
  ARI: "Arizona Cardinals", ATL: "Atlanta Falcons", BAL: "Baltimore Ravens", BUF: "Buffalo Bills", CAR: "Carolina Panthers",
  CHI: "Chicago Bears", CIN: "Cincinnati Bengals", CLE: "Cleveland Browns", DAL: "Dallas Cowboys", DEN: "Denver Broncos",
  DET: "Detroit Lions", GB: "Green Bay Packers", HOU: "Houston Texans", IND: "Indianapolis Colts", JAX: "Jacksonville Jaguars",
  KC: "Kansas City Chiefs", LAC: "Los Angeles Chargers", LAR: "Los Angeles Rams", LV: "Las Vegas Raiders", MIA: "Miami Dolphins",
  MIN: "Minnesota Vikings", NE: "New England Patriots", NO: "New Orleans Saints", NYG: "New York Giants", NYJ: "New York Jets",
  PHI: "Philadelphia Eagles", PIT: "Pittsburgh Steelers", SEA: "Seattle Seahawks", SF: "San Francisco 49ers", TB: "Tampa Bay Buccaneers",
  TEN: "Tennessee Titans", WAS: "Washington Commanders",
};

const COLS = [
  { pos: "QB", label: "Quarterbacks", max: 3 },
  { pos: "RB", label: "Running backs", max: 5 },
  { pos: "WR", label: "Wide receivers", max: 6 },
  { pos: "TE", label: "Tight ends", max: 3 },
  { pos: "K", label: "Kicker", max: 1 },
] as const;

type Status = "mine" | "taken" | "available";

const STATUS_STYLE: Record<Status, { row: string; chip: string; label: string }> = {
  mine: {
    row: "border-l-2 border-cyan-300 bg-cyan-400/15 text-cyan-50",
    chip: "border-cyan-300/60 bg-cyan-400/15 text-cyan-100",
    label: "Your roster",
  },
  taken: { row: "border-l-2 border-transparent text-slate-300", chip: "border-white/20 bg-white/5 text-slate-200", label: "Taken" },
  available: {
    row: "border-l-2 border-lime-300/70 bg-lime-400/10 text-lime-100",
    chip: "border-lime-300/50 bg-lime-400/10 text-lime-200",
    label: "Available",
  },
};

export default function DepthCharts({ model, myId }: { model: LeagueModel; myId: number }) {
  const { open } = usePlayerDrawer();
  const [show, setShow] = useState<Record<Status, boolean>>({ mine: true, taken: true, available: true });
  const [team, setTeam] = useState("ALL");
  const [q, setQ] = useState("");
  const [basis, setBasis] = useState<"week" | "ros">("week");
  const weeklyCurrent = model.nfl?.ecr?.week === model.week;

  const teams = useMemo(() => {
    const set = new Set<string>();
    for (const g of model.schedule.games) {
      set.add(g.home);
      set.add(g.away);
    }
    return [...set].filter((t) => TEAM_NAMES[t]).sort((a, b) => TEAM_NAMES[a].localeCompare(TEAM_NAMES[b]));
  }, [model]);

  // Group every player by team and position once, ordered the way a depth chart reads.
  const charts = useMemo(() => {
    const useWeek = basis === "week" && weeklyCurrent;
    const rankOf = (v: PlayerView) => (useWeek ? v.ecrWeek ?? v.ecrRos : v.ecrRos);
    const by = new Map<string, Map<string, { v: PlayerView; rank: number | null; status: Status }[]>>();
    for (const v of model.views.values()) {
      if (!v.p.team || !COLS.some((c) => c.pos === v.p.pos)) continue;
      const rank = rankOf(v);
      // Skip deep reserves nobody ranks and who haven't played.
      if (rank == null && v.games === 0 && (v.p.depth ?? 9) > 2) continue;
      const status: Status = v.ownerRosterId === myId ? "mine" : v.ownerRosterId != null ? "taken" : "available";
      const t = by.get(v.p.team) ?? new Map();
      const list = t.get(v.p.pos) ?? [];
      list.push({ v, rank: rank == null ? null : Math.round(rank), status });
      t.set(v.p.pos, list);
      by.set(v.p.team, t);
    }
    for (const t of by.values())
      for (const [pos, list] of t) {
        list.sort(
          (a, b) =>
            (a.rank ?? 999) - (b.rank ?? 999) ||
            (a.v.p.depth ?? 9) - (b.v.p.depth ?? 9) ||
            b.v.valuePg - a.v.valuePg
        );
        t.set(pos, list.slice(0, COLS.find((c) => c.pos === pos)!.max));
      }
    return by;
  }, [model, myId, basis, weeklyCurrent]);

  const s = q.trim().toLowerCase();
  const shownTeams = teams.filter((t) => {
    if (team !== "ALL" && t !== team) return false;
    if (!s) return true;
    if (t.toLowerCase() === s || TEAM_NAMES[t].toLowerCase().includes(s)) return true;
    const pos = charts.get(t);
    return !!pos && [...pos.values()].some((l) => l.some((x) => x.v.p.name.toLowerCase().includes(s)));
  });

  return (
    <div className="space-y-6">
      <Panel
        title={`Depth charts · Week ${model.week}`}
        corners
        right={
          <div className="flex rounded-lg border border-white/10 p-0.5 font-mono text-xs">
            {(["week", "ros"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setBasis(k)}
                disabled={k === "week" && !weeklyCurrent}
                title={k === "week" && !weeklyCurrent ? "This week's expert ranks aren't out yet, so rest-of-season ranks are used" : undefined}
                className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${basis === k || (k === "ros" && !weeklyCurrent) ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
              >
                {k === "week" ? `Wk ${model.week}` : "ROS"}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <select className="input w-full sm:w-64" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="ALL" className="bg-slate-900">
              All 32 teams
            </option>
            {teams.map((t) => (
              <option key={t} value={t} className="bg-slate-900">
                {TEAM_NAMES[t]}
              </option>
            ))}
          </select>
          <input className="input w-full sm:w-56" placeholder="Search player or team" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {(Object.keys(STATUS_STYLE) as Status[]).map((k) => (
              <button
                key={k}
                onClick={() => setShow({ ...show, [k]: !show[k] })}
                aria-pressed={show[k]}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
                  show[k] ? STATUS_STYLE[k].chip : "border-white/10 text-slate-500 line-through"
                }`}
              >
                <span className={`grid h-3.5 w-3.5 place-items-center rounded-sm border ${show[k] ? "border-current" : "border-slate-600"}`}>
                  {show[k] ? "✓" : ""}
                </span>
                {STATUS_STYLE[k].label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Ordered by FantasyPros expert consensus ({basis === "week" && weeklyCurrent ? `week ${model.week} PPR ranks` : "rest-of-season PPR ranks"}), so it
          shows the fantasy pecking order rather than the team&apos;s official depth chart. The number is each player&apos;s positional rank. Tap anyone
          for usage, injuries and news.
        </p>
      </Panel>

      {!shownTeams.length && <p className="text-center text-sm text-slate-500">No team or player matches that search.</p>}

      <div className="space-y-4">
        {shownTeams.map((t) => {
          const pos = charts.get(t);
          const g = model.gameFor(t, model.week);
          const bye = model.schedule.byes[t];
          return (
            <section key={t} className="panel overflow-hidden">
              <header className="flex items-center gap-3 border-b border-cyan-400/10 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-cyan-300/40 bg-cyan-400/10 font-display text-[11px] font-bold text-cyan-100">
                  {t}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-sm font-bold text-slate-100">{TEAM_NAMES[t]}</div>
                  <div className="text-[11px] text-slate-500">
                    {g ? `Week ${model.week}: ${g.home ? "vs" : "@"} ${g.opp}` : `Bye in week ${model.week}`}
                    {bye ? ` · bye week ${bye}` : ""}
                  </div>
                </div>
              </header>
              <div className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-3 lg:grid-cols-5">
                {COLS.map((c) => {
                  const list = (pos?.get(c.pos) ?? []).filter((x) => show[x.status]);
                  return (
                    <div key={c.pos} className="min-w-0 bg-[#0b0f1c] p-2.5">
                      <div className="hud-title mb-1.5 !text-[10px]">{c.label}</div>
                      {!list.length ? (
                        <div className="px-2 py-1 text-xs text-slate-600">-</div>
                      ) : (
                        <ul className="space-y-1">
                          {list.map(({ v, rank, status }) => (
                            <li key={v.p.id}>
                              <button
                                onClick={() => open(v.p.id)}
                                title={status === "taken" ? `On ${model.ownerName(v.p.id)}` : STATUS_STYLE[status].label}
                                className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition hover:brightness-125 ${STATUS_STYLE[status].row}`}
                              >
                                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-slate-400">{rank ?? "-"}</span>
                                <span className="min-w-0 flex-1 truncate">{v.p.name}</span>
                                <InjuryTag status={v.p.injury} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
