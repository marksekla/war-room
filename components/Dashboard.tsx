"use client";

import { useMemo } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { Delta, InjuryTag, Meter, Panel, PosTag, RankChip, Stat } from "./ui";
import { PlayerName } from "./PlayerDrawer";

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

export default function Dashboard({ model, myId }: { model: LeagueModel; myId: number }) {
  const me = model.team(myId)!;
  const roster = useMemo(
    () =>
      me.players
        .map((id) => model.view(id))
        .filter(Boolean)
        .sort((a, b) => POS_ORDER[a!.p.pos] - POS_ORDER[b!.p.pos] || b!.rosPoints - a!.rosPoints) as PlayerView[],
    [model, me]
  );
  const standings = useMemo(() => model.teams.slice().sort((a, b) => b.wins - a.wins || b.pf - a.pf), [model]);
  const needs = useMemo(() => model.needsTable(), [model]);
  const myNeeds = needs.find((n) => n.team.rosterId === myId);
  const lineupNow = useMemo(() => model.lineup(me.players, (id) => model.expected(id, model.week)), [model, me]);
  const starterIds = new Set(lineupNow.filled.map((f) => f.id));
  const rank = standings.findIndex((t) => t.rosterId === myId) + 1;
  const pfRank = model.teams.slice().sort((a, b) => b.pf - a.pf).findIndex((t) => t.rosterId === myId) + 1;
  const h2h = useMemo(() => model.headToHead(myId), [model, myId]);
  const moves = useMemo(() => model.recentMoves(10), [model]);

  const byeWeeks = model.remainingWeeks();
  const startersByPosPerWeek = byeWeeks.map((w) => {
    const lu = model.lineup(me.players, (id) => model.expected(id, w));
    return { week: w, total: lu.total, empty: lu.filled.filter((f) => !f.id || f.val < 1).length };
  });
  const maxWeek = Math.max(...startersByPosPerWeek.map((x) => x.total), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Record" value={`${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`} sub={`#${rank} of ${model.teams.length} in standings`} />
        <Stat label="Points for" value={me.pf.toFixed(1)} sub={`#${pfRank} in league`} tone="violet" />
        <Stat
          label={`Week ${model.week} projection`}
          value={lineupNow.total.toFixed(1)}
          sub={h2h ? `vs ${h2h.opponent.teamName} ${h2h.oppProj.toFixed(1)} · ${h2h.winProb}% to win` : "Best lineup, matchup-adjusted"}
          tone="lime"
        />
        <Stat
          label="Waiver priority"
          value={me.waiverPosition ?? "-"}
          sub={myNeeds?.needs.length ? `Biggest need: ${myNeeds.needs.join(", ")}` : "No glaring hole"}
          tone="amber"
        />
      </div>

      <Panel title="Roster intel" corners>
        <div className="-mx-4 overflow-x-auto">
          <table className="tbl tbl-sticky">
            <thead>
              <tr>
                <th>Player</th>
                <th className="mhide">Bye</th>
                <th className="mhide">PPG</th>
                <th>Last 3</th>
                <th>Proj</th>
                <th>Snap</th>
                <th>Tgt share</th>
                <th className="mhide">Carry share</th>
                <th>Next opp</th>
                <th className="mhide" title="Points per game above a waiver-level starter">VORP</th>
                <th>ROS pts</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((v) => {
                const g = model.gameFor(v.p.team, model.week);
                const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                return (
                  <tr key={v.p.id} className={starterIds.has(v.p.id) ? "" : "opacity-70"}>
                    <td>
                      <div className="flex items-center gap-2">
                        <PosTag pos={v.p.pos} />
                        <PlayerName v={v} className="max-w-[130px] sm:max-w-none" />
                        <span className="hidden text-xs text-slate-500 sm:inline">{v.p.team}</span>
                        <InjuryTag status={v.p.injury} />
                        {starterIds.has(v.p.id) && <span className="hidden text-[10px] text-cyan-300/70 sm:inline">START</span>}
                      </div>
                    </td>
                    <td className="mhide font-mono text-slate-400">{v.bye ?? "-"}</td>
                    <td className="mhide font-mono">{v.ppg.toFixed(1)}</td>
                    <td className="font-mono">{v.last3.toFixed(1)}</td>
                    <td className="font-mono text-cyan-200">{v.projNext?.toFixed(1) ?? "-"}</td>
                    <td><Meter value={v.snapShare} /></td>
                    <td><Meter value={v.targetShare} max={0.4} tone="violet" /></td>
                    <td className="mhide"><Meter value={v.carryShare} max={0.8} tone="lime" /></td>
                    <td>
                      {g ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          {g.home ? "vs" : "@"} {g.opp} <RankChip rank={d?.rank} />
                        </span>
                      ) : (
                        <span className="text-xs text-amber-300">BYE</span>
                      )}
                    </td>
                    <td className="mhide"><Delta value={v.vorp} /></td>
                    <td className="font-mono font-semibold text-slate-100">{v.rosPoints.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tap a name for the full player card (usage, practice report, team environment, news). Opponent chip: rank vs that position (1 = toughest, 32 = easiest). Faded rows are bench.
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Weekly outlook to the title">
          <div className="flex h-44 items-end gap-1.5">
            {startersByPosPerWeek.map((x) => (
              <div key={x.week} className="flex h-full flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t ${x.week >= model.playoffStart ? "bg-fuchsia-400/70 shadow-[0_0_10px_#e879f9]" : "bg-cyan-400/60 shadow-[0_0_10px_#22e4ff]"}`}
                    style={{ height: `${(x.total / maxWeek) * 100}%` }}
                    title={`${x.total.toFixed(1)} pts${x.empty ? `, ${x.empty} weak slot(s)` : ""}`}
                  />
                </div>
                <span className={`font-mono text-[10px] ${x.empty ? "text-amber-300" : "text-slate-500"}`}>{x.week}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Projected best-lineup points by week. Amber week numbers have an empty or near-empty starting slot (byes, injuries). Pink bars are playoff weeks.
          </p>
        </Panel>

        <Panel title="Standings">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Team</th>
                <th>W-L</th>
                <th>PF</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr key={t.rosterId} className={t.rosterId === myId ? "bg-cyan-400/10" : ""}>
                  <td className="font-mono text-slate-500">{i + 1}</td>
                  <td>
                    <div className="font-medium text-slate-100">{t.teamName}</div>
                    <div className="text-xs text-slate-500">{t.ownerName}</div>
                  </td>
                  <td className="font-mono">{t.wins}-{t.losses}</td>
                  <td className="font-mono">{t.pf.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Trade market: every team's needs">
        <div className="-mx-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Team</th>
                <th>QB</th>
                <th>RB</th>
                <th>WR</th>
                <th>TE</th>
                <th>Needs</th>
                <th>Bench surplus</th>
              </tr>
            </thead>
            <tbody>
              {needs.map((n) => (
                <tr key={n.team.rosterId} className={n.team.rosterId === myId ? "bg-cyan-400/10" : ""}>
                  <td className="font-medium text-slate-100">{n.team.teamName}</td>
                  {(["QB", "RB", "WR", "TE"] as const).map((p) => (
                    <td key={p}>
                      <StrengthCell rank={n.ranks[p]} of={model.teams.length} />
                    </td>
                  ))}
                  <td className="text-rose-300">{n.needs.join(", ") || "-"}</td>
                  <td className="text-lime-300">{n.surplus.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Starter strength rank by position (1 = strongest). Target teams whose needs match your surplus.
        </p>
      </Panel>

      {moves.length > 0 && (
        <Panel title="League wire">
          <ul className="divide-y divide-white/5">
            {moves.map((mv, i) => (
              <li key={i} className="flex items-start gap-3 py-2 text-sm">
                <span
                  className={`mt-0.5 w-5 shrink-0 text-center ${mv.type === "trade" ? "text-fuchsia-300" : mv.type === "waiver" ? "text-cyan-300" : "text-slate-400"}`}
                  title={mv.type}
                >
                  {mv.type === "trade" ? "⇄" : mv.type === "waiver" ? "⊕" : "+"}
                </span>
                <span className={`min-w-0 flex-1 ${mv.teams.includes(myId) ? "text-cyan-100" : "text-slate-300"}`}>{mv.text}</span>
                <span className="shrink-0 font-mono text-[11px] text-slate-500">W{mv.week}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function StrengthCell({ rank, of }: { rank: number; of: number }) {
  const tone = rank <= of / 3 ? "text-lime-300" : rank > (2 * of) / 3 ? "text-rose-300" : "text-slate-300";
  return <span className={`font-mono ${tone}`}>{rank}</span>;
}
