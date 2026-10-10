"use client";

// Waiver cheat sheet in the FantasyPros style: expert consensus ranks by position for this week or
// the rest of the season, with every player marked as yours, available or taken.

import { useMemo, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import type { Position } from "@/lib/types";
import { InjuryTag, Panel } from "./ui";
import { usePlayerDrawer } from "./PlayerDrawer";

const OFFENSE: Position[] = ["QB", "RB", "WR", "TE"];
const OTHER: Position[] = ["K", "DEF"];
const ALL: Position[] = [...OFFENSE, ...OTHER];
const PAGE = 40;

type Row = { v: PlayerView; rank: number; mine: boolean; open: boolean };

function shortName(v: PlayerView) {
  if (v.p.pos === "DEF") return `${v.p.team} DEF`;
  const parts = v.p.name.split(" ");
  if (parts.length < 2) return v.p.name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

export default function CheatSheet({ model, myId }: { model: LeagueModel; myId: number }) {
  const [span, setSpan] = useState<"week" | "ros">("week");
  const [hideTaken, setHideTaken] = useState(false);
  const [group, setGroup] = useState<"offense" | "other">("offense");
  const [mobilePos, setMobilePos] = useState<Position>("RB");
  const [limit, setLimit] = useState(PAGE);

  const weeklyReady = useMemo(() => [...model.views.values()].some((v) => v.ecrWeek != null), [model]);
  const useSpan = span === "week" && !weeklyReady ? "ros" : span;

  // Ordinal positional ranks from the consensus average rank, like the FantasyPros cheat sheet.
  const byPos = useMemo(() => {
    const out = new Map<Position, Row[]>();
    for (const pos of ALL) out.set(pos, []);
    for (const v of model.views.values()) {
      if (!v.p.team) continue;
      const score = useSpan === "week" ? v.ecrWeek : v.ecrRos;
      if (score == null) continue;
      const list = out.get(v.p.pos as Position);
      if (!list) continue;
      list.push({ v, rank: score, mine: v.ownerRosterId === myId, open: v.ownerRosterId == null });
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.rank - b.rank);
      list.forEach((r, i) => (r.rank = i + 1));
    }
    return out;
  }, [model, myId, useSpan]);

  const visible = (pos: Position) => {
    const rows = byPos.get(pos) ?? [];
    return (hideTaken ? rows.filter((r) => r.mine || r.open) : rows).slice(0, limit);
  };

  const counts = useMemo(() => {
    let mine = 0, open = 0;
    for (const rows of byPos.values()) for (const r of rows.slice(0, PAGE)) (r.mine ? mine++ : r.open ? open++ : 0);
    return { mine, open };
  }, [byPos]);

  const cols = group === "offense" ? OFFENSE : OTHER;
  const more = ALL.some((p) => (hideTaken ? (byPos.get(p) ?? []).filter((r) => r.mine || r.open) : byPos.get(p) ?? []).length > limit);

  return (
    <Panel
      title="Waiver cheat sheet"
      right={
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium" role="group" aria-label="Rankings for">
            {(["week", "ros"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSpan(k)}
                disabled={k === "week" && !weeklyReady}
                className={`rounded-md px-2.5 py-1 disabled:opacity-40 ${useSpan === k ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
              >
                {k === "week" ? `Week ${model.week}` : "ROS"}
              </button>
            ))}
          </div>
          <Toggle on={hideTaken} onChange={setHideTaken} label="Hide taken" />
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-accent/25 ring-1 ring-inset ring-accent/40" /> Yours ({counts.mine})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-good/20 ring-1 ring-inset ring-good/40" /> Available ({counts.open})
        </span>
        {!hideTaken && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-track ring-1 ring-inset ring-line" /> Taken
          </span>
        )}
        <span className="basis-full sm:ml-auto sm:basis-auto">
          FantasyPros expert consensus, {useSpan === "week" ? `week ${model.week}` : "rest of season"}
          {model.nfl?.ecr?.date ? ` · updated ${new Date(model.nfl.ecr.date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
          {!weeklyReady && span === "week" ? ` (week ${model.week} ranks aren't out yet)` : ""}
        </span>
      </div>

      {/* Phones: one position at a time */}
      <div className="md:hidden">
        <div className="-mx-1 mb-3 flex overflow-x-auto px-1">
          <div className="flex w-full rounded-lg border border-line bg-card p-0.5 text-xs font-medium">
            {ALL.map((p) => (
              <button
                key={p}
                onClick={() => setMobilePos(p)}
                className={`flex-1 rounded-md px-2 py-1.5 ${mobilePos === p ? "bg-accent font-semibold text-[#ffffff]" : "text-muted"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <List rows={visible(mobilePos)} full model={model} />
      </div>

      {/* Tablets and up: columns side by side */}
      <div className="hidden md:block">
        <div className="mb-3 flex w-fit rounded-lg border border-line bg-card p-0.5 text-xs font-medium">
          {(["offense", "other"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-md px-3 py-1 ${group === g ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
            >
              {g === "offense" ? "QB · RB · WR · TE" : "K · DEF"}
            </button>
          ))}
        </div>
        <div className={`grid gap-4 ${cols.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2"}`}>
          {cols.map((p) => (
            <div key={p} className="min-w-0">
              <div className="mb-2 px-1 font-display text-sm font-semibold text-ink">{p}</div>
              <List rows={visible(p)} model={model} />
            </div>
          ))}
        </div>
      </div>

      {more && (
        <div className="mt-4 flex justify-center">
          <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        </div>
      )}
    </Panel>
  );
}

function List({ rows, full = false, model }: { rows: Row[]; full?: boolean; model: LeagueModel }) {
  const { open } = usePlayerDrawer();
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted">No ranked players.</p>;
  return (
    <ol className="space-y-1">
      {rows.map((r) => {
        const tone = r.mine ? "bg-accent/20 hover:bg-accent/30" : r.open ? "bg-good/[0.13] hover:bg-good/25" : "hover:bg-hover";
        return (
          <li key={r.v.p.id}>
            <button
              type="button"
              onClick={() => open(r.v.p.id)}
              title={r.mine ? "Your team" : r.open ? "Available" : `Taken: ${model.ownerName(r.v.p.id)}`}
              className={`flex w-full items-center gap-2.5 rounded-md px-2 py-[7px] text-left text-sm transition ${tone}`}
            >
              <span className="w-7 shrink-0 text-right font-mono text-xs text-muted">{r.rank}.</span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center">
                  <span className={`truncate font-medium ${r.mine || r.open ? "text-ink" : "text-ink2"}`}>{full ? r.v.p.name : shortName(r.v)}</span>
                  {r.v.p.pos !== "DEF" && <span className="ml-1.5 shrink-0 text-xs text-muted">{r.v.p.team}</span>}
                  <InjuryTag status={r.v.p.injury} />
                </span>
                {full && !r.mine && !r.open && <span className="block truncate text-[11px] text-faint">{model.ownerName(r.v.p.id)}</span>}
              </span>
              {full && (r.mine || r.open) && (
                <span className={`shrink-0 text-[11px] font-semibold ${r.mine ? "text-accentstrong" : "text-good"}`}>{r.mine ? "Yours" : "Available"}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex shrink-0 cursor-pointer select-none items-center gap-2 text-xs font-medium text-ink2">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 rounded-full transition ${on ? "bg-good" : "bg-track ring-1 ring-inset ring-linestrong"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#ffffff] shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
