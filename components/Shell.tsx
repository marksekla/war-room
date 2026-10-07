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
import Chat from "./Chat";
import { PlayerDrawerProvider } from "./PlayerDrawer";
import PlayerSearch from "./PlayerSearch";
import { Spinner } from "./ui";

export type Tab = "dashboard" | "waivers" | "lineup" | "trades" | "agent" | "health";

const NAV: { id: Tab; label: string; short: string; icon: string }[] = [
  { id: "dashboard", label: "Command", short: "Command", icon: "◈" },
  { id: "agent", label: "AI Agent", short: "AI Agent", icon: "✦" },
  { id: "trades", label: "Trades", short: "Trades", icon: "⇄" },
  { id: "waivers", label: "Waivers", short: "Waivers", icon: "⊕" },
  { id: "lineup", label: "Start / Sit", short: "Start/Sit", icon: "▤" },
  { id: "health", label: "Are they playing", short: "Playing?", icon: "✚" },
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
      <div className="relative z-10 flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-cyan-400/10 bg-black/30 p-4 backdrop-blur md:flex">
          <Brand />
          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  tab === n.id ? "bg-cyan-400/10 text-cyan-100 shadow-glow" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                }`}
              >
                <span className={`text-lg ${tab === n.id ? "neon-text" : ""}`}>{n.icon}</span>
                <span className="font-display text-xs uppercase tracking-[0.16em]">{n.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            <button className="btn btn-ghost w-full justify-start" onClick={() => setSettingsOpen(true)}>
              ⚙ Settings & AI key
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile header: one compact row */}
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cyan-400/10 bg-[#05060b]/90 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <Brand compact />
            <div className="min-w-0 flex-1">
              {model ? (
                <select
                  className="w-full truncate bg-transparent font-display text-sm font-bold text-cyan-200 outline-none"
                  value={saved.rosterId ?? ""}
                  onChange={(e) => setSaved({ rosterId: Number(e.target.value) })}
                >
                  {model.teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId} className="bg-slate-900">
                      {t.teamName} ({t.ownerName})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="font-display text-sm font-bold text-slate-300">Syncing...</div>
              )}
              <div className="truncate text-[11px] text-slate-500">
                {model ? `${model.bundle.league.name} · Week ${model.week}` : progress}
              </div>
            </div>
            {model && <PlayerSearch model={model} compact />}
            <button
              className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-300 active:bg-white/10"
              onClick={reload}
              aria-label="Sync"
            >
              <span className={loading ? "animate-spin" : ""}>⟳</span>
            </button>
            <button
              className="grid h-9 w-9 place-items-center rounded-lg text-lg text-slate-300 active:bg-white/10"
              onClick={() => setSettingsOpen(true)}
              aria-label="Settings"
            >
              ⚙
            </button>
          </header>

          {/* Desktop header */}
          <header className="sticky top-0 z-20 hidden flex-wrap items-center gap-3 border-b border-cyan-400/10 bg-[#05060b]/80 px-8 py-3 backdrop-blur md:flex">
            <div className="min-w-0">
              <div className="hud-title">League</div>
              <div className="truncate font-display text-sm font-bold text-slate-100">{model?.bundle.league.name ?? "Syncing..."}</div>
            </div>
            {model && (
              <>
                <div className="h-8 w-px bg-cyan-400/15" />
                <div>
                  <div className="hud-title">Your team</div>
                  <select
                    className="bg-transparent font-display text-sm font-bold text-cyan-200 outline-none"
                    value={saved.rosterId ?? ""}
                    onChange={(e) => setSaved({ rosterId: Number(e.target.value) })}
                  >
                    {model.teams.map((t) => (
                      <option key={t.rosterId} value={t.rosterId} className="bg-slate-900">
                        {t.teamName} ({t.ownerName})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="h-8 w-px bg-cyan-400/15" />
                <div>
                  <div className="hud-title">NFL week</div>
                  <div className="font-display text-sm font-bold neon-violet">{model.week}</div>
                </div>
              </>
            )}
            <div className="ml-auto flex items-center gap-2">
              {model && <PlayerSearch model={model} />}
              {loading ? (
                <Spinner label={progress || "Syncing"} />
              ) : (
                <button className="btn btn-ghost" onClick={reload} title="Re-sync league data">
                  ⟳ Sync
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setSaved({ leagueId: "", rosterId: null })} title="Switch league">
                Switch
              </button>
            </div>
          </header>

          {/* Mobile bottom tab bar */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-cyan-400/15 bg-[#070912]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex flex-col items-center gap-0.5 py-2.5 ${tab === n.id ? "text-cyan-200" : "text-slate-500"}`}
              >
                <span className={`text-xl leading-none ${tab === n.id ? "neon-text" : ""}`}>{n.icon}</span>
                <span className="font-display text-[8.5px] uppercase tracking-wider">{n.short}</span>
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
                <Spinner label={progress || "Booting up"} />
              </div>
            )}
            {model && me && (
              <>
                {tab === "dashboard" && <Dashboard model={model} myId={me.rosterId} go={(t) => { setTab(t); window.scrollTo({ top: 0 }); }} />}
                {tab === "waivers" && <Waivers model={model} myId={me.rosterId} />}
                {tab === "lineup" && <StartSit model={model} myId={me.rosterId} />}
                {tab === "health" && <Availability model={model} myId={me.rosterId} />}
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

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/50 bg-cyan-400/10 shadow-glow">
        <span className="font-display text-sm font-black neon-text">W</span>
        <span className="absolute -right-1 -top-1 h-2 w-2 animate-pulseGlow rounded-full bg-fuchsia-400 shadow-[0_0_10px_#e879f9]" />
      </div>
      {!compact && (
        <div>
          <div className="font-display text-sm font-black tracking-[0.2em] text-slate-100">WAR ROOM</div>
          <div className="font-display text-[10px] tracking-[0.4em] neon-violet">AI · AGENT</div>
        </div>
      )}
    </div>
  );
}
