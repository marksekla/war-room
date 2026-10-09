"use client";

import { useEffect, useRef, useState } from "react";
import { useLeague } from "@/lib/LeagueContext";
import type { LeagueModel } from "@/lib/model";
import { runAgent, PROVIDERS, type ChatMessage } from "@/lib/agent/run";
import Markdown from "./Markdown";

const SUGGESTIONS = [
  "Who are the best waiver adds for my roster this week?",
  "Find me a fair trade that upgrades my RB2. Check every team's needs.",
  "Set my lineup for this week and flag any injury or lock-timing risks.",
  "Which of my players should I sell high or buy low right now?",
];

export default function Chat({
  model,
  myId,
  pendingPrompt,
  clearPending,
  openSettings,
}: {
  model: LeagueModel;
  myId: number;
  pendingPrompt: string | null;
  clearPending: () => void;
  openSettings: () => void;
}) {
  const { saved } = useLeague();
  const storeKey = `war-room:chat:${saved.leagueId}:${myId}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Keep the conversation across refreshes (this browser only, per league and team).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      setMessages(raw ? (JSON.parse(raw) as ChatMessage[]) : []);
    } catch {
      setMessages([]);
    }
    setLoaded(true);
  }, [storeKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      if (messages.length) localStorage.setItem(storeKey, JSON.stringify(messages.slice(-40)));
      else localStorage.removeItem(storeKey);
    } catch {
      /* storage full or blocked: chat still works, it just won't be saved */
    }
  }, [messages, loaded, storeKey]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, live]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    if (!saved.ai.apiKey) {
      setErr("Add an AI key in Settings to use the agent. Gemini keys from Google AI Studio are free.");
      return;
    }
    setErr(null);
    const history = [...messages, { role: "user" as const, content: q }];
    setMessages(history);
    setInput("");
    setBusy(true);
    setLive([]);
    try {
      const reply = await runAgent(saved.ai, model, myId, history, (label) => setLive((l) => [...l, label]), {
        untouchables: saved.untouchables ?? [],
      });
      setMessages((m) => [...m, reply]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setLive([]);
    }
  };

  useEffect(() => {
    if (pendingPrompt && loaded) {
      clearPending();
      send(pendingPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt, loaded]);

  const provider = PROVIDERS[saved.ai.provider];

  return (
    <div className="flex h-[calc(100dvh-12.5rem)] flex-col md:h-[calc(100vh-11rem)]">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-semibold text-ink">AI Agent</h1>
        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-0.5 font-mono text-[11px] text-fuchsia-200">
          {provider.label} · {saved.ai.model || provider.defaultModel || "auto"}
        </span>
        {messages.length > 0 && (
          <button className="btn btn-ghost ml-auto" onClick={() => setMessages([])}>New chat</button>
        )}
      </div>

      <div className="panel flex-1 overflow-y-auto p-4 md:p-6">
        {messages.length === 0 && !busy && (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center">
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-cyan-300/40 bg-cyan-400/10 shadow-glow">
              <span className="font-display text-2xl neon-text">✦</span>
            </div>
            <p className="text-sm text-slate-400">
              Your agent has your whole league loaded: rosters, league scoring, usage, snap and first-read shares, red zone work, practice reports, team pass rates, matchups, Vegas lines, weather, market trade values and a trade simulator. It checks news before it answers.
            </p>
            {!saved.ai.apiKey && (
              <button className="btn btn-violet mt-4" onClick={openSettings}>Add an AI key to start (Gemini is free)</button>
            )}
            <div className="mt-6 grid w-full gap-2 md:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/50 hover:shadow-glow"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm text-cyan-50">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[95%]">
                {m.steps && m.steps.length > 0 && (
                  <details className="mb-2 text-xs text-slate-500">
                    <summary className="cursor-pointer select-none hover:text-cyan-300">
                      {m.steps.length} research step{m.steps.length > 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {m.steps.map((s, j) => (
                        <li key={j}>› {s}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-black/30 px-4 py-3">
                  <Markdown text={m.content || "(no answer returned)"} />
                  {m.sources && m.sources.length > 0 && (
                    <div className="mt-3 border-t border-white/10 pt-2">
                      <div className="hud-title mb-1">Sources</div>
                      <ul className="space-y-0.5 text-xs">
                        {m.sources.slice(0, 10).map((s) => (
                          <li key={s.url}>
                            <a className="text-cyan-300 hover:underline" href={s.url} target="_blank" rel="noreferrer">
                              {s.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {busy && (
            <div className="space-y-1 font-mono text-xs text-cyan-300">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" /> Thinking
              </div>
              {live.map((l, i) => (
                <div key={i} className="text-slate-400">› {l}</div>
              ))}
            </div>
          )}
          {err && <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{err}</div>}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          className="input min-h-[48px] resize-none text-base md:text-sm"
          rows={1}
          placeholder="Ask your AI agent..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="btn px-5" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
