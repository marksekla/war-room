"use client";

// Weekly usage splits: who got each team's backfield work (running back carries plus targets) and
// who got the targets in every game of a finished week, with each player's change from his own
// average share earlier in the season. Built from Sleeper's live box-score stats.

import { useMemo, useState } from "react";
import { fmtKick, type LeagueModel, type UsageGame, type UsageRow, type UsageTeam } from "@/lib/model";
import { usePlayerDrawer } from "./PlayerDrawer";
import { Empty, Panel } from "./ui";
import { TEAM_NAMES } from "./DepthCharts";

// Series colors, readable on both themes. "Other" is always the neutral gray.
const COLORS = ["rgb(var(--t-accent))", "rgb(var(--t-warn))", "rgb(var(--t-good))", "#ec4899", "rgb(var(--t-purple))"];
const OTHER = "rgb(var(--t-faint))";

export default function UsageSplits({ model, myId }: { model: LeagueModel; myId: number }) {
  const weeks = useMemo(() => model.reviewWeeks(), [model]);
  const [week, setWeek] = useState<number>(weeks[0] ?? model.week - 1);
  const [team, setTeam] = useState("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const games = useMemo(() => model.usageSplits(week), [model, week]);
  const mine = useMemo(() => new Set(model.team(myId)?.players ?? []), [model, myId]);

  const teams = useMemo(
    () => games.flatMap((g) => [g.away.team, g.home.team]).sort((a, b) => (TEAM_NAMES[a] ?? a).localeCompare(TEAM_NAMES[b] ?? b)),
    [games]
  );
  const hasMine = (g: UsageGame) => [g.away, g.home].some((t) => [...t.backfield, ...t.targets].some((r) => r.id && mine.has(r.id)));
  const shown = games.filter((g) => (team === "ALL" || g.away.team === team || g.home.team === team) && (!mineOnly || hasMine(g)));

  if (!weeks.length) return <Empty>No games have been played yet this season.</Empty>;

  return (
    <div className="space-y-4">
      <Panel
        title={`Week ${week} usage splits`}
        right={
          weeks.length > 1 ? (
            <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium">
              {[...weeks].sort((a, b) => a - b).map((w) => (
                <button
                  key={w}
                  onClick={() => setWeek(w)}
                  className={`rounded-md px-2.5 py-1 ${week === w ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
                >
                  Week {w}
                  {w === model.week ? " so far" : ""}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select className="input sm:w-64" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Team">
            <option value="ALL">All {games.length} games</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {TEAM_NAMES[t] ?? t}
              </option>
            ))}
          </select>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink2">
            <button
              type="button"
              role="switch"
              aria-checked={mineOnly}
              onClick={() => setMineOnly(!mineOnly)}
              className={`relative h-5 w-9 shrink-0 rounded-full transition ${mineOnly ? "bg-good" : "bg-track ring-1 ring-inset ring-linestrong"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#ffffff] shadow transition-all ${mineOnly ? "left-[18px]" : "left-0.5"}`} />
            </button>
            Games with my players
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Backfield is running back carries plus targets. <span className="text-good">▲</span>
          <span className="text-bad">▼</span> is the change in his share from his average in earlier games this season. Your players are in
          blue. Tap a name for the player card.
        </p>
      </Panel>

      {!shown.length && <Empty>No games match.</Empty>}
      {shown.map((g) => (
        <GameCard key={`${g.away.team}-${g.home.team}`} g={g} mine={mine} />
      ))}
    </div>
  );
}

function GameCard({ g, mine }: { g: UsageGame; mine: Set<string> }) {
  const a = g.away.score, h = g.home.score;
  const final = a != null && h != null;
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-linesoft px-4 py-3 sm:px-5">
        <div className="flex items-baseline gap-2 font-display text-[15px] font-semibold">
          <span className={final && a! > h! ? "text-good" : "text-ink"}>
            {g.away.team} {a ?? ""}
          </span>
          <span className="text-faint">@</span>
          <span className={final && h! > a! ? "text-good" : "text-ink"}>
            {g.home.team} {h ?? ""}
          </span>
        </div>
        <span className="text-xs text-muted">{fmtKick(g.kickoff)}</span>
      </header>
      <div className="divide-y divide-linesoft">
        <TeamBlock t={g.away} mine={mine} />
        <TeamBlock t={g.home} mine={mine} />
      </div>
    </section>
  );
}

function TeamBlock({ t, mine }: { t: UsageTeam; mine: Set<string> }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accenttint text-[10px] font-semibold text-accentstrong">{t.team}</span>
        <span className="font-display text-sm font-semibold text-ink">{TEAM_NAMES[t.team] ?? t.team}</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
        <Split title="Backfield" unit="car + tgt" total={t.backfieldTotal} rows={t.backfield} mine={mine} kind="bf" />
        <Split title="Targets" unit="targets" total={t.targetTotal} rows={t.targets} mine={mine} kind="tg" />
      </div>
    </div>
  );
}

function Split({ title, unit, total, rows, mine, kind }: { title: string; unit: string; total: number; rows: UsageRow[]; mine: Set<string>; kind: "bf" | "tg" }) {
  const { open } = usePlayerDrawer();
  const color = (r: UsageRow, i: number) => (r.id ? COLORS[i % COLORS.length] : OTHER);
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</div>
      {!rows.length ? (
        <p className="text-sm text-faint">No {kind === "bf" ? "running back touches" : "targets"} recorded.</p>
      ) : (
        <div className="flex items-start gap-4">
          <Donut segments={rows.map((r, i) => ({ v: r.share, c: color(r, i) }))} total={total} unit={unit} />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {rows.map((r, i) => {
              const isMine = !!r.id && mine.has(r.id);
              return (
                <li key={r.id ?? "other"} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color(r, i) }} />
                  <div className="min-w-0 flex-1">
                    {r.id ? (
                      <button
                        type="button"
                        onClick={() => open(r.id!)}
                        className={`block max-w-full truncate text-left text-[13px] font-medium hover:underline ${isMine ? "text-accentstrong" : "text-ink"}`}
                      >
                        <span className="sm:hidden">{r.short}</span>
                        <span className="hidden sm:inline">{r.name}</span>
                      </button>
                    ) : (
                      <span className="block truncate text-[13px] font-medium text-muted">{r.name}</span>
                    )}
                    <span className="block truncate text-[11px] text-muted">
                      {kind === "bf" ? `${r.car} car · ${r.tgt} tgt` : `${r.tgt} tgt`}
                      {r.id && (kind === "bf" ? r.rz : r.rzTgt) > 0 ? ` · ${kind === "bf" ? r.rz : r.rzTgt} RZ` : ""}
                    </span>
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[13px] font-semibold text-ink">{Math.round(r.share * 100)}%</span>
                  <span
                    className={`w-11 shrink-0 text-right font-mono text-[11px] ${r.delta == null || r.delta === 0 ? "text-faint" : r.delta > 0 ? "text-good" : "text-bad"}`}
                    title={r.delta == null ? "No earlier games to compare" : "Change from his average share in earlier games"}
                  >
                    {r.delta == null ? "" : r.delta === 0 ? "0%" : `${r.delta > 0 ? "▲" : "▼"}${Math.abs(r.delta)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Donut({ segments, total, unit }: { segments: { v: number; c: string }[]; total: number; unit: string }) {
  const size = 84, stroke = 13, r = (size - stroke) / 2, circ = 2 * Math.PI * r;
  const sum = segments.reduce((a, s) => a + s.v, 0) || 1;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "rgb(var(--t-track))" }} strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.v / sum) * circ;
          const gap = segments.length > 1 ? Math.min(1.5, len / 3) : 0;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              style={{ stroke: s.c }}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${circ}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-display text-lg font-semibold leading-none text-ink">{total}</div>
          <div className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">{unit}</div>
        </div>
      </div>
    </div>
  );
}
