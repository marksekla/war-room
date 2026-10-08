// The NFL's official injury report (nfl.com/injuries), parsed from the page HTML.
// Teams file it every practice day; it lists each player's injury, latest practice
// participation and, once it's final, the game status.

export interface OfficialRow {
  /** Index of the table on the page (each team has its own). */
  tbl: number;
  /** Team named in the heading just before the table, when there is one. */
  contextTeam: string | null;
  name: string;
  pos: string;
  injury: string | null;
  practice: "DNP" | "LP" | "FP" | null;
  game: "Out" | "Doubtful" | "Questionable" | null;
}

export const TEAM_BY_NICKNAME: Record<string, string> = {
  Cardinals: "ARI", Falcons: "ATL", Ravens: "BAL", Bills: "BUF", Panthers: "CAR", Bears: "CHI", Bengals: "CIN",
  Browns: "CLE", Cowboys: "DAL", Broncos: "DEN", Lions: "DET", Packers: "GB", Texans: "HOU", Colts: "IND",
  Jaguars: "JAX", Chiefs: "KC", Chargers: "LAC", Rams: "LAR", Raiders: "LV", Dolphins: "MIA", Vikings: "MIN",
  Patriots: "NE", Saints: "NO", Giants: "NYG", Jets: "NYJ", Eagles: "PHI", Steelers: "PIT", Seahawks: "SEA",
  "49ers": "SF", Buccaneers: "TB", Titans: "TEN", Commanders: "WAS",
};
const TEAM_RE = new RegExp(`\\b(${Object.keys(TEAM_BY_NICKNAME).join("|")})\\b`, "g");

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#?[a-z0-9]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();

export function parseOfficialReport(html: string): OfficialRow[] {
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const out: OfficialRow[] = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  let ti = 0;
  while ((m = tableRe.exec(clean))) {
    const before = text(clean.slice(Math.max(lastEnd, m.index - 4000), m.index));
    lastEnd = m.index + m[0].length;
    const found = before.match(TEAM_RE);
    const contextTeam = found ? TEAM_BY_NICKNAME[found[found.length - 1]] : null;
    const rows = [...m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])));
    const tbl = ti++;
    if (!rows.length) continue;
    const head = rows[0].map((h) => h.toLowerCase());
    if (!head.some((h) => h.includes("player")) || !head.some((h) => h.includes("practice"))) continue;
    const col = (k: string) => head.findIndex((h) => h.includes(k));
    const ci = { player: col("player"), pos: col("position"), inj: col("injur"), prac: col("practice"), game: col("game") };
    for (const r of rows.slice(1)) {
      const get = (i: number) => (i >= 0 && i < r.length ? r[i] : "");
      const name = get(ci.player);
      if (!name) continue;
      const pr = get(ci.prac).toLowerCase();
      const gm = get(ci.game).toLowerCase();
      out.push({
        tbl,
        contextTeam,
        name,
        pos: get(ci.pos).toUpperCase(),
        injury: get(ci.inj) || null,
        practice: pr.includes("did not") ? "DNP" : pr.includes("limited") ? "LP" : pr.includes("full") ? "FP" : null,
        game: gm.startsWith("out") ? "Out" : gm.startsWith("doubtful") ? "Doubtful" : gm.startsWith("questionable") ? "Questionable" : null,
      });
    }
  }
  return out;
}

// Teams post the report in the afternoon of each practice day; West Coast teams later (local time).
const TZ: Record<string, number> = {
  // hours behind Eastern
  CHI: 1, DAL: 1, GB: 1, HOU: 1, KC: 1, MIN: 1, NO: 1, TEN: 1,
  DEN: 2, ARI: 2,
  LAC: 3, LAR: 3, LV: 3, SEA: 3, SF: 3,
};

const ET = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hour12: false });
function etParts(t: number) {
  const p = Object.fromEntries(ET.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { wd: p.weekday as string, y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24 };
}

/**
 * Which practice day the latest official report covers for a team, given its kickoff: the most recent
 * practice day whose report should be out by now (about 4:30pm local). Practice days are the three days
 * ending two days before a Sunday/Monday/Saturday game, or the three days before a Thursday game.
 */
export function officialReportDay(team: string, kick: number, now: number, rule: "posted" | "noon" | "late" = "posted"): string | null {
  const k = etParts(kick);
  const offsets = k.wd === "Thu" ? [3, 2, 1] : [4, 3, 2];
  const [hh, mm] = rule === "posted" ? [16, 30] : rule === "late" ? [19, 0] : [12, 0];
  let label: string | null = null;
  for (const daysBack of offsets) {
    const t = kick - daysBack * 86_400_000;
    const e = etParts(t);
    const utcOff = (new Date(t).getUTCHours() - e.h + 24) % 24; // 4 in summer, 5 in winter
    const at = Date.UTC(e.y, e.m - 1, e.d, hh + (TZ[team] ?? 0) + utcOff, mm);
    if (now >= at) label = e.wd;
  }
  return label;
}

const normName = (n: string) => n.toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z]/g, "");

/** Same hash the data build stores (scripts/nfl_official.py fingerprint), so a report can be recognised. */
export function reportFingerprint(rows: OfficialRow[]): string {
  const items = rows.map((r) => `${normName(r.name)}|${r.practice ?? ""}|${r.game ?? ""}`).sort();
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(items.join(";"))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The practice day a team's live report describes. If the data build already saw this exact report,
 * keep its label (unless it's now well past the next day's deadline, which means the new day's report
 * came out identical). If the report changed since, it's the latest practice day that has started. A
 * team the build never saw gets the latest day whose report should be out.
 */
export function labelReport(team: string, fp: string, kick: number, now: number, saved?: { fp: string; day: string } | null): string | null {
  if (saved && saved.fp === fp) {
    const late = officialReportDay(team, kick, now, "late");
    return late && ORDER.indexOf(late) > ORDER.indexOf(saved.day) ? late : saved.day;
  }
  return officialReportDay(team, kick, now, saved ? "noon" : "posted");
}
