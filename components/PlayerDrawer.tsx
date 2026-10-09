"use client";

// Slide-over player card. Click any player name in the app to open it.
// It holds the deep data (advanced usage, practice reports, team environment,
// market value, news) so the tables can stay clean.

import { createContext, useContext, useEffect, useState } from "react";
import type { LeagueModel, PlayerView } from "@/lib/model";
import { fetchNews, fetchWeather, weatherNote } from "@/lib/live";
import type { NewsItem, NflUsage, Weather } from "@/lib/types";
import { ChanceRing, InjuryTag, PosTag, RankChip } from "./ui";
import { IconSparkles, IconX } from "./icons";

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
      className={`truncate text-left font-medium text-ink underline-offset-4 hover:text-accentstrong hover:underline ${className}`}
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
  // Week-by-week: actual points in this league's scoring vs. what he was projected to score before the game.
  const wkRows = (() => {
    const byWeek = new Map<number, { w: number; pts: number | null; proj: number | null; xfp: number | null; snap: number | null }>();
    for (const [w, snap, , , , xfp, fp] of a?.wk ?? []) byWeek.set(w, { w, pts: fp, proj: null, xfp, snap });
    for (const g of v.log) {
      const cur = byWeek.get(g.week) ?? { w: g.week, pts: null, proj: null, xfp: null, snap: g.teamSnaps ? g.snaps / g.teamSnaps : null };
      cur.pts = g.pts; // league scoring wins over nflverse PPR
      byWeek.set(g.week, cur);
    }
    for (const r of byWeek.values()) r.proj = model.pastProjection(v.p.id, r.w);
    return [...byWeek.values()].sort((x, y) => x.w - y.w).slice(-8);
  })();
  const hasProj = wkRows.some((r) => r.proj != null);
  const lineOf = (r: (typeof wkRows)[number]) => (hasProj ? r.proj : r.xfp);
  const maxPts = Math.max(1, ...wkRows.map((r) => Math.max(r.pts ?? 0, lineOf(r) ?? 0)));
  const play = v.p.pos !== "DEF" && model.gameFor(v.p.team, model.week) ? model.playChance(v.p.id) : null;
  const showPlay = !!play && (play.p < 0.95 || play.practice.length > 0 || !!v.p.injury);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-overlay backdrop-blur-[1px]" onClick={onClose}>
      <aside
        className="h-full w-full overflow-y-auto border-l border-line bg-card px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-[0_10px_40px_rgba(15,23,42,0.18)] sm:w-[460px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 -mx-5 mb-4 flex items-start gap-3 border-b border-linesoft bg-card px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <PosTag pos={v.p.pos} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 font-display text-lg font-semibold text-ink">
              <span className="truncate">{v.p.name}</span>
              <InjuryTag status={v.p.injury} />
            </div>
            <div className="text-xs text-muted">
              {v.p.team ?? "FA"}
              {v.p.age ? ` · ${v.p.age} yrs` : ""}
              {v.bye ? ` · bye ${v.bye}` : ""} · {owner}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconX size={17} />
          </button>
        </div>

        {/* Key numbers */}
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Value / game" value={v.valuePg.toFixed(1)} sub={`${v.vorp > 0 ? "+" : ""}${v.vorp.toFixed(1)} over repl.`} />
          <Tile
            label="ROS pts"
            value={
              <span>
                {v.rosPoints.toFixed(0)}
                {model.rosRank(v.p.id) != null && (
                  <span className="ml-1.5 text-xs font-normal text-accentstrong/80">
                    {v.p.pos}
                    {model.rosRank(v.p.id)}
                  </span>
                )}
              </span>
            }
            sub={
              model.gameFor(v.p.team, model.week) ? (
                <span>
                  Wk {model.week} proj {model.projection(v.p.id).toFixed(1)}
                  {v.projSleeper != null && (
                    <span className="block text-[10px] text-muted">Sleeper {v.projSleeper.toFixed(1)}</span>
                  )}
                </span>
              ) : (
                `Bye in week ${model.week}`
              )
            }
          />
          <Tile
            label="Expert rank"
            value={v.ecrRos != null ? `${v.p.pos}${Math.round(v.ecrRos)}` : "-"}
            sub={
              <span>
                {v.ecrRos != null ? "FantasyPros ROS" : "Not ranked"}
                {v.market && (
                  <span className="block text-[10px] text-muted">
                    Market {v.p.pos}
                    {v.market.posRank}
                    {v.market.trend !== 0 && (
                      <span className={v.market.trend > 0 ? "text-good" : "text-bad"}>
                        {" "}
                        {v.market.trend > 0 ? "▲" : "▼"}
                        {Math.abs(v.market.trend)}
                      </span>
                    )}
                  </span>
                )}
              </span>
            }
          />
        </div>

        {/* Health */}
        {(v.p.injury || pr || v.espn || model.roleShift.get(v.p.id) || showPlay) && (
          <Section title="Health and role">
            <div className="space-y-1.5 text-sm">
              {showPlay && play && (
                <div className="flex items-start gap-3 rounded-lg border border-line bg-sunken p-2.5">
                  <ChanceRing p={play.p} size={44} />
                  <div className="min-w-0 text-xs leading-snug">
                    <div className="text-ink">Chance to play week {model.week}</div>
                    <div className="mt-0.5 text-muted">{play.why}</div>
                  </div>
                </div>
              )}
              {model.returnWeek.get(v.p.id) != null && (
                <div className="text-warn">
                  Expected back:{" "}
                  {model.returnWeek.get(v.p.id)! > 18 ? "not this season" : `Week ${model.returnWeek.get(v.p.id)}`}
                  {v.espn?.returnDate ? "" : " (estimate)"}
                </div>
              )}
              {model.roleShift.get(v.p.id) && (
                <div className="text-bad">
                  Role likely shrinks from Week {model.roleShift.get(v.p.id)!.fromWeek} when {model.roleShift.get(v.p.id)!.by} returns. His
                  projections are lowered from then.
                </div>
              )}
              {pr && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted">Week {pr.w} practice</span>
                  <PracChip st={pr.st} />
                  {pr.inj && <span className="text-ink2">{pr.inj}</span>}
                  {pr.rep && <span className="text-warn">· {pr.rep}</span>}
                  {pr.wks >= 3 && !/rest|not injury/i.test(pr.inj ?? "") && (
                    <span className="rounded border border-bad/40 px-1.5 text-[10px] text-bad">ON REPORT {pr.wks} WKS</span>
                  )}
                </div>
              )}
              {v.espn && (
                <div className="text-ink2">
                  <span className="text-muted">ESPN: </span>
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
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                  <th className="pb-1 font-normal" />
                  <th className="pb-1 text-right font-normal">Season</th>
                  <th className="pb-1 text-right font-normal">Last 3</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fn, tip]) => (
                  <tr key={label} className="border-t border-linesoft">
                    <td className="py-1.5 text-muted" title={tip}>
                      {label}
                    </td>
                    <td className="py-1.5 text-right font-mono text-ink">{fn(a.s!)}</td>
                    <td className="py-1.5 text-right font-mono text-accentstrong">{a.l3 ? fn(a.l3) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {luck != null && Math.abs(luck) >= 2 && (
              <p className={`mt-2 text-xs ${luck > 0 ? "text-warn" : "text-good"}`}>
                {luck > 0
                  ? `Scoring ${luck.toFixed(1)} PPR pts/game above his expected points. Some of that is efficiency or TD luck that may cool off.`
                  : `Scoring ${Math.abs(luck).toFixed(1)} PPR pts/game below his expected points. The opportunity is there, so a bounce-back is likely.`}
              </p>
            )}

            {/* Weekly bars: actual points (number on top) with the pre-game projection line. Numbers are always visible, no hover needed. */}
            {wkRows.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex justify-between text-[10px] uppercase tracking-wider text-muted">
                  <span>{wkRows.length >= 8 ? "Last 8 games" : "Week by week"}</span>
                  <span>
                    <span className="text-accentstrong">■</span> Scored <span className="ml-2 text-purple">━</span> {hasProj ? "Projected" : "Expected (xFP)"}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex w-9 shrink-0 flex-col justify-end text-[9px] uppercase tracking-wider text-muted">
                    <span className="flex h-6 items-end pb-0.5">Pts</span>
                    <span className="h-20" />
                    <span className="mt-1 h-3.5 leading-[14px]">Wk</span>
                    {hasProj && <span className="h-3.5 leading-[14px] text-purple/80">Proj</span>}
                    <span className={`h-3.5 leading-[14px] ${hasProj ? "text-muted" : "text-purple/80"}`} title="Expected points from his opportunity (targets, carries, field position)">
                      xFP
                    </span>
                    <span className="h-3.5 leading-[14px]">Snap</span>
                  </div>
                  {wkRows.map((r) => {
                    const line = lineOf(r);
                    const beat = r.pts != null && line != null ? r.pts - line : null;
                    return (
                      <div key={r.w} className="flex min-w-0 flex-1 flex-col items-center">
                        <span
                          className={`flex h-6 items-end pb-0.5 font-mono text-[11px] font-semibold ${beat == null ? "text-ink" : beat >= 0 ? "text-good" : "text-bad"}`}
                        >
                          {r.pts != null ? r.pts.toFixed(1) : "-"}
                        </span>
                        <div className="relative flex h-20 w-full items-end">
                          <div className="w-full rounded-t-[3px] bg-accent/70" style={{ height: `${(Math.max(0, r.pts ?? 0) / maxPts) * 100}%` }} />
                          {line != null && (
                            <div
                              className="absolute inset-x-0 h-0.5 bg-purple"
                              style={{ bottom: `calc(${(Math.max(0, line) / maxPts) * 100}% - 1px)` }}
                            />
                          )}
                        </div>
                        <span className="mt-1 h-3.5 font-mono text-[10px] leading-[14px] text-muted">{r.w}</span>
                        {hasProj && <span className="h-3.5 font-mono text-[10px] leading-[14px] text-purple/90">{r.proj != null ? r.proj.toFixed(1) : "-"}</span>}
                        <span className={`h-3.5 font-mono text-[10px] leading-[14px] ${hasProj ? "text-muted" : "text-purple/90"}`}>{r.xfp != null ? r.xfp.toFixed(1) : "-"}</span>
                        <span className="h-3.5 font-mono text-[10px] leading-[14px] text-muted">{r.snap != null ? `${Math.round(r.snap * 100)}%` : "-"}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted">
                  {hasProj
                    ? "Projected = what he was expected to score before kickoff. xFP = what his actual usage that day is usually worth, so a low xFP means the opportunity wasn't there."
                    : "xFP = what his actual usage is usually worth (targets, carries, field position)."}
                </p>
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
          v.p.pos !== "K" && <p className="mt-6 text-xs text-muted">No advanced usage yet (no snaps this season, or data not loaded).</p>
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
                  <div key={w} className="rounded border border-line px-2 py-1 text-center font-mono text-[11px]">
                    <div className="text-muted">W{w}</div>
                    {g ? (
                      <div className="flex items-center gap-1 text-ink">
                        {g.home ? "" : "@"}
                        {g.opp} <RankChip rank={d?.rank} />
                      </div>
                    ) : (
                      <div className="text-warn">BYE</div>
                    )}
                  </div>
                );
              })}
            </div>
            <ThisWeek model={model} v={v} />
            {wn && (
              <p className={`mt-2 text-xs ${wn.severe ? "text-warn" : "text-muted"}`}>
                Week {model.week} forecast: {wn.label}
              </p>
            )}
          </Section>
        )}

        {/* News */}
        {v.p.espnId && (
          <Section title="Latest news">
            {!news && !newsErr && <p className="text-xs text-muted">Loading...</p>}
            {newsErr && <p className="text-xs text-muted">News is unavailable right now.</p>}
            {news && !news.length && <p className="text-xs text-muted">No recent news.</p>}
            <ul className="space-y-3">
              {news?.slice(0, 4).map((n, i) => (
                <li key={i} className="text-sm">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    {n.published ? new Date(n.published).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                    {n.source ? ` · ${n.source}` : ""}
                  </div>
                  <div className="text-ink">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noreferrer" className="hover:text-accentstrong hover:underline">
                        {n.headline}
                      </a>
                    ) : (
                      n.headline
                    )}
                  </div>
                  {n.story && n.story !== n.headline && <div className="mt-0.5 line-clamp-3 text-xs text-muted">{n.story}</div>}
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
          <IconSparkles size={16} />
          Ask the AI about {v.p.name.split(" ").slice(-1)[0]}
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
    dOut.length ? { tone: "text-good", text: `${g.opp} defense missing: ${dOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}` } : null,
    olOut.length ? { tone: "text-bad", text: `${v.p.team} O-line missing: ${olOut.map((x) => `${x.name} (${x.pos}, ${x.status})`).join(", ")}` } : null,
    ctx && (Math.abs(restGap) >= 3 || ctx.divisional || ctx.neutralSite)
      ? {
          tone: "text-muted",
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
    <div className="rounded-lg border border-line bg-sunken p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold neon-text">{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function EnvTile({ label, value, rank, tip }: { label: string; value: string; rank?: number; tip?: string }) {
  return (
    <div className="rounded-lg border border-line bg-sunken p-2" title={tip}>
      <div className="text-[10px] leading-tight text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-sm text-ink">
        {value}
        {rank != null && <span className={`text-[10px] ${rank <= 8 ? "text-good" : rank >= 25 ? "text-bad" : "text-muted"}`}>#{rank}</span>}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-line bg-sunken px-2 py-1">
      <span className="text-muted">{label} </span>
      <span className="font-mono text-ink">{value}</span>
    </span>
  );
}

export function PracChip({ st }: { st: "DNP" | "LP" | "FP" | null }) {
  if (!st) return null;
  const tone =
    st === "DNP" ? "border-bad/50 text-bad" : st === "LP" ? "border-warn/50 text-warn" : "border-good/50 text-good";
  return <span className={`rounded border px-1 font-mono text-[10px] ${tone}`}>{st}</span>;
}
