"use client";

import { useMemo, useState } from "react";
import type { LeagueModel } from "@/lib/model";
import type { Position } from "@/lib/types";
import { Delta, Empty, InjuryTag, Meter, Panel, PosTag, RankChip } from "./ui";

const FILTERS: (Position | "ALL")[] = ["ALL", "RB", "WR", "TE", "QB", "K", "DEF"];

export default function Waivers({ model, myId }: { model: LeagueModel; myId: number }) {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const drops = useMemo(() => model.dropCandidates(myId), [model, myId]);
  const [dropId, setDropId] = useState<string>(drops[0]?.p.id ?? "");

  const rows = useMemo(() => {
    const list = model.freeAgents(pos).slice(0, 30);
    return list
      .map((v) => ({ v, gain: dropId ? model.waiverGain(myId, v.p.id, dropId) : 0 }))
      .sort((a, b) => b.gain - a.gain || b.v.rosPoints - a.v.rosPoints);
  }, [model, myId, pos, dropId]);

  return (
    <div className="space-y-6">
      <Panel
        title="Waiver radar"
        corners
        right={
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setPos(f)}
                className={`rounded px-2.5 py-1 font-mono text-xs ${pos === f ? "bg-cyan-400/20 text-cyan-100 shadow-glow" : "text-slate-400 hover:text-slate-100"}`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-400">If I drop</span>
          <select className="input w-full sm:w-auto" value={dropId} onChange={(e) => setDropId(e.target.value)}>
            {drops.map((d) => (
              <option key={d.p.id} value={d.p.id} className="bg-slate-900">
                {d.p.name} ({d.p.pos}, {d.rosPoints.toFixed(0)} ROS pts)
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Lineup gain = how many points your best weekly lineup adds through the championship.</span>
        </div>
        {!rows.length ? (
          <Empty>No free agents found at this position.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="tbl tbl-sticky">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Lineup gain</th>
                  <th>ROS pts</th>
                  <th className="mhide">Last 3</th>
                  <th>Proj</th>
                  <th>Snap</th>
                  <th>Tgt share</th>
                  <th className="mhide">Carry share</th>
                  <th>Next opp</th>
                  <th>Adds 48h</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ v, gain }) => {
                  const g = model.gameFor(v.p.team, model.week);
                  const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                  return (
                    <tr key={v.p.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <PosTag pos={v.p.pos} />
                          <span className="max-w-[130px] truncate font-medium text-slate-100 sm:max-w-none">{v.p.name}</span>
                          <span className="hidden text-xs text-slate-500 sm:inline">{v.p.team}</span>
                          <InjuryTag status={v.p.injury} />
                        </div>
                      </td>
                      <td><Delta value={gain} /></td>
                      <td className="font-mono">{v.rosPoints.toFixed(0)}</td>
                      <td className="mhide font-mono">{v.last3.toFixed(1)}</td>
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
                      <td className="font-mono text-fuchsia-300">{v.trendingAdds ? v.trendingAdds.toLocaleString() : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <p className="text-xs text-slate-500">
        Numbers come from usage and projections and lag breaking news. Ask the AI agent to check injuries and depth-chart changes before you claim anyone.
      </p>
    </div>
  );
}
