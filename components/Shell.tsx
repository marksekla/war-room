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
import {
  IconChevronDown,
  IconDashboard,
  IconLayers,
  IconLineup,
  IconPulse,
  IconRefresh,
  IconSliders,
  IconSparkles,
  IconSwitch,
  IconTrade,
  IconUserPlus,
} from "./icons";

export type Tab = "dashboard" | "waivers" | "lineup" | "trades" | "agent" | "health" | "depth";

type IconT = (p: { className?: string; size?: number; strokeWidth?: number }) => React.ReactNode;
type NavItem = { id: Tab; label: string; short: string; title: string; sub: string; Icon: IconT };

const NAV: NavItem[] = [
  { id: "dashboard", label: "Command", short: "Home", title: "Command", sub: "Your team at a glance", Icon: IconDashboard },
  { id: "agent", label: "AI Agent", short: "AI", title: "AI Agent", sub: "Ask anything about your league", Icon: IconSparkles },
  { id: "trades", label: "Trades", short: "Trades", title: "Trades", sub: "Find, build and grade trades", Icon: IconTrade },
  { id: "waivers", label: "Waivers", short: "Waivers", title: "Waivers", sub: "The best pickups for your roster", Icon: IconUserPlus },
  { id: "lineup", label: "Start / Sit", short: "Start/Sit", title: "Start / Sit", sub: "Set your best lineup for the week", Icon: IconLineup },
  { id: "health", label: "Are they playing", short: "Playing?", title: "Are they playing?", sub: "Practice reports and game status", Icon: IconPulse },
  { id: "depth", label: "Depth charts", short: "Depth", title: "Depth charts", sub: "Every team's depth chart and who has them", Icon: IconLayers },
];

const GROUPS: { label: string; ids: Tab[] }[] = [
  { label: "Overview", ids: ["dashboard", "agent"] },
  { label: "Roster moves", ids: ["trades", "waivers"] },
  { label: "Game day", ids: ["lineup", "health"] },
  { label: "Research", ids: ["depth"] },
];

export default function Shell() {
  const { saved, setSaved, model, loading, progress, error, reload } = useLeague();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Switching tabs starts the new page at the top.
  const go = (t: Tab) => {
    setTab(t);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const askAgent = (prompt: string) => {
    setPendingPrompt(prompt);
    go("agent");
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
  const current = NAV.find((n) => n.id === tab)!;

  const teamSelect = (cls: string) =>
    model ? (
      <select
        className={`w-full cursor-pointer appearance-none truncate bg-transparent pr-5 outline-none ${cls}`}
        value={saved.rosterId ?? ""}
        onChange={(e) => setSaved({ rosterId: Number(e.target.value) })}
        aria-label="Your team"
      >
        {model.teams.map((t) => (
          <option key={t.rosterId} value={t.rosterId}>
            {t.teamName} ({t.ownerName})
          </option>
        ))}
      </select>
    ) : null;

  const sideItem = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] font-medium transition";

  return (
    <PlayerDrawerProvider model={model} askAgent={askAgent}>
      <div className="relative flex min-h-screen bg-page">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-card md:flex">
          <div className="flex h-16 items-center px-5">
            <Brand />
          </div>

          <div className="px-3">
            <div className="relative rounded-lg border border-line bg-sunken px-3 py-2.5">
              <div className="truncate text-[13px] font-semibold text-ink">{model?.bundle.league.name ?? "Syncing..."}</div>
              <div className="relative mt-0.5">
                {teamSelect("text-[12px] text-muted")}
                {model && <IconChevronDown size={14} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted" />}
              </div>
            </div>
          </div>

          <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
            {GROUPS.map((g) => (
              <div key={g.label} className="mt-5">
                <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{g.label}</div>
                <div className="flex flex-col gap-0.5">
                  {g.ids.map((id) => {
                    const n = NAV.find((x) => x.id === id)!;
                    const on = tab === id;
                    return (
                      <button
                        key={id}
                        onClick={() => go(id)}
                        aria-current={on ? "page" : undefined}
                        className={`${sideItem} ${on ? "bg-accenttint font-semibold text-accentstrong" : "text-ink2 hover:bg-hover hover:text-ink"}`}
                      >
                        <n.Icon size={18} className={on ? "text-accent" : "text-muted"} />
                        <span>{n.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="flex flex-col gap-0.5 border-t border-line p-3">
            <button className={`${sideItem} text-ink2 hover:bg-hover hover:text-ink`} onClick={() => setSettingsOpen(true)}>
              <IconSliders size={18} className="text-muted" />
              Settings & AI key
            </button>
            <button className={`${sideItem} text-ink2 hover:bg-hover hover:text-ink`} onClick={() => setSaved({ leagueId: "", rosterId: null })}>
              <IconSwitch size={18} className="text-muted" />
              Switch league
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Mobile header */}
          <header className="sticky top-0 z-20 flex items-center gap-2.5 border-b border-line bg-card/95 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <Brand compact />
            <div className="min-w-0 flex-1">
              <div className="relative">
                {model ? teamSelect("text-[14px] font-semibold text-ink") : <div className="text-sm font-semibold text-ink2">Syncing...</div>}
                {model && <IconChevronDown size={14} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-muted" />}
              </div>
              <div className="truncate text-[11px] text-muted">{model ? `${model.bundle.league.name} · Week ${model.week}` : progress}</div>
            </div>
            {model && <PlayerSearch model={model} compact />}
            <button className="icon-btn" onClick={reload} aria-label="Sync">
              <IconRefresh size={17} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
              <IconSliders size={17} />
            </button>
          </header>

          {/* Desktop header */}
          <header className="sticky top-0 z-20 hidden h-16 items-center gap-4 border-b border-line bg-card/90 px-8 backdrop-blur md:flex">
            {model ? <PlayerSearch model={model} /> : <div className="flex-1" />}
            <div className="ml-auto flex items-center gap-2">
              {loading && <Spinner label={progress || "Syncing"} />}
              {model && (
                <span className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold text-ink">Week {model.week}</span>
              )}
              <button className="icon-btn" onClick={reload} title="Re-sync league data" aria-label="Sync">
                <IconRefresh size={17} className={loading ? "animate-spin" : ""} />
              </button>
              <ThemeToggle className="icon-btn" />
            </div>
          </header>

          {/* Mobile bottom tab bar */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {NAV.map((n) => {
              const on = tab === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  aria-current={on ? "page" : undefined}
                  className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 ${on ? "text-accent" : "text-muted"}`}
                >
                  {on && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent" />}
                  <n.Icon size={20} strokeWidth={on ? 2 : 1.75} />
                  <span className={`text-[9.5px] ${on ? "font-semibold" : "font-medium"}`}>{n.short}</span>
                </button>
              );
            })}
          </nav>

          <div className="mx-auto max-w-[1400px] p-4 pb-28 md:px-8 md:pb-10 md:pt-7">
            {error && (
              <div className="panel mb-6 border-bad/30 p-4 text-sm text-bad">
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
                <div className="mb-4 md:mb-6">
                  <h1 className="font-display text-xl font-semibold text-ink md:text-[24px]">{current.title}</h1>
                  <p className="mt-0.5 hidden text-sm text-muted md:block">{current.sub}</p>
                </div>
                {tab === "dashboard" && <Dashboard model={model} myId={me.rosterId} go={go} />}
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

/** Logo: a plain monogram tile and the wordmark. */
export function Brand({ compact = false }: { compact?: boolean; onLight?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-[15px] font-bold tracking-tight text-[#ffffff]">W</div>
      {!compact && <div className="font-display text-[16px] font-semibold text-ink">War Room</div>}
    </div>
  );
}
