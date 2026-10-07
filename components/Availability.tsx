"use client";

// "Are they playing?" Chance each injured or limited player suits up for his next game,
// from War Room's learned availability model plus this week's practice reports and news.

import { useMemo, useState } from "react";
import { fmtKick, type LeagueModel, type PlayerView } from "@/lib/model";
import type { Position } from "@/lib/types";
import { usePlayerDrawer } from "./PlayerDrawer";
import { ChanceRing, Empty, Panel, PosTag } from "./ui";

const FILTERS: (Position | "ALL")[] = ["ALL", "QB", "RB", "WR", "TE"];
const LONG = new Set(["IR", "PUP", "Sus", "NA"]);

function PracticeChips({ days }: { days: { day: string; st: "DNP" | "LP" | "FP" }[] }) {
  if (!days.length) return <span className="text-xs text-slate-600">No report yet</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {days.map((d) => (
        <span
          key={d.day}
          className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
            d.st === "FP" ? "border-lime-400/40 text-lime-300" : d.st === "LP" ? "border-amber-300/40 text-amber-200" : "border-rose-400/40 text-rose-300"
          }`}
        >
          {d.day === "Latest" ? "" : `${d.day} `}
          {d.st}
        </span>
      ))}
    </div>
  );
}

export default function Availability({ model, myId }: { model: LeagueModel; myId: number }) {
  const { open } = usePlayerDrawer();
  const [pos, setPos] = useState<Position | "ALL">("ALL");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"chance" | "kickoff">("chance");

  const rows = useMemo(() => {
    const out: { v: PlayerView; pc: ReturnType<LeagueModel["playChance"]>; kick: number; opp: string; home: boolean }[] = [];
    for (const v of model.views.values()) {
      if (!["QB", "RB", "WR", "TE", "K"].includes(v.p.pos) || !v.p.team) continue;
      const g = model.gameFor(v.p.team, model.week);
      if (!g) continue;
      if (v.p.injury && LONG.has(v.p.injury) && !(v.espn?.returnDate && new Date(v.espn.returnDate).getTime() <= new Date(g.game.kickoff).getTime()))
        continue;
      const pc = model.playChance(v.p.id);
      const flagged = !!v.p.injury || pc.practice.length > 0 || pc.p < 0.95;
      if (!flagged) continue;
      // Healthy scratches and backups listed for non-injury reasons aren't injury news.
      if (v.ownerRosterId == null && /coach'?s decision|not injury|non-injury|personal/i.test(pc.injury ?? "")) continue;
      // Fantasy-relevant only: rostered, or someone people would actually start.
      const startable: Record<string, number> = { QB: 20, RB: 55, WR: 70, TE: 20, K: 14 };
      const relevant =
        v.ownerRosterId != null || (v.ecrRos != null ? v.ecrRos <= (startable[v.p.pos] ?? 40) : v.valuePg >= (v.p.pos === "QB" ? 15 : 7));
      if (!relevant) continue;
      out.push({ v, pc, kick: new Date(g.game.kickoff).getTime(), opp: g.opp, home: g.home });
    }
    return out;
  }, [model]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (pos === "ALL" ? true : r.v.p.pos === pos))
      .filter((r) => (mine ? r.v.ownerRosterId === myId : true))
      .filter((r) => (s ? r.v.p.name.toLowerCase().includes(s) || (r.v.p.team ?? "").toLowerCase() === s : true))
      .sort((a, b) => (sort === "chance" ? a.pc.p - b.pc.p || b.v.valuePg - a.v.valuePg : a.kick - b.kick || a.pc.p - b.pc.p));
  }, [rows, pos, mine, q, sort, myId]);

  const myFlagged = rows.filter((r) => r.v.ownerRosterId === myId);
  // After the last game of the week, Sleeper keeps showing it until the week rolls over.
  const weekOver = useMemo(() => {
    const kicks = model.schedule.games.filter((g) => g.week === model.week).map((g) => new Date(g.kickoff).getTime()).filter(Number.isFinite);
    return kicks.length > 0 && Date.now() > Math.max(...kicks) + 4 * 3600 * 1000;
  }, [model]);
  const n = model.nfl?.calib?.play?.n;

  return (
    <div className="space-y-6">
      {weekOver && (
        <div className="panel border-amber-400/30 p-4 text-sm text-amber-100">
          Week {model.week} is over, so these show who actually played. Chances for week {model.week + 1} appear once Sleeper rolls over to the
          new week (usually Tuesday or Wednesday), right as the first practice reports come out.
        </div>
      )}
      <Panel
        title={`Are they playing? · Week ${model.week}`}
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
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input className="input w-full sm:w-64" placeholder="Search player or team" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex rounded-lg border border-white/10 p-0.5 font-mono text-xs">
            {(["chance", "kickoff"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`rounded-md px-2.5 py-1 ${sort === k ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
              >
                {k === "chance" ? "Least likely first" : "By kickoff"}
              </button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
            My team{myFlagged.length ? <span className="font-mono text-xs text-cyan-300">({myFlagged.length})</span> : null}
          </label>
        </div>

        {!shown.length ? (
          <Empty>{mine ? "Nobody on your team is on the injury report this week." : "No fantasy-relevant players on the injury report right now."}</Empty>
        ) : (
          <>
            {/* Desktop table */}
            <div className="-mx-4 hidden overflow-x-auto md:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Chance</th>
                    <th>Status</th>
                    <th>Injury</th>
                    <th>Matchup</th>
                    <th>Practice</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ v, pc, kick, opp, home }) => (
                    <tr key={v.p.id} className={v.ownerRosterId === myId ? "bg-cyan-400/10" : ""}>
                      <td>
                        <div className="flex items-center gap-2">
                          <PosTag pos={v.p.pos} />
                          <div className="min-w-0">
                            <div className="truncate text-slate-100">{v.p.name}</div>
                            <div className="truncate text-[11px] text-slate-500">
                              {v.p.team} · {v.ownerRosterId === myId ? <span className="text-cyan-300">Your team</span> : model.ownerName(v.p.id)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <ChanceRing p={pc.p} size={42} />
                      </td>
                      <td className="text-xs">
                        <div className="text-slate-200">{pc.status ?? "No designation"}</div>
                        <div className="text-[10px] text-slate-500">{pc.official ? "Final report" : "Not final yet"}</div>
                      </td>
                      <td className="text-xs text-slate-300">{pc.injury ?? "-"}</td>
                      <td className="whitespace-nowrap font-mono text-xs text-slate-300">
                        {home ? "vs" : "@"} {opp}
                        <div className="text-[10px] text-slate-500">{fmtKick(new Date(kick).toISOString())}</div>
                      </td>
                      <td>
                        <PracticeChips days={pc.practice} />
                      </td>
                      <td>
                        <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-xs" onClick={() => open(v.p.id)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {shown.map(({ v, pc, kick, opp, home }) => (
                <li key={v.p.id}>
                  <button onClick={() => open(v.p.id)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left ${v.ownerRosterId === myId ? "border-cyan-400/30 bg-cyan-400/10" : "border-white/10 bg-black/20"}`}>
                    <ChanceRing p={pc.p} size={46} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <PosTag pos={v.p.pos} />
                        <span className="truncate text-sm font-semibold text-slate-100">{v.p.name}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">
                        {pc.status ?? "No designation"}
                        {pc.injury ? ` · ${pc.injury}` : ""} · {home ? "vs" : "@"} {opp} {fmtKick(new Date(kick).toISOString())}
                      </div>
                      <div className="mt-1.5">
                        <PracticeChips days={pc.practice} />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Chances come from a model trained on {n ? n.toLocaleString() : "thousands of"} real injury designations from recent seasons (designation, last
          practice, missed last game, injury type, position), updated with this week&apos;s practice reports and ESPN injury notes. Before the final
          report (usually the day before the game) the numbers are wider estimates. Tap a player for the full breakdown.
        </p>
      </Panel>
    </div>
  );
}
