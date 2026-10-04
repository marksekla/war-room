"use client";

// Slide-over player card. Click any player name in the app to open it.
// It holds the deep data (advanced usage, practice reports, team environment,
// market value, news) so the tables can stay clean.

import { createContext, useContext, useEffect, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { fetchNews, fetchWeather, weatherNote } from "@/lib/live";
import type { NewsItem, NflUsage, Weather } from "@/lib/types";
import { InjuryTag, PosTag, RankChip } from "./ui";

interface DrawerCtx {
  open: (id: string) => void;
}
const Ctx = createContext<DrawerCtx>({ open: () => {} });
export const usePlayerDrawer = () => useContext(Ctx);

export function PlayerDrawerProvider({
  model,
  askAgent,
  children,
}: {
  model: LeagueModel | null;
  askAgent: (p: string) => void;
  children: React.ReactNode;
}) {
  const [id, setId] = useState<string | null>(null);
  const v = id && model ? model.view(id) : null;

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setId(null);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [id]);

  return (
    <Ctx.Provider value={{ open: setId }}>
      {children}
      {v && model && (
        <Drawer
          model={model}
          v={v}
          onClose={() => setId(null)}
          onAsk={(q) => {
            setId(null);
            askAgent(q);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

/** A player's name that opens the player card. */
export function PlayerName({ v, className = "" }: { v: PlayerView; className?: string }) {
  const { open } = usePlayerDrawer();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(v.p.id);
      }}
      className={`truncate text-left font-medium text-slate-100 underline-offset-4 hover:text-cyan-200 hover:underline ${className}`}
    >
      {v.p.name}
    </button>
  );
}

const pct = (x: number | null | undefined) => (x == null ? "-" : `${Math.round(Math.max(0, x) * 100)}%`);
const n1 = (x: number | null | undefined) => (x == null ? "-" : x.toFixed(1));

function Drawer({ model, v, onClose, onAsk }: { model: LeagueModel; v: PlayerView; onClose: () => void; onAsk: (q: string) => void }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsErr, setNewsErr] = useState(false);
  const [wx, setWx] = useState<Weather | null>(null);

  useEffect(() => {
    setNews(null);
    setNewsErr(false);
    if (v.p.espnId) {
      fetchNews(v.p.espnId)
        .then(setNews)
        .catch(() => setNewsErr(true));
    }
    if (v.p.team) {
      fetchWeather(model.week)
        .then((w) => setWx(w[v.p.team!] ?? null))
        .catch(() => setWx(null));
    }
  }, [v.p.id, v.p.espnId, v.p.team, model.week]);

  const a = v.adv;
  const env = model.teamEnv(v.p.team);
  const pr = a?.prac && a.prac.w >= model.week - 1 ? a.prac : null;
  const isRec = v.p.pos === "WR" || v.p.pos === "TE" || v.p.pos === "RB";
  const isRB = v.p.pos === "RB";
  const isQB = v.p.pos === "QB";
  const owner = model.ownerName(v.p.id);
  const wn = weatherNote(wx);

  const rows: [string, (u: NflUsage) => string, string?][] = [
    ["Snap share", (u) => pct(u.snap)],
    ...(isRec
      ? ([
          ["Target share", (u) => pct(u.tgtSh)],
          ["First-read share", (u) => pct(u.frSh), "Share of the team's targets where he was the QB's first read (FTN)"],
        ] as [string, (u: NflUsage) => string, string?][])
      : []),
    ...(isRec && !isRB
      ? ([
          ["Air yards share", (u) => pct(u.airSh)],
          ["WOPR", (u) => (u.wopr == null ? "-" : u.wopr.toFixed(2)), "Weighted opportunity: target share + air yards share"],
        ] as [string, (u: NflUsage) => string, string?][])
      : []),
    ...(isRB || isQB ? ([["Carry share", (u) => pct(u.carSh)]] as [string, (u: NflUsage) => string][]) : []),
    ["Red zone share", (u) => pct(u.rzSh), "Share of the team's targets + carries inside the 20"],
    ...(isRB ? ([["Goal-line carries", (u) => String(u.glC)]] as [string, (u: NflUsage) => string][]) : []),
    ["Expected pts (xFP)", (u) => n1(u.xfp), "Expected PPR points per game from his opportunity"],
    ["Actual PPR pts", (u) => n1(u.fp)],
  ];

  const luck = a?.s?.fp != null && a.s.xfp != null ? a.s.fp - a.s.xfp : null;
  const weeks = model.remainingWeeks().slice(0, 6);
  const maxPts = Math.max(1, ...(a?.wk ?? []).slice(-8).map((w) => Math.max(w[6] ?? 0, w[5] ?? 0)));

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="h-full w-full overflow-y-auto border-l border-cyan-400/20 bg-[#070912] px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-[0_0_40px_rgba(34,228,255,0.15)] sm:w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-start gap-3 border-b border-cyan-400/10 bg-[#070912] px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <PosTag pos={v.p.pos} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-display text-lg font-bold text-slate-100">
              <span className="truncate">{v.p.name}</span>
              <InjuryTag status={v.p.injury} />
            </div>
            <div className="text-xs text-slate-400">
              {v.p.team ?? "FA"}
              {v.p.age ? ` · ${v.p.age} yrs` : ""}
              {v.bye ? ` · bye ${v.bye}` : ""} · {owner}
            </div>
          </div>
          <button className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-300 hover:bg-white/10" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Key numbers */}
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Value / game" value={v.valuePg.toFixed(1)} sub={`${v.vorp > 0 ? "+" : ""}${v.vorp.toFixed(1)} over repl.`} />
          <Tile
            label="ROS pts"
            value={v.rosPoints.toFixed(0)}
            sub={
              v.projNext != null ? (
                <span title={`Sleeper ${v.projSleeper ?? "-"} · ESPN ${v.projEspn ?? "-"}`}>
                  Wk {model.week} proj {v.projNext.toFixed(1)}
                  {v.projSleeper != null && v.projEspn != null && (
                    <span className="block text-[10px] text-slate-500">
                      SLP {v.projSleeper.toFixed(1)} · ESPN {v.projEspn.toFixed(1)}
                    </span>
                  )}
                </span>
              ) : (
                "No projection"
              )
            }
          />
          <Tile
            label="Market"
            value={v.market ? `#${v.market.rank}` : "-"}
            sub={
              v.market ? (
                <span>
                  {v.p.pos}
                  {v.market.posRank}{" "}
                  {v.market.trend !== 0 && (
                    <span className={v.market.trend > 0 ? "text-lime-300" : "text-rose-300"}>
                      {v.market.trend > 0 ? "▲" : "▼"}
                      {Math.abs(v.market.trend)}
                    </span>
                  )}
                </span>
              ) : (
                "Not in top values"
              )
            }
          />
        </div>

        {/* Health */}
        {(v.p.injury || pr || v.espn || model.roleShift.get(v.p.id)) && (
          <Section title="Health and role">
            <div className="space-y-1.5 text-sm">
              {model.returnWeek.get(v.p.id) != null && (
                <div className="text-amber-200">
                  Expected back:{" "}
                  {model.returnWeek.get(v.p.id)! > 18 ? "not this season" : `Week ${model.returnWeek.get(v.p.id)}`}
                  {v.espn?.returnDate ? "" : " (estimate)"}
                </div>
              )}
              {model.roleShift.get(v.p.id) && (
                <div className="text-rose-300">
                  Role likely shrinks from Week {model.roleShift.get(v.p.id)!.fromWeek} when {model.roleShift.get(v.p.id)!.by} returns. His
                  projections are lowered from then.
                </div>
              )}
              {pr && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400">Week {pr.w} practice</span>
                  <PracChip st={pr.st} />
                  {pr.inj && <span className="text-slate-300">{pr.inj}</span>}
                  {pr.rep && <span className="text-amber-300">· {pr.rep}</span>}
                  {pr.wks >= 3 && !/rest|not injury/i.test(pr.inj ?? "") && (
                    <span className="rounded border border-rose-400/40 px-1.5 text-[10px] text-rose-300">ON REPORT {pr.wks} WKS</span>
                  )}
                </div>
              )}
              {v.espn && (
                <div className="text-slate-300">
                  <span className="text-slate-400">ESPN: </span>
                  {v.espn.status}
                  {v.espn.short ? ` · ${v.espn.short}` : ""}
                  {v.espn.returnDate ? ` · est. return ${new Date(v.espn.returnDate).toLocaleDateString()}` : ""}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Usage */}
        {a?.s ? (
          <Section title={`Usage · nflverse through week ${model.nfl?.throughWeek ?? "?"}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="pb-1 font-normal" />
                  <th className="pb-1 text-right font-normal">Season</th>
                  <th className="pb-1 text-right font-normal">Last 3</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fn, tip]) => (
                  <tr key={label} className="border-t border-white/5">
                    <td className="py-1.5 text-slate-400" title={tip}>
                      {label}
                    </td>
                    <td className="py-1.5 text-right font-mono text-slate-100">{fn(a.s!)}</td>
                    <td className="py-1.5 text-right font-mono text-cyan-200">{a.l3 ? fn(a.l3) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {luck != null && Math.abs(luck) >= 2 && (
              <p className={`mt-2 text-xs ${luck > 0 ? "text-amber-200" : "text-lime-300"}`}>
                {luck > 0
                  ? `Scoring ${luck.toFixed(1)} PPR pts/game above his expected points. Some of that is efficiency or TD luck that may cool off.`
                  : `Scoring ${Math.abs(luck).toFixed(1)} PPR pts/game below his expected points. The opportunity is there, so a bounce-back is likely.`}
              </p>
            )}

            {/* Weekly bars: PPR points (number on top) with the expected-points line. Numbers are always visible, no hover needed. */}
            {a.wk.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
                  <span>{a.wk.length > 8 ? "Last 8 games" : "Week by week"}</span>
                  <span>
                    <span className="text-cyan-300">■</span> PPR pts <span className="ml-2 text-fuchsia-300">━</span> expected
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex w-9 shrink-0 flex-col justify-end text-[9px] uppercase tracking-wider text-slate-500">
                    <span className="flex h-6 items-end pb-0.5">Pts</span>
                    <span className="h-20" />
                    <span className="mt-1 h-3.5 leading-[14px]">Wk</span>
                    <span className="h-3.5 leading-[14px] text-fuchsia-300/80">xFP</span>
                    <span className="h-3.5 leading-[14px]">Snap</span>
                  </div>
                  {a.wk.slice(-8).map(([w, snap, , , , xfp, fp]) => (
                    <div key={w} className="flex min-w-0 flex-1 flex-col items-center">
                      <span className="flex h-6 items-end pb-0.5 font-mono text-[11px] font-semibold text-slate-100">{fp != null ? fp.toFixed(1) : "-"}</span>
                      <div className="relative flex h-20 w-full items-end">
                        <div className="w-full rounded-t bg-cyan-400/60" style={{ height: `${((fp ?? 0) / maxPts) * 100}%` }} />
                        {xfp != null && (
                          <div className="absolute inset-x-0 h-0.5 bg-fuchsia-400 shadow-[0_0_6px_#e879f9]" style={{ bottom: `${(xfp / maxPts) * 100}%` }} />
                        )}
                      </div>
                      <span className="mt-1 h-3.5 font-mono text-[10px] leading-[14px] text-slate-400">{w}</span>
                      <span className="h-3.5 font-mono text-[10px] leading-[14px] text-fuchsia-300/90">{xfp != null ? xfp.toFixed(1) : "-"}</span>
                      <span className="h-3.5 font-mono text-[10px] leading-[14px] text-slate-500">{snap != null ? `${Math.round(snap * 100)}%` : "-"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {a.ngs && Object.keys(a.ngs).length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
                {a.ngs.sep != null && <Chip label="Separation" value={`${a.ngs.sep} yd`} />}
                {a.ngs.yacoe != null && <Chip label="YAC over exp" value={`${a.ngs.yacoe > 0 ? "+" : ""}${a.ngs.yacoe}`} />}
                {a.s.adot != null && isRec && !isRB && <Chip label="aDOT" value={`${a.s.adot}`} />}
                {a.ngs.ryoe != null && <Chip label="Rush yds over exp/att" value={`${a.ngs.ryoe > 0 ? "+" : ""}${a.ngs.ryoe}`} />}
                {a.ngs.box8 != null && <Chip label="8+ in box" value={`${Math.round(a.ngs.box8)}%`} />}
                {a.ngs.cpoe != null && <Chip label="CPOE" value={`${a.ngs.cpoe > 0 ? "+" : ""}${a.ngs.cpoe}`} />}
                {a.ngs.ttt != null && <Chip label="Time to throw" value={`${a.ngs.ttt}s`} />}
              </div>
            )}
          </Section>
        ) : (
          v.p.pos !== "DEF" &&
          v.p.pos !== "K" && <p className="mt-6 text-xs text-slate-500">No advanced usage yet (no snaps this season, or data not loaded).</p>
        )}

        {/* Team environment */}
        {env && (
          <Section title={`${v.p.team} offense`}>
            <div className="grid grid-cols-3 gap-2">
              <EnvTile label="Neutral pass rate" value={`${n1(env.npr)}%`} rank={env.rk?.npr} />
              <EnvTile label="Pass rate over exp" value={`${env.proe != null && env.proe > 0 ? "+" : ""}${n1(env.proe)}%`} rank={env.rk?.proe} tip="League average is about -2%" />
              <EnvTile label="Pace (sec/play)" value={n1(env.pace)} rank={env.rk?.pace} />
              <EnvTile label="Points / game" value={n1(env.ppg)} rank={env.rk?.ppg} />
              <EnvTile label="Red zone trips" value={n1(env.rzPg)} rank={env.rk?.rzPg} />
              <EnvTile label="QB goal-line rush" value={env.qbGl == null ? "-" : `${Math.round(env.qbGl)}%`} tip="Share of carries inside the 5 taken by the QB" />
            </div>
          </Section>
        )}

        {/* Schedule */}
        {v.p.team && (
          <Section title="Next games">
            <div className="flex flex-wrap gap-1.5">
              {weeks.map((w) => {
                const g = model.gameFor(v.p.team, w);
                const d = g ? model.dvp.get(g.opp)?.get(v.p.pos) : undefined;
                return (
                  <div key={w} className="rounded border border-white/10 px-2 py-1 text-center font-mono text-[11px]">
                    <div className="text-slate-500">W{w}</div>
                    {g ? (
                      <div className="flex items-center gap-1 text-slate-200">
                        {g.home ? "" : "@"}
                        {g.opp} <RankChip rank={d?.rank} />
                      </div>
                    ) : (
                      <div className="text-amber-300">BYE</div>
                    )}
                  </div>
                );
              })}
            </div>
            <ThisWeek model={model} v={v} />
            {wn && (
              <p className={`mt-2 text-xs ${wn.severe ? "text-amber-300" : "text-slate-400"}`}>
                Week {model.week} forecast: {wn.label}
              </p>
            )}
          </Section>
        )}

        {/* News */}
        {v.p.espnId && (
          <Section title="Latest news">
            {!news && !newsErr && <p className="text-xs text-slate-500">Loading...</p>}
            {newsErr && <p className="text-xs text-slate-500">News is unavailable right now.</p>}
            {news && !news.length && <p className="text-xs text-slate-500">No recent news.</p>}
            <ul className="space-y-3">
              {news?.slice(0, 4).map((n, i) => (
                <li key={i} className="text-sm">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    {n.published ? new Date(n.published).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                    {n.source ? ` · ${n.source}` : ""}
                  </div>
                  <div className="text-slate-200">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noreferrer" className="hover:text-cyan-200 hover:underline">
                        {n.headline}
                      </a>
                    ) : (
                      n.headline
                    )}
                  </div>
                  {n.story && n.story !== n.headline && <div className="mt-0.5 line-clamp-3 text-xs text-slate-400">{n.story}</div>}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <button
          className="btn btn-violet mt-6 w-full justify-center"
          onClick={() =>
            onAsk(
              `Give me a full outlook on ${v.p.name} (${v.p.pos}, ${v.p.team ?? "FA"}): role and usage trend, injury and practice status, offense environment, schedule, and whether I should buy, sell, hold, start or add him. Check his latest news first.`
            )
          }
        >
          ✦ Ask the AI about {v.p.name.split(" ").slice(-1)[0]}
        </button>
      </aside>
    </div>
  );
}

function ThisWeek({ model, v }: { model: LeagueModel; v: PlayerView }) {
  const g = model.gameFor(v.p.team, model.week);
  if (!g) return null;
  const ctx = model.gameContext(v.p.team, model.week);
  const dOut = model.unitOut(g.opp, "def");
  const olOut = model.unitOut(v.p.team, "ol");
  const restGap = ctx?.rest != null && ctx.oppRest != null ? ctx.rest - ctx.oppRest : 0;
  const lines = [
    dOut.length ? { tone: "text-lime-300", text: `${g.opp} defense missing: ${dOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}` } : null,
    olOut.length ? { tone: "text-rose-300", text: `${v.p.team} O-line missing: ${olOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}` } : null,
    ctx && (Math.abs(restGap) >= 3 || ctx.divisional || ctx.neutralSite)
      ? {
          tone: "text-slate-400",
          text: [
            ctx.rest != null && Math.abs(restGap) >= 3 ? `${ctx.rest} days rest vs ${ctx.oppRest}` : null,
            ctx.divisional ? "divisional game" : null,
            ctx.neutralSite ? `neutral site${ctx.stadium ? ` (${ctx.stadium})` : ""}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
  ].filter(Boolean) as { tone: string; text: string }[];
  if (!lines.length) return null;
  return (
    <div className="mt-2 space-y-1 text-xs">
      {lines.map((l, i) => (
        <p key={i} className={l.tone}>
          Week {model.week}: {l.text}
        </p>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="hud-title mb-2">{title}</h3>
      {children}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold neon-text">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function EnvTile({ label, value, rank, tip }: { label: string; value: string; rank?: number; tip?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2" title={tip}>
      <div className="text-[10px] leading-tight text-slate-500">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-sm text-slate-100">
        {value}
        {rank != null && <span className={`text-[10px] ${rank <= 8 ? "text-lime-300" : rank >= 25 ? "text-rose-300" : "text-slate-500"}`}>#{rank}</span>}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-white/10 bg-black/30 px-2 py-1">
      <span className="text-slate-500">{label} </span>
      <span className="font-mono text-slate-100">{value}</span>
    </span>
  );
}

export function PracChip({ st }: { st: "DNP" | "LP" | "FP" | null }) {
  if (!st) return null;
  const tone =
    st === "DNP" ? "border-rose-400/50 text-rose-300" : st === "LP" ? "border-amber-400/50 text-amber-300" : "border-lime-400/50 text-lime-300";
  return <span className={`rounded border px-1 font-mono text-[10px] ${tone}`}>{st}</span>;
}
