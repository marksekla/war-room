"use client";

import { useEffect, useState } from "react";
import type { Position } from "@/lib/types";
import { IconBarChart, IconListOrdered, IconMoon, IconSun, IconTarget, IconTrendUp } from "./icons";

export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
  corners = false,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  corners?: boolean;
}) {
  return (
    <section className={`panel ${corners ? "panel-corners" : ""} ${className}`}>
      {(title || right) && (
        <header className="flex flex-col gap-2.5 border-b border-linesoft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5 sm:py-4">
          <h2 className="panel-title">{title}</h2>
          {right && <div className="-mx-1 min-w-0 overflow-x-auto px-1 sm:mx-0 sm:overflow-visible sm:px-0 [&>div]:flex-nowrap">{right}</div>}
        </header>
      )}
      <div className={`p-4 sm:p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = "cyan" }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "cyan" | "violet" | "lime" | "amber" }) {
  const chip = { cyan: "bg-accenttint text-accent", violet: "bg-purpletint text-purple", lime: "bg-goodtint text-good", amber: "bg-warntint text-warn" };
  const Icon = { cyan: IconListOrdered, violet: IconBarChart, lime: IconTrendUp, amber: IconTarget }[tone];
  return (
    <div className="panel flex items-start gap-3.5 px-4 py-4 sm:px-5">
      <div className={`hidden h-10 w-10 shrink-0 place-items-center rounded-lg sm:grid ${chip[tone]}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <div className="tile-label">{label}</div>
        <div className="mt-0.5 font-display text-[22px] font-semibold leading-tight text-ink">{value}</div>
        {sub && <div className="mt-1 text-xs leading-snug text-muted">{sub}</div>}
      </div>
    </div>
  );
}

const POS_STYLE: Record<string, string> = {
  QB: "bg-rose-500/10 text-rose-400",
  RB: "bg-emerald-500/10 text-emerald-400",
  WR: "bg-cyan-500/10 text-cyan-400",
  TE: "bg-amber-500/10 text-amber-500",
  K: "bg-slate-500/10 text-slate-400",
  DEF: "bg-violet-500/10 text-violet-400",
};

export function PosTag({ pos }: { pos: Position | string }) {
  return (
    <span className={`inline-flex w-9 justify-center rounded-md px-1 py-[3px] text-[10px] font-semibold leading-none tracking-wide ${POS_STYLE[pos] ?? POS_STYLE.K}`}>
      {pos}
    </span>
  );
}

export function InjuryTag({ status }: { status: string | null }) {
  if (!status) return null;
  const tone = status === "Questionable" ? "text-warn bg-warn/10" : "text-bad bg-bad/10";
  const short: Record<string, string> = { Questionable: "Q", Doubtful: "D", Out: "O", IR: "IR", PUP: "PUP", Sus: "SUS", NA: "NA" };
  return (
    <span title={status} className={`ml-1.5 inline-block rounded px-1 py-[2px] align-middle text-[10px] font-semibold leading-none ${tone}`}>
      {short[status] ?? status}
    </span>
  );
}

export function Meter({ value, max = 1, tone = "cyan" }: { value: number | null; max?: number; tone?: "cyan" | "violet" | "lime" }) {
  if (value == null) return <span className="text-faint">-</span>;
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { cyan: "bg-accent", violet: "bg-purple", lime: "bg-good" }[tone];
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-track">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-ink2">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function RankChip({ rank, of = 32 }: { rank: number | null | undefined; of?: number }) {
  if (!rank) return <span className="text-faint">-</span>;
  // High rank number = generous defense = good matchup.
  const good = rank > of * 0.66;
  const bad = rank <= of * 0.33;
  const tone = good ? "text-good bg-good/10" : bad ? "text-bad bg-bad/10" : "text-ink2 bg-track";
  return <span className={`inline-block min-w-[22px] rounded px-1.5 py-[3px] text-center font-mono text-[10px] font-semibold leading-none ${tone}`}>{rank}</span>;
}

export function Delta({ value, suffix = "" }: { value: number; suffix?: string }) {
  const tone = value > 0.5 ? "text-good" : value < -0.5 ? "text-bad" : "text-ink2";
  return (
    <span className={`font-mono ${tone}`}>
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-10 text-center text-sm text-muted">{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-track border-t-accent" />
      {label}
    </div>
  );
}

/** Circular chance-to-play gauge. Green when likely, amber when uncertain, red when unlikely. */
export function ChanceRing({ p, size = 48 }: { p: number; size?: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = pct >= 80 ? "rgb(var(--t-good))" : pct >= 50 ? "rgb(var(--t-warn))" : "rgb(var(--t-bad))";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${pct}% chance to play`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: "rgb(var(--t-track))" }} strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-mono text-[11px] font-semibold" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

/** Light / dark switch. Dark is the default; the choice is remembered on this device. */
export function ThemeToggle({ className = "", label = false }: { className?: string; label?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0b0d10" : "#f5f6f8");
    try {
      localStorage.setItem("war-room:theme", next);
    } catch {
      /* private mode: the switch still works for this visit */
    }
    setTheme(next);
  };
  return (
    <button
      onClick={flip}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={className}
    >
      <span aria-hidden>{theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}</span>
      {label && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
