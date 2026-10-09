"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtKick, type LeagueModel } from "@/lib/model";
import { fetchWeather, weatherNote } from "@/lib/live";
import type { Weather } from "@/lib/types";
import { InjuryTag, Panel, PosTag, RankChip } from "./ui";
import { PlayerName, PracChip } from "./PlayerDrawer";
import { IconAlert, IconRain, IconSnow, IconSwapVertical, IconWind } from "./icons";

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
    const pc = cur ? model.playChance(id) : null;
    // Chips only for clear absences (out or doubtful); the player card lists questionable ones too.
    const dOut = cur ? model.unitOut(g!.opp, "def").filter((x) => x.status !== "Questionable") : [];
    const olOut = cur ? model.unitOut(v.p.team, "ol").filter((x) => x.status !== "Questionable") : [];
    return (
      <tr key={(slot ?? "bn") + id}>
        {slot !== undefined && <td className="text-[11px] font-semibold tracking-wide text-muted">{slot.replace("_", " ")}</td>}
        <td>
          <div className="flex items-center gap-2">
            <PosTag pos={v.p.pos} />
            <PlayerName v={v} className="max-w-[120px] sm:max-w-none" />
            <span className="hidden text-xs text-muted sm:inline">{v.p.team}</span>
            <InjuryTag status={v.p.injury} />
            {pc && pc.p < 0.95 && (
              <span
                title={pc.why}
                className={`whitespace-nowrap rounded border px-1 font-mono text-[10px] ${
                  pc.p >= 0.8 ? "border-good/40 text-good" : pc.p >= 0.5 ? "border-warn/40 text-warn" : "border-bad/40 text-bad"
                }`}
              >
                {Math.round(pc.p * 100)}% to play
              </span>
            )}
            {!pc && v.adv?.prac && v.adv.prac.w === week && v.adv.prac.st !== "FP" && !/rest|not injury/i.test(v.adv.prac.inj ?? "") && (
              <PracChip st={v.adv.prac.st} />
            )}
          </div>
        </td>
        <td className="font-mono font-semibold neon-text">
          {exp.toFixed(1)}
          {cur && v.ecrWeek != null && (
            <span className="block text-[10px] font-normal text-muted">
              Wk{week} {v.p.pos}
              {Math.round(v.ecrWeek)}
            </span>
          )}
        </td>
        <td className="font-mono text-xs">
          {g ? (
            <span className="flex items-center gap-1.5">
              {g.home ? "vs" : "@"} {g.opp} <RankChip rank={d?.rank} />
              {dOut.length >= 2 && (
                <span
                  title={`${g.opp} defense missing: ${dOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}`}
                  className="rounded border border-good/40 px-1 text-[10px] text-good"
                >
                  -{dOut.length}D
                </span>
              )}
              {olOut.length >= 2 && (
                <span
                  title={`${v.p.team} O-line missing: ${olOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}`}
                  className="rounded border border-bad/40 px-1 text-[10px] text-bad"
                >
                  OL-{olOut.length}
                </span>
              )}
              {wn && (
                <span title={wn.label} aria-label={wn.label} className={`inline-grid place-items-center ${wn.severe ? "text-warn" : "text-muted"}`}>
                  {/wind/.test(wn.label) ? <IconWind size={14} /> : /rain/.test(wn.label) ? <IconRain size={14} /> : <IconSnow size={14} />}
                </span>
              )}
            </span>
          ) : (
            <span className="text-warn">BYE</span>
          )}
        </td>
        <td className="font-mono text-xs text-muted">{g ? fmtKick(g.game.kickoff) : "-"}</td>
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
            className={`rounded px-3 py-1 font-mono text-sm ${week === w ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:bg-hover hover:text-ink"}`}
          >
            {w}
          </button>
        ))}
        <span className="ml-auto text-right">
          <span className="font-display text-xl font-semibold neon-text">{r.lineup.total.toFixed(1)} pts</span>
          {h2h && (
            <span className="block text-xs text-muted">
              vs {h2h.opponent.teamName} {h2h.oppProj.toFixed(1)} ·{" "}
              <span className={h2h.winProb >= 55 ? "text-good" : h2h.winProb <= 45 ? "text-bad" : "text-ink"}>{h2h.winProb}% to win</span>
            </span>
          )}
        </span>
      </div>

      <Compare model={model} myId={myId} week={week} wx={wx} />

      {alerts.length > 0 && (
        <div className="panel border-warn/30 p-4">
          <div className="hud-title !text-warn">Lineup alerts</div>
          <ul className="mt-2 space-y-1 text-sm text-warn">
            {alerts.map((w, i) => (
              <li key={i} className="flex items-start gap-2">
                <IconAlert size={15} className="mt-0.5" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Panel title="Optimal lineup" corners>
        <div className="-mx-4 sm:-mx-5 overflow-x-auto">
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
                    <td className="text-[11px] font-semibold tracking-wide text-muted">{f.slot}</td>
                    <td colSpan={4} className="text-bad">Empty, pick someone up</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Bench">
        <div className="-mx-4 sm:-mx-5 overflow-x-auto">
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
      <p className="text-xs text-muted">
        Expected points blend Sleeper, ESPN and FantasyPros consensus projections, FantasyPros weekly expert ranks, season-long usage, matchup and Vegas, times each player&apos;s chance to play (learned from past injury reports plus this week&apos;s practice reports and news). When a teammate is out, projections that already react to the depth chart count more. -2D means two of the opponent&apos;s defensive starters are out; OL-2 means two of his own linemen are out (hover or tap a player for names). Weather icons mark wind, rain/snow or cold at kickoff. Labels like Wk{week} RB10 under each projection are the FantasyPros expert consensus rank for this week only. Check final news before lock; the AI agent can do that for you.
      </p>
    </div>
  );
}

function Compare({ model, myId, week, wx }: { model: LeagueModel; myId: number; week: number; wx: Record<string, Weather> }) {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const me = model.team(myId)!;
  const roster = me.players
    .map((id) => model.view(id))
    .filter((v): v is NonNullable<typeof v> => !!v)
    .sort((a, b) => ["QB", "RB", "WR", "TE", "K", "DEF"].indexOf(a.p.pos) - ["QB", "RB", "WR", "TE", "K", "DEF"].indexOf(b.p.pos));
  const r = useMemo(() => (ids.length >= 2 ? model.compare(myId, ids, week) : null), [model, myId, ids, week]);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));

  if (!open)
    return (
      <button className="btn" onClick={() => setOpen(true)}>
        <IconSwapVertical size={16} />
        Compare players
      </button>
    );

  const cell = "px-2 py-1.5 text-center align-top";
  return (
    <Panel
      title={`Compare · week ${week}`}
      right={
        <button className="text-xs text-muted hover:text-ink" onClick={() => setOpen(false)}>
          Close
        </button>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {roster.map((v) => (
          <button
            key={v.p.id}
            onClick={() => toggle(v.p.id)}
            className={`rounded-full border px-2.5 py-1 text-xs ${ids.includes(v.p.id) ? "border-accent/70 bg-accenttint text-accentstrong" : "border-line text-muted hover:text-ink"}`}
          >
            <span className="mr-1 font-mono text-[10px] text-muted">{v.p.pos}</span>
            {v.p.name}
          </button>
        ))}
      </div>
      {!r && <p className="mt-3 text-xs text-muted">Pick 2 or 3 players.</p>}
      {r && (
        <>
          <div className="-mx-4 sm:-mx-5 mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-24 px-2" />
                  {r.rows.map((x) => (
                    <th key={x.v.p.id} className={`${cell} font-display text-xs ${r.pick === x.v.p.id ? "text-good" : "text-ink"}`}>
                      {x.v.p.name}
                      {r.pick === x.v.p.id && <div className="text-[10px] tracking-widest text-good">START</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-linesoft">
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Projection</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} font-mono text-base font-semibold neon-text`}>
                      {x.range.exp.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Floor to ceiling</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} font-mono text-xs text-ink2`}>
                      {x.range.floor.toFixed(0)} to {x.range.ceiling.toFixed(0)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Matchup</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} font-mono text-xs`}>
                      {x.g ? (
                        <span className="inline-flex items-center gap-1">
                          {x.g.home ? "vs" : "@"} {x.g.opp} <RankChip rank={x.dvpRank} />
                        </span>
                      ) : (
                        <span className="text-warn">BYE</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Team total (Vegas)</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} font-mono text-xs`}>
                      {x.g?.impliedTotal != null ? x.g.impliedTotal.toFixed(1) : "-"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Injuries that matter</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} text-[11px] leading-snug`}>
                      {x.defOut.length > 0 && <div className="text-good">{x.g?.opp} D missing {x.defOut.length}</div>}
                      {x.olOut.length > 0 && <div className="text-bad">Own OL missing {x.olOut.length}</div>}
                      {!x.defOut.length && !x.olOut.length && <span className="text-faint">-</span>}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Status</td>
                  {r.rows.map((x) => {
                    const pr = x.v.adv?.prac;
                    return (
                      <td key={x.v.p.id} className={`${cell} text-[11px]`}>
                        {x.v.p.injury ? <span className="text-warn">{x.v.p.injury}</span> : <span className="text-muted">Healthy</span>}
                        {pr && pr.w === week && pr.st && pr.st !== "FP" && <div className="text-muted">{pr.st} in practice</div>}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Weather</td>
                  {r.rows.map((x) => {
                    const n = weatherNote(wx[x.v.p.team ?? ""]);
                    return (
                      <td key={x.v.p.id} className={`${cell} text-[11px] ${n?.severe ? "text-warn" : "text-muted"}`}>
                        {n?.label ?? "-"}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="px-2 py-1.5 text-xs text-muted">Kickoff</td>
                  {r.rows.map((x) => (
                    <td key={x.v.p.id} className={`${cell} font-mono text-[11px] text-muted`}>
                      {x.g ? fmtKick(x.g.game.kickoff) : "-"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink">{r.why}</p>
        </>
      )}
    </Panel>
  );
}
