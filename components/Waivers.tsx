"use client";

import { useMemo, useState } from "react";
import type { LeagueModel } from "@/lib/model";
import type { Position } from "@/lib/types";
import { Delta, Empty, InjuryTag, Meter, Panel, PosTag, RankChip } from "./ui";
import { PlayerName } from "./PlayerDrawer";

const FILTERS: (Position | "ALL")[] = ["ALL", "RB", "WR", "TE", "QB", "K", "DEF"];
const STREAM_POS: Position[] = ["QB", "TE", "K", "DEF"];

export default function Waivers({ model, myId }: { model: LeagueModel; myId: number }) {
  const [mode, setMode] = useState<"ros" | "stream">("ros");
  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border border-white/10 p-0.5 font-mono text-xs sm:w-fit">
        {(["ros", "stream"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`flex-1 rounded-md px-3 py-1.5 sm:flex-none ${mode === k ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
          >
            {k === "ros" ? "Rest of season" : "Streamers (one week)"}
          </button>
        ))}
      </div>
      {mode === "ros" ? <RosWaivers model={model} myId={myId} /> : <Streamers model={model} myId={myId} />}
    </div>
  );
}

function RosWaivers({ model, myId }: { model: LeagueModel; myId: number }) {
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const faab = useMemo(() => model.faab(myId), [model, myId]);
  const drops = useMemo(() => model.dropCandidates(myId), [model, myId]);
  const [dropId, setDropId] = useState<string>(drops[0]?.p.id ?? "");

  const rows = useMemo(() => {
    const list = model.freeAgents(pos).slice(0, 40);
    return list
      .map((v) => {
        const cuff = model.contingentValue(v.p.id, myId);
        // Rising role: snap share in his last game well above his earlier average.
        const snaps = v.log.map((g) => (g.teamSnaps ? g.snaps / g.teamSnaps : 0));
        const prior = snaps.slice(0, -1);
        const rising = snaps.length >= 3 && snaps[snaps.length - 1] - prior.reduce((a, b) => a + b, 0) / prior.length >= 0.15;
        const plan = dropId ? model.waiverPlan(myId, v.p.id, dropId) : null;
        const gain = plan?.gain ?? 0;
        return { v, gain, starts: plan?.starts ?? 0, weeks: plan?.weeks ?? 0, cuff, rising, score: gain + (cuff?.pts ?? 0) };
      })
      .sort((a, b) => b.score - a.score || b.v.rosPoints - a.v.rosPoints)
      .slice(0, 30);
  }, [model, myId, pos, dropId]);

  return (
    <>
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
          <span className="text-xs text-slate-500">
            Lineup gain = extra points in lineups you&apos;d actually start through the championship, compared with streaming the best free agent
            when you need one.
          </span>
        </div>
        {faab && (
          <p className="-mt-2 mb-4 text-xs text-slate-400">
            FAAB left: <span className="font-mono text-slate-200">${faab.remaining}</span> of ${faab.budget}
            {faab.median != null && (
              <>
                {" "}
                · League&apos;s median winning bid <span className="font-mono text-slate-200">${faab.median}</span>, top{" "}
                <span className="font-mono text-slate-200">${faab.top}</span> ({faab.claims} claims)
              </>
            )}
          </p>
        )}
        {!rows.length ? (
          <Empty>No free agents found at this position.</Empty>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="tbl tbl-sticky">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Lineup gain</th>
                  {faab && <th title="Suggested FAAB bid">Bid</th>}
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
                {rows.map(({ v, gain, starts, weeks, cuff, rising }) => {
                  const g = model.gameFor(v.p.team, model.week);
                  const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                  return (
                    <tr key={v.p.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <PosTag pos={v.p.pos} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <PlayerName v={v} className="max-w-[130px] sm:max-w-none" />
                              <span className="hidden text-xs text-slate-500 sm:inline">{v.p.team}</span>
                              <InjuryTag status={v.p.injury} />
                            </div>
                            {(cuff || rising) && (
                              <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] leading-tight">
                                {cuff && (
                                  <span className="text-violet-300" title={`${cuff.missChance}% chance ${cuff.starter} misses a game the rest of the season`}>
                                    Handcuff: ~{cuff.ifOutPg.toFixed(0)}/gm if {cuff.starter.replace(/^(\S)\S*\s+/, "$1. ")} is out
                                  </span>
                                )}
                                {rising && <span className="text-lime-300">Snaps rising</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td title={Math.abs(gain) < 3 ? "Too small to matter: under 3 points over the rest of the season" : undefined}>
                        <span className={Math.abs(gain) < 3 ? "opacity-40" : ""}>
                          <Delta value={gain} />
                        </span>
                        {weeks > 0 && (
                          <span className={`block text-[10px] ${starts >= 2 ? "text-slate-400" : "text-slate-600"}`}>
                            {starts ? `starts ${starts}/${weeks} wks` : "bench only"}
                          </span>
                        )}
                        {cuff && cuff.pts >= 0.5 && <span className="block text-[10px] text-violet-300">+{cuff.pts.toFixed(1)} upside</span>}
                      </td>
                      {faab && <td className="font-mono text-amber-200">{faab.suggest(gain) ? `$${faab.suggest(gain)}` : "-"}</td>}
                      <td className="font-mono">{v.rosPoints.toFixed(0)}</td>
                      <td className="mhide font-mono">{v.last3.toFixed(1)}</td>
                      <td className="font-mono text-cyan-200">{model.gameFor(v.p.team, model.week) ? model.projection(v.p.id).toFixed(1) : "-"}</td>
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
        Faded gains are under 3 points for the rest of the season, so they&apos;re basically even. A backup who&apos;d only fill a bye week or wait
        for an injury scores low here on purpose: you can pick up a fill-in that week instead of holding a bench spot all season. Handcuffs show what a backup would score per
        game if the starter ahead of him misses time; &quot;upside&quot; is those extra points weighted by the chance it happens, and it counts in
        the sort order. Tap a name for snap trends, red zone work, expected points and news. Injured players only show up if they&apos;re due back before your playoffs.
        {faab ? " Bids scale with lineup gain and how big your league bids." : ""} Numbers lag breaking news, so ask the AI agent before you claim
        anyone.
      </p>
    </>
  );
}

function Streamers({ model, myId }: { model: LeagueModel; myId: number }) {
  const weeks = model.remainingWeeks().slice(0, 3);
  const [week, setWeek] = useState(weeks[0]);
  const [pos, setPos] = useState<Position>("QB");
  const me = model.team(myId)!;
  // Who you'd be replacing: your best healthy option at that spot this week.
  const mine = me.players
    .map((id) => model.view(id))
    .filter((v) => v && v.p.pos === pos)
    .map((v) => ({ v: v!, exp: model.expected(v!.p.id, week) }))
    .sort((a, b) => b.exp - a.exp)[0];
  const rows = useMemo(
    () =>
      model
        .freeAgents(pos)
        .map((v) => ({ v, exp: model.expected(v.p.id, week) }))
        .filter((x) => x.exp > 0)
        .sort((a, b) => b.exp - a.exp)
        .slice(0, 15),
    [model, pos, week]
  );
  return (
    <Panel
      title="Streamers"
      corners
      right={
        <div className="flex flex-wrap gap-1">
          {STREAM_POS.map((f) => (
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
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="hud-title">Week</span>
        {weeks.map((w) => (
          <button
            key={w}
            onClick={() => setWeek(w)}
            className={`rounded px-3 py-1 font-mono ${week === w ? "bg-cyan-400/20 text-cyan-100 shadow-glow" : "text-slate-400 hover:text-slate-100"}`}
          >
            {w}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          Your best {pos} this week:{" "}
          {mine ? (
            <span className="text-slate-200">
              {mine.v.p.name}{" "}
              {mine.exp > 0 ? `(${mine.exp.toFixed(1)})` : model.gameFor(mine.v.p.team, week) ? "(no projection)" : "(on bye or out)"}
            </span>
          ) : (
            "none"
          )}
        </span>
      </div>
      {!rows.length ? (
        <Empty>No free agents with a game this week at {pos}.</Empty>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="tbl tbl-sticky">
            <thead>
              <tr>
                <th>Player</th>
                <th>Proj wk {week}</th>
                <th>vs yours</th>
                <th>Matchup</th>
                <th>Team total</th>
                <th className="mhide">ROS pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ v, exp }) => {
                const g = model.gameFor(v.p.team, week);
                const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                const opp = g && pos === "DEF" && g.game.total != null && g.impliedTotal != null ? g.game.total - g.impliedTotal : null;
                return (
                  <tr key={v.p.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <PosTag pos={v.p.pos} />
                        <PlayerName v={v} className="max-w-[130px] sm:max-w-none" />
                        <InjuryTag status={v.p.injury} />
                      </div>
                    </td>
                    <td className="font-mono font-semibold neon-text">{exp.toFixed(1)}</td>
                    <td>
                      <Delta value={exp - (mine?.exp ?? 0)} />
                    </td>
                    <td>
                      {g ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          {g.home ? "vs" : "@"} {g.opp} {pos !== "DEF" && <RankChip rank={d?.rank} />}
                        </span>
                      ) : (
                        <span className="text-xs text-amber-300">BYE</span>
                      )}
                    </td>
                    <td className="font-mono text-xs">
                      {pos === "DEF" ? (opp != null ? `opp ${opp.toFixed(1)}` : "-") : g?.impliedTotal != null ? g.impliedTotal.toFixed(1) : "-"}
                    </td>
                    <td className="mhide font-mono">{v.rosPoints.toFixed(0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">
        One-week pickups for byes and injuries, ranked by this week&apos;s projection with matchup and Vegas built in. For defenses, a low opponent
        team total is what you want. Vegas lines usually post a week ahead, so later weeks lean on matchups only.
      </p>
    </Panel>
  );
}
