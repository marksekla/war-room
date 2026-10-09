"use client";

import { useState } from "react";
import { useLeague } from "@/lib/LeagueContext";
import { Brand } from "./Shell";

interface LeagueRow {
  id: string;
  name: string;
  season: string;
  teams: number;
}

export default function Onboarding({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { setSaved } = useLeague();
  const [username, setUsername] = useState("");
  const [leagueId, setLeagueId] = useState("");
  const [leagues, setLeagues] = useState<LeagueRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const findLeagues = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/user-leagues?username=${encodeURIComponent(username.trim())}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Lookup failed");
      setLeagues(j.leagues);
      if (!j.leagues.length) setErr("No NFL leagues found for this season.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (id: string) => setSaved({ leagueId: id, rosterId: null, username: username.trim() });

  return (
    <div className="relative z-10 flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <Brand onLight />
          <h1 className="mt-8 font-display text-3xl font-black tracking-wider text-slate-100 md:text-4xl">
            Welcome to the <span className="whitespace-nowrap neon-text">War Room</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-slate-400">
            Sync your Sleeper league. Get trade simulations, waiver targets, lineup calls and an AI agent that knows your roster, your scoring and the news.
          </p>
        </div>

        <div className="panel panel-corners space-y-5 p-6">
          <div>
            <label className="hud-title">Sleeper username</label>
            <div className="mt-2 flex gap-2">
              <input
                className="input"
                placeholder="e.g. xoM3RK"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && username && findLeagues()}
              />
              <button className="btn" disabled={!username || busy} onClick={findLeagues}>
                {busy ? "Searching" : "Find leagues"}
              </button>
            </div>
          </div>

          {leagues && leagues.length > 0 && (
            <div className="space-y-2">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  onClick={() => pick(l.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-left transition hover:border-cyan-300/60 hover:shadow-glow"
                >
                  <span className="font-medium text-slate-100">{l.name}</span>
                  <span className="font-mono text-xs text-slate-400">
                    {l.teams} teams · {l.season}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500">
            <div className="h-px flex-1 bg-white/10" /> or league ID <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="flex gap-2">
            <input
              className="input font-mono"
              placeholder="Sleeper league ID (from the league URL)"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn btn-violet" disabled={leagueId.length < 6} onClick={() => pick(leagueId)}>
              Load
            </button>
          </div>

          {err && <p className="text-sm text-rose-300">{err}</p>}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          The AI agent needs your own AI key (Claude, GPT, or a free Gemini key).{" "}
          <button className="text-cyan-300 underline" onClick={onOpenSettings}>
            Add it in Settings
          </button>
          . Keys stay in your browser.
        </p>
      </div>
    </div>
  );
}
