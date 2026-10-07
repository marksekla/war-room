"""Self-calibration: War Room learns its own weights from what actually happened.

Every time a new NFL week finishes, the nightly GitHub Action replays last season and
this season week by week. For every player-week it asks: given what we knew beforehand
(Sleeper and ESPN projections, season average, last 3 games, expected points from usage),
what did he actually score? It then fits the blend that predicts best, measures how
wrong each source is, and learns how often players at each position miss games.

The app reads the result from data/nfl.json, so the model gets sharper as the season goes.
Everything here is free: nflverse, ffopportunity, Sleeper and ESPN projections.
"""

from __future__ import annotations

import json
import math
import urllib.request

import numpy as np
import pandas as pd

NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download"
FFOPP = "https://github.com/ffverse/ffopportunity/releases/download/latest-data"
POS = ["QB", "RB", "WR", "TE"]
VERSION = 4

# ESPN stat id -> (Sleeper-style key) for PPR scoring of ESPN projections.
ESPN_STAT = {"3": "pass_yd", "4": "pass_td", "20": "pass_int", "24": "rush_yd", "25": "rush_td",
             "53": "rec", "42": "rec_yd", "43": "rec_td", "72": "fum_lost",
             "19": "pass_2pt", "26": "rush_2pt", "44": "rec_2pt"}
PPR = {"pass_yd": 0.04, "pass_td": 4, "pass_int": -2, "rush_yd": 0.1, "rush_td": 6, "rec": 1,
       "rec_yd": 0.1, "rec_td": 6, "fum_lost": -2, "pass_2pt": 2, "rush_2pt": 2, "rec_2pt": 2}


def log(msg):
    print(msg, flush=True)


def get_json(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"accept": "application/json", "user-agent": "war-room", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def ppr(stats: dict) -> float:
    return sum(PPR.get(k, 0) * (v or 0) for k, v in stats.items())


def sleeper_proj(season: int, week: int, sleeper_to_gsis: dict) -> dict:
    q = "&".join(f"position[]={p}" for p in POS)
    rows = get_json(f"https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&{q}")
    out = {}
    for r in rows or []:
        g = sleeper_to_gsis.get(str(r.get("player_id")))
        st = r.get("stats") or {}
        if not g or not st:
            continue
        pts = st.get("pts_ppr")
        out[g] = float(pts) if isinstance(pts, (int, float)) else ppr(st)
    return out


def espn_proj(season: int, week: int, espn_to_gsis: dict) -> dict:
    filt = {"players": {"filterSlotIds": {"value": [0, 2, 4, 6]}, "limit": 1200,
                        "sortPercOwned": {"sortPriority": 1, "sortAsc": False}}}
    j = get_json(
        f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{season}/segments/0/leaguedefaults/3"
        f"?scoringPeriodId={week}&view=kona_player_info",
        headers={"x-fantasy-filter": json.dumps(filt)},
    )
    out = {}
    for row in j.get("players", []):
        p = row.get("player") or {}
        g = espn_to_gsis.get(str(p.get("id") or row.get("id")))
        if not g:
            continue
        for s in p.get("stats") or []:
            if s.get("statSourceId") == 1 and s.get("scoringPeriodId") == week and s.get("seasonId") == season:
                line = {ESPN_STAT[k]: v for k, v in (s.get("stats") or {}).items() if k in ESPN_STAT}
                if line:
                    out[g] = ppr(line)
                break
    return out


def nnls(X: np.ndarray, y: np.ndarray, iters: int = 400) -> np.ndarray:
    """Non-negative least squares by coordinate descent (small problems, no scipy needed)."""
    n = X.shape[1]
    w = np.full(n, 1.0 / n)
    col_sq = (X ** 2).sum(axis=0)
    for _ in range(iters):
        for j in range(n):
            if col_sq[j] == 0:
                w[j] = 0
                continue
            r = y - X @ w + X[:, j] * w[j]
            w[j] = max(0.0, float(X[:, j] @ r) / col_sq[j])
    return w


def read(url):
    try:
        return pd.read_csv(url, low_memory=False)
    except Exception as e:  # noqa: BLE001
        log(f"  calib skip {url.split('/')[-1]} ({e.__class__.__name__})")
        return pd.DataFrame()


TEAM_FIX = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS", "OAK": "LV", "SD": "LAC", "STL": "LAR"}


def implied_totals(games: pd.DataFrame, season: int) -> dict:
    """(week, team) -> Vegas implied points (closing line from nflverse)."""
    out = {}
    g = games[(games.season == season) & (games.game_type == "REG")]
    for r in g.itertuples(index=False):
        if pd.isna(r.spread_line) or pd.isna(r.total_line):
            continue
        h, a = TEAM_FIX.get(r.home_team, r.home_team), TEAM_FIX.get(r.away_team, r.away_team)
        out[(int(r.week), h)] = r.total_line / 2 + r.spread_line / 2  # spread_line > 0 = home favored
        out[(int(r.week), a)] = r.total_line / 2 - r.spread_line / 2
    return out


def build_rows(season: int, max_week: int, ids: pd.DataFrame, fetch_proj: bool, games: pd.DataFrame | None = None) -> pd.DataFrame:
    stats = read(f"{NFLVERSE}/stats_player/stats_player_week_{season}.csv")
    if stats.empty:
        return pd.DataFrame()
    stats = stats[(stats.season_type == "REG") & stats.position.isin(POS) & (stats.week <= max_week)].copy()
    stats["team"] = stats.team.map(lambda t: TEAM_FIX.get(t, t))
    stats["opponent_team"] = stats.opponent_team.map(lambda t: TEAM_FIX.get(t, t))

    # Vegas implied team totals, relative to that week's average.
    implied = implied_totals(games, season) if games is not None else {}
    wk_avg = {}
    for (w, _t), v in implied.items():
        wk_avg.setdefault(w, []).append(v)
    wk_avg = {w: float(np.mean(v)) for w, v in wk_avg.items()}

    # Defense vs position: PPR allowed per game by each defense to each position, before that week.
    allowed = stats.groupby(["opponent_team", "position", "week"]).fantasy_points_ppr.sum().reset_index()
    dvp = {}
    for (opp, pos), g in allowed.sort_values("week").groupby(["opponent_team", "position"]):
        hist = []
        for r in g.itertuples(index=False):
            if len(hist) >= 2:
                dvp[(opp, pos, int(r.week))] = float(np.mean(hist))
            hist.append(float(r.fantasy_points_ppr))
    league_dvp = {}
    for (opp, pos, w), v in dvp.items():
        league_dvp.setdefault((pos, w), []).append(v)
    league_dvp = {k: float(np.mean(v)) for k, v in league_dvp.items()}
    ep = read(f"{FFOPP}/ep_weekly_{season}.csv")
    xfp = {}
    if not ep.empty:
        for r in ep[["player_id", "week", "total_fantasy_points_exp"]].itertuples(index=False):
            xfp[(r.player_id, int(r.week))] = float(r.total_fantasy_points_exp)

    sl_map = {str(int(float(s))): g for s, g in zip(ids.sleeper_id, ids.gsis_id) if isinstance(g, str) and not pd.isna(s)}
    es_map = {str(int(float(s))): g for s, g in zip(ids.espn_id, ids.gsis_id) if isinstance(g, str) and not pd.isna(s)}
    proj_s, proj_e = {}, {}
    if fetch_proj:
        for w in range(1, max_week + 1):
            try:
                proj_s[w] = sleeper_proj(season, w, sl_map)
            except Exception as e:  # noqa: BLE001
                log(f"  calib: Sleeper projections {season} wk{w} unavailable ({e.__class__.__name__})")
            try:
                proj_e[w] = espn_proj(season, w, es_map)
            except Exception as e:  # noqa: BLE001
                log(f"  calib: ESPN projections {season} wk{w} unavailable ({e.__class__.__name__})")

    rows = []
    for pid, g in stats.sort_values("week").groupby("player_id"):
        pos = g.position.iloc[0]
        hist_fp, hist_xfp = [], []
        for r in g.itertuples(index=False):
            w = int(r.week)
            fp = float(r.fantasy_points_ppr or 0)
            if len(hist_fp) >= 2:
                imp = implied.get((w, r.team))
                d = dvp.get((r.opponent_team, pos, w))
                ld = league_dvp.get((pos, w))
                rows.append({
                    "season": season, "week": w, "pos": pos, "gsis": pid, "y": fp,
                    "vegas": imp / wk_avg[w] if imp and wk_avg.get(w) else np.nan,
                    "dvp": d / ld if d and ld else np.nan,
                    "ppg": float(np.mean(hist_fp)), "last3": float(np.mean(hist_fp[-3:])),
                    "xfp": float(np.mean(hist_xfp)) if hist_xfp else np.nan,
                    "projS": proj_s.get(w, {}).get(pid, np.nan), "projE": proj_e.get(w, {}).get(pid, np.nan),
                })
            hist_fp.append(fp)
            if (pid, w) in xfp:
                hist_xfp.append(xfp[(pid, w)])
    return pd.DataFrame(rows)


def availability(seasons: list[int], games: pd.DataFrame) -> dict:
    """P(a regular starter suits up next game | he played 60%+ of snaps in his team's last game)."""
    out = {}
    rows = []
    for season in seasons:
        sc = read(f"{NFLVERSE}/snap_counts/snap_counts_{season}.csv")
        if sc.empty:
            continue
        sc = sc[sc.game_type == "REG"].copy()
        sc["position"] = sc.position.replace({"HB": "RB", "FB": "RB"})
        sc = sc[sc.position.isin(POS)]
        gs = games[(games.season == season) & (games.game_type == "REG") & games.result.notna()]
        team_weeks = {}
        for r in gs.itertuples(index=False):
            for t in (r.home_team, r.away_team):
                team_weeks.setdefault(t, []).append(int(r.week))
        played = {(r.pfr_player_id, int(r.week)) for r in sc.itertuples(index=False)}
        for r in sc[sc.offense_pct >= 0.6].itertuples(index=False):
            wk = sorted(team_weeks.get(r.team, []))
            nxt = [w for w in wk if w > r.week]
            if not nxt:
                continue
            rows.append((r.position, (r.pfr_player_id, nxt[0]) in played))
    if not rows:
        return out
    df = pd.DataFrame(rows, columns=["pos", "ok"])
    for pos, g in df.groupby("pos"):
        if len(g) >= 200:
            out[pos] = round(float(g.ok.mean()), 3)
    return out


def fit_matchup(d: pd.DataFrame) -> dict | None:
    """How much Vegas and defense-vs-position should scale a player's baseline.
    Model: actual = base * (1 + a*(vegas-1)) * (1 + b*(dvp-1)), fit as a linear problem."""
    d = d.dropna(subset=["base", "vegas", "dvp"])
    d = d[d.base > 0]
    if len(d) < 300:
        return None
    X = np.column_stack([d.base * (d.vegas - 1), d.base * (d.dvp - 1)])
    coef, *_ = np.linalg.lstsq(X, (d.y - d.base).to_numpy(), rcond=None)
    a, b = (float(min(1.5, max(0.0, c))) for c in coef)
    return {"vegas": round(a, 3), "dvp": round(b, 3)}


def market_weight(data: pd.DataFrame, history: dict, ids: pd.DataFrame) -> dict | None:
    """Learns how much FantasyCalc trade values should pull a player's value, using snapshots
    War Room has saved before each week. Starts once a few weeks of snapshots exist."""
    if not history:
        return None
    sl_map = {str(int(float(s))): g for s, g in zip(ids.sleeper_id, ids.gsis_id) if isinstance(g, str) and not pd.isna(s)}
    vals = {}
    for season, weeks in history.items():
        for week, snap in weeks.items():
            for sid, v in snap.items():
                g = sl_map.get(str(sid))
                if g:
                    vals[(int(season), int(week), g)] = float(v)
    d = data.dropna(subset=["base"]).copy()
    d["mv"] = [vals.get((int(r.season), int(r.week), r.gsis), np.nan) for r in d.itertuples(index=False)]
    d = d.dropna(subset=["mv"])
    out = {}
    for pos in POS:
        x = d[d.pos == pos]
        if len(x) < 200:
            continue
        A = np.column_stack([np.ones(len(x)), np.sqrt(x.mv)])
        c, *_ = np.linalg.lstsq(A, x.y.to_numpy(), rcond=None)
        implied = A @ c
        diff = implied - x.base.to_numpy()
        den = float(diff @ diff)
        if den <= 0:
            continue
        m = float((x.y.to_numpy() - x.base.to_numpy()) @ diff / den)
        out[pos] = round(min(0.6, max(0.0, m)), 3)
    return out or None


def ecr_weight(data: pd.DataFrame, history: dict, ids: pd.DataFrame) -> dict | None:
    """Learns how much FantasyPros rest-of-season expert rankings should pull a player's value,
    from the weekly snapshots War Room saves. Rank maps to points through log(rank)."""
    if not history:
        return None
    ranks = {}
    for season, weeks in history.items():
        for week, snap in weeks.items():
            for g, rk in snap.items():
                ranks[(int(season), int(week), g)] = float(rk)
    d = data.dropna(subset=["base"]).copy()
    d["rk"] = [ranks.get((int(r.season), int(r.week), r.gsis), np.nan) for r in d.itertuples(index=False)]
    d = d.dropna(subset=["rk"])
    out = {}
    for pos in POS:
        x = d[d.pos == pos]
        if len(x) < 200:
            continue
        A = np.column_stack([np.ones(len(x)), np.log(x.rk.clip(lower=1))])
        c, *_ = np.linalg.lstsq(A, x.y.to_numpy(), rcond=None)
        diff = A @ c - x.base.to_numpy()
        den = float(diff @ diff)
        if den <= 0:
            continue
        m = float((x.y.to_numpy() - x.base.to_numpy()) @ diff / den)
        out[pos] = round(min(0.6, max(0.0, m)), 3)
    return out or None


INJ_GROUPS = [
    ("soft", ("hamstring", "calf", "groin", "quad", "pectoral", "oblique", "abdom", "adductor")),
    ("concussion", ("concussion", "head")),
    ("lower", ("ankle", "knee", "foot", "toe", "hip", "achilles", "heel", "shin", "fibula", "tibia")),
    ("nonInjury", ("illness", "not injury", "personal", "rest")),
]


def injury_group(s) -> str:
    s = str(s or "").lower()
    for name, keys in INJ_GROUPS:
        if any(k in s for k in keys):
            return name
    return "upper" if s and s != "nan" else "none"


PLAY_FEATS = ["dnp", "fp", "prevOut", "soft", "lower", "concussion", "nonInjury", "QB", "RB", "TE"]


def logistic(X: np.ndarray, y: np.ndarray, l2: float = 2.0, iters: int = 50) -> np.ndarray:
    """Logistic regression by Newton's method with a ridge penalty (intercept not penalized)."""
    w = np.zeros(X.shape[1])
    reg = np.full(X.shape[1], l2)
    reg[0] = 0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ w)))
        g = X.T @ (p - y) + reg * w
        H = (X * (p * (1 - p))[:, None]).T @ X + np.diag(reg)
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-6:
            break
    return w


def play_model(seasons: list[int], ids: pd.DataFrame) -> dict | None:
    """P(a player with a real role suits up | his final injury designation and practice report).
    Learned from past seasons' official injury reports matched against who actually played."""
    pfr2g = {r.pfr_id: r.gsis_id for r in ids[["pfr_id", "gsis_id"]].itertuples(index=False)
             if isinstance(r.pfr_id, str) and isinstance(r.gsis_id, str)}
    short = {"Did Not Participate In Practice": "DNP", "Limited Participation in Practice": "LP",
             "Full Participation in Practice": "FP"}
    rows = []
    for season in seasons:
        inj = read(f"{NFLVERSE}/injuries/injuries_{season}.csv")
        sn = read(f"{NFLVERSE}/snap_counts/snap_counts_{season}.csv")
        if inj.empty or sn.empty:
            continue
        sn = sn[sn.game_type == "REG"].copy()
        sn["team"] = sn.team.map(lambda t: TEAM_FIX.get(t, t))
        sn["gsis"] = sn.pfr_player_id.map(pfr2g)
        played = set(zip(sn.gsis, sn.week))
        team_weeks = set(zip(sn.team, sn.week))
        role = {}
        for g, gg in sn[sn.gsis.notna()].groupby("gsis"):
            gg = gg.sort_values("week")
            wk, pct = gg.week.to_numpy(), gg.offense_pct.to_numpy()
            for w in range(2, 19):
                prior = pct[wk < w][-3:]
                if len(prior):
                    role[(g, w)] = float(prior.mean())
        inj = inj[(inj.game_type == "REG") & inj.position.isin(POS)].copy()
        inj["team"] = inj.team.map(lambda t: TEAM_FIX.get(t, t))
        inj = inj.sort_values(["gsis_id", "week"])
        last = {}
        for r in inj.itertuples(index=False):
            if (r.team, r.week) not in team_weeks or role.get((r.gsis_id, r.week), 0) < 0.4:
                last[r.gsis_id] = (r.week, (r.gsis_id, r.week) in played)
                continue
            pw = last.get(r.gsis_id)
            ok = (r.gsis_id, r.week) in played
            rows.append({
                "rs": r.report_status if isinstance(r.report_status, str) else "None",
                "ps": short.get(r.practice_status, "LP") if isinstance(r.practice_status, str) else "LP",
                "prevOut": bool(pw and pw[0] == r.week - 1 and not pw[1]),
                "grp": injury_group(r.report_primary_injury if isinstance(r.report_primary_injury, str) else r.practice_primary_injury),
                "pos": r.position, "y": 1.0 if ok else 0.0,
            })
            last[r.gsis_id] = (r.week, ok)
    if len(rows) < 500:
        return None
    d = pd.DataFrame(rows)
    out = {"n": int(len(d)), "rates": {}}
    # Smoothed rates for every designation x practice combination (Beta prior toward the designation's overall rate).
    for rs, g in d.groupby("rs"):
        overall = (g.y.sum() + 1) / (len(g) + 2)
        out["rates"][rs] = {"all": round(float(overall), 3)}
        for ps, h in g.groupby("ps"):
            out["rates"][rs][ps] = round(float((h.y.sum() + 10 * overall) / (len(h) + 10)), 3)
    # Questionable is where the real uncertainty is: fit a small logistic model on it.
    q = d[d.rs == "Questionable"]
    if len(q) >= 300:
        X = np.column_stack([np.ones(len(q))] + [
            (q.ps == "DNP"), (q.ps == "FP"), q.prevOut, q.grp == "soft", q.grp == "lower", q.grp == "concussion",
            q.grp == "nonInjury", q.pos == "QB", q.pos == "RB", q.pos == "TE",
        ]).astype(float)
        w = logistic(X, q.y.to_numpy())
        out["q"] = {"intercept": round(float(w[0]), 3), **{f: round(float(c), 3) for f, c in zip(PLAY_FEATS, w[1:])}}
        p = 1 / (1 + np.exp(-(X @ w)))
        out["qBrier"] = round(float(np.mean((p - q.y.to_numpy()) ** 2)), 3)
    log(f"  calib: play model n={out['n']} rates={out['rates']} q={out.get('q')}")
    return out


def calibrate(season: int, max_week: int, ids: pd.DataFrame, games: pd.DataFrame, prev: dict | None,
              market_history: dict | None = None, ecr_history: dict | None = None) -> dict | None:
    """Returns the calibration block, or the previous one if nothing new happened."""
    fresh = prev and prev.get("version") == VERSION and prev.get("season") == season and prev.get("throughWeek", -1) >= max_week
    if fresh and prev.get("weights"):  # refit if projections were missing last time
        log("  calib: up to date")
        return prev
    log(f"Calibrating on {season - 1} + {season} through week {max_week}")
    last = build_rows(season - 1, 18, ids, fetch_proj=True, games=games)
    cur = build_rows(season, max_week, ids, fetch_proj=True, games=games) if max_week >= 3 else pd.DataFrame()
    data = pd.concat([d for d in (last, cur) if not d.empty], ignore_index=True)
    if data.empty:
        return prev

    out = {"version": VERSION, "season": season, "throughWeek": max_week, "n": int(len(data)),
           "weights": {}, "projBlend": None, "sd": {}, "avail": availability([season - 1, season], games), "accuracy": {}}

    # 1) How to combine the two projection sources.
    both = data.dropna(subset=["projS", "projE"])
    if len(both) >= 500:
        w = nnls(both[["projS", "projE"]].to_numpy(), both.y.to_numpy())
        if w.sum() > 0:
            out["projBlend"] = {"sleeper": round(float(w[0] / w.sum()), 3), "espn": round(float(w[1] / w.sum()), 3)}
    pb = out["projBlend"] or {"sleeper": 0.5, "espn": 0.5}
    data["proj"] = np.where(
        data.projS.notna() & data.projE.notna(), pb["sleeper"] * data.projS + pb["espn"] * data.projE,
        data.projS.fillna(data.projE),
    )

    # 2) Per-position blend of projection, recent form, season average and expected points.
    feats = ["proj", "last3", "ppg", "xfp"]
    for pos in POS:
        d = data[(data.pos == pos)].dropna(subset=feats)
        if len(d) < 300:
            continue
        w = nnls(d[feats].to_numpy(), d.y.to_numpy())
        pred = d[feats].to_numpy() @ w
        out["weights"][pos] = {f: round(float(x), 3) for f, x in zip(feats, w)}
        out["sd"][pos] = round(float(np.std(d.y.to_numpy() - pred)), 2)

    # Fallback for players without a projection this week: stats-only blend.
    out["weightsNoProj"] = {}
    for pos in POS:
        d = data[(data.pos == pos)].dropna(subset=["last3", "ppg", "xfp"])
        if len(d) < 300:
            continue
        w = nnls(d[["last3", "ppg", "xfp"]].to_numpy(), d.y.to_numpy())
        out["weightsNoProj"][pos] = {f: round(float(x), 3) for f, x in zip(["last3", "ppg", "xfp"], w)}
        if pos not in out["sd"]:
            out["sd"][pos] = round(float(np.std(d.y.to_numpy() - d[["last3", "ppg", "xfp"]].to_numpy() @ w)), 2)

    # Baseline prediction per row (full blend when a projection exists, stats-only otherwise).
    def base_row(r):
        w = out["weights"].get(r.pos)
        if w and not pd.isna(r.proj) and not pd.isna(r.xfp):
            return w["proj"] * r.proj + w["last3"] * r.last3 + w["ppg"] * r.ppg + w["xfp"] * r.xfp
        w2 = out["weightsNoProj"].get(r.pos)
        if w2 and not pd.isna(r.xfp):
            return w2["last3"] * r.last3 + w2["ppg"] * r.ppg + w2["xfp"] * r.xfp
        return np.nan
    data["base"] = [base_row(r) for r in data.itertuples(index=False)]

    # 4) Matchup: how much Vegas implied totals and defense-vs-position move the needle, by position.
    out["matchup"] = {}
    for pos in POS:
        m = fit_matchup(data[data.pos == pos])
        if m:
            out["matchup"][pos] = m

    # 5) Market value prior (learned from War Room's own weekly FantasyCalc snapshots).
    out["market"] = market_weight(data, market_history or {}, ids)
    # 6) Expert consensus prior (FantasyPros rest-of-season ranks, from War Room's weekly snapshots).
    out["ecr"] = ecr_weight(data, ecr_history or {}, ids)
    # 7) Chance to play from injury designations + practice reports (last 3 seasons + this one).
    try:
        out["play"] = play_model([season - 3, season - 2, season - 1, season], ids)
    except Exception as e:  # noqa: BLE001
        log(f"  calib: play model failed ({e.__class__.__name__}: {e})")
        out["play"] = (prev or {}).get("play")

    # 3) Honest accuracy: train on last season only, test on this season (average miss in PPR points).
    if not cur.empty and not last.empty:
        test = data[data.season == season].dropna(subset=feats)
        train = data[data.season == season - 1].dropna(subset=feats)
        if len(test) >= 100 and len(train) >= 300:
            mae = {}
            for pos in POS:
                tr, te = train[train.pos == pos], test[test.pos == pos]
                if len(tr) < 100 or len(te) < 20:
                    continue
                w = nnls(tr[feats].to_numpy(), tr.y.to_numpy())
                mae.setdefault("warRoom", []).extend(np.abs(te.y - te[feats].to_numpy() @ w).tolist())
                mae.setdefault("sleeper", []).extend(np.abs(te.y - te.projS.fillna(te.proj)).tolist())
                mae.setdefault("espn", []).extend(np.abs(te.y - te.projE.fillna(te.proj)).tolist())
            out["accuracy"] = {k: round(float(np.mean(v)), 2) for k, v in mae.items()}
            out["accuracy"]["n"] = int(len(test))
    log(f"  calib: weights {out['weights']}, noProj {out['weightsNoProj']}, blend {out['projBlend']}, matchup {out['matchup']}, "
        f"market {out['market']}, ecr {out.get('ecr')}, sd {out['sd']}, avail {out['avail']}, accuracy {out['accuracy']}")
    return out
