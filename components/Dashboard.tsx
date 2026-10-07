"use client";

import { useMemo, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { Delta, InjuryTag, Meter, Panel, PosTag, RankChip, Stat } from "./ui";
import { PlayerName, usePlayerDrawer } from "./PlayerDrawer";

const POS_ORDER: Record<string, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  K: 4,
  DEF: 5,
};

export default function Dashboard({
  model,
  myId,
  go,
}: {
  model: LeagueModel;
  myId: number;
  go?: (tab: "lineup" | "waivers" | "trades") => void;
}) {
  const { open } = usePlayerDrawer();
  const todo = useMemo(() => model.actionItems(myId), [model, myId]);
  const odds = useMemo(
    () => (model.activity?.schedule ? model.playoffOdds() : null),
    [model],
  );
  const oddsBy = new Map((odds ?? []).map((o) => [o.rosterId, o]));
  const myOdds = oddsBy.get(myId);
  const me = model.team(myId)!;
  const roster = useMemo(
    () =>
      me.players
        .map((id) => model.view(id))
        .filter(Boolean)
        .sort(
          (a, b) =>
            POS_ORDER[a!.p.pos] - POS_ORDER[b!.p.pos] ||
            b!.rosPoints - a!.rosPoints,
        ) as PlayerView[],
    [model, me],
  );
  const standings = useMemo(
    () => model.teams.slice().sort((a, b) => b.wins - a.wins || b.pf - a.pf),
    [model],
  );
  const needs = useMemo(() => model.needsTable(), [model]);
  const myNeeds = needs.find((n) => n.team.rosterId === myId);
  const lineupNow = useMemo(
    () => model.lineup(me.players, (id) => model.expected(id, model.week)),
    [model, me],
  );
  const starterIds = new Set(lineupNow.filled.map((f) => f.id));
  const rank = standings.findIndex((t) => t.rosterId === myId) + 1;
  const pfRank =
    model.teams
      .slice()
      .sort((a, b) => b.pf - a.pf)
      .findIndex((t) => t.rosterId === myId) + 1;
  const h2h = useMemo(() => model.headToHead(myId), [model, myId]);
  const moves = useMemo(() => model.recentMoves(30), [model]);

  // Weekly outlook: best lineup each week, and which of your usual starters are missing.
  const outlook = useMemo(() => {
    // Your normal lineup. Slots without data (e.g. a kicker with no projection) are ignored.
    const coreFilled = model.lineup(
      me.players,
      (id) => model.view(id)?.valuePg ?? 0,
    ).filled;
    const core = coreFilled.filter((f) => f.id && f.val >= 1);
    return model.remainingWeeks().map((w) => {
      const lu = model.lineup(me.players, (id) => model.expected(id, w));
      const weak = lu.filled
        .filter(
          (f, i) => (coreFilled[i]?.val ?? 0) >= 1 && (!f.id || f.val < 1),
        )
        .map((f) => f.slot.replace("_", " "));
      const missing = core
        .filter((f) => model.expected(f.id!, w) === 0)
        .map((f) => {
          const v = model.view(f.id!)!;
          const why = !model.gameFor(v.p.team, w)
            ? "bye"
            : (v.p.injury ?? "out");
          return `${v.p.name} (${why})`;
        });
      return { week: w, total: lu.total, weak, missing };
    });
  }, [model, me]);
  const firstProblem =
    outlook.find((x) => x.weak.length || x.missing.length)?.week ?? model.week;
  const [pick, setPick] = useState<number>(firstProblem);
  const picked = outlook.find((x) => x.week === pick) ?? outlook[0];
  const totals = outlook.map((x) => x.total);
  const hi = Math.max(1, ...totals);
  const lo = Math.min(...totals);
  const floor = Math.max(0, lo - (hi - lo) * 1.2 - 10); // start bars above zero so differences are visible

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Record"
          value={`${me.wins}-${me.losses}${me.ties ? `-${me.ties}` : ""}`}
          sub={`#${rank} of ${model.teams.length}${myOdds ? ` · ${myOdds.playoffPct}% to make playoffs` : " in standings"}`}
        />
        <Stat
          label="Points for"
          value={me.pf.toFixed(1)}
          sub={`#${pfRank} in league`}
          tone="violet"
        />
        <Stat
          label={`Week ${model.week} projection`}
          value={lineupNow.total.toFixed(1)}
          sub={
            h2h
              ? `vs ${h2h.opponent.teamName} ${h2h.oppProj.toFixed(1)} · ${h2h.winProb}% to win`
              : "Best lineup, matchup-adjusted"
          }
          tone="lime"
        />
        <Stat
          label="Waiver priority"
          value={me.waiverPosition ?? "-"}
          sub={
            myNeeds?.needs.length
              ? `Biggest need: ${myNeeds.needs.join(", ")}`
              : "No glaring hole"
          }
          tone="amber"
        />
      </div>

      {todo.length > 0 && (
        <Panel title={`Week ${model.week} to-do`}>
          <ul className="-my-1 divide-y divide-white/5">
            {todo.map((t, i) => {
              const dot = {
                rose: "bg-rose-400",
                amber: "bg-amber-300",
                lime: "bg-lime-300",
                cyan: "bg-cyan-300",
              }[t.tone];
              const act =
                t.tab && go
                  ? () => go(t.tab!)
                  : t.playerId
                    ? () => open(t.playerId!)
                    : undefined;
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!act}
                    onClick={act}
                    className="flex w-full items-start gap-3 py-2 text-left text-sm text-slate-200 enabled:hover:text-cyan-100"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`}
                    />
                    <span className="min-w-0 flex-1">{t.text}</span>
                    {act && <span className="shrink-0 text-slate-500">›</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel
        title="Weekly outlook to the title"
        right={
          <span className="hidden text-[11px] text-slate-500 sm:inline">
            Tap a week
          </span>
        }
      >
        <div className="flex h-28 items-end gap-1 sm:gap-1.5">
          {outlook.map((x) => {
            const playoff = x.week >= model.playoffStart;
            const problem = x.weak.length > 0 || x.missing.length > 0;
            const on = x.week === picked?.week;
            return (
              <button
                key={x.week}
                type="button"
                onClick={() => setPick(x.week)}
                className="group flex h-full flex-1 flex-col items-center gap-1"
                aria-label={`Week ${x.week}: ${x.total.toFixed(1)} points`}
              >
                <span className="hidden font-mono text-[10px] text-slate-400 sm:block">
                  {x.total.toFixed(0)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t transition ${
                      playoff
                        ? "bg-fuchsia-400/70 shadow-[0_0_10px_#e879f9]"
                        : "bg-cyan-400/60 shadow-[0_0_10px_#22e4ff]"
                    } ${on ? "ring-2 ring-white/70" : "group-hover:brightness-125"}`}
                    style={{
                      height: `${Math.max(8, ((x.total - floor) / (hi - floor)) * 100)}%`,
                    }}
                  />
                </div>
                <span
                  className={`font-mono text-[10px] ${problem ? "text-amber-300" : "text-slate-500"} ${on ? "font-bold" : ""}`}
                >
                  {x.week}
                </span>
              </button>
            );
          })}
        </div>
        {picked && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
            <span className="font-display font-bold text-slate-100">
              Week {picked.week}
            </span>
            <span className="ml-2 font-mono text-cyan-200">
              {picked.total.toFixed(1)} pts
            </span>
            {picked.week >= model.playoffStart && (
              <span className="ml-2 text-xs text-fuchsia-300">playoffs</span>
            )}
            <div className="mt-1 text-xs text-slate-400">
              {picked.missing.length || picked.weak.length ? (
                <>
                  {picked.missing.length > 0 && (
                    <span className="text-amber-200">
                      Missing: {picked.missing.join(", ")}.{" "}
                    </span>
                  )}
                  {picked.weak.length > 0 && (
                    <span className="text-rose-300">
                      Weak or empty slot: {picked.weak.join(", ")}.
                    </span>
                  )}
                </>
              ) : (
                "Full lineup, no byes or injuries among your starters."
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Amber weeks have starters on bye or hurt. Pink bars are playoff weeks.
        </p>
      </Panel>

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
                <th
                  className="mhide"
                  title="Points per game above a waiver-level starter"
                >
                  VORP
                </th>
                <th>ROS pts</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((v) => {
                const g = model.gameFor(v.p.team, model.week);
                const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                return (
                  <tr
                    key={v.p.id}
                    className={starterIds.has(v.p.id) ? "" : "opacity-70"}
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <PosTag pos={v.p.pos} />
                        <PlayerName
                          v={v}
                          className="max-w-[130px] sm:max-w-none"
                        />
                        <span className="hidden text-xs text-slate-500 sm:inline">
                          {v.p.team}
                        </span>
                        <InjuryTag status={v.p.injury} />
                        {starterIds.has(v.p.id) && (
                          <span className="hidden text-[10px] text-cyan-300/70 sm:inline">
                            START
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mhide font-mono text-slate-400">
                      {v.bye ?? "-"}
                    </td>
                    <td className="mhide font-mono">{v.ppg.toFixed(1)}</td>
                    <td className="font-mono">{v.last3.toFixed(1)}</td>
                    <td className="font-mono text-cyan-200">
                      {v.projNext?.toFixed(1) ?? "-"}
                    </td>
                    <td>
                      <Meter value={v.snapShare} />
                    </td>
                    <td>
                      <Meter value={v.targetShare} max={0.4} tone="violet" />
                    </td>
                    <td className="mhide">
                      <Meter value={v.carryShare} max={0.8} tone="lime" />
                    </td>
                    <td>
                      {g ? (
                        <span className="flex items-center gap-1.5 font-mono text-xs">
                          {g.home ? "vs" : "@"} {g.opp}{" "}
                          <RankChip rank={d?.rank} />
                        </span>
                      ) : (
                        <span className="text-xs text-amber-300">BYE</span>
                      )}
                    </td>
                    <td className="mhide">
                      <Delta value={v.vorp} />
                    </td>
                    <td className="font-mono font-semibold text-slate-100">
                      {v.rosPoints.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Tap a name for the full player card (usage, practice report, team
          environment, news). Opponent chip: rank vs that position (1 =
          toughest, 32 = easiest). Faded rows are bench.
        </p>
      </Panel>

      <div className="grid items-stretch gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel
          title={odds ? "Standings and playoff odds" : "Standings"}
          right={
            odds ? (
              <span className="hidden text-[11px] text-slate-500 sm:inline">
                Simulated {(4000).toLocaleString()}x
              </span>
            ) : undefined
          }
        >
          <ul className="-my-1 divide-y divide-white/5">
            {odds && (
              <li className="flex items-center gap-3 px-1 pb-1.5 font-display text-[10px] uppercase tracking-wider text-cyan-300/70">
                <span className="w-5" />
                <span className="flex-1">Team</span>
                <span className="w-10 text-right">W-L</span>
                <span className="hidden w-14 text-right sm:inline">PF</span>
                <span className="w-14 text-right">Playoffs</span>
                <span className="w-11 text-right">Title</span>
              </li>
            )}
            {standings.map((t, i) => {
              const o = oddsBy.get(t.rosterId);
              const tone = !o
                ? ""
                : o.playoffPct >= 70
                  ? "text-lime-300"
                  : o.playoffPct <= 25
                    ? "text-rose-300"
                    : "text-slate-200";
              return (
                <li
                  key={t.rosterId}
                  className={`flex items-center gap-3 rounded px-1 py-1.5 text-sm ${t.rosterId === myId ? "bg-cyan-400/10" : ""}`}
                >
                  <span className="w-5 text-right font-mono text-xs text-slate-500">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-100">
                      {t.teamName}
                    </span>
                    <span className="ml-2 hidden text-xs text-slate-500 lg:inline">
                      {t.ownerName}
                    </span>
                  </span>
                  <span className="w-10 text-right font-mono text-slate-200">
                    {t.wins}-{t.losses}
                  </span>
                  <span
                    className={`${odds ? "hidden sm:inline" : ""} w-14 text-right font-mono text-slate-400`}
                  >
                    {t.pf.toFixed(1)}
                  </span>
                  {o && (
                    <>
                      <span
                        className={`w-14 text-right font-mono ${tone}`}
                        title={
                          o.byePct != null ? `Bye: ${o.byePct}%` : undefined
                        }
                      >
                        {o.playoffPct}%
                      </span>
                      <span className="w-11 text-right font-mono text-fuchsia-300">
                        {o.titlePct}%
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {odds && (
            <p className="mt-3 text-xs text-slate-500">
              Plays out every remaining game on your league&apos;s schedule with
              each team&apos;s projected lineup, then the playoff bracket.
              Tiebreak: points for.
            </p>
          )}
        </Panel>

        {/* On desktop the wire matches the standings' height and scrolls inside. */}
        <div className="relative">
          <Panel
            title="League wire"
            right={
              moves.length ? (
                <span className="text-[11px] text-slate-500">
                  Last {moves.length} moves
                </span>
              ) : undefined
            }
            className="flex flex-col lg:absolute lg:inset-0"
            bodyClassName="min-h-0 flex-1 lg:overflow-y-auto"
          >
            {moves.length ? (
              <ul className="-my-1 divide-y divide-white/5">
                {moves.map((mv, i) => (
                  <li key={i} className="flex items-start gap-3 py-1.5 text-sm">
                    <span
                      className={`mt-0.5 w-5 shrink-0 text-center ${mv.type === "trade" ? "text-fuchsia-300" : mv.type === "waiver" ? "text-cyan-300" : "text-slate-400"}`}
                      title={mv.type}
                    >
                      {mv.type === "trade"
                        ? "⇄"
                        : mv.type === "waiver"
                          ? "⊕"
                          : "+"}
                    </span>
                    <span
                      className={`min-w-0 flex-1 ${mv.teams.includes(myId) ? "text-cyan-100" : "text-slate-300"}`}
                    >
                      {mv.text}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      W{mv.week}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                No adds, drops or trades yet.
              </p>
            )}
          </Panel>
        </div>
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
                <tr
                  key={n.team.rosterId}
                  className={n.team.rosterId === myId ? "bg-cyan-400/10" : ""}
                >
                  <td className="font-medium text-slate-100">
                    {n.team.teamName}
                  </td>
                  {(["QB", "RB", "WR", "TE"] as const).map((p) => (
                    <td key={p}>
                      <StrengthCell rank={n.ranks[p]} of={model.teams.length} />
                    </td>
                  ))}
                  <td className="text-rose-300">{n.needs.join(", ") || "-"}</td>
                  <td className="text-lime-300">
                    {n.surplus.join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rest-of-season starter strength by position (1 = strongest), from season-long usage and production blended with FantasyPros
          rest-of-season rankings and the trade market, with long injuries discounted. A need means that team&apos;s starters are clearly below the
          league&apos;s typical team there. Target teams whose needs match your surplus.
        </p>
      </Panel>
    </div>
  );
}

function StrengthCell({ rank, of }: { rank: number; of: number }) {
  const tone =
    rank <= of / 3
      ? "text-lime-300"
      : rank > (2 * of) / 3
        ? "text-rose-300"
        : "text-slate-300";
  return <span className={`font-mono ${tone}`}>{rank}</span>;
}
