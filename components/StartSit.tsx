"use client";

import { useMemo, useState } from "react";
import { fmtKick, type LeagueModel } from "@/lib/model";
import { InjuryTag, Panel, PosTag, RankChip } from "./ui";

export default function StartSit({ model, myId }: { model: LeagueModel; myId: number }) {
  const [week, setWeek] = useState(model.week);
  const r = useMemo(() => model.startSit(myId, week), [model, myId, week]);
  const weeks = model.remainingWeeks();

  const row = (id: string, slot?: string, val?: number) => {
    const v = model.view(id);
    if (!v) return null;
    const g = model.gameFor(v.p.team, week);
    const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
    const exp = val ?? model.expected(id, week);
    return (
      <tr key={(slot ?? "bn") + id}>
        {slot !== undefined && <td className="font-display text-[10px] tracking-widest text-cyan-300/70">{slot.replace("_", " ")}</td>}
        <td>
          <div className="flex items-center gap-2">
            <PosTag pos={v.p.pos} />
            <span className="max-w-[120px] truncate font-medium text-slate-100 sm:max-w-none">{v.p.name}</span>
            <span className="hidden text-xs text-slate-500 sm:inline">{v.p.team}</span>
            <InjuryTag status={v.p.injury} />
          </div>
        </td>
        <td className="font-mono font-semibold neon-text">{exp.toFixed(1)}</td>
        <td className="font-mono text-xs">
          {g ? (
            <span className="flex items-center gap-1.5">
              {g.home ? "vs" : "@"} {g.opp} <RankChip rank={d?.rank} />
            </span>
          ) : (
            <span className="text-amber-300">BYE</span>
          )}
        </td>
        <td className="font-mono text-xs text-slate-400">{g ? fmtKick(g.game.kickoff) : "-"}</td>
        <td className="mhide font-mono text-xs">{g?.teamSpread != null ? (g.teamSpread > 0 ? `+${g.teamSpread}` : g.teamSpread) : "-"}</td>
        <td className="mhide font-mono text-xs">{g?.impliedTotal != null ? g.impliedTotal.toFixed(1) : "-"}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="hud-title">Week</span>
        {weeks.slice(0, 6).map((w) => (
          <button
            key={w}
            onClick={() => setWeek(w)}
            className={`rounded px-3 py-1 font-mono text-sm ${week === w ? "bg-cyan-400/20 text-cyan-100 shadow-glow" : "text-slate-400 hover:text-slate-100"}`}
          >
            {w}
          </button>
        ))}
        <span className="ml-auto font-display text-xl font-bold neon-text">{r.lineup.total.toFixed(1)} pts</span>
      </div>

      {r.warnings.length > 0 && (
        <div className="panel border-amber-400/30 p-4">
          <div className="hud-title !text-amber-300">Lineup alerts</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-100">
            {r.warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        </div>
      )}

      <Panel title="Optimal lineup" corners>
        <div className="-mx-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Slot</th>
                <th>Player</th>
                <th>Expected</th>
                <th>Matchup</th>
                <th>Kickoff</th>
                <th className="mhide">Spread</th>
                <th className="mhide">Team total</th>
              </tr>
            </thead>
            <tbody>
              {r.lineup.filled.map((f) =>
                f.id ? (
                  row(f.id, f.slot, f.val)
                ) : (
                  <tr key={f.slot + "empty"}>
                    <td className="font-display text-[10px] tracking-widest text-cyan-300/70">{f.slot}</td>
                    <td colSpan={4} className="text-rose-300">Empty, pick someone up</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Bench">
        <div className="-mx-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Player</th>
                <th>Expected</th>
                <th>Matchup</th>
                <th>Kickoff</th>
                <th className="mhide">Spread</th>
                <th className="mhide">Team total</th>
              </tr>
            </thead>
            <tbody>{r.lineup.bench.map((id) => row(id))}</tbody>
          </table>
        </div>
      </Panel>
      <p className="text-xs text-slate-500">
        Expected points blend projections, recent usage and matchup, and zero out byes and players ruled out. Check final injury news before lock; the AI agent can do that for you.
      </p>
    </div>
  );
}
