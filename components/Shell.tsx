"use client";

import { useState } from "react";
import { useLeague } from "@/lib/LeagueContext";
import Onboarding from "./Onboarding";
import Settings from "./Settings";
import Dashboard from "./Dashboard";
import Waivers from "./Waivers";
import StartSit from "./StartSit";
import Trades from "./Trades";
import Availability from "./Availability";
import DepthCharts from "./DepthCharts";
import Chat from "./Chat";
import { PlayerDrawerProvider } from "./PlayerDrawer";
import PlayerSearch from "./PlayerSearch";
import { Spinner, ThemeToggle } from "./ui";

export type Tab = "dashboard" | "waivers" | "lineup" | "trades" | "agent" | "health" | "depth";

const NAV: { id: Tab; label: string; short: string; icon: string; title: string }[] = [
  { id: "dashboard", label: "Command", short: "Home", icon: "⌂", title: "Command" },
  { id: "agent", label: "AI Agent", short: "AI", icon: "✦", title: "AI Agent" },
  { id: "trades", label: "Trades", short: "Trades", icon: "⇄", title: "Trades" },
  { id: "waivers", label: "Waivers", short: "Waivers", icon: "⊕", title: "Waivers" },
  { id: "lineup", label: "Start / Sit", short: "Start/Sit", icon: "☰", title: "Start / Sit" },
  { id: "health", label: "Are they playing", short: "Playing?", icon: "✚", title: "Are they playing?" },
  { id: "depth", label: "Depth charts", short: "Depth", icon: "☷", title: "Depth charts" },
];

export default function Shell() {
  const { saved, setSaved, model, loading, progress, error, reload } = useLeague();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  const askAgent = (prompt: string) => {
    setPendingPrompt(prompt);
    setTab("agent");
  };

  if (!saved.leagueId) {
    return (
      <>
        <Onboarding onOpenSettings={() => setSettingsOpen(true)} />
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      </>
    );
  }

  const me = model && saved.rosterId != null ? model.team(saved.rosterId) : null;

  return (
    <PlayerDrawerProvider model={model} askAgent={askAgent}>
      <div className="relative flex min-h-screen bg-page">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-nav px-3 py-5 md:flex">
          <div className="px-2">
            <Brand />
          </div>
          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium transition ${
                  tab === n.id ? "bg-navactive text-[#ffffff]" : "text-navtext hover:bg-navhover hover:text-[#ffffff]"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base ${
                    tab === n.id ? "bg-[#22c55e] text-[#ffffff]" : "bg-navhover text-navtext group-hover:text-[#ffffff]"
                  }`}
                >
                  {n.icon}
                </span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-1">
            <ThemeToggle
              label
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-navtext transition hover:bg-navhover hover:text-[#ffffff] [&>span:first-child]:grid [&>span:first-child]:h-8 [&>span:first-child]:w-8 [&>span:first-child]:place-items-center [&>span:first-child]:rounded-lg [&>span:first-child]:bg-navhover"
            />
            <button
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[14px] font-medium text-navtext transition hover:bg-navhover hover:text-[#ffffff]"
              onClick={() => setSettingsOpen(true)}
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-navhover">⚙</span>
              Settings & AI key
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile header: one compact row */}
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-card/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <Brand compact />
            <div className="min-w-0 flex-1">
              {model ? (
                <select
                  className="w-full truncate bg-transparent font-display text-sm font-semibold text-ink outline-none"
                  value={saved.rosterId ?? ""}
                  onChange={(e) => setSaved({ rosterId: Number(e.target.value) })}
                >
                  {model.teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName} ({t.ownerName})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="font-display text-sm font-semibold text-slate-300">Syncing...</div>
              )}
              <div className="truncate text-[11px] text-slate-500">
                {model ? `${model.bundle.league.name} · Week ${model.week}` : progress}
              </div>
            </div>
            {model && <PlayerSearch model={model} compact />}
            <button
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-lg text-slate-300 active:bg-hover"
              onClick={reload}
              aria-label="Sync"
            >
              <span className={loading ? "animate-spin" : ""}>⟳</span>
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-full border border-line text-lg text-slate-300 active:bg-hover"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              ⚙
            </button>
          </header>

          {/* Desktop header */}
          <header className="sticky top-0 z-20 hidden flex-wrap items-center gap-4 border-b border-line bg-card/95 px-8 py-3 backdrop-blur md:flex">
            <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card px-3 py-1.5 shadow-card">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accenttint font-display text-sm font-bold text-accent">
                {(me?.teamName ?? "W").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="max-w-[260px] truncate text-[13px] font-semibold text-ink">{model?.bundle.league.name ?? "Syncing..."}</div>
                {model ? (
                  <select
                    className="max-w-[260px] truncate bg-transparent text-[13px] text-muted outline-none"
                    value={saved.rosterId ?? ""}
                    onChange={(e) => setSaved({ rosterId: Number(e.target.value) })}
                  >
                    {model.teams.map((t) => (
                      <option key={t.rosterId} value={t.rosterId}>
                        {t.teamName} ({t.ownerName})
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </div>
            {model && (
              <div className="rounded-lg border border-line bg-card px-3 py-1.5 text-[13px] font-semibold text-ink">Week {model.week}</div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {model && <PlayerSearch model={model} />}
              {loading ? (
                <Spinner label={progress || "Syncing"} />
              ) : (
                <button className="btn" onClick={reload} title="Re-sync league data">
                  ⟳ Sync
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSaved({ leagueId: "", rosterId: null })} title="Switch league">
                Switch
              </button>
            </div>
          </header>

          {/* Mobile bottom tab bar */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex flex-col items-center gap-0.5 py-2.5 ${tab === n.id ? "text-accent" : "text-muted"}`}
              >
                <span className="text-xl leading-none">{n.icon}</span>
                <span className="text-[9px] font-semibold">{n.short}</span>
              </button>
            ))}
          </nav>

          <div className="mx-auto max-w-[1400px] p-4 pb-28 md:p-8">
            {error && (
              <div className="panel mb-6 border-rose-400/30 p-4 text-sm text-rose-200">
                Could not load league data: {error}{" "}
                <button className="underline" onClick={reload}>
                  Retry
                </button>
              </div>
            )}
            {!model && !error && (
              <div className="flex h-[60vh] items-center justify-center">
                <Spinner label={progress || "Loading"} />
              </div>
            )}
            {model && me && (
              <>
                <h1 className="mb-5 hidden font-display text-[26px] font-bold text-ink md:block">{NAV.find((n) => n.id === tab)?.title}</h1>
                {tab === "dashboard" && <Dashboard model={model} myId={me.rosterId} go={(t) => { setTab(t); window.scrollTo({ top: 0 }); }} />}
                {tab === "waivers" && <Waivers model={model} myId={me.rosterId} />}
                {tab === "lineup" && <StartSit model={model} myId={me.rosterId} />}
                {tab === "health" && <Availability model={model} myId={me.rosterId} />}
                {tab === "depth" && <DepthCharts model={model} myId={me.rosterId} />}
                {tab === "trades" && <Trades model={model} myId={me.rosterId} askAgent={askAgent} />}
                {tab === "agent" && (
                  <Chat
                    model={model}
                    myId={me.rosterId}
                    pendingPrompt={pendingPrompt}
                    clearPending={() => setPendingPrompt(null)}
                    openSettings={() => setSettingsOpen(true)}
                  />
                )}
              </>
            )}
          </div>
        </main>
        {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      </div>
    </PlayerDrawerProvider>
  );
}

export function Brand({ compact = false, onLight = false }: { compact?: boolean; onLight?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-[#f5b301] bg-[#2563eb] font-display text-sm font-bold text-[#ffffff]">
        W
      </div>
      {!compact && <div className={`font-display text-[17px] font-semibold tracking-tight ${onLight ? "text-ink" : "text-[#ffffff]"}`}>War Room</div>}
    </div>
  );
}
