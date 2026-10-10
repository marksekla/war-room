"use client";

import { useMemo, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { Delta, InjuryTag, Meter, Panel, PosTag, RankChip, Stat } from "./ui";
import { PlayerName, usePlayerDrawer } from "./PlayerDrawer";
import { IconAlert, IconChevronRight, IconInfo, IconSparkles, IconSwitch, IconTrendUp, IconUserPlus } from "./icons";

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
  const moves = useMemo(() => model.recentMoves(15), [model]);

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
          valueClass={me.wins > me.losses ? "text-good" : me.wins < me.losses ? "text-bad" : "text-ink"}
          sub={
            <>
              <span className={`font-semibold ${rankTone(rank, model.teams.length)}`}>#{rank}</span> of {model.teams.length}
              {myOdds ? (
                <>
                  {" · "}
                  <span className={`font-semibold ${pctTone(myOdds.playoffPct, 60, 35)}`}>{myOdds.playoffPct}%</span> to make playoffs
                </>
              ) : (
                " in standings"
              )}
            </>
          }
        />
        <Stat
          label="Points for"
          value={me.pf.toFixed(1)}
          sub={
            <>
              <span className={`font-semibold ${rankTone(pfRank, model.teams.length)}`}>#{pfRank}</span> in league
            </>
          }
          tone="violet"
        />
        <Stat
          label={`Week ${model.week} projection`}
          value={lineupNow.total.toFixed(1)}
          valueClass="text-accentstrong"
          sub={
            h2h ? (
              <>
                vs {h2h.opponent.teamName} {h2h.oppProj.toFixed(1)}
                {" · "}
                <span className={`font-semibold ${pctTone(h2h.winProb, 55, 45)}`}>{h2h.winProb}%</span> to win
              </>
            ) : (
              "Best lineup, matchup-adjusted"
            )
          }
          tone="lime"
        />
        <Stat
          label="Waiver priority"
          value={me.waiverPosition ?? "-"}
          valueClass={
            me.waiverPosition == null
              ? "text-ink"
              : rankTone(me.waiverPosition, model.teams.length)
          }
          sub={
            myNeeds?.needs.length ? (
              <>
                Biggest need: <span className="font-semibold text-warn">{myNeeds.needs.join(", ")}</span>
              </>
            ) : (
              <span className="text-good">No glaring hole</span>
            )
          }
          tone="amber"
        />
      </div>

      {todo.length > 0 && (
        <Panel title={`Week ${model.week} to-do`}>
          <ul className="-my-1 divide-y divide-linesoft">
            {todo.map((t, i) => {
              const chip = {
                rose: { cls: "bg-bad/10 text-bad", Icon: IconAlert },
                amber: { cls: "bg-warn/10 text-warn", Icon: IconInfo },
                lime: { cls: "bg-good/10 text-good", Icon: IconTrendUp },
                cyan: { cls: "bg-accenttint text-accent", Icon: IconSparkles },
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
                    className="group flex w-full items-start gap-3 py-2.5 text-left text-sm text-ink"
                  >
                    <span className={`mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md ${chip.cls}`}>
                      <chip.Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug group-enabled:group-hover:text-accentstrong">{t.text}</span>
                    {act && <IconChevronRight size={16} className="mt-0.5 shrink-0 text-faint group-hover:text-accent" />}
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
          <span className="hidden text-[11px] text-muted sm:inline">
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
                <span className="hidden font-mono text-[10px] text-muted sm:block">
                  {x.total.toFixed(0)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-t-[3px] transition ${
                      playoff ? "bg-purple" : "bg-accent"
                    } ${on ? "opacity-100" : "opacity-50 group-hover:opacity-80"}`}
                    style={{
                      height: `${Math.max(8, ((x.total - floor) / (hi - floor)) * 100)}%`,
                    }}
                  />
                </div>
                <span
                  className={`font-mono text-[10px] ${problem ? "text-warn" : on ? "text-ink" : "text-muted"} ${on ? "font-semibold" : ""}`}
                >
                  {x.week}
                </span>
              </button>
            );
          })}
        </div>
        {picked && (
          <div className="mt-3 rounded-lg border border-line bg-sunken px-3 py-2 text-sm">
            <span className="font-display font-semibold text-ink">
              Week {picked.week}
            </span>
            <span className="ml-2 font-mono text-accentstrong">
              {picked.total.toFixed(1)} pts
            </span>
            {picked.week >= model.playoffStart && (
              <span className="ml-2 text-xs text-purple">Playoffs</span>
            )}
            <div className="mt-1 text-xs text-muted">
              {picked.missing.length || picked.weak.length ? (
                <>
                  {picked.missing.length > 0 && (
                    <span className="text-warn">
                      Missing: {picked.missing.join(", ")}.{" "}
                    </span>
                  )}
                  {picked.weak.length > 0 && (
                    <span className="text-bad">
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
        <p className="mt-2 text-xs text-muted">
          Amber weeks have starters on bye or hurt. Purple bars are playoff weeks.
        </p>
      </Panel>

      <Panel title="Roster intel" corners>
        <div className="-mx-4 sm:-mx-5 overflow-x-auto">
          <table className="tbl">
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
                        <span className="hidden text-xs text-muted sm:inline">
                          {v.p.team}
                        </span>
                        <InjuryTag status={v.p.injury} />
                        {starterIds.has(v.p.id) && (
                          <span className="hidden rounded bg-accenttint px-1.5 py-[2px] text-[10px] font-semibold text-accentstrong sm:inline">
                            Starter
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mhide font-mono text-muted">
                      {v.bye ?? "-"}
                    </td>
                    <td className="mhide font-mono">{v.ppg.toFixed(1)}</td>
                    <td className="font-mono">{v.last3.toFixed(1)}</td>
                    <td className="font-mono text-accentstrong">
                      {model.gameFor(v.p.team, model.week) ? model.projection(v.p.id).toFixed(1) : "-"}
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
                        <span className="text-xs text-warn">BYE</span>
                      )}
                    </td>
                    <td className="mhide">
                      <Delta value={v.vorp} />
                    </td>
                    <td className="font-mono font-semibold text-ink">
                      {v.rosPoints.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
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
              <span className="hidden text-[11px] text-muted sm:inline">
                Simulated {(4000).toLocaleString()}x
              </span>
            ) : undefined
          }
        >
          <ul className="-my-1 divide-y divide-linesoft">
            {odds && (
              <li className="flex items-center gap-3 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
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
                  ? "text-good"
                  : o.playoffPct <= 25
                    ? "text-bad"
                    : "text-ink";
              return (
                <li
                  key={t.rosterId}
                  className={`flex items-center gap-3 rounded px-1 py-1.5 text-sm ${t.rosterId === myId ? "bg-accenttint" : ""}`}
                >
                  <span className="w-5 text-right font-mono text-xs text-muted">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-ink">
                      {t.teamName}
                    </span>
                    <span className="ml-2 hidden text-xs text-muted lg:inline">
                      {t.ownerName}
                    </span>
                  </span>
                  <span className="w-10 text-right font-mono text-ink">
                    {t.wins}-{t.losses}
                  </span>
                  <span
                    className={`${odds ? "hidden sm:inline" : ""} w-14 text-right font-mono text-muted`}
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
                      <span className="w-11 text-right font-mono text-purple">
                        {o.titlePct}%
                      </span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {odds && (
            <p className="mt-3 text-xs text-muted">
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
                <span className="text-[11px] text-muted">
                  Last {moves.length} moves
                </span>
              ) : undefined
            }
            className="flex flex-col lg:absolute lg:inset-0"
            bodyClassName="min-h-0 flex-1 lg:overflow-y-auto"
          >
            {moves.length ? (
              <ul className="-my-1 divide-y divide-linesoft">
                {moves.map((mv, i) => (
                  <li key={i} className="flex items-start gap-3 py-1.5 text-sm">
                    <span
                      className={`mt-0.5 grid w-5 shrink-0 place-items-center ${mv.type === "trade" ? "text-purple" : mv.type === "waiver" ? "text-accentstrong" : "text-muted"}`}
                      title={mv.type}
                    >
                      {mv.type === "trade" ? <IconSwitch size={16} /> : <IconUserPlus size={16} />}
                    </span>
                    <span
                      className={`min-w-0 flex-1 ${mv.teams.includes(myId) ? "text-accentstrong" : "text-ink2"}`}
                    >
                      {mv.text}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      W{mv.week}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted">
                No adds, drops or trades yet.
              </p>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Trade market: every team's needs">
        <div className="-mx-4 sm:-mx-5 overflow-x-auto">
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
                  className={n.team.rosterId === myId ? "bg-accenttint" : ""}
                >
                  <td className="font-medium text-ink">
                    {n.team.teamName}
                  </td>
                  {(["QB", "RB", "WR", "TE"] as const).map((p) => (
                    <td key={p}>
                      <StrengthCell rank={n.ranks[p]} of={model.teams.length} pts={n.strength[p]} />
                    </td>
                  ))}
                  <td className="text-bad">{n.needs.join(", ") || "-"}</td>
                  <td className="text-good">
                    {n.surplus.join(", ") || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Rank by position (1 = strongest) with that group&apos;s rest-of-season points per week in grey. Each group counts the starters that spot
          needs (QB1, RB1-2, WR1-2, TE1) plus the next backups at partial weight, since flex spots, byes and injuries put depth on the field.
          Player values blend season-long usage and scoring with FantasyPros rest-of-season rankings and the trade market, and players on IR count
          from the week they&apos;re due back. A need means that group is clearly below the league&apos;s typical team.
        </p>
      </Panel>
    </div>
  );
}

/** Top third of the league green, middle amber, bottom third red. 1 = best. */
function rankTone(rank: number, of: number) {
  return rank <= Math.ceil(of / 3) ? "text-good" : rank > of - Math.ceil(of / 3) ? "text-bad" : "text-warn";
}

/** Percent at or above `hi` green, at or below `lo` red, in between amber. */
function pctTone(pct: number, hi: number, lo: number) {
  return pct >= hi ? "text-good" : pct <= lo ? "text-bad" : "text-warn";
}

function StrengthCell({ rank, of, pts }: { rank: number; of: number; pts?: number }) {
  const tone =
    rank <= of / 3
      ? "text-good"
      : rank > (2 * of) / 3
        ? "text-bad"
        : "text-ink2";
  return (
    <span className="whitespace-nowrap">
      <span className={`font-mono ${tone}`}>{rank}</span>
      {pts != null && <span className="ml-1.5 font-mono text-[10px] text-muted">{pts.toFixed(0)}</span>}
    </span>
  );
}
