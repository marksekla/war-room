"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LeagueModel } from "./model";
import type {
  AiSettings,
  EspnInjury,
  LeagueActivity,
  LeagueBundle,
  MarketValue,
  NflData,
  PlayerMap,
  Schedule,
  StatLine,
  WeekProjections,
  WeekStats,
} from "./types";
import { DEFAULT_STRATEGY, LEGACY_STRATEGIES } from "./agent/strategy";

const LS = "war-room:v1";

interface Saved {
  leagueId: string;
  rosterId: number | null;
  username: string;
  ai: AiSettings;
  /** Players you never want offered in trade ideas (per browser). */
  untouchables: string[];
}

const defaultSaved: Saved = {
  leagueId: "",
  rosterId: null,
  username: "",
  untouchables: [],
  ai: { provider: "anthropic", apiKey: "", keys: {}, model: "", baseUrl: "", webSearch: true, strategy: DEFAULT_STRATEGY },
};

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return defaultSaved;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const ai = { ...defaultSaved.ai, ...(parsed.ai ?? {}) };
    // Older saves only had one key: remember it under its provider.
    if (ai.apiKey && !ai.keys?.[ai.provider]) ai.keys = { ...(ai.keys ?? {}), [ai.provider]: ai.apiKey };
    if (LEGACY_STRATEGIES.some((l) => l.trim() === (ai.strategy ?? "").trim())) ai.strategy = DEFAULT_STRATEGY;
    return { ...defaultSaved, ...parsed, ai };
  } catch {
    return defaultSaved;
  }
}

async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed: ${url}`);
  return body as T;
}

interface Ctx {
  saved: Saved;
  setSaved: (patch: Partial<Saved>) => void;
  model: LeagueModel | null;
  loading: boolean;
  progress: string;
  error: string | null;
  reload: () => void;
}

const LeagueCtx = createContext<Ctx | null>(null);

export function LeagueProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSavedState] = useState<Saved>(defaultSaved);
  const [hydrated, setHydrated] = useState(false);
  const [model, setModel] = useState<LeagueModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setSavedState(loadSaved());
    setHydrated(true);
  }, []);

  const setSaved = useCallback((patch: Partial<Saved>) => {
    setSavedState((prev) => {
      const next = { ...prev, ...patch, ai: { ...prev.ai, ...(patch.ai ?? {}) } };
      try {
        localStorage.setItem(LS, JSON.stringify(next));
      } catch {
        /* storage blocked: settings just won't persist */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !saved.leagueId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setProgress("Syncing league");
        const bundle = await api<LeagueBundle>(`/api/league?id=${saved.leagueId}`);
        const season = Number(bundle.league.season || bundle.state.season);
        const week = Math.max(1, Math.min(18, Number(bundle.state.week) || 1));
        const statWeeks = Array.from({ length: week }, (_, i) => i + 1);
        const lg = bundle.league;
        const superflex = lg.roster_positions.includes("SUPER_FLEX") || lg.roster_positions.filter((r) => r === "QB").length > 1;
        const ppr = lg.scoring_settings?.rec ?? 1;
        setProgress("Loading players, stats, schedule and advanced data");
        const [players, stats, projections, schedule, trending, nfl, values, injuries, activity, espnProj] = await Promise.all([
          api<PlayerMap>(`/api/players`),
          api<WeekStats[]>(`/api/stats?season=${season}&weeks=${statWeeks.join(",")}&current=${week}`),
          api<WeekProjections[]>(`/api/projections?season=${season}&weeks=${week},${Math.min(18, week + 1)}`),
          api<Schedule>(`/api/schedule?season=${season}`),
          api<{ add: { player_id: string; count: number }[] }>(`/api/trending`).catch(() => ({ add: [] })),
          // Optional sources: the app still works if any of these are down.
          api<NflData>(`/api/nfl`).catch(() => null),
          api<Record<string, MarketValue>>(`/api/values?teams=${lg.total_rosters}&sf=${superflex ? 1 : 0}&ppr=${ppr}`).catch(() => null),
          api<EspnInjury[]>(`/api/injuries`).catch(() => null),
          api<LeagueActivity>(`/api/activity?id=${saved.leagueId}&week=${week}`).catch(() => null),
          api<Record<string, StatLine>>(`/api/espn-proj?season=${season}&week=${week}`).catch(() => null),
        ]);
        if (cancelled) return;
        setProgress("Running the numbers");
        const m = new LeagueModel(bundle, players, stats, projections, schedule, trending, { nfl, values, injuries, activity, espnProj });
        setModel(m);
        if (saved.rosterId == null || !m.team(saved.rosterId)) {
          const guess = saved.username
            ? m.teams.find((t) => t.ownerName.toLowerCase() === saved.username.toLowerCase())
            : undefined;
          setSaved({ rosterId: guess?.rosterId ?? m.teams[0]?.rosterId ?? null });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setProgress("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, saved.leagueId, nonce]);

  const value = useMemo<Ctx>(
    () => ({ saved, setSaved, model, loading, progress, error, reload: () => setNonce((n) => n + 1) }),
    [saved, setSaved, model, loading, progress, error]
  );
  return <LeagueCtx.Provider value={value}>{children}</LeagueCtx.Provider>;
}

export function useLeague() {
  const ctx = useContext(LeagueCtx);
  if (!ctx) throw new Error("useLeague must be used inside LeagueProvider");
  return ctx;
}
