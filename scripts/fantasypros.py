"""FantasyPros expert consensus, straight from fantasypros.com.

Two things come from here:
  * Consensus weekly projections (stat lines averaged across many sites). Independent studies
    find an average of many projection sources beats almost every single source, so this is
    War Room's third projection input next to Sleeper and ESPN.
  * Expert consensus rankings (ECR), rest of season and this week. Pulled fresh from the
    rankings pages; the DynastyProcess mirror (updated about once a week) is the fallback.

Everything here fails soft: if a page can't be read or doesn't look right, it is skipped
and the app keeps working on its other sources.
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
from html.parser import HTMLParser

BASE = "https://www.fantasypros.com/nfl"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36"
)
PROJ_POS = ["qb", "rb", "wr", "te"]

# (group header, column label) -> Sleeper-style stat key, so the app can score the line
# with the league's own settings (5-pt passing TDs, -1 INT, etc).
COLS = {
    ("PASSING", "ATT"): "pass_att", ("PASSING", "CMP"): "pass_cmp", ("PASSING", "YDS"): "pass_yd",
    ("PASSING", "TDS"): "pass_td", ("PASSING", "INTS"): "pass_int",
    ("RUSHING", "ATT"): "rush_att", ("RUSHING", "YDS"): "rush_yd", ("RUSHING", "TDS"): "rush_td",
    ("RECEIVING", "REC"): "rec", ("RECEIVING", "YDS"): "rec_yd", ("RECEIVING", "TDS"): "rec_td",
    ("MISC", "FL"): "fum_lost", ("MISC", "FPTS"): "fpts",
}
# Column order on each page, used only if the group header row can't be read.
FALLBACK = {
    "qb": ["pass_att", "pass_cmp", "pass_yd", "pass_td", "pass_int", "rush_att", "rush_yd", "rush_td", "fum_lost", "fpts"],
    "rb": ["rush_att", "rush_yd", "rush_td", "rec", "rec_yd", "rec_td", "fum_lost", "fpts"],
    "wr": ["rec", "rec_yd", "rec_td", "rush_att", "rush_yd", "rush_td", "fum_lost", "fpts"],
    "te": ["rec", "rec_yd", "rec_td", "fum_lost", "fpts"],
}


def log(msg: str) -> None:
    print(msg, flush=True)


_fails = 0  # consecutive failed pages; after a few, stop trying so a blocked site can't stall the build


def fetch(url: str, timeout: int = 20, tries: int = 2) -> str:
    global _fails
    if _fails >= 3:
        raise ConnectionError("fantasypros.com unreachable this run")
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"user-agent": UA, "accept": "text/html,application/xhtml+xml"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                html = r.read().decode("utf-8", "replace")
            _fails = 0
            return html
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    _fails += 1
    raise last  # type: ignore[misc]


class _DataTable(HTMLParser):
    """Collects the rows of <table id="data">: each cell's text, colspan and FantasyPros id.
    Text inside high/low range markers (min-cell / max-cell) is ignored so only the consensus number is read."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.rows: list[dict] = []
        self.row: dict | None = None
        self.cell: dict | None = None
        self.skip: list[str] = []  # open tags whose text is ignored

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            if self.depth:
                self.depth += 1
            elif a.get("id") == "data":
                self.depth = 1
            return
        if not self.depth:
            return
        cls = a.get("class") or ""
        if self.skip or re.search(r"\b(min|max)-cell\b", cls):
            if tag not in VOID:
                self.skip.append(tag)
            return
        if tag == "tr":
            m = re.search(r"mpb-player-(\d+)", cls)
            self.row = {"cells": [], "fpid": m.group(1) if m else None}
            self.rows.append(self.row)
        elif tag in ("td", "th") and self.row is not None:
            try:
                span = int(a.get("colspan") or 1)
            except ValueError:
                span = 1
            self.cell = {"th": tag == "th", "text": "", "span": span, "name": None, "player": "player-label" in cls}
            self.row["cells"].append(self.cell)
        elif tag == "a" and self.cell is not None:
            if "fp-player-link" in cls or a.get("fp-player-name") or "player-name" in cls:
                self.cell["player"] = True
                m = re.search(r"fp-id-(\d+)", cls)
                if m and self.row is not None and not self.row["fpid"]:
                    self.row["fpid"] = m.group(1)
                if a.get("fp-player-name"):
                    self.cell["name"] = a.get("fp-player-name")

    def handle_endtag(self, tag):
        if not self.depth:
            return
        if self.skip:
            if tag == self.skip[-1]:
                self.skip.pop()
            return
        if tag == "table":
            self.depth -= 1
        elif tag in ("td", "th"):
            self.cell = None
        elif tag == "tr":
            self.row = None

    def handle_data(self, data):
        if self.cell is not None and not self.skip:
            self.cell["text"] += data


VOID = {"br", "img", "input", "hr", "meta", "link", "wbr", "source"}
NUM = re.compile(r"^\s*(-?\d[\d,]*(?:\.\d+)?|-?\.\d+)")


def _num(s: str) -> float | None:
    """The number a cell starts with ("32.2", "1,204.5", "32.2 (29-35)"); None for text."""
    m = NUM.match(s or "")
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return None


def _check_pts(st: dict) -> list[float]:
    """Point totals the stat line could produce under common scoring (PPR / half / standard,
    4- or 6-pt pass TDs, -1 or -2 INTs). Used only to confirm the columns were read in the right order."""
    rec, yd = st.get("rec", 0), 0.1 * (st.get("rush_yd", 0) + st.get("rec_yd", 0))
    td = 6 * (st.get("rush_td", 0) + st.get("rec_td", 0)) - 2 * st.get("fum_lost", 0) + 0.04 * st.get("pass_yd", 0)
    out = []
    for r in (1, 0.5, 0):
        for ptd in (4, 6):
            for ip in (1, 2):
                out.append(r * rec + yd + td + ptd * st.get("pass_td", 0) - ip * st.get("pass_int", 0))
    return out


DIAG: dict[str, dict] = {}  # what each page looked like on the last read (written to nfl.json when a page fails)


def _rows_with(body: list[dict], keys: list[str], align: str) -> list[dict]:
    out = []
    for r in body:
        cells = r["cells"]
        pi = next((i for i, c in enumerate(cells) if c["player"] or c["name"]), 0)
        vals = [_num(c["text"]) for c in cells[pi + 1:]]
        if len(vals) < len(keys):
            continue
        vals = vals[: len(keys)] if align == "head" else vals[len(vals) - len(keys):]
        st = {k: v for k, v in zip(keys, vals) if v is not None}
        fpts = st.pop("fpts", None)
        if fpts is None or not st:
            continue
        player = cells[pi]
        text = " ".join(player["text"].split())
        name = (player["name"] or "").strip()
        rest = text.replace(name, " ") if name and name in text else text
        words = rest.split()
        team = words[-1] if words and re.fullmatch(r"[A-Z]{2,3}", words[-1]) else None
        if not name:
            name = " ".join(words[:-1] if team else words)
        out.append({"fpid": r["fpid"], "name": name, "team": team, "s": {k: round(v, 2) for k, v in st.items()}, "fpts": fpts})
    return out


def _pass_rate(rows: list[dict], pos: str) -> float:
    if not rows:
        return 0.0
    ok = 0
    for r in rows:
        tol = max(1.0, 0.06 * r["fpts"]) if pos == "qb" else max(0.6, 0.04 * r["fpts"])
        if min(abs(x - r["fpts"]) for x in _check_pts(r["s"])) <= tol:
            ok += 1
    return ok / len(rows)


def parse_projections(html: str, pos: str) -> list[dict]:
    """Rows of one projections page -> [{fpid, name, team, s: {stat: value}, fpts}]. Empty if the page looks wrong."""
    t = _DataTable()
    t.feed(html)

    def is_data(r):
        return sum(_num(c["text"]) is not None for c in r["cells"]) >= 3

    rows = [r for r in t.rows if r["cells"]]
    first = next((i for i, r in enumerate(rows) if is_data(r)), len(rows))
    head = rows[:first]
    body = [r for r in rows[first:] if is_data(r)]
    diag = {"htmlKB": round(len(html) / 1024), "table": t.depth == 0 and bool(t.rows), "rows": len(body),
            "head": [[c["text"].strip()[:12] for c in h["cells"]] for h in head[-2:]],
            "sample": [c["text"].strip()[:24] for c in body[0]["cells"]] if body else []}
    # Candidate column orders: from the header rows (group row with colspans, then labels), and the known layout.
    cands: list[list[str]] = []
    if len(head) >= 2:
        groups: list[str] = []
        for c in head[-2]["cells"]:
            groups += [c["text"].strip().upper()] * c["span"]
        labels = [c["text"].strip().upper() for c in head[-1]["cells"]]
        if len(groups) == len(labels) + 1:
            labels = [""] + labels
        elif len(labels) == len(groups) + 1:
            groups = [""] + groups
        if len(groups) == len(labels):
            ks = [COLS.get((g, l)) for g, l in zip(groups, labels)]
            first_stat = next((i for i, k in enumerate(ks) if k), None)
            if first_stat is not None:
                ks = ks[first_stat:]
                if all(ks) and len(ks) >= len(FALLBACK[pos]) - 1:
                    cands.append(ks)  # type: ignore[arg-type]
    cands.append(FALLBACK[pos])
    best, best_rate = [], 0.0
    for ks in cands:
        for align in ("head", "tail"):
            got = _rows_with(body, ks, align)
            rate = _pass_rate(got, pos)
            if len(got) >= 20 and rate > best_rate:
                best, best_rate = got, rate
    diag["passRate"] = round(best_rate, 2)
    DIAG[pos] = diag
    if best_rate < 0.7:
        log(f"  FantasyPros {pos} projections didn't look right ({diag}); skipped")
        return []
    return best


def projections(week: int, year: int | None = None, positions=PROJ_POS, pause: float = 0.8) -> dict[str, list[dict]]:
    """Consensus projections for one week, by position. Missing positions are simply left out."""
    out = {}
    for pos in positions:
        url = f"{BASE}/projections/{pos}.php?week={week}&scoring=PPR" + (f"&year={year}" if year else "")
        try:
            rows = parse_projections(fetch(url), pos)
        except Exception as e:  # noqa: BLE001
            log(f"  FantasyPros {pos} week {week}{' ' + str(year) if year else ''} projections unavailable ({e.__class__.__name__})")
            DIAG[pos] = {"error": f"{e.__class__.__name__}: {str(e)[:120]}"}
            rows = []
        if rows:
            out[pos.upper()] = rows
        time.sleep(pause)
    return out


def parse_ecr(html: str) -> dict | None:
    """The ecrData object embedded in a FantasyPros rankings page."""
    m = re.search(r"\becrData\s*=\s*", html)
    if not m:
        return None
    start = html.find("{", m.end() - 1)
    if start < 0:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(html[start:])
    except ValueError:
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("players"), list) or not obj["players"]:
        return None
    return obj


def rankings(page: str) -> dict | None:
    """One rankings page (e.g. 'ros-ppr-wr', 'ppr-wr') -> {week, updated, players: [...]} or None."""
    try:
        d = parse_ecr(fetch(f"{BASE}/rankings/{page}.php"))
    except Exception as e:  # noqa: BLE001
        log(f"  FantasyPros rankings {page} unavailable ({e.__class__.__name__})")
        return None
    if not d:
        log(f"  FantasyPros rankings {page}: no ranking data on the page")
        return None
    players = []
    for p in d["players"]:
        rank = _num(str(p.get("rank_ave") or p.get("rank_ecr") or ""))
        if rank is None:
            continue
        sd = _num(str(p.get("rank_std") or ""))
        players.append({
            "fpid": str(p.get("player_id") or ""), "name": p.get("player_name") or "",
            "team": p.get("player_team_id") or "", "rank": rank, "sd": sd, "posRank": p.get("pos_rank"),
        })
    week = d.get("week")
    try:
        week = int(week) if week not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        week = None
    return {"week": week, "updated": d.get("last_updated") or d.get("accessed"), "players": players}
