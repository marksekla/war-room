"use client";

import { useMemo, useRef, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import type { Position } from "@/lib/types";
import { useLeague } from "@/lib/LeagueContext";
import { Delta, Empty, InjuryTag, Panel, PosTag } from "./ui";
import { usePlayerDrawer } from "./PlayerDrawer";
import { IconLock, IconSparkles, IconSwitch, IconUnlock } from "./icons";

const POS_ORDER: Record<string, number> = { QB: 0, RB: 1, WR: 2, TE: 3, K: 4, DEF: 5 };

export default function Trades({ model, myId, askAgent }: { model: LeagueModel; myId: number; askAgent: (p: string) => void }) {
  // Side A defaults to your team, but any two teams can be compared.
  const [sideA, setSideA] = useState<number>(myId);
  const others = model.teams.filter((t) => t.rosterId !== sideA);
  const [partnerId, setPartnerId] = useState<number>(model.teams.find((t) => t.rosterId !== myId)?.rosterId ?? 0);
  const [give, setGive] = useState<string[]>([]);
  const [get, setGet] = useState<string[]>([]);
  const [metric, setMetric] = useState<"ros" | "week">("ros");

  const me = model.team(sideA)!;
  const isMe = sideA === myId;
  const partner = partnerId !== sideA ? model.team(partnerId) : undefined;
  const aName = isMe ? "you" : me.teamName;
  const profile = useMemo(() => (partner && model.activity ? model.managerProfile(partner.rosterId) : null), [model, partner]);

  const score = (v: PlayerView) => (metric === "ros" ? v.rosPoints : model.expected(v.p.id, model.week));
  const sortRoster = (ids: string[]) =>
    ids
      .map((id) => model.view(id))
      .filter(Boolean)
      .sort((a, b) => POS_ORDER[a!.p.pos] - POS_ORDER[b!.p.pos] || score(b!) - score(a!)) as PlayerView[];
  const label = (v: PlayerView) => {
    const back = model.returnWeek.get(v.p.id);
    const tag = back != null && back > model.week ? (back > 18 ? "out for season · " : `back W${back} · `) : "";
    return metric === "ros" ? `${tag}${v.rosPoints.toFixed(0)} ROS` : `${score(v).toFixed(1)} WK${model.week}`;
  };

  const result = useMemo(
    () => (give.length && get.length && partner ? model.evaluateTrade(sideA, partnerId, give, get) : null),
    [model, sideA, partnerId, give, get, partner]
  );

  const impact = useMemo(
    () => (give.length && get.length && partner ? model.tradePlayoffImpact(sideA, partnerId, give, get) : null),
    [model, sideA, partnerId, give, get, partner]
  );

  const toggle = (list: string[], set: (x: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const names = (ids: string[]) => ids.map((id) => model.view(id)?.p.name).join(" + ");
  const maxAbs = result ? Math.max(1, ...result.perWeek.map((w) => Math.abs(w.me))) : 1;
  const { saved, setSaved } = useLeague();
  const locked = saved.untouchables ?? [];
  const toggleLock = (id: string) =>
    setSaved({ untouchables: locked.includes(id) ? locked.filter((x) => x !== id) : [...locked, id] });
  const simRef = useRef<HTMLDivElement>(null);

  const loadIdea = (pid: number, g: string[], gt: string[]) => {
    setSideA(myId);
    setPartnerId(pid);
    setGive(g);
    setGet(gt);
    setTimeout(() => simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="space-y-6">
      <TradeFinder model={model} myId={myId} locked={locked} onLoad={loadIdea} askAgent={askAgent} />

      {/* Pick any two teams: side A defaults to yours. */}
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <TeamSelect
          label={isMe ? "Your side" : "Team A"}
          value={sideA}
          teams={model.teams}
          myId={myId}
          onChange={(id) => {
            setSideA(id);
            setGive([]);
            if (id === partnerId) {
              setPartnerId(model.teams.find((t) => t.rosterId !== id)?.rosterId ?? 0);
              setGet([]);
            }
          }}
        />
        <button
          className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center self-center rounded-lg border border-line bg-card text-ink2 transition hover:border-accent/50 hover:text-accent sm:self-auto"
          title="Swap sides"
          aria-label="Swap sides"
          onClick={() => {
            const a = sideA;
            setSideA(partnerId);
            setPartnerId(a);
            setGive(get);
            setGet(give);
          }}
        >
          <IconSwitch size={18} className="rotate-90 sm:rotate-0" />
        </button>
        <TeamSelect
          label="Trade partner"
          value={partnerId}
          teams={others}
          myId={myId}
          onChange={(id) => {
            setPartnerId(id);
            setGet([]);
          }}
        />
        <div className="flex items-center justify-end gap-2 sm:ml-auto">
          {(give.length > 0 || get.length > 0) && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setGive([]);
                setGet([]);
              }}
            >
              Clear
            </button>
          )}
          {!isMe && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSideA(myId);
                setGive([]);
                if (partnerId === myId) {
                  setPartnerId(model.teams.find((t) => t.rosterId !== myId)?.rosterId ?? 0);
                  setGet([]);
                }
              }}
            >
              Back to my team
            </button>
          )}
          <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium" role="group" aria-label="Show points for">
            {(["ros", "week"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMetric(k)}
                className={`rounded-md px-2.5 py-1 ${metric === k ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
                title={k === "ros" ? "Projected points for the rest of the season" : `Projected points this week (week ${model.week})`}
              >
                {k === "ros" ? "ROS" : `Wk ${model.week}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {profile && <p className="-mt-3 text-xs text-muted">{profile.summary}</p>}

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <RosterPicker
          title={isMe ? `You send (${me.teamName})` : `${me.teamName} sends`}
          players={sortRoster(model.rosterAll(sideA))}
          selected={give}
          onToggle={(id) => toggle(give, setGive, id)}
          tone="rose"
          label={label}
          locked={isMe ? locked : undefined}
          onLock={isMe ? toggleLock : undefined}
        />
        <RosterPicker
          title={isMe ? `You get (${partner?.teamName ?? ""})` : `${partner?.teamName ?? ""} sends`}
          players={sortRoster(partner ? model.rosterAll(partner.rosterId) : [])}
          selected={get}
          onToggle={(id) => toggle(get, setGet, id)}
          tone="lime"
          label={label}
        />
      </div>

      <div ref={simRef} className="scroll-mt-24" />
      <Panel title="Simulation" corners>
        {!result ? (
          <Empty>Pick at least one player on each side to simulate the trade week by week.</Empty>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
              <Big
                label={isMe ? "Verdict" : `Verdict for ${me.teamName}`}
                value={isMe ? result.verdict : result.verdict.replace(" for you", "")}
                tone={/win/i.test(result.verdict) ? "lime" : /loss/i.test(result.verdict) ? "rose" : "cyan"}
                sub={
                  impact ? (
                    <>
                      Playoffs {impact.before.playoffPct}% → <span className="font-mono text-ink">{impact.after.playoffPct}%</span> · Title{" "}
                      {impact.before.titlePct}% → <span className="font-mono text-ink">{impact.after.titlePct}%</span>
                    </>
                  ) : undefined
                }
              />
              <Big
                label={isMe ? "Your lineup, rest of season" : `${me.teamName} lineup, rest of season`}
                value={<Delta value={result.myDelta} suffix=" pts" />}
                sub={<>Avg <Delta value={result.perWeekAvg} suffix=" / week" /></>}
              />
              <Big label="Next 3 weeks / playoffs" value={<span><Delta value={result.myNearDelta} /> / <Delta value={result.myPlayoffDelta} /></span>} />
              <Big
                label={isMe ? "They accept?" : `${partner?.teamName ?? "They"} accepts?`}
                value={result.acceptance}
                sub={
                  <>
                    Their lineup: <Delta value={result.theirPerWeekAvg} suffix=" / wk" />
                    {result.fillsTheirNeed ? " · fills a need" : ""}
                  </>
                }
                tone={result.acceptance === "Likely" ? "lime" : result.acceptance === "Coin flip" ? "cyan" : "rose"}
              />
            </div>

            <div>
              <div className="hud-title mb-3">Week by week ({isMe ? "your" : `${me.teamName}'s`} lineup change)</div>
              <div className="flex h-32 items-center gap-1.5">
                {result.perWeek.map((w) => (
                  <div key={w.week} className="flex h-full flex-1 flex-col items-center" title={`Week ${w.week}: ${w.me > 0 ? "+" : ""}${w.me}`}>
                    <div className="flex h-1/2 w-full items-end">
                      {w.me > 0 && <div className="w-full rounded-t bg-good/80" style={{ height: `${(w.me / maxAbs) * 100}%` }} />}
                    </div>
                    <div className="flex h-1/2 w-full items-start">
                      {w.me < 0 && <div className="w-full rounded-b bg-bad/80" style={{ height: `${(-w.me / maxAbs) * 100}%` }} />}
                    </div>
                    <span className={`font-mono text-[10px] ${w.week >= model.playoffStart ? "text-purple" : "text-muted"}`}>{w.week}</span>
                  </div>
                ))}
              </div>
            </div>

            {(result.market || result.expert) && (
              <div className="grid gap-3 rounded-lg border border-line bg-sunken p-3 text-sm md:grid-cols-3">
                <div>
                  <div className="hud-title mb-1.5">Trade market (FantasyCalc)</div>
                  {result.market ? (
                    <div className="font-mono text-muted">
                      Send <span className="text-bad">{result.market.give.toLocaleString()}</span> · Get{" "}
                      <span className="text-good">{result.market.get.toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="text-muted">No market values</div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="hud-title mb-1.5">Experts (FantasyPros ROS)</div>
                  {result.expert ? (
                    <div className="space-y-0.5 text-xs">
                      <div className="truncate text-muted">
                        Send: {result.expert.give.map((x) => `${x.name} ${x.rank}`).join(", ")}
                      </div>
                      <div className="truncate text-muted">
                        Get: {result.expert.get.map((x) => `${x.name} ${x.rank}`).join(", ")}
                      </div>
                    </div>
                  ) : (
                    <div className="text-muted">Not ranked</div>
                  )}
                </div>
                <div>
                  <div className="hud-title mb-1.5">Fair?</div>
                  {result.consensusRatio != null ? (
                    <div className={result.consensusRatio > 1.25 ? "text-bad" : result.consensusRatio < 0.8 ? "text-warn" : "text-good"}>
                      {result.consensusRatio > 1.25
                        ? "You overpay on value"
                        : result.consensusRatio >= 1.08
                          ? "You pay a little more"
                          : result.consensusRatio >= 0.92
                            ? "Fair on value"
                            : result.consensusRatio >= 0.8
                              ? "You get a little more"
                              : "Lopsided in your favor"}
                      <span className="block text-[11px] text-muted">Market and expert rankings combined</span>
                    </div>
                  ) : (
                    <div className="text-muted">-</div>
                  )}
                </div>
              </div>
            )}

            {!isMe && (
              <p className="-mb-2 text-xs text-muted">
                Seen from {me.teamName}&apos;s side: below, &quot;you&quot; means {me.teamName} and &quot;they&quot; means {partner?.teamName}.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="hud-title mb-2">Why</div>
                <ul className="space-y-1.5 text-sm text-ink2">
                  {result.reasons.map((f, i) => (
                    <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current opacity-60" /><span>{f}</span></li>
                  ))}
                </ul>
              </div>
              {result.flags.length > 0 && (
                <div>
                  <div className="hud-title mb-2 !text-warn">Watch out</div>
                  <ul className="space-y-1.5 text-sm text-warn/90">
                    {result.flags.map((f, i) => (
                      <li key={i} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current opacity-60" /><span>{f}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-xs text-muted">
              The simulator plays out every remaining week with your best lineup, counts depth for injuries and byes, and weighs playoff weeks 1.5x. Player values blend usage, projections, FantasyPros rest-of-season consensus and the trade market. Breaking news can still move things, so ask the AI before you send it.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn btn-violet"
                onClick={() =>
                  askAgent(
                    isMe
                      ? `Analyze this trade like an expert: I give ${names(give)} to ${partner?.teamName} and get ${names(get)}. ` +
                          `Use evaluate_trade, then check news and get_player for every player involved (injuries, role, usage trend, schedule), my roster fit and depth, byes, the playoff schedule, my strategy rules (players I won't trade, selling low), and the other manager's needs and trade habits. ` +
                          `Tell me if I should accept, and if not, suggest a fair counter they would actually accept.`
                      : `Grade this trade between two other teams like an expert: ${me.teamName} sends ${names(give)} to ${partner?.teamName} for ${names(get)}. ` +
                          `Use evaluate_trade with fromTeam "${me.teamName}", check news and roles for every player, and both teams' needs and depth. Who won it, by how much, and how does it change the league race and my own path?`
                  )
                }
              >
                <IconSparkles size={16} />
                Ask the AI agent for a full breakdown
              </button>
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
  locked,
  onLock,
}: {
  title: string;
  players: PlayerView[];
  selected: string[];
  onToggle: (id: string) => void;
  tone: "rose" | "lime";
  label: (v: PlayerView) => string;
  locked?: string[];
  onLock?: (id: string) => void;
}) {
  const sel = tone === "rose" ? "border-bad/60 bg-bad/10" : "border-good/60 bg-good/10";
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
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${on ? sel : "border-transparent hover:bg-hover"}`}
            >
              <PosTag pos={v.p.pos} />
              <span className="flex min-w-0 flex-1 items-center">
                <span className="min-w-0 truncate font-medium text-ink">{v.p.name}</span>
                <span className="ml-1.5 hidden text-xs text-muted sm:inline">{v.p.team}</span>
                <InjuryTag status={v.p.injury} />
              </span>
              {(() => {
                // "back W6 · 165 ROS": the return week goes on its own small line so names keep their room on phones.
                const parts = label(v).split(" · ");
                return (
                  <span className="shrink-0 text-right font-mono text-xs leading-tight text-muted">
                    {parts.length > 1 && <span className="block text-[10px] text-warn">{parts.slice(0, -1).join(" · ")}</span>}
                    {parts[parts.length - 1]}
                  </span>
                );
              })()}
              {onLock && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={locked?.includes(v.p.id) ? `Unlock ${v.p.name}` : `Never offer ${v.p.name}`}
                  title={locked?.includes(v.p.id) ? "Locked: never offered in trade ideas" : "Lock: never offer him in trade ideas"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLock(v.p.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onLock(v.p.id);
                    }
                  }}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                    locked?.includes(v.p.id) ? "border-warn/60 text-warn" : "border-line text-faint hover:text-ink2"
                  }`}
                >
                  {locked?.includes(v.p.id) ? <IconLock size={13} strokeWidth={2} /> : <IconUnlock size={13} />}
                </span>
              )}
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
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line text-[11px] text-muted hover:border-accent/50 hover:text-accentstrong"
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
  const t = { cyan: "text-accentstrong", lime: "text-good", rose: "text-bad" }[tone];
  return (
    <div className="rounded-lg border border-line bg-sunken p-3">
      <div className="hud-title">{label}</div>
      <div className={`mt-1 font-display text-lg font-semibold ${t}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

const NEEDS: (Position | "ANY")[] = ["ANY", "RB", "WR", "TE", "QB"];

type Idea = ReturnType<LeagueModel["findTradesWith"]>[number];

function TradeFinder({
  model,
  myId,
  locked,
  onLoad,
  askAgent,
}: {
  model: LeagueModel;
  myId: number;
  locked: string[];
  onLoad: (partnerId: number, give: string[], get: string[]) => void;
  askAgent: (p: string) => void;
}) {
  const [need, setNeed] = useState<Position | "ANY">("ANY");
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const runId = useRef(0);
  const name = (id: string) => model.view(id)?.p.name ?? id;

  const scan = () => {
    const id = ++runId.current;
    const partners = model.teams.filter((t) => t.rosterId !== myId);
    const found: Idea[] = [];
    setIdeas(null);
    setProgress(0);
    // One team per tick keeps the page responsive on phones.
    const step = (i: number) => {
      if (id !== runId.current) return;
      if (i >= partners.length) {
        setIdeas(found.sort((a, b) => b.score - a.score).slice(0, 8));
        setProgress(null);
        return;
      }
      found.push(...model.findTradesWith(myId, partners[i].rosterId, need, locked));
      setProgress((i + 1) / partners.length);
      setTimeout(() => step(i + 1), 0);
    };
    setTimeout(() => step(0), 0);
  };

  return (
    <Panel
      title="Trade finder"
      right={
        locked.length > 0 ? (
          <span className="flex items-center gap-1 text-[11px] text-warn"><IconLock size={12} strokeWidth={2} /> {locked.map(name).join(", ")}</span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-muted">Tap <IconUnlock size={12} /> on your players to lock them</span>
        )
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Find me</span>
        <div className="flex rounded-lg border border-line bg-card p-0.5 text-xs font-medium">
          {NEEDS.map((n) => (
            <button
              key={n}
              onClick={() => setNeed(n)}
              className={`rounded-md px-2.5 py-1 ${need === n ? "bg-accent font-semibold text-[#ffffff]" : "text-muted hover:text-ink"}`}
            >
              {n === "ANY" ? "Any upgrade" : n}
            </button>
          ))}
        </div>
        <button className="btn ml-auto" onClick={scan} disabled={progress != null}>
          {progress != null ? `Scanning ${Math.round(progress * 100)}%` : "Scan the league"}
        </button>
      </div>
      {ideas && !ideas.length && (
        <p className="mt-4 text-sm text-muted">
          No fair deals found that clearly help you at {need === "ANY" ? "any position" : need}. Try another position or unlock someone.
        </p>
      )}
      {ideas && ideas.length > 0 && (
        <ul className="mt-4 divide-y divide-linesoft">
          {ideas.map((i, k) => {
            const r = i.result;
            const partner = model.team(i.partnerId);
            return (
              <li key={k} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="text-ink">
                    <span className="text-bad">{i.give.map(name).join(" + ")}</span>
                    <span className="mx-2 text-muted">for</span>
                    <span className="text-good">{i.get.map(name).join(" + ")}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {partner?.teamName} · <Delta value={r.perWeekAvg} suffix="/wk" /> · playoffs <Delta value={r.myPlayoffDelta} /> · {r.acceptance} to accept
                    {r.theirPerWeekAvg > 0.2 ? ` · helps them too (+${r.theirPerWeekAvg.toFixed(1)}/wk)` : ""}
                    {r.consensusRatio != null ? ` · ${r.consensusRatio <= 1.08 && r.consensusRatio >= 0.92 ? "fair value" : r.consensusRatio > 1.08 ? "you pay a bit more" : "you get a bit more"}` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" onClick={() => onLoad(i.partnerId, i.give, i.get)}>
                    Simulate
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      askAgent(
                        `Check this trade idea: I give ${i.give.map(name).join(" + ")} to ${partner?.teamName} for ${i.get
                          .map(name)
                          .join(" + ")}. Use evaluate_trade, check news and roles for every player, my roster fit, and their needs and trade habits. Should I send it, tweak it, or skip it?`
                      )
                    }
                  >
                    <IconSparkles size={15} />
                    Ask AI
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!ideas && progress == null && (
        <p className="mt-3 text-xs text-muted">
          Scans every team for rest-of-season deals both sides would take: your lineup improves, theirs doesn&apos;t get worse, and the
          value is fair by trade market and FantasyPros expert rankings. Each idea runs through the full week-by-week simulator.
        </p>
      )}
    </Panel>
  );
}

function TeamSelect({
  label,
  value,
  teams,
  myId,
  onChange,
}: {
  label: string;
  value: number;
  teams: { rosterId: number; teamName: string; ownerName: string; wins: number; losses: number }[];
  myId: number;
  onChange: (id: number) => void;
}) {
  return (
    <label className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:max-w-sm sm:flex-1">
      <span className="hud-title">{label}</span>
      <select className="input w-full" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {teams.map((t) => (
          <option key={t.rosterId} value={t.rosterId} className="bg-card">
            {t.teamName} ({t.ownerName}) {t.wins}-{t.losses}
            {t.rosterId === myId ? " · you" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
