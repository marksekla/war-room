"use client";

// Injury recap for the week that just finished: fantasy-relevant players who got hurt in their games,
// whether they came back, their status now, what they did before leaving and who took over.

import { useMemo, useState } from "react";
import type { InjuryRecapItem, LeagueModel } from "@/lib/model";
import { usePlayerDrawer } from "./PlayerDrawer";
import { Empty, Panel, PosTag } from "./ui";

const STATUS_STYLE: Record<string, string> = {
  OUT: "bg-bad/10 text-bad",
  IR: "bg-bad/10 text-bad",
  D: "bg-bad/10 text-bad",
  Q: "bg-warn/10 text-warn",
  Active: "bg-good/10 text-good",
};
const STATUS_LABEL: Record<string, string> = { OUT: "Out", IR: "IR", D: "Doubtful", Q: "Questionable", Active: "Active" };
const EXIT_STYLE: Record<string, string> = {
  "Didn't return": "text-bad",
  "Q to return": "text-warn",
  "Hurt in game": "text-warn",
  "Left early": "text-warn",
  Injured: "text-warn",
  Returned: "text-good",
};

export default function InjuryRecap({ model, myId }: { model: LeagueModel; myId: number }) {
  const weeks = useMemo(() => model.reviewWeeks(), [model]);
  const [week, setWeek] = useState<number>(weeks[0] ?? model.week - 1);
  const [scope, setScope] = useState<"all" | "rostered" | "mine">("all");
  const items = useMemo(() => model.injuryRecap(week), [model, week]);
  const shown = items.filter((x) => (scope === "all" ? true : scope === "mine" ? x.v.ownerRosterId === myId : x.v.ownerRosterId != null));
  const mineFirst = [...shown].sort((a, b) => Number(b.v.ownerRosterId === myId) - Number(a.v.ownerRosterId === myId));

  if (!weeks.length) return <Empty>No games have been played yet this season.</Empty>;

  return (
    <div className="space-y-4">
      <Panel
        title={`Week ${week} injury recap`}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium sm:w-fit">
            {(
              [
                ["all", `All (${items.length})`],
                ["rostered", "On rosters"],
                ["mine", "My team"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setScope(k)}
                className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 sm:flex-none ${scope === k ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">From in-game news, post-game updates and snap counts. Status is live.</p>
        </div>
      </Panel>

      {!mineFirst.length ? (
        <Panel>
          <Empty>{scope === "all" ? `No fantasy-relevant in-game injuries found for week ${week}.` : "None of these players got hurt."}</Empty>
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {mineFirst.map((x) => (
            <RecapCard key={x.v.p.id} x={x} model={model} myId={myId} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecapCard({ x, model, myId }: { x: InjuryRecapItem; model: LeagueModel; myId: number }) {
  const { open } = usePlayerDrawer();
  const mine = x.v.ownerRosterId === myId;
  const pct = (n: number | null) => (n == null ? null : `${Math.round(n * 100)}%`);
  const accent = x.status === "OUT" || x.status === "IR" || x.status === "D" ? "bg-bad" : x.status === "Q" ? "bg-warn" : "bg-good";
  return (
    <article className={`panel relative overflow-hidden p-4 pl-5 ${mine ? "ring-1 ring-inset ring-accent/40" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <PosTag pos={x.v.p.pos} />
            <button type="button" onClick={() => open(x.v.p.id)} className="truncate text-left font-display text-[15px] font-semibold text-ink hover:underline">
              {x.v.p.name}
            </button>
          </div>
          <div className="mt-1 text-xs text-muted">
            {x.team} · {mine ? <span className="font-medium text-accentstrong">Your team</span> : model.ownerName(x.v.p.id)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`inline-block rounded-md px-2 py-1 text-[11px] font-semibold ${STATUS_STYLE[x.status]}`}>{STATUS_LABEL[x.status]}</span>
          <div className={`mt-1 text-[11px] font-semibold ${EXIT_STYLE[x.exit] ?? "text-muted"}`}>{x.exit}</div>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px]">
        {x.injury && (
          <>
            <dt className="text-muted">Injury</dt>
            <dd className="text-ink">{x.injury}</dd>
          </>
        )}
        <dt className="text-muted">Before exit</dt>
        <dd className="text-ink">
          {x.line}
          {x.snapShare != null && x.snapShare > 0 && (
            <span className="text-muted">
              {" "}
              · {pct(x.snapShare)} snaps{x.usualSnapShare != null && x.usualSnapShare >= 0.05 ? ` (usually ${pct(x.usualSnapShare)})` : ""}
            </span>
          )}
        </dd>
        {x.nextUp && (
          <>
            <dt className="text-muted">Next up</dt>
            <dd className="min-w-0">
              {x.nextUp.v ? (
                <button type="button" onClick={() => open(x.nextUp!.v!.p.id)} className="font-medium text-ink hover:underline">
                  {x.nextUp.name}
                </button>
              ) : (
                <span className="font-medium text-ink">{x.nextUp.name}</span>
              )}
              <span className="text-muted"> · {x.nextUp.line}</span>
              {x.nextUp.v && x.nextUp.v.ownerRosterId == null && <span className="ml-1.5 rounded bg-good/10 px-1.5 py-[2px] text-[10px] font-semibold text-good">Available</span>}
            </dd>
          </>
        )}
      </dl>
      {x.note && <p className="mt-3 line-clamp-3 border-t border-linesoft pt-3 text-xs leading-relaxed text-muted">{x.note}</p>}
    </article>
  );
}
