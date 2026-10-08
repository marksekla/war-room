"""The NFL's official injury report, read straight from nfl.com.

Teams file it every practice day (usually posted 4-6pm ET): each player's injury, latest
practice participation (DNP / limited / full) and, from Friday, the game status. nflverse
publishes the same report, but hours later; reading it at the source means the practice
status for a day shows up that evening.

Fails soft: if the page can't be read or doesn't look right, nothing is returned and the
build keeps using nflverse. A short note on what the page looked like is returned so it can
be fixed.
"""

from __future__ import annotations

import re
import urllib.request
from html.parser import HTMLParser

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)

TEAMS = {
    "Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF", "Panthers": "CAR", "Bears": "CHI",
    "Bengals": "CIN", "Browns": "CLE", "Cowboys": "DAL", "Broncos": "DEN", "Lions": "DET", "Packers": "GB",
    "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX", "Chiefs": "KC", "Chargers": "LAC", "Rams": "LAR",
    "Raiders": "LV", "Dolphins": "MIA", "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG",
    "Jets": "NYJ", "Eagles": "PHI", "Steelers": "PIT", "Seahawks": "SEA", "49ers": "SF", "Buccaneers": "TB",
    "Titans": "TEN", "Commanders": "WAS",
}
TEAM_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in TEAMS) + r")\b")
PRACTICE = {
    "did not participate": "Did Not Participate In Practice",
    "limited": "Limited Participation in Practice",
    "full": "Full Participation in Practice",
}
GAME = {"out": "Out", "doubtful": "Doubtful", "questionable": "Questionable"}


class _Page(HTMLParser):
    """Every <table> on the page (rows of cell texts) plus the text that came before it."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tables: list[dict] = []
        self.depth = 0
        self.row: list[str] | None = None
        self.cell: list[str] | None = None
        self.before: list[str] = []  # text seen outside tables, most recent last
        self.skip = 0  # inside <script>/<style>

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
            return
        if tag == "table":
            self.depth += 1
            if self.depth == 1:
                self.tables.append({"context": " ".join(self.before[-12:]), "rows": []})
            return
        if not self.depth:
            return
        if tag == "tr":
            self.row = []
            self.tables[-1]["rows"].append(self.row)
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
            self.row.append("")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
            return
        if tag == "table" and self.depth:
            self.depth -= 1
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row[-1] = " ".join("".join(self.cell).split())
            self.cell = None

    def handle_data(self, data):
        if self.skip:
            return
        if self.depth and self.cell is not None:
            self.cell.append(data)
        elif not self.depth:
            t = data.strip()
            if t:
                self.before.append(t)


def _norm(n: str) -> str:
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", str(n).lower())
    return re.sub(r"[^a-z]", "", s)


def parse(html: str) -> tuple[list[dict], dict]:
    """-> ([{team, name, pos, injury, practice, game}], diagnostics)."""
    p = _Page()
    p.feed(html)
    out: list[dict] = []
    diag = {"htmlKB": round(len(html) / 1024), "tables": len(p.tables)}
    for ti, t in enumerate(p.tables):
        rows = [r for r in t["rows"] if any(r)]
        if not rows:
            continue
        head = [c.lower() for c in rows[0]]
        if not any("player" in h for h in head) or not any("practice" in h for h in head):
            continue
        col = {k: next((i for i, h in enumerate(head) if k in h), None)
               for k in ("player", "position", "injur", "practice", "game")}
        found = TEAM_RE.findall(t["context"])
        tm = TEAMS[found[-1]] if found else None
        for r in rows[1:]:
            def get(k):
                i = col[k]
                return r[i] if i is not None and i < len(r) else ""
            name = get("player")
            if not name:
                continue
            prac_raw, game_raw = get("practice").lower(), get("game").lower()
            prac = next((v for k, v in PRACTICE.items() if k in prac_raw), None)
            game = next((v for k, v in GAME.items() if game_raw.startswith(k)), None)
            out.append({"tbl": ti, "team": tm, "name": name, "pos": get("position").upper(), "injury": get("injur") or None,
                        "practice": prac, "game": game})
    diag["rows"] = len(out)
    diag["teams"] = len({r["team"] for r in out if r["team"]})
    if not out:
        diag["firstTableHead"] = p.tables[0]["rows"][0][:8] if p.tables and p.tables[0]["rows"] else None
        diag["textSample"] = " | ".join(p.before[:15])[:300]
    return out, diag


def fetch(season: int, week: int, timeout: int = 30) -> str:
    url = f"https://www.nfl.com/injuries/league/{season}/reg{week}"
    req = urllib.request.Request(url, headers={"user-agent": UA, "accept": "text/html,application/xhtml+xml"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def report(season: int, week: int, ids) -> tuple[list[dict], dict]:
    """Official report rows for one week, matched to nflverse (gsis) ids where possible."""
    try:
        html = fetch(season, week)
    except Exception as e:  # noqa: BLE001
        return [], {"error": f"{e.__class__.__name__}: {str(e)[:120]}"}
    rows, diag = parse(html)
    if not rows:
        return [], diag
    # Match by name (+ team when the same name exists twice).
    by_name: dict[str, list[tuple[str, str]]] = {}
    fix = {"LVR": "LV", "LA": "LAR", "JAC": "JAX", "WSH": "WAS", "OAK": "LV", "SD": "LAC", "STL": "LAR", "GBP": "GB",
           "KCC": "KC", "NEP": "NE", "NOS": "NO", "SFO": "SF", "TBB": "TB"}
    if ids is not None and not ids.empty:
        for n, g, t in zip(ids.name, ids.gsis_id, ids.team):
            if isinstance(n, str) and isinstance(g, str):
                by_name.setdefault(_norm(n), []).append((g, fix.get(str(t), str(t))))
    # Which team each table belongs to: the players' own teams outvote the heading text, in case
    # the heading names both teams in the matchup.
    votes: dict[int, dict[str, int]] = {}
    for r in rows:
        cands = by_name.get(_norm(r["name"]), [])
        if len(cands) == 1:
            v = votes.setdefault(r["tbl"], {})
            v[cands[0][1]] = v.get(cands[0][1], 0) + 1
    for r in rows:
        v = votes.get(r["tbl"])
        if v:
            top, n = max(v.items(), key=lambda kv: kv[1])
            if n >= 2 and n / sum(v.values()) >= 0.6:
                r["team"] = top
    matched = 0
    for r in rows:
        cands = by_name.get(_norm(r["name"]), [])
        if len(cands) > 1 and r["team"]:
            cands = [c for c in cands if c[1] == r["team"]] or cands
        r["gsis"] = cands[0][0] if len(cands) == 1 else None
        matched += r["gsis"] is not None
    diag["matched"] = matched
    diag["teams"] = len({r["team"] for r in rows if r["team"]})
    by: dict[str, int] = {}
    for r in rows:
        by[r["team"] or "?"] = by.get(r["team"] or "?", 0) + 1
    diag["byTeam"] = by
    diag["unmatchedSkill"] = [r["name"] for r in rows if not r["gsis"] and r["pos"] in ("QB", "RB", "WR", "TE", "K")][:15]
    return rows, diag
