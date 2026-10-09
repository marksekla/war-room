"use client";

// Tiny, dependency-free markdown renderer for agent replies. Builds React nodes
// directly (no innerHTML), so model output can never inject HTML.

import { Fragment } from "react";

function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={k} className="rounded bg-track px-1 font-mono text-[0.85em] text-accentstrong">{tok.slice(1, -1)}</code>);
    else {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noreferrer" className="text-accentstrong underline decoration-accent/40 hover:decoration-accent">
          {label}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const size = h[1].length <= 2 ? "text-base" : "text-sm";
      blocks.push(
        <div key={key++} className={`mt-4 font-display ${size} font-semibold text-ink`}>
          {inline(h[2], `h${key}`)}
        </div>
      );
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key++} className="my-3 overflow-x-auto">
          <table className="tbl rounded-lg border border-line">
            <thead>
              <tr>{head?.map((c, j) => <th key={j}>{inline(c, `th${key}${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j} className="!whitespace-normal">{inline(c, `td${key}${ri}${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: { depth: number; text: string }[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const depth = Math.floor((lines[i].match(/^\s*/)?.[0].length ?? 0) / 2);
        items.push({ depth, text: lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "") });
        i++;
      }
      const Tag = ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={key++} className={`my-2 space-y-1 ${ordered ? "list-decimal" : "list-disc"} pl-5 marker:text-accentstrong`}>
          {items.map((it, j) => (
            <li key={j} style={{ marginLeft: it.depth * 16 }}>
              {inline(it.text, `li${key}${j}`)}
            </li>
          ))}
        </Tag>
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+\.)\s+|\s*\|)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-2 leading-relaxed">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${key}${j}`)}
          </Fragment>
        ))}
      </p>
    );
  }
  return <div className="text-sm text-ink">{blocks}</div>;
}
