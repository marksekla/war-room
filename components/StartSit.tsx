"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtKick, type LeagueModel } from "@/lib/model";
import { fetchWeather, weatherNote } from "@/lib/live";
import type { Weather } from "@/lib/types";
import { InjuryTag, Panel, PosTag, RankChip } from "./ui";
import { PlayerName, PracChip } from "./PlayerDrawer";

export default function StartSit({ model, myId }: { model: LeagueModel; myId: number }) {
  const [week, setWeek] = useState(model.week);
  const r = useMemo(() => model.startSit(myId, week), [model, myId, week]);
  const h2h = useMemo(() => (week === model.week ? model.headToHead(myId, week) : null), [model, myId, week]);
  const weeks = model.remainingWeeks();
  const [wx, setWx] = useState<Record<string, Weather>>({});

  useEffect(() => {
    let live = true;
    setWx({});
    fetchWeather(week)
      .then((w) => live && setWx(w))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [week]);

  // Weather alerts for starters in wind, rain or snow.
  const weatherAlerts = r.lineup.filled
    .map((f) => (f.id ? model.view(f.id) : null))
    .filter((v) => v && ["QB", "WR", "TE", "K"].includes(v.p.pos))
    .map((v) => {
      const n = weatherNote(wx[v!.p.team ?? ""]);
      return n?.severe ? `${v!.p.name}: ${n.label} at kickoff. Downgrade passing and kicking a bit.` : null;
    })
    .filter(Boolean) as string[];
  const alerts = [...r.warnings, ...weatherAlerts];

  const row = (id: string, slot?: string, val?: number) => {
    const v = model.view(id);
    if (!v) return null;
    const g = model.gameFor(v.p.team, week);
    const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
    const exp = val ?? model.expected(id, week);
    const wn = g ? weatherNote(wx[v.p.team ?? ""]) : null;
    const cur = week === model.week && g && !["K", "DEF"].includes(v.p.pos);
    // Chips only for clear absences (out or doubtful); the player card lists questionable ones too.
    const dOut = cur ? model.unitOut(g!.opp, "def").filter((x) => x.status !== "Questionable") : [];
    const olOut = cur ? model.unitOut(v.p.team, "ol").filter((x) => x.status !== "Questionable") : [];
    return (
      <tr key={(slot ?? "bn") + id}>
        {slot !== undefined && <td className="font-display text-[10px] tracking-widest text-cyan-300/70">{slot.replace("_", " ")}</td>}
        <td>
          <div className="flex items-center gap-2">
            <PosTag pos={v.p.pos} />
            <PlayerName v={v} className="max-w-[120px] sm:max-w-none" />
            <span className="hidden text-xs text-slate-500 sm:inline">{v.p.team}</span>
            <InjuryTag status={v.p.injury} />
            {v.adv?.prac && v.adv.prac.w === week && v.adv.prac.st !== "FP" && !/rest|not injury/i.test(v.adv.prac.inj ?? "") && (
              <PracChip st={v.adv.prac.st} />
            )}
          </div>
        </td>
        <td className="font-mono font-semibold neon-text">{exp.toFixed(1)}</td>
        <td className="font-mono text-xs">
          {g ? (
            <span className="flex items-center gap-1.5">
              {g.home ? "vs" : "@"} {g.opp} <RankChip rank={d?.rank} />
              {dOut.length >= 2 && (
                <span
                  title={`${g.opp} defense missing: ${dOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}`}
                  className="rounded border border-lime-400/40 px-1 text-[10px] text-lime-300"
                >
                  -{dOut.length}D
                </span>
              )}
              {olOut.length >= 2 && (
                <span
                  title={`${v.p.team} O-line missing: ${olOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}`}
                  className="rounded border border-rose-400/40 px-1 text-[10px] text-rose-300"
                >
                  OL-{olOut.length}
                </span>
              )}
              {wn && (
                <span title={wn.label} className={wn.severe ? "text-amber-300" : "text-slate-400"}>
                  {/wind/.test(wn.label) ? "≋" : /rain/.test(wn.label) ? "☂" : "❄"}
                </span>
              )}
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
        <span className="ml-auto text-right">
          <span className="font-display text-xl font-bold neon-text">{r.lineup.total.toFixed(1)} pts</span>
          {h2h && (
            <span className="block text-xs text-slate-400">
              vs {h2h.opponent.teamName} {h2h.oppProj.toFixed(1)} ·{" "}
              <span className={h2h.winProb >= 55 ? "text-lime-300" : h2h.winProb <= 45 ? "text-rose-300" : "text-slate-200"}>{h2h.winProb}% to win</span>
            </span>
          )}
        </span>
      </div>

      {alerts.length > 0 && (
        <div className="panel border-amber-400/30 p-4">
          <div className="hud-title !text-amber-300">Lineup alerts</div>
          <ul className="mt-2 space-y-1 text-sm text-amber-100">
            {alerts.map((w, i) => (
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
        Expected points blend projections, recent usage, expected points from opportunity and matchup, and zero out byes and players ruled out. DNP/LP chips are this week&apos;s practice report. -2D means two of the opponent&apos;s defensive starters are out; OL-2 means two of his own linemen are out (hover or tap a player for names). ≋ ☂ ❄ mark wind, rain/snow or cold at kickoff. Check final news before lock; the AI agent can do that for you.
      </p>
    </div>
  );
}
