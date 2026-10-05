// Multi-provider agent loop. Calls Claude, GPT, Gemini or any OpenAI-compatible API directly from the browser
// with the user's own API key, so the key never touches our server.

import type { LeagueModel } from "../model";
import type { AiSettings, ProviderId } from "../types";
import { TOOLS, type AgentCtx } from "./tools";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: { title: string; url: string }[];
  steps?: string[];
}

export interface ProviderInfo {
  label: string;
  sub: string;
  defaultModel: string;
  keyHint: string;
  keyUrl: string;
  note?: string;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    label: "Claude",
    sub: "Anthropic",
    defaultModel: "claude-sonnet-5",
    keyHint: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    label: "GPT",
    sub: "OpenAI",
    defaultModel: "gpt-5.5",
    keyHint: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    label: "Gemini",
    sub: "Google · free tier",
    defaultModel: "",
    keyHint: "AIza...",
    keyUrl: "https://aistudio.google.com/apikey",
    note: "Free key from Google AI Studio, no card needed. Free use has daily limits; if you hit one, wait or pick another model. Google Search needs a paid key, so free keys rely on the app's own news feed.",
  },
  compat: {
    label: "Other",
    sub: "OpenRouter, Groq, xAI...",
    defaultModel: "",
    keyHint: "API key",
    keyUrl: "https://openrouter.ai/keys",
    note: "Any OpenAI-compatible API. Pick the model with Load models; it must support tool calling.",
  },
};

export const COMPAT_PRESETS = [
  { name: "OpenRouter", url: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys" },
  { name: "Groq", url: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys" },
  { name: "xAI", url: "https://api.x.ai/v1", keyUrl: "https://console.x.ai" },
  { name: "DeepSeek", url: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys" },
  { name: "Mistral", url: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys" },
];

type Exec = (name: string, args: Record<string, unknown>) => Promise<unknown>;

const MAX_ROUNDS = 10;

function buildSystem(m: LeagueModel, myId: number, strategy: string) {
  const me = m.team(myId);
  const today = new Date().toDateString();
  return `You are War Room, an expert fantasy football analyst and agent working for one manager in a Sleeper league.
Today is ${today}. The NFL is in week ${m.week} of the ${m.season} season.
League: "${m.bundle.league.name}", ${m.teams.length} teams. The user manages "${me?.teamName}" (owner ${me?.ownerName}), record ${me?.wins}-${me?.losses}.

You have live tools for this league: rosters, usage, league-specific scoring, matchups, Vegas lines, defense vs position, a week-by-week trade simulator, waivers and start/sit. You also have advanced data from nflverse (snap share, first-read target share, air yards, WOPR, red zone and goal-line work, expected fantasy points, Next Gen Stats, official practice reports), team environment (pass rate over expected, neutral pass rate, pace, red zone trips, QB goal-line rushing, defensive EPA), FantasyCalc market trade values, ESPN injury designations, player news blurbs, game-day weather, Sleeper and ESPN projections (averaged), opposing defensive starters and O-linemen who are hurt, rest days, this week's head-to-head matchup with win probability, and every manager's transactions and trade tendencies. Use them instead of guessing, and pull fresh news with web search when injuries, roles or practice reports matter. Tool numbers are model estimates: combine them with news and judgment, and say when news changes the picture.
League-average PROE is about -2%, not 0. xFP is expected PPR points from a player's opportunity; actual minus expected shows luck or efficiency that may not last. Advanced data updates daily, so for game-day news use get_player_news or web search.

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
  exec: Exec,
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
    const results = await Promise.all(
      calls.map(async (c) => {
        const out = await runTool(exec, c.name ?? "", c.input ?? {}, steps, onStep);
        return { type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) };
      })
    );
    messages.push({ role: "user", content: results });
  }
  return { role: "assistant", content: LIMIT_MSG, steps };
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
  exec: Exec,
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
    input = await Promise.all(
      calls.map(async (c) => {
        const out = await runTool(exec, c.name ?? "", parseArgs(c.arguments), steps, onStep);
        return { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(out) };
      })
    );
  }
  return { role: "assistant", content: LIMIT_MSG, steps };
}

// ---------------- shared helpers ----------------

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  try {
    const v = JSON.parse(String(raw || "{}"));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

async function runTool(exec: Exec, name: string, args: Record<string, unknown>, steps: string[], onStep: (l: string) => void) {
  const def = TOOLS.find((t) => t.name === name);
  const label = def?.label(args) ?? name ?? "tool";
  steps.push(label);
  onStep(label);
  try {
    return await exec(name, args);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const LIMIT_MSG = "I hit my research limit for one answer. Ask me to continue, or narrow the question.";

// ---------------- Google Gemini ----------------

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

type GSchema = Record<string, unknown>;
/** Gemini takes an OpenAPI-style schema subset with upper-case types. */
function toGeminiSchema(s: GSchema): GSchema {
  const out: GSchema = {};
  if (typeof s.type === "string") out.type = s.type.toUpperCase();
  if (s.description) out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items as GSchema);
  if (s.properties) {
    const props: GSchema = {};
    for (const [k, v] of Object.entries(s.properties as Record<string, GSchema>)) props[k] = toGeminiSchema(v);
    out.properties = props;
    if (!Object.keys(props).length) delete out.properties;
  }
  return out;
}

interface GPart {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  [k: string]: unknown;
}

let geminiDefaultCache: { key: string; model: string } | null = null;

async function geminiModels(key: string): Promise<string[]> {
  const res = await fetch(`${GEMINI}/models?pageSize=1000`, { headers: { "x-goog-api-key": key } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `Gemini error ${res.status}`);
  return ((j.models ?? []) as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => /^gemini/.test(n) && !/(image|tts|audio|live|embedding|vision|transcribe|translate)/.test(n));
}

/** Newest plain "flash" model the key can use: fast, cheap, and on the free tier. */
function pickGemini(list: string[]): string {
  const ver = (n: string) => Number(n.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const flash = list.filter((n) => /^gemini-\d+(\.\d+)?-flash$/.test(n)).sort((a, b) => ver(b) - ver(a));
  if (flash.length) return flash[0];
  const any = list.filter((n) => n.includes("flash") && !n.includes("lite")).sort((a, b) => ver(b) - ver(a));
  return any[0] ?? list[0] ?? "gemini-2.5-flash";
}

async function geminiModel(s: AiSettings) {
  if (s.model) return s.model;
  if (geminiDefaultCache?.key === s.apiKey) return geminiDefaultCache.model;
  const model = pickGemini(await geminiModels(s.apiKey).catch(() => []));
  geminiDefaultCache = { key: s.apiKey, model };
  return model;
}

async function runGemini(s: AiSettings, system: string, history: ChatMessage[], exec: Exec, onStep: (l: string) => void): Promise<ChatMessage> {
  const model = await geminiModel(s);
  const decls = TOOLS.map((t) => {
    const params = toGeminiSchema(t.parameters as GSchema);
    return params.properties ? { name: t.name, description: t.description, parameters: params } : { name: t.name, description: t.description };
  });
  let useSearch = s.webSearch;
  const contents: { role: string; parts: GPart[] }[] = history.map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] }));
  const steps: string[] = [];
  const sources = new Map<string, string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents,
      tools: useSearch ? [{ googleSearch: {} }, { functionDeclarations: decls }] : [{ functionDeclarations: decls }],
      ...(useSearch ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
    };
    const res = await fetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": s.apiKey },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg: string = j?.error?.message || `Gemini error ${res.status}`;
      if (useSearch && ([400, 403, 429].includes(res.status) || /search|ground/i.test(msg))) {
        // Free-tier keys don't get Google Search, and older models can't mix it with our tools: keep the tools.
        useSearch = false;
        steps.push("Google Search isn't available on this key or model, continuing without it");
        onStep(steps[steps.length - 1]);
        round--;
        continue;
      }
      if (res.status === 429) throw new Error(`Gemini rate limit reached (${model}). Free keys have per-minute and daily caps: wait a bit or pick another model in Settings.`);
      throw new Error(msg);
    }
    const cand = j.candidates?.[0];
    const parts: GPart[] = cand?.content?.parts ?? [];
    const gm = cand?.groundingMetadata;
    for (const q of (gm?.webSearchQueries ?? []) as string[]) {
      steps.push(`Searching Google: ${q}`);
      onStep(steps[steps.length - 1]);
    }
    for (const c of (gm?.groundingChunks ?? []) as { web?: { uri?: string; title?: string } }[]) {
      if (c.web?.uri) sources.set(c.web.uri, c.web.title || c.web.uri);
    }
    contents.push({ role: "model", parts: parts.length ? parts : [{ text: "" }] });
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      if (!text && cand?.finishReason && cand.finishReason !== "STOP") throw new Error(`Gemini stopped early (${cand.finishReason}). Try again or pick another model.`);
      return { role: "assistant", content: text.trim(), steps, sources: [...sources].map(([url, title]) => ({ url, title })) };
    }
    const responses = await Promise.all(
      calls.map(async (p) => {
        const fc = p.functionCall!;
        const out = await runTool(exec, fc.name, fc.args ?? {}, steps, onStep);
        const response = out && typeof out === "object" && !Array.isArray(out) ? out : { result: out };
        return { functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response } };
      })
    );
    contents.push({ role: "user", parts: responses as GPart[] });
  }
  return { role: "assistant", content: LIMIT_MSG, steps };
}

// ---------------- OpenAI-compatible (Chat Completions) ----------------

function compatBase(s: AiSettings) {
  const base = (s.baseUrl || COMPAT_PRESETS[0].url).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("Set a valid base URL for your provider in Settings.");
  return base;
}

function compatHeaders(s: AiSettings, base: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${s.apiKey}` };
  if (base.includes("openrouter.ai") && typeof window !== "undefined") {
    h["HTTP-Referer"] = window.location.origin;
    h["X-Title"] = "War Room";
  }
  return h;
}

interface CompatMsg {
  role: string;
  content: string | null;
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  annotations?: { type: string; url_citation?: { url?: string; title?: string } }[];
}

async function runCompat(s: AiSettings, system: string, history: ChatMessage[], exec: Exec, onStep: (l: string) => void): Promise<ChatMessage> {
  if (!s.model) throw new Error("Pick a model in Settings first (click Load models). It needs to support tool calling.");
  const base = compatBase(s);
  const tools = TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: CompatMsg[] = [{ role: "system", content: system }, ...history.map((h) => ({ role: h.role, content: h.content }))];
  let useWeb = s.webSearch && base.includes("openrouter.ai");
  const steps: string[] = [];
  const sources = new Map<string, string>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: compatHeaders(s, base),
      body: JSON.stringify({ model: s.model, messages, tools, tool_choice: "auto", ...(useWeb ? { plugins: [{ id: "web", max_results: 5 }] } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg: string = j?.error?.message || `Provider error ${res.status}`;
      if (useWeb) {
        useWeb = false;
        steps.push("Web search plugin unavailable, continuing without it");
        onStep(steps[steps.length - 1]);
        round--;
        continue;
      }
      if (/tool/i.test(msg)) throw new Error(`${msg}. This model may not support tool calling; pick another one.`);
      throw new Error(msg);
    }
    const msg: CompatMsg = j.choices?.[0]?.message ?? { role: "assistant", content: "" };
    for (const a of msg.annotations ?? []) if (a.url_citation?.url) sources.set(a.url_citation.url, a.url_citation.title || a.url_citation.url);
    messages.push({ role: "assistant", content: msg.content ?? "", ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
    if (!msg.tool_calls?.length) {
      return { role: "assistant", content: (msg.content ?? "").trim(), steps, sources: [...sources].map(([url, title]) => ({ url, title })) };
    }
    const outs = await Promise.all(
      msg.tool_calls.map(async (c) => ({
        role: "tool",
        tool_call_id: c.id,
        content: JSON.stringify(await runTool(exec, c.function.name, parseArgs(c.function.arguments), steps, onStep)),
      }))
    );
    messages.push(...outs);
  }
  return { role: "assistant", content: LIMIT_MSG, steps };
}

// ---------------- entry points ----------------

export async function runAgent(
  s: AiSettings,
  m: LeagueModel,
  myId: number,
  history: ChatMessage[],
  onStep: (label: string) => void,
  ctx: AgentCtx = { untouchables: [] }
): Promise<ChatMessage> {
  if (!s.apiKey) throw new Error("Add your API key in Settings first.");
  const locked = ctx.untouchables.map((id) => m.view(id)?.p.name).filter(Boolean);
  const system =
    buildSystem(m, myId, s.strategy) +
    (locked.length ? `\n\nPlayers the user has locked and will not trade: ${locked.join(", ")}. Never include them in trade ideas.` : "");
  const exec: Exec = async (name, args) => {
    const t = TOOLS.find((x) => x.name === name);
    if (!t) return { error: `Unknown tool ${name}` };
    return await t.run(m, myId, args, ctx);
  };
  const trimmed = history.slice(-16).map((h) => ({ role: h.role, content: h.content }));
  switch (s.provider) {
    case "openai":
      return runOpenAI(s, system, trimmed, exec, onStep);
    case "gemini":
      return runGemini(s, system, trimmed, exec, onStep);
    case "compat":
      return runCompat(s, system, trimmed, exec, onStep);
    default:
      return runAnthropic(s, system, trimmed, exec, onStep);
  }
}

export async function listModels(s: Pick<AiSettings, "provider" | "apiKey" | "baseUrl">): Promise<string[]> {
  const { provider, apiKey: key } = s;
  if (!key) throw new Error("Enter your API key first.");
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error?.message || "Could not list models");
    return (j.data ?? []).map((m: { id: string }) => m.id);
  }
  if (provider === "gemini") {
    const list = await geminiModels(key);
    const best = pickGemini(list);
    return [best, ...list.filter((n) => n !== best).sort().reverse()];
  }
  if (provider === "compat") {
    const base = compatBase(s as AiSettings);
    const res = await fetch(`${base}/models`, { headers: compatHeaders(s as AiSettings, base) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error?.message || "Could not list models");
    const rows = (j.data ?? []) as { id: string; supported_parameters?: string[] }[];
    // OpenRouter tells us which models support tools; free ones end in ":free".
    const usable = rows.filter((r) => !r.supported_parameters || r.supported_parameters.includes("tools"));
    return usable
      .map((r) => r.id)
      .sort((a, b) => Number(b.endsWith(":free")) - Number(a.endsWith(":free")) || a.localeCompare(b));
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
