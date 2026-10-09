"use client";

// Find any NFL player and open his card. Lives in the header on every tab.

import { useEffect, useMemo, useRef, useState } from "react";
import type { LeagueModel } from "@/lib/model";
import { usePlayerDrawer } from "./PlayerDrawer";
import { InjuryTag, PosTag } from "./ui";
import { IconSearch } from "./icons";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");

export default function PlayerSearch({ model, compact = false }: { model: LeagueModel; compact?: boolean }) {
  const { open } = usePlayerDrawer();
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const [expanded, setExpanded] = useState(!compact);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const s = norm(q.trim());
    if (s.length < 2) return [];
    const out = [];
    for (const v of model.views.values()) {
      const n = norm(v.p.name);
      if (!n.includes(s)) continue;
      const score = (n.startsWith(s) || n.includes(" " + s) ? 100 : 0) + v.valuePg;
      out.push({ v, score });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }, [q, model]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setShow(false);
        if (compact && !q) setExpanded(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [compact, q]);

  const pick = (id: string) => {
    open(id);
    setQ("");
    setShow(false);
    if (compact) setExpanded(false);
  };

  if (compact && !expanded)
    return (
      <button
        className="icon-btn"
        aria-label="Search players"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => input.current?.focus(), 0);
        }}
      >
        <IconSearch size={17} />
      </button>
    );

  return (
    <div ref={box} className={compact ? "absolute inset-x-0 top-full z-30 border-b border-line bg-card px-4 py-2" : "relative w-full max-w-[420px]"}>
      <IconSearch size={16} className={`pointer-events-none absolute z-10 text-faint ${compact ? "left-[30px] top-[19px]" : "left-3.5 top-1/2 -translate-y-1/2"}`} />
      <input
        ref={input}
        className="input rounded-full border-line bg-sunken py-2 pl-10 text-sm focus:bg-card"
        placeholder="Search any player"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setShow(true);
        }}
        onFocus={() => setShow(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0].v.p.id);
          if (e.key === "Escape") {
            setQ("");
            setShow(false);
            if (compact) setExpanded(false);
          }
        }}
      />
      {show && results.length > 0 && (
        <ul className={`${compact ? "mt-2" : "absolute left-0 right-0 top-full mt-1.5"} z-40 overflow-hidden rounded-xl border border-line bg-card py-1 shadow-xl`}>
          {results.map(({ v }) => (
            <li key={v.p.id}>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(v.p.id)}
              >
                <PosTag pos={v.p.pos} />
                <span className="truncate text-ink">{v.p.name}</span>
                <span className="text-xs text-muted">{v.p.team ?? "FA"}</span>
                <InjuryTag status={v.p.injury} />
                <span className="ml-auto truncate text-[11px] text-muted">{model.ownerName(v.p.id)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
