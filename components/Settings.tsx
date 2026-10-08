"use client";

import { useState } from "react";
import { useLeague } from "@/lib/LeagueContext";
import { DEFAULT_STRATEGY } from "@/lib/agent/strategy";
import { COMPAT_PRESETS, listModels, PROVIDERS } from "@/lib/agent/run";
import type { AiSettings, ProviderId } from "@/lib/types";

const SEARCH_LABEL: Record<ProviderId, string> = {
  anthropic: "Let the agent search the web for injury news and practice reports (small extra cost per search)",
  openai: "Let the agent search the web for injury news and practice reports (small extra cost per search)",
  gemini: "Let the agent use Google Search for news (newer Gemini models; turned off automatically if unsupported)",
  compat: "Use OpenRouter's web search plugin (paid credits; ignored by other providers)",
};

export default function Settings({ onClose }: { onClose: () => void }) {
  const { saved, setSaved, model } = useLeague();
  const [ai, setAi] = useState<AiSettings>(() => ({
    ...saved.ai,
    apiKey: saved.ai.keys?.[saved.ai.provider] ?? saved.ai.apiKey,
  }));
  const [models, setModels] = useState<string[]>([]);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const provider = PROVIDERS[ai.provider];
  const preset = COMPAT_PRESETS.find((p) => p.url === ai.baseUrl);
  const keyUrl = ai.provider === "compat" ? preset?.keyUrl ?? provider.keyUrl : provider.keyUrl;

  const switchProvider = (id: ProviderId) => {
    const keys = { ...(ai.keys ?? {}), [ai.provider]: ai.apiKey };
    setAi({
      ...ai,
      keys,
      provider: id,
      apiKey: keys[id] ?? "",
      model: "",
      baseUrl: id === "compat" ? ai.baseUrl || COMPAT_PRESETS[0].url : ai.baseUrl,
    });
    setModels([]);
    setModelErr(null);
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelErr(null);
    try {
      const list = await listModels(ai);
      setModels(list);
      if (!ai.model && list.length) setAi({ ...ai, model: list[0] });
    } catch (e) {
      setModelErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  };

  const save = () => {
    setSaved({ ai: { ...ai, keys: { ...(ai.keys ?? {}), [ai.provider]: ai.apiKey } } });
    onClose();
  };

  const nfl = model?.nfl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="panel panel-corners max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-widest neon-text">SETTINGS</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-6">
          <div>
            <div className="hud-title mb-2">AI provider</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => switchProvider(id)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${
                    ai.provider === id ? "border-cyan-300/70 bg-cyan-400/10 shadow-glow" : "border-white/10 hover:border-cyan-400/30"
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-100">{PROVIDERS[id].label}</div>
                  <div className={`text-[11px] ${id === "gemini" ? "text-lime-300" : "text-slate-500"}`}>{PROVIDERS[id].sub}</div>
                </button>
              ))}
            </div>
            {provider.note && <p className="mt-2 text-xs text-slate-400">{provider.note}</p>}
          </div>

          {ai.provider === "compat" && (
            <div>
              <div className="hud-title mb-2">Provider URL</div>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {COMPAT_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      setAi({ ...ai, baseUrl: p.url, model: "" });
                      setModels([]);
                    }}
                    className={`rounded border px-2.5 py-1 text-xs ${ai.baseUrl === p.url ? "border-cyan-300/60 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-slate-400 hover:text-slate-100"}`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <input
                className="input font-mono text-sm"
                placeholder="https://.../v1"
                value={ai.baseUrl ?? ""}
                onChange={(e) => setAi({ ...ai, baseUrl: e.target.value.trim() })}
              />
            </div>
          )}

          <div>
            <div className="hud-title mb-2">API key</div>
            <input
              type="password"
              className="input font-mono"
              placeholder={provider.keyHint}
              value={ai.apiKey}
              onChange={(e) => setAi({ ...ai, apiKey: e.target.value.trim() })}
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-slate-400">
              Get one at{" "}
              <a className="text-cyan-300 underline" href={keyUrl} target="_blank" rel="noreferrer">
                {keyUrl.replace("https://", "")}
              </a>
              . Your key is stored only in this browser and sent straight to the provider, never to this site&apos;s server.
            </p>
          </div>

          <div>
            <div className="hud-title mb-2">Model</div>
            <div className="flex gap-2">
              {models.length ? (
                <select className="input" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })}>
                  {models.map((m) => (
                    <option key={m} value={m} className="bg-slate-900">
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="input font-mono"
                  placeholder={provider.defaultModel ? `default: ${provider.defaultModel}` : ai.provider === "gemini" ? "auto: newest Flash model" : "click Load models"}
                  value={ai.model}
                  onChange={(e) => setAi({ ...ai, model: e.target.value.trim() })}
                />
              )}
              <button className="btn" onClick={fetchModels} disabled={!ai.apiKey || loadingModels}>
                {loadingModels ? "Loading" : "Load models"}
              </button>
            </div>
            {ai.provider === "compat" && ai.baseUrl?.includes("openrouter") && (
              <p className="mt-2 text-xs text-slate-400">Free OpenRouter models end in &quot;:free&quot; and are listed first.</p>
            )}
            {modelErr && <p className="mt-2 text-xs text-rose-300">{modelErr}</p>}
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={ai.webSearch} onChange={(e) => setAi({ ...ai, webSearch: e.target.checked })} className="h-4 w-4 shrink-0 accent-cyan-400" />
            {SEARCH_LABEL[ai.provider]}
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="hud-title">Your strategy (the agent follows this)</div>
              <button className="text-xs text-cyan-300 underline" onClick={() => setAi({ ...ai, strategy: DEFAULT_STRATEGY })}>
                Reset to default
              </button>
            </div>
            <textarea
              className="input h-56 font-mono text-xs leading-relaxed"
              value={ai.strategy}
              onChange={(e) => setAi({ ...ai, strategy: e.target.value })}
            />
          </div>

          <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400">
            <summary className="cursor-pointer select-none text-slate-300">Data sources and freshness</summary>
            <ul className="mt-2 space-y-1">
              <li>League, rosters, scoring, matchups, transactions: Sleeper (1-5 minutes behind)</li>
              <li>
                Projections: Sleeper, ESPN and FantasyPros consensus, averaged
                {model ? ` (${projStatus(model)})` : ""}
              </li>
              <li>
                Expert rankings (rest of season and weekly): FantasyPros consensus
                {nfl?.ecr ? ` (updated ${nfl.ecr.date})` : " (not loaded)"}
              </li>
              <li>Injury designations: ESPN (every 15 minutes) layered on Sleeper</li>
              <li>
                Snaps, first reads, red zone, xFP, Next Gen Stats, practice reports, team PROE and pace, defensive and O-line starters, rest days: nflverse
                {nfl ? ` (through week ${nfl.throughWeek}, updated ${new Date(nfl.updated).toLocaleString()})` : " (not loaded)"}
              </li>
              <li>Trade market values: FantasyCalc (every 6 hours){model && !hasValues(model) ? " (not loaded)" : ""}</li>
              <li>Schedule, Vegas lines: ESPN · Weather: Open-Meteo · News: ESPN / Rotowire</li>
            </ul>
            {nfl?.calib && (
              <p className="mt-2 text-slate-300">
                Self-tuning: weights learned from {nfl.calib.n.toLocaleString()} player-games through week {nfl.calib.throughWeek}, refit every time a
                week finishes.
                {nfl.calib.accuracy?.warRoom != null && (
                  <>
                    {" "}
                    Average miss per player this season: War Room {nfl.calib.accuracy.warRoom} pts
                    {nfl.calib.accuracy.blend != null ? `, the three sources averaged ${nfl.calib.accuracy.blend}` : ""}
                    {nfl.calib.accuracy.fantasypros != null ? `, FantasyPros ${nfl.calib.accuracy.fantasypros}` : ""}
                    {nfl.calib.accuracy.sleeper != null ? `, Sleeper ${nfl.calib.accuracy.sleeper}` : ""}
                    {nfl.calib.accuracy.espn != null ? `, ESPN ${nfl.calib.accuracy.espn}` : ""} (tested on games it hadn&apos;t seen).
                  </>
                )}
              </p>
            )}
            <p className="mt-2">Data: nflverse (CC-BY 4.0), FTN Data via nflverse (CC-BY-SA 4.0), ffopportunity, DynastyProcess, FantasyPros expert consensus.</p>
          </details>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {saved.leagueId && (
            <button
              className="btn btn-ghost mr-auto"
              onClick={() => {
                setSaved({ leagueId: "", rosterId: null });
                onClose();
              }}
            >
              ⇆ Switch league
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}

function projStatus(m: NonNullable<ReturnType<typeof useLeague>["model"]>) {
  const live = m.extras.espnProj && Object.keys(m.extras.espnProj).length > 0;
  const espn = live ? "ESPN live" : m.nfl?.espnProj?.week === m.week ? "ESPN from the backup copy" : "ESPN not loaded";
  const ranks = m.nfl?.ecr && (m.nfl.ecr.week == null || m.nfl.ecr.week === m.week);
  const fp =
    m.nfl?.fpProj?.week === m.week
      ? `FantasyPros top-10 projections + weekly ranks for everyone else (${m.nfl.fpProj.date})`
      : ranks
        ? `FantasyPros weekly ranks (${m.nfl!.ecr!.date})`
        : "FantasyPros not loaded yet";
  return `Sleeper live · ${espn} · ${fp}`;
}

function hasValues(m: NonNullable<ReturnType<typeof useLeague>["model"]>) {
  for (const v of m.views.values()) if (v.market) return true;
  return false;
}
