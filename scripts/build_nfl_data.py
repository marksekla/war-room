"""Builds data/nfl.json from free, open NFL data.

Runs nightly in GitHub Actions (see .github/workflows/update-data.yml) and can be
run locally:  pip install pandas  &&  python scripts/build_nfl_data.py

Sources (all free):
  - nflverse play-by-play, player stats, snap counts, injury/practice reports,
    Next Gen Stats and schedules  (https://github.com/nflverse/nflverse-data, CC-BY 4.0)
  - FTN charting data via nflverse (CC-BY-SA 4.0): first-read targets
  - ffopportunity expected fantasy points (https://github.com/ffverse/ffopportunity)
  - DynastyProcess player ID map (https://github.com/dynastyprocess/data)

Everything is keyed so the app can match players to Sleeper IDs.
"""

from __future__ import annotations

import json
import math
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd

try:  # self-calibration lives next to this file
    from calibrate import calibrate
except ImportError:  # pragma: no cover
    sys.path.append(os.path.dirname(__file__))
    from calibrate import calibrate

NFLVERSE = "https://github.com/nflverse/nflverse-data/releases/download"
FFOPP = "https://github.com/ffverse/ffopportunity/releases/download/latest-data"
IDS = "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "nfl.json")
SKILL = {"QB", "RB", "WR", "TE", "FB"}

# Stadium coordinates for weather lookups (keyed by nflverse stadium_id).
STADIUMS = {
    "ATL97": (33.7554, -84.4008), "BAL00": (39.2780, -76.6227), "BOS00": (42.0909, -71.2643),
    "BUF00": (42.7738, -78.7870), "BUF01": (42.7738, -78.7870), "CAR00": (35.2258, -80.8528),
    "CHI98": (41.8623, -87.6167), "CIN00": (39.0955, -84.5161), "CLE00": (41.5061, -81.6995),
    "DAL00": (32.7473, -97.0945), "DEN00": (39.7439, -105.0201), "DET00": (42.3400, -83.0456),
    "GNB00": (44.5013, -88.0622), "HOU00": (29.6847, -95.4107), "IND00": (39.7601, -86.1639),
    "JAX00": (30.3239, -81.6373), "KAN00": (39.0489, -94.4839), "LAX01": (33.9535, -118.3392),
    "LON00": (51.5560, -0.2796), "LON01": (51.4560, -0.3415), "LON02": (51.6043, -0.0664),
    "MEX00": (19.3029, -99.1505), "MIA00": (25.9580, -80.2389), "MIN01": (44.9737, -93.2575),
    "MUN01": (48.2188, 11.6247), "FRA00": (50.0686, 8.6455), "NAS00": (36.1665, -86.7713),
    "NOR00": (29.9511, -90.0812), "NYC01": (40.8135, -74.0745), "PAR00": (48.9245, 2.3602),
    "PHI00": (39.9008, -75.1675), "PHO00": (33.5276, -112.2626), "PIT00": (40.4468, -80.0158),
    "RIO00": (-22.9121, -43.2302), "SAO00": (-23.5453, -46.4742), "SEA00": (47.5952, -122.3316),
    "SFO01": (37.4030, -121.9700), "TAM00": (27.9759, -82.5033), "VEG00": (36.0908, -115.1833),
    "WAS00": (38.9076, -76.8645), "MEL00": (-37.8200, 144.9834), "MAD00": (40.4531, -3.6883),
    "DUB00": (53.3352, -6.2285),
}
NAME_COORDS = {"tottenham": "LON02", "wembley": "LON00", "twickenham": "LON01", "allianz": "MUN01",
               "deutsche bank": "FRA00", "bernabeu": "MAD00", "croke": "DUB00", "maracan": "RIO00"}

TEAM_FIX = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS", "OAK": "LV", "SD": "LAC", "STL": "LAR"}


def log(msg: str) -> None:
    print(msg, flush=True)


def read(url: str, **kw) -> pd.DataFrame:
    try:
        df = pd.read_csv(url, low_memory=False, **kw)
        log(f"  ok   {url.split('/')[-1]}  ({len(df)} rows)")
        return df
    except Exception as e:  # noqa: BLE001 - a missing file should not kill the build
        log(f"  skip {url.split('/')[-1]}  ({e.__class__.__name__}: {str(e)[:80]})")
        return pd.DataFrame()


def num(x, digits=1):
    if x is None:
        return None
    try:
        f = float(x)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)


def team(t):
    if not isinstance(t, str):
        return None
    return TEAM_FIX.get(t, t)



DEF_GROUP = {"CB": "CB", "DB": "S", "S": "S", "FS": "S", "SS": "S", "LB": "LB", "ILB": "LB", "MLB": "LB",
             "OLB": "EDGE", "DE": "EDGE", "DT": "DL", "NT": "DL", "DL": "DL"}
OL_GROUP = {"T": "OT", "G": "OG", "C": "C", "OL": "OL", "OT": "OT", "OG": "OG"}


def key_starters(snaps: pd.DataFrame, inj: pd.DataFrame, pfr_to_gsis: dict) -> dict:
    """Defensive and offensive line regulars (60%+ of snaps over their last 3 games)
    with their latest official injury status, so the app can flag who is missing."""
    snaps = snaps.copy()
    snaps["team"] = snaps["team"].map(team)
    latest = {}
    if not inj.empty:
        last_week = int(inj.week.max())
        cur = inj[(inj.season_type == "REG") & (inj.week == last_week)]
        for r in cur.itertuples(index=False):
            latest[r.gsis_id] = (r.report_status if isinstance(r.report_status, str) else None,
                                 r.practice_status if isinstance(r.practice_status, str) else None)
            latest[(str(r.full_name), team(r.team))] = latest[r.gsis_id]
    short = {"Did Not Participate In Practice": "DNP", "Limited Participation in Practice": "LP",
             "Full Participation in Practice": "FP"}
    out: dict[str, dict] = {}
    for unit, col, groups in (("def", "defense_pct", DEF_GROUP), ("ol", "offense_pct", OL_GROUP)):
        d = snaps[snaps.position.isin(groups) & (snaps[col] > 0)].sort_values("week")
        for (tm, pid), g in d.groupby(["team", "pfr_player_id"]):
            recent = g.tail(3)
            pct = float(recent[col].mean())
            if pct < 0.6 or not isinstance(tm, str):
                continue
            name = str(g.player.iloc[-1])
            gsis = pfr_to_gsis.get(pid)
            rep, prac = latest.get(gsis) or latest.get((name, tm)) or (None, None)
            out.setdefault(tm, {"def": [], "ol": []})[unit].append({
                "n": name, "pos": groups[g.position.iloc[-1]], "pct": round(pct, 2),
                "rep": rep, "pr": short.get(prac) if prac else None,
            })
    for tm in out:
        for unit in out[tm]:
            out[tm][unit].sort(key=lambda x: -x["pct"])
    return out


def snapshot_market(history: dict, season: int, games: pd.DataFrame) -> dict:
    """Saves FantasyCalc values before each week so the model can later learn how much
    market value predicts real results. Keeps this season and last season only."""
    history = {k: v for k, v in (history or {}).items() if int(k) >= season - 1}
    try:
        g = games[(games.season == season) & (games.game_type == "REG") & games.result.isna()]
        if g.empty:
            return history
        week = int(g.week.min())
        import urllib.request
        req = urllib.request.Request(
            "https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=12&ppr=1",
            headers={"accept": "application/json", "user-agent": "war-room"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            rows = json.loads(r.read().decode("utf-8"))
        snap = {}
        for row in rows:
            sid = (row.get("player") or {}).get("sleeperId")
            val = row.get("redraftValue") or row.get("value")
            if sid and isinstance(val, (int, float)):
                snap[str(sid)] = int(val)
        if snap:
            history.setdefault(str(season), {})[str(week)] = snap
            log(f"  market snapshot: {len(snap)} players for week {week}")
    except Exception as e:  # noqa: BLE001
        log(f"  market snapshot skipped ({e.__class__.__name__})")
    return history


def default_season() -> int:
    now = datetime.now(timezone.utc)
    return now.year if now.month >= 8 else now.year - 1


def main() -> None:
    season = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("SEASON", default_season()))
    log(f"Building NFL data for {season}")

    stats = read(f"{NFLVERSE}/stats_player/stats_player_week_{season}.csv")
    snaps = read(f"{NFLVERSE}/snap_counts/snap_counts_{season}.csv")
    inj = read(f"{NFLVERSE}/injuries/injuries_{season}.csv")
    pbp = read(f"{NFLVERSE}/pbp/play_by_play_{season}.csv.gz")
    ftn = read(f"{NFLVERSE}/ftn_charting/ftn_charting_{season}.csv")
    games = read(f"{NFLVERSE}/schedules/games.csv")
    xfp = read(f"{FFOPP}/ep_weekly_{season}.csv")
    ids = read(IDS)
    ngs = {t: read(f"{NFLVERSE}/nextgen_stats/ngs_{t}.csv.gz") for t in ("receiving", "rushing", "passing")}

    # ---------------- ID maps ----------------
    gsis_to_sleeper: dict[str, str] = {}
    pfr_to_gsis: dict[str, str] = {}
    if not ids.empty:
        for r in ids[["gsis_id", "sleeper_id", "pfr_id"]].itertuples(index=False):
            g = r.gsis_id if isinstance(r.gsis_id, str) else None
            if not g:
                continue
            if not pd.isna(r.sleeper_id):
                gsis_to_sleeper[g] = str(int(float(r.sleeper_id)))
            if isinstance(r.pfr_id, str):
                pfr_to_gsis[r.pfr_id] = g

    players: dict[str, dict] = {}

    def P(gsis: str, name=None, pos=None, tm=None) -> dict:
        p = players.get(gsis)
        if p is None:
            p = {"sid": gsis_to_sleeper.get(gsis), "n": name, "pos": pos, "tm": tm, "wk": {}}
            players[gsis] = p
        if name and not p["n"]:
            p["n"] = name
        if pos and not p["pos"]:
            p["pos"] = pos
        if tm:
            p["tm"] = tm
        return p

    def W(p: dict, week: int) -> dict:
        return p["wk"].setdefault(int(week), {})

    max_week = 0

    # ---------------- weekly player stats ----------------
    if not stats.empty:
        stats = stats[(stats.season_type == "REG") & (stats.position.isin(SKILL))].copy()
        stats["team"] = stats["team"].map(team)
        max_week = int(stats.week.max()) if len(stats) else 0
        tm_tot = stats.groupby(["team", "week"])[["targets", "carries"]].sum()
        for r in stats.itertuples(index=False):
            p = P(r.player_id, r.player_display_name, r.position, r.team)
            w = W(p, r.week)
            t_tot = tm_tot.loc[(r.team, r.week)]
            w.update({
                "tgt": int(r.targets or 0), "car": int(r.carries or 0), "rec": int(r.receptions or 0),
                "ay": num(r.receiving_air_yards, 0) or 0, "fp": num(r.fantasy_points_ppr, 1),
                "ttgt": int(t_tot.targets), "tcar": int(t_tot.carries),
                "wopr": num(r.wopr, 3), "airsh": num(r.air_yards_share, 3),
            })

    # ---------------- snap counts ----------------
    starters: dict[str, dict] = {}
    if not snaps.empty:
        starters = key_starters(snaps[snaps.game_type == "REG"].copy(), inj, pfr_to_gsis)
        snaps = snaps[(snaps.game_type == "REG") & (snaps.position.isin(SKILL | {"HB"}))].copy()
        snaps["position"] = snaps.position.replace({"HB": "RB"})
        snaps["team"] = snaps["team"].map(team)
        by_name = {(v["n"], v["tm"]): k for k, v in players.items() if v["n"]}
        for r in snaps.itertuples(index=False):
            g = pfr_to_gsis.get(r.pfr_player_id) or by_name.get((r.player, r.team))
            if not g:
                continue
            p = P(g, r.player, r.position, r.team)
            W(p, r.week)["snap"] = num(r.offense_pct, 3)

    # ---------------- expected fantasy points (ffopportunity) ----------------
    if not xfp.empty:
        for r in xfp.itertuples(index=False):
            if not isinstance(r.player_id, str):
                continue
            p = players.get(r.player_id)
            if p is None:
                if r.position not in SKILL:
                    continue
                p = P(r.player_id, r.full_name, r.position, team(r.posteam))
            W(p, r.week)["xfp"] = num(r.total_fantasy_points_exp, 1)

    # ---------------- play-by-play: player red zone, aDOT, first reads; team environment ----------------
    teams: dict[str, dict] = {}
    if not pbp.empty:
        pbp = pbp[pbp.season_type == "REG"].copy()
        for c in ("posteam", "defteam", "home_team", "away_team"):
            pbp[c] = pbp[c].map(team)
        plays = pbp[pbp.play_type.isin(["pass", "run"]) & (pbp.two_point_attempt != 1)].copy()
        plays["rz"] = plays.yardline_100 <= 20
        plays["gl"] = plays.yardline_100 <= 5

        # First-read targets from FTN charting.
        if not ftn.empty:
            f = ftn[["nflverse_game_id", "nflverse_play_id", "read_thrown"]].rename(
                columns={"nflverse_game_id": "game_id", "nflverse_play_id": "play_id"})
            plays = plays.merge(f, on=["game_id", "play_id"], how="left")
            plays["first_read"] = plays.read_thrown.astype(str) == "1"
        else:
            plays["first_read"] = False

        tgt = plays[plays.receiver_player_id.notna() & (plays["pass"] == 1)]
        run = plays[plays.rusher_player_id.notna() & (plays.play_type == "run")]

        # Team red zone opportunities per week (targets + carries inside the 20).
        rz_team = (
            pd.concat([tgt[tgt.rz][["posteam", "week"]], run[run.rz][["posteam", "week"]]])
            .groupby(["posteam", "week"]).size()
        )
        fr_team = tgt[tgt.first_read].groupby(["posteam", "week"]).size()

        def add_counts(df, key, col, mask=None):
            d = df if mask is None else df[mask]
            for (pid, wk), n in d.groupby([key, "week"]).size().items():
                if pid in players:
                    W(players[pid], wk)[col] = int(n)

        add_counts(tgt, "receiver_player_id", "rzt", tgt.rz)
        add_counts(run, "rusher_player_id", "rzc", run.rz)
        add_counts(run, "rusher_player_id", "glc", run.gl)
        add_counts(tgt, "receiver_player_id", "fr", tgt.first_read)
        for (pid, wk, tm), _ in tgt.groupby(["receiver_player_id", "week", "posteam"]).size().items():
            if pid in players:
                w = W(players[pid], wk)
                w["trz"] = int(rz_team.get((tm, wk), 0))
                w["tfr"] = int(fr_team.get((tm, wk), 0))
        for (pid, wk, tm), _ in run.groupby(["rusher_player_id", "week", "posteam"]).size().items():
            if pid in players:
                w = W(players[pid], wk)
                w["trz"] = int(rz_team.get((tm, wk), 0))
                w.setdefault("tfr", int(fr_team.get((tm, wk), 0)))
        adot = tgt.groupby("receiver_player_id").air_yards.mean()

        # ---- team environment ----
        neutral = plays[plays.wp.between(0.2, 0.8) & plays.down.isin([1, 2]) & (plays.half_seconds_remaining > 120)]
        pbp_sorted = plays.sort_values(["game_id", "play_id"])
        pbp_sorted["next_sec"] = pbp_sorted.groupby(["game_id", "posteam", "fixed_drive"]).game_seconds_remaining.shift(-1)
        pbp_sorted["sec"] = (pbp_sorted.game_seconds_remaining - pbp_sorted.next_sec).clip(lower=0, upper=60)
        neutral_pace = pbp_sorted[pbp_sorted.wp.between(0.2, 0.8) & (pbp_sorted.half_seconds_remaining > 120)]

        passers = set(plays[plays.passer_player_id.notna()].groupby("passer_player_id").size().loc[lambda s: s >= 10].index)
        gl_runs = run[run.gl]
        drives = pbp[pbp.posteam.notna() & pbp.fixed_drive.notna()].groupby(["game_id", "posteam", "fixed_drive"]).agg(
            minyl=("yardline_100", "min"), result=("fixed_drive_result", "first"))

        for tm, g in plays.groupby("posteam"):
            if not isinstance(tm, str):
                continue
            n_games = g.game_id.nunique()
            ne = neutral[neutral.posteam == tm]
            pace = neutral_pace[neutral_pace.posteam == tm].sec.mean()
            dr = drives.loc[(slice(None), tm), :] if tm in drives.index.get_level_values(1) else drives.iloc[0:0]
            rz_dr = dr[dr.minyl <= 20]
            gl = gl_runs[gl_runs.posteam == tm]
            dpass = plays[(plays.defteam == tm) & (plays["pass"] == 1)].epa.mean()
            drush = plays[(plays.defteam == tm) & (plays["rush"] == 1)].epa.mean()
            teams[tm] = {
                "g": int(n_games),
                "plays": num(len(g) / max(1, n_games)),
                "npr": num(100 * ne["pass"].mean()),
                "proe": num(g.pass_oe.mean()),
                "pace": num(pace),
                "epa": num(g.epa.mean(), 3),
                "rzPg": num(len(rz_dr) / max(1, n_games)),
                "rzTd": num(100 * (rz_dr.result == "Touchdown").mean()) if len(rz_dr) else None,
                "qbGl": num(100 * gl.rusher_player_id.isin(passers).mean()) if len(gl) else None,
                "dPass": num(dpass, 3),
                "dRush": num(drush, 3),
            }
    else:
        adot = pd.Series(dtype=float)

    # Points per game + upcoming games from the schedule.
    upcoming = []
    if not games.empty:
        gs = games[(games.season == season) & (games.game_type == "REG")].copy()
        gs["home_team"] = gs.home_team.map(team)
        gs["away_team"] = gs.away_team.map(team)
        done = gs[gs.result.notna()]
        for tm in teams:
            pts = pd.concat([done[done.home_team == tm].home_score, done[done.away_team == tm].away_score])
            teams[tm]["ppg"] = num(pts.mean()) if len(pts) else None
        roof_by_stadium = gs.dropna(subset=["roof"]).groupby("stadium_id").roof.agg(lambda s: s.mode().iat[0])
        et = ZoneInfo("America/New_York")
        for r in gs[gs.result.isna()].itertuples(index=False):
            sid = r.stadium_id if isinstance(r.stadium_id, str) else None
            name = str(r.stadium or "").lower()
            for key, alt in NAME_COORDS.items():
                if key in name:
                    sid = alt
            roof = r.roof if isinstance(r.roof, str) else roof_by_stadium.get(r.stadium_id, None)
            coords = STADIUMS.get(sid or "")
            try:
                kick = datetime.strptime(f"{r.gameday} {r.gametime}", "%Y-%m-%d %H:%M").replace(tzinfo=et)
                k = kick.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except (TypeError, ValueError):
                k = None
            upcoming.append({
                "w": int(r.week), "h": r.home_team, "a": r.away_team, "k": k,
                "st": r.stadium if isinstance(r.stadium, str) else None,
                "roof": roof, "lat": coords[0] if coords else None, "lon": coords[1] if coords else None,
                "hr": int(r.home_rest) if not pd.isna(r.home_rest) else None,
                "ar": int(r.away_rest) if not pd.isna(r.away_rest) else None,
                "surf": r.surface if isinstance(r.surface, str) else None,
                "div": bool(r.div_game == 1),
                "neutral": r.location == "Neutral",
            })

    # Team ranks (1 = most of that thing, except defense where 1 = stingiest).
    def rank(key, reverse=True):
        vals = [(t, v[key]) for t, v in teams.items() if v.get(key) is not None]
        vals.sort(key=lambda x: x[1], reverse=reverse)
        for i, (t, _) in enumerate(vals):
            teams[t].setdefault("rk", {})[key] = i + 1

    for key in ("npr", "proe", "plays", "epa", "rzPg", "ppg"):
        rank(key)
    rank("pace", reverse=False)  # fewer seconds per play = faster
    rank("dPass", reverse=False)
    rank("dRush", reverse=False)

    # ---------------- Next Gen Stats (season totals are week 0) ----------------
    def ngs_rows(df):
        if df.empty:
            return df
        d = df[(df.season == season) & (df.season_type == "REG")]
        return d[d.week == 0] if (d.week == 0).any() else d.sort_values("week").groupby("player_gsis_id").tail(1)

    rec = ngs_rows(ngs["receiving"])
    for r in rec.itertuples(index=False):
        if r.player_gsis_id in players:
            players[r.player_gsis_id]["ngs"] = {
                "sep": num(r.avg_separation), "cush": num(r.avg_cushion),
                "yacoe": num(r.avg_yac_above_expectation), "iay": num(r.percent_share_of_intended_air_yards),
            }
    rush = ngs_rows(ngs["rushing"])
    for r in rush.itertuples(index=False):
        if r.player_gsis_id in players:
            players[r.player_gsis_id].setdefault("ngs", {}).update({
                "ryoe": num(r.rush_yards_over_expected_per_att, 2), "box8": num(r.percent_attempts_gte_eight_defenders),
                "eff": num(r.efficiency, 2),
            })
    pas = ngs_rows(ngs["passing"])
    for r in pas.itertuples(index=False):
        if r.player_gsis_id in players:
            players[r.player_gsis_id].setdefault("ngs", {}).update({
                "cpoe": num(r.completion_percentage_above_expectation), "ttt": num(r.avg_time_to_throw, 2),
                "aggr": num(r.aggressiveness),
            })

    # ---------------- injury + practice reports ----------------
    short = {"Did Not Participate In Practice": "DNP", "Limited Participation in Practice": "LP",
             "Full Participation in Practice": "FP"}
    if not inj.empty:
        inj = inj[inj.season_type == "REG"]
        for gid, g in inj.groupby("gsis_id"):
            if gid not in players:
                if g.position.iloc[0] not in SKILL:
                    continue
                P(gid, g.full_name.iloc[0], g.position.iloc[0], team(g.team.iloc[0]))
            last = g.sort_values("week").iloc[-1]
            body = last.report_primary_injury if isinstance(last.report_primary_injury, str) else last.practice_primary_injury
            same = g[(g.report_primary_injury == body) | (g.practice_primary_injury == body)] if isinstance(body, str) else g.iloc[0:0]
            players[gid]["prac"] = {
                "w": int(last.week),
                "st": short.get(last.practice_status, None) if isinstance(last.practice_status, str) else None,
                "rep": last.report_status if isinstance(last.report_status, str) else None,
                "inj": body if isinstance(body, str) else None,
                "wks": int(same.week.nunique()),  # weeks on the report with this injury this season
            }

    # ---------------- aggregate per player ----------------
    def share(a, b):
        return num(a / b, 3) if b else None

    out_players = {}
    for gid, p in players.items():
        weeks = sorted(p["wk"])
        if not weeks and "prac" not in p:
            continue
        rows = [p["wk"][w] for w in weeks]
        played = [r for r in rows if r.get("snap") or r.get("tgt") or r.get("car")]
        last3 = played[-3:]

        def agg(rs):
            if not rs:
                return None
            tgt = sum(r.get("tgt", 0) for r in rs)
            ttgt = sum(r.get("ttgt", 0) for r in rs)
            car = sum(r.get("car", 0) for r in rs)
            tcar = sum(r.get("tcar", 0) for r in rs)
            rz = sum(r.get("rzt", 0) + r.get("rzc", 0) for r in rs)
            trz = sum(r.get("trz", 0) for r in rs)
            fr = sum(r.get("fr", 0) for r in rs)
            tfr = sum(r.get("tfr", 0) for r in rs)
            snaps_ = [r["snap"] for r in rs if r.get("snap") is not None]
            xs = [r["xfp"] for r in rs if r.get("xfp") is not None]
            fps = [r["fp"] for r in rs if r.get("fp") is not None]
            wo = [r["wopr"] for r in rs if r.get("wopr") is not None]
            air = [r["airsh"] for r in rs if r.get("airsh") is not None]
            return {
                "g": len(rs),
                "snap": num(sum(snaps_) / len(snaps_), 3) if snaps_ else None,
                "tgtSh": share(tgt, ttgt), "carSh": share(car, tcar),
                "airSh": num(sum(air) / len(air), 3) if air else None,
                "wopr": num(sum(wo) / len(wo), 3) if wo else None,
                "frSh": share(fr, tfr) if tfr else None,
                "rzSh": share(rz, trz) if trz else None,
                "rzT": sum(r.get("rzt", 0) for r in rs), "rzC": sum(r.get("rzc", 0) for r in rs),
                "glC": sum(r.get("glc", 0) for r in rs),
                "tgtPg": num(tgt / len(rs)), "carPg": num(car / len(rs)),
                "xfp": num(sum(xs) / len(xs)) if xs else None,
                "fp": num(sum(fps) / len(fps)) if fps else None,
            }

        season_agg = agg(played)
        if season_agg is not None and gid in adot.index:
            season_agg["adot"] = num(adot.loc[gid])
        o = {
            "sid": p["sid"], "n": p["n"], "pos": p["pos"], "tm": p["tm"],
            "s": season_agg, "l3": agg(last3),
            # per week: [week, snap%, targets, carries, red-zone opps, xFP, PPR pts]
            "wk": [[w, p["wk"][w].get("snap"), p["wk"][w].get("tgt", 0), p["wk"][w].get("car", 0),
                    p["wk"][w].get("rzt", 0) + p["wk"][w].get("rzc", 0), p["wk"][w].get("xfp"), p["wk"][w].get("fp")]
                   for w in weeks],
        }
        if "ngs" in p:
            o["ngs"] = {k: v for k, v in p["ngs"].items() if v is not None}
        if "prac" in p:
            o["prac"] = p["prac"]
        out_players[gid] = o

    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": season,
        "throughWeek": max_week,
        "attribution": "nflverse (CC-BY 4.0), FTN Data via nflverse (CC-BY-SA 4.0), ffopportunity, DynastyProcess",
        "teams": teams,
        "players": out_players,
        "games": upcoming,
        "starters": starters,
        "startersReportWeek": int(inj[inj.season_type == "REG"].week.max()) if not inj.empty else None,
    }
    # Learn the model's weights from past results (only re-runs when a new week finishes).
    prev = None
    history = {}
    if os.path.exists(OUT):
        try:
            with open(OUT) as fh:
                old_data = json.load(fh)
            prev = old_data.get("calib")
            history = old_data.get("marketHistory") or {}
        except (OSError, ValueError):
            prev = None
    data["marketHistory"] = snapshot_market(history, season, games)
    try:
        data["calib"] = (
            calibrate(season, max_week, ids, games, prev, data["marketHistory"]) if not ids.empty and not games.empty else prev
        )
    except Exception as e:  # noqa: BLE001 - calibration is a bonus, never block the data build
        log(f"Calibration failed ({e.__class__.__name__}: {e}); keeping previous weights.")
        data["calib"] = prev

    if not out_players and os.path.exists(OUT):
        log("No player data came back; keeping the existing file.")
        return
    # Skip the write when nothing but the timestamp changed (avoids empty commits).
    if os.path.exists(OUT):
        try:
            with open(OUT) as fh:
                prev = json.load(fh)
            if {**prev, "updated": None} == json.loads(json.dumps({**data, "updated": None})):
                log("No changes since the last build.")
                return
        except (OSError, ValueError):
            pass
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(data, fh, separators=(",", ":"))
    log(f"Wrote {OUT}: {len(out_players)} players, {len(teams)} teams, {len(upcoming)} upcoming games, "
        f"{os.path.getsize(OUT) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
