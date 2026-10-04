"use client";

import { useMemo, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { Delta, Empty, InjuryTag, Panel, PosTag } from "./ui";
import { usePlayerDrawer } from "./PlayerDrawer";

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

export default function Trades({ model, myId, askAgent }: { model: LeagueModel; myId: number; askAgent: (p: string) => void }) {
  const others = model.teams.filter((t) => t.rosterId !== myId);
  const [partnerId, setPartnerId] = useState<number>(others[0]?.rosterId ?? 0);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [metric, setMetric] = useState<"ros" | "week">("ros");

  const me = model.team(myId)!;
  const partner = model.team(partnerId);
  const profile = useMemo(() => (partner && model.activity ? model.managerProfile(partner.rosterId) : null), [model, partner]);

  const score = (v: PlayerView) => (metric === "ros" ? v.rosPoints : model.expected(v.p.id, model.week));
  const sortRoster = (ids: string[]) =>
    ids
      .map((id) => model.view(id))
      .filter(Boolean)
      .sort((a, b) => POS_ORDER[a!.p.pos] - POS_ORDER[b!.p.pos] || score(b!) - score(a!)) as PlayerView[];
  const label = (v: PlayerView) => (metric === "ros" ? `${v.rosPoints.toFixed(0)} ROS` : `${score(v).toFixed(1)} WK${model.week}`);

  const result = useMemo(
    () => (give.length && get.length && partner ? model.evaluateTrade(myId, partnerId, give, get) : null),
    [model, myId, partnerId, give, get, partner]
  );

  const toggle = (list: string[], set: (x: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const names = (ids: string[]) => ids.map((id) => model.view(id)?.p.name).join(" + ");
  const maxAbs = result ? Math.max(1, ...result.perWeek.map((w) => Math.abs(w.me))) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="hud-title">Trade partner</span>
        <select
          className="input w-full sm:w-auto"
          value={partnerId}
          onChange={(e) => {
            setPartnerId(Number(e.target.value));
            setGet([]);
          }}
        >
          {others.map((t) => (
            <option key={t.rosterId} value={t.rosterId} className="bg-slate-900">
              {t.teamName} ({t.ownerName}) {t.wins}-{t.losses}
            </option>
          ))}
        </select>
        {(give.length > 0 || get.length > 0) && (
          <button className="btn btn-ghost" onClick={() => { setGive([]); setGet([]); }}>Clear</button>
        )}
        <div className="ml-auto flex rounded-lg border border-white/10 p-0.5 font-mono text-xs" role="group" aria-label="Show points for">
          {(["ros", "week"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setMetric(k)}
              className={`rounded-md px-2.5 py-1 ${metric === k ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400 hover:text-slate-100"}`}
              title={k === "ros" ? "Projected points for the rest of the season" : `Projected points this week (week ${model.week})`}
            >
              {k === "ros" ? "ROS" : `Wk ${model.week}`}
            </button>
          ))}
        </div>
      </div>

      {profile && <p className="-mt-3 text-xs text-slate-400">{profile.summary}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <RosterPicker title={`You send (${me.teamName})`} players={sortRoster(me.players)} selected={give} onToggle={(id) => toggle(give, setGive, id)} tone="rose" label={label} />
        <RosterPicker title={`You get (${partner?.teamName ?? ""})`} players={sortRoster(partner?.players ?? [])} selected={get} onToggle={(id) => toggle(get, setGet, id)} tone="lime" label={label} />
      </div>

      <Panel title="Simulation" corners>
        {!result ? (
          <Empty>Pick at least one player on each side to simulate the trade week by week.</Empty>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              <Big label="Verdict" value={result.verdict} tone={result.myDelta > 3 ? "lime" : result.myDelta < -3 ? "rose" : "cyan"} />
              <Big label="Your lineup, rest of season" value={<Delta value={result.myDelta} suffix=" pts" />} />
              <Big label="Next 3 weeks / playoffs" value={<span><Delta value={result.myNearDelta} /> / <Delta value={result.myPlayoffDelta} /></span>} />
              <Big
                label="They accept?"
                value={result.acceptance}
                sub={<>Their lineup: <Delta value={result.theirDelta} suffix=" pts" /></>}
                tone={result.acceptance === "Likely" ? "lime" : result.acceptance === "Coin flip" ? "cyan" : "rose"}
              />
            </div>

            <div>
              <div className="hud-title mb-3">Week by week (your lineup change)</div>
              <div className="flex h-32 items-center gap-1.5">
                {result.perWeek.map((w) => (
                  <div key={w.week} className="flex h-full flex-1 flex-col items-center" title={`Week ${w.week}: ${w.me > 0 ? "+" : ""}${w.me}`}>
                    <div className="flex h-1/2 w-full items-end">
                      {w.me > 0 && <div className="w-full rounded-t bg-lime-400/70 shadow-[0_0_8px_#a3ff12]" style={{ height: `${(w.me / maxAbs) * 100}%` }} />}
                    </div>
                    <div className="flex h-1/2 w-full items-start">
                      {w.me < 0 && <div className="w-full rounded-b bg-rose-400/70 shadow-[0_0_8px_#ff4d6d]" style={{ height: `${(-w.me / maxAbs) * 100}%` }} />}
                    </div>
                    <span className={`font-mono text-[10px] ${w.week >= model.playoffStart ? "text-fuchsia-300" : "text-slate-500"}`}>{w.week}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.market && (
              <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-sm">
                <div className="hud-title mb-2">Market value check (FantasyCalc)</div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono">
                  <span className="text-slate-400">
                    You send <span className="text-rose-300">{result.market.give.toLocaleString()}</span>
                  </span>
                  <span className="text-slate-400">
                    You get <span className="text-lime-300">{result.market.get.toLocaleString()}</span>
                  </span>
                  <span className="text-xs text-slate-500">
                    {result.market.ratio >= 1.1 ? "They come out ahead on value" : result.market.ratio >= 0.9 ? "Fair by market value" : "You come out ahead on value"}
                  </span>
                </div>
              </div>
            )}

            {(result.flags.length > 0 || result.myDrops.length > 0 || result.theirDrops.length > 0) && (
              <ul className="space-y-1.5 text-sm text-slate-300">
                {result.flags.map((f, i) => (
                  <li key={i}>• {f}</li>
                ))}
                {result.myDrops.length > 0 && <li>• You would need to drop: {names(result.myDrops)}</li>}
                {result.theirDrops.length > 0 && <li>• They would need to drop: {names(result.theirDrops)}</li>}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-violet"
                onClick={() =>
                  askAgent(
                    `Analyze this trade like an expert: I give ${names(give)} to ${partner?.teamName} and get ${names(get)}. ` +
                      `Use evaluate_trade, then check current injury news, roles and usage for every player involved, my roster fit, byes, and the playoff schedule. ` +
                      `Tell me if I should accept, and if not, suggest a fair counter they would actually accept.`
                  )
                }
              >
                ✦ Ask the AI agent for a full breakdown
              </button>
              <span className="text-xs text-slate-500">The simulator handles the math. The agent adds news, injury history and negotiation.</span>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function RosterPicker({
  title,
  players,
  selected,
  onToggle,
  tone,
  label,
}: {
  title: string;
  players: PlayerView[];
  selected: string[];
  onToggle: (id: string) => void;
  tone: "rose" | "lime";
  label: (v: PlayerView) => string;
}) {
  const sel = tone === "rose" ? "border-rose-400/60 bg-rose-500/10" : "border-lime-400/60 bg-lime-500/10";
  const { open } = usePlayerDrawer();
  return (
    <Panel title={title}>
      <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
        {players.map((v) => {
          const on = selected.includes(v.p.id);
          return (
            <button
              key={v.p.id}
              onClick={() => onToggle(v.p.id)}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${on ? sel : "border-transparent hover:bg-white/5"}`}
            >
              <PosTag pos={v.p.pos} />
              <span className="font-medium text-slate-100">{v.p.name}</span>
              <span className="text-xs text-slate-500">{v.p.team}</span>
              <InjuryTag status={v.p.injury} />
              <span className="ml-auto whitespace-nowrap font-mono text-xs text-slate-400">{label(v)}</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Open ${v.p.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  open(v.p.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    open(v.p.id);
                  }
                }}
                className="grid h-6 w-6 place-items-center rounded-full border border-white/10 text-[11px] text-slate-400 hover:border-cyan-300/50 hover:text-cyan-200"
              >
                i
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function Big({ label, value, sub, tone = "cyan" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "cyan" | "lime" | "rose" }) {
  const t = { cyan: "text-cyan-200", lime: "text-lime-300", rose: "text-rose-300" }[tone];
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="hud-title">{label}</div>
      <div className={`mt-1 font-display text-lg font-bold ${t}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
