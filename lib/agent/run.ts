// Multi-provider agent loop. Calls Anthropic or OpenAI directly from the browser
// with the user's own API key, so the key never touches our server.

import type { LeagueModel } from "../model";
import type { AiSettings, ProviderId } from "../types";
import { TOOLS } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url: string }[];
  steps?: string[];
}

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string; keyHint: string; keyUrl: string }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    defaultModel: "claude-sonnet-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    label: "OpenAI (GPT)",
    defaultModel: "gpt-5.5",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
};

const MAX_ROUNDS = 10;

function buildSystem(m: LeagueModel, myId: number, strategy: string) {
  const me = m.team(myId);
  const today = new Date().toDateString();
  return `You are War Room, an expert fantasy football analyst and agent working for one manager in a Sleeper league.
Today is ${today}. The NFL is in week ${m.week} of the ${m.season} season.
League: "${m.bundle.league.name}", ${m.teams.length} teams. The user manages "${me?.teamName}" (owner ${me?.ownerName}), record ${me?.wins}-${me?.losses}.

You have live tools for this league: rosters, usage, league-specific scoring, matchups, Vegas lines, defense vs position, a week-by-week trade simulator, waivers and start/sit. Use them instead of guessing, and pull fresh news with web search when injuries, roles or practice reports matter. Tool numbers are model estimates: combine them with news and judgment, and say when news changes the picture.

Key definitions: valuePerGame blends projections with recent and season scoring in this league's scoring. valueOverReplacement is points per game above a waiver-level starter at that position, which is how scarcity shows up. Trade results are the change in the user's best possible lineup, summed week by week to the championship.

${strategy}`;
}

// ---------------- Anthropic ----------------

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  citations?: { url?: string; title?: string }[];
}

async function anthropicCall(key: string, body: Record<string, unknown>) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `Anthropic error ${res.status}`);
  return json as { content: AnthropicBlock[]; stop_reason: string };
}

async function runAnthropic(
  s: AiSettings,
  system: string,
  history: ChatMessage[],
  exec: (name: string, args: Record<string, unknown>) => unknown,
  onStep: (label: string) => void
): Promise<ChatMessage> {
  const tools: Record<string, unknown>[] = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  let useSearch = s.webSearch;
  const messages: { role: string; content: unknown }[] = history.map((h) => ({ role: h.role, content: h.content }));
  const steps: string[] = [];
  const sources = new Map<string, string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const allTools = useSearch ? [...tools, { type: "web_search_20250305", name: "web_search", max_uses: 5 }] : tools;
    let resp;
    try {
      resp = await anthropicCall(s.apiKey, { model: s.model || PROVIDERS.anthropic.defaultModel, max_tokens: 8000, system, tools: allTools, messages });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (useSearch && /web_search|tool/i.test(msg)) {
        useSearch = false;
        steps.push("Web search unavailable on this key, continuing without it");
        onStep(steps[steps.length - 1]);
        round--;
        continue;
      }
      throw e;
    }
    for (const b of resp.content) {
      if (b.type === "server_tool_use" && b.name === "web_search") {
        const q = (b.input as { query?: string } | undefined)?.query;
        steps.push(`Searching the web: ${q ?? ""}`);
        onStep(steps[steps.length - 1]);
      }
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content as { url?: string; title?: string }[]) if (r.url) sources.set(r.url, r.title || r.url);
      }
      if (b.type === "text") for (const c of b.citations ?? []) if (c.url) sources.set(c.url, c.title || c.url);
    }
    messages.push({ role: "assistant", content: resp.content });
    if (resp.stop_reason === "pause_turn") continue;
    const calls = resp.content.filter((b) => b.type === "tool_use");
    if (!calls.length) {
      const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      return { role: "assistant", content: text.trim(), steps, sources: [...sources].map(([url, title]) => ({ url, title })) };
    }
    const results = calls.map((c) => {
      const def = TOOLS.find((t) => t.name === c.name);
      const label = def?.label(c.input ?? {}) ?? c.name ?? "tool";
      steps.push(label);
      onStep(label);
      let out: unknown;
      try {
        out = exec(c.name!, c.input ?? {});
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) };
    });
    messages.push({ role: "user", content: results });
  }
  return { role: "assistant", content: "I hit my research limit for one answer. Ask me to continue, or narrow the question.", steps };
}

// ---------------- OpenAI (Responses API) ----------------

interface OpenAIItem {
  type: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  action?: { query?: string };
  content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string }[] }[];
}

async function openaiCall(key: string, body: Record<string, unknown>) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `OpenAI error ${res.status}`);
  return json as { id: string; output: OpenAIItem[] };
}

async function runOpenAI(
  s: AiSettings,
  system: string,
  history: ChatMessage[],
  exec: (name: string, args: Record<string, unknown>) => unknown,
  onStep: (label: string) => void
): Promise<ChatMessage> {
  const fnTools = TOOLS.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.parameters, strict: false }));
  const searchTypes = s.webSearch ? ["web_search", "web_search_preview"] : [];
  let searchIdx = 0;
  const steps: string[] = [];
  const sources = new Map<string, string>();
  let input: unknown = history.map((h) => ({ role: h.role, content: h.content }));
  let previous: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const searchTool = searchTypes[searchIdx] ? [{ type: searchTypes[searchIdx] }] : [];
    let resp;
    try {
      resp = await openaiCall(s.apiKey, {
        model: s.model || PROVIDERS.openai.defaultModel,
        instructions: system,
        input,
        tools: [...fnTools, ...searchTool],
        ...(previous ? { previous_response_id: previous } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (searchTool.length && /web_search|tool/i.test(msg)) {
        searchIdx++;
        round--;
        continue;
      }
      throw e;
    }
    previous = resp.id;
    const calls: OpenAIItem[] = [];
    let text = "";
    for (const item of resp.output ?? []) {
      if (item.type === "web_search_call") {
        steps.push(`Searching the web${item.action?.query ? `: ${item.action.query}` : ""}`);
        onStep(steps[steps.length - 1]);
      } else if (item.type === "function_call") calls.push(item);
      else if (item.type === "message") {
        for (const c of item.content ?? []) {
          if (c.type === "output_text") {
            text += c.text ?? "";
            for (const a of c.annotations ?? []) if (a.url) sources.set(a.url, a.title || a.url);
          }
        }
      }
    }
    if (!calls.length) return { role: "assistant", content: text.trim(), steps, sources: [...sources].map(([url, title]) => ({ url, title })) };
    input = calls.map((c) => {
      const def = TOOLS.find((t) => t.name === c.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.arguments || "{}");
      } catch {
        /* keep empty */
      }
      const label = def?.label(args) ?? c.name ?? "tool";
      steps.push(label);
      onStep(label);
      let out: unknown;
      try {
        out = exec(c.name!, args);
      } catch (e) {
        out = { error: e instanceof Error ? e.message : String(e) };
      }
      return { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) };
    });
  }
  return { role: "assistant", content: "I hit my research limit for one answer. Ask me to continue, or narrow the question.", steps };
}

// ---------------- entry points ----------------

export async function runAgent(
  s: AiSettings,
  m: LeagueModel,
  myId: number,
  history: ChatMessage[],
  onStep: (label: string) => void
): Promise<ChatMessage> {
  if (!s.apiKey) throw new Error("Add your API key in Settings first.");
  const system = buildSystem(m, myId, s.strategy);
  const exec = (name: string, args: Record<string, unknown>) => {
    const t = TOOLS.find((x) => x.name === name);
    if (!t) return { error: `Unknown tool ${name}` };
    return t.run(m, myId, args);
  };
  const trimmed = history.slice(-16).map((h) => ({ role: h.role, content: h.content }));
  return s.provider === "openai"
    ? runOpenAI(s, system, trimmed, exec, onStep)
    : runAnthropic(s, system, trimmed, exec, onStep);
}

export async function listModels(provider: ProviderId, key: string): Promise<string[]> {
  if (!key) throw new Error("Enter your API key first.");
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || "Could not list models");
    return (j.data ?? []).map((m: { id: string }) => m.id);
  }
  const res = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message || "Could not list models");
  return (j.data ?? [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => /^(gpt-|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|embedding|search)/.test(id))
    .sort()
    .reverse();
}
