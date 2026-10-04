"use client";

import { useState } from "react";
import { useLeague } from "@/lib/LeagueContext";
import { DEFAULT_STRATEGY } from "@/lib/agent/strategy";
import { listModels, PROVIDERS } from "@/lib/agent/run";
import type { ProviderId } from "@/lib/types";

export default function Settings({ onClose }: { onClose: () => void }) {
  const { saved, setSaved } = useLeague();
  const [ai, setAi] = useState(saved.ai);
  const [models, setModels] = useState<string[]>([]);
  const [modelErr, setModelErr] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const provider = PROVIDERS[ai.provider];

  const fetchModels = async () => {
    setLoadingModels(true);
    setModelErr(null);
    try {
      const list = await listModels(ai.provider, ai.apiKey);
      setModels(list);
      if (!ai.model && list.length) setAi({ ...ai, model: list[0] });
    } catch (e) {
      setModelErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingModels(false);
    }
  };

  const save = () => {
    setSaved({ ai });
    onClose();
  };

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
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setAi({ ...ai, provider: id, model: "" });
                    setModels([]);
                  }}
                  className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
                    ai.provider === id ? "border-cyan-300/70 bg-cyan-400/10 shadow-glow" : "border-white/10 hover:border-cyan-400/30"
                  }`}
                >
                  {PROVIDERS[id].label}
                </button>
              ))}
            </div>
          </div>

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
              <a className="text-cyan-300 underline" href={provider.keyUrl} target="_blank" rel="noreferrer">
                {provider.keyUrl.replace("https://", "")}
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
                  placeholder={`default: ${provider.defaultModel}`}
                  value={ai.model}
                  onChange={(e) => setAi({ ...ai, model: e.target.value.trim() })}
                />
              )}
              <button className="btn" onClick={fetchModels} disabled={!ai.apiKey || loadingModels}>
                {loadingModels ? "Loading" : "Load models"}
              </button>
            </div>
            {modelErr && <p className="mt-2 text-xs text-rose-300">{modelErr}</p>}
          </div>

          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" checked={ai.webSearch} onChange={(e) => setAi({ ...ai, webSearch: e.target.checked })} className="h-4 w-4 accent-cyan-400" />
            Let the agent search the web for injury news and practice reports (small extra cost per search)
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
