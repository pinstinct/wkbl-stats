"""Shared stat calculation utilities for API/database layers."""

from __future__ import annotations

from typing import Any, Dict, Optional


def _r(value: float, digits: int) -> float:
    return round(value, digits)


def estimate_possessions(fga: float, fta: float, tov: float, oreb: float) -> float:
    """Estimate possessions: FGA + 0.44*FTA + TOV - OREB."""
    return _r(fga + 0.44 * fta + tov - oreb, 1)


def compute_advanced_stats(
    row: Dict[str, Any],
    *,
    team_stats: Optional[Dict[str, Any]] = None,
    league_stats: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Compute percentage and advanced stats for an aggregated player row.

    Required keys:
    gp, min, pts, reb, ast, stl, blk, tov,
    total_fgm, total_fga, total_tpm, total_tpa, total_ftm, total_fta

    Optional keys (for Game Score / TOV%):
    off_reb, def_reb, pf

    Optional kwargs:
    team_stats: team/opponent season totals for USG%, ORtg, DRtg, Pace, rate stats
    league_stats: league season totals for PER
    """
    d = dict(row)

    gp = d.get("gp") or 0
    min_avg = d.get("min") or 0
    pts_avg = d.get("pts") or 0
    reb_avg = d.get("reb") or 0
    ast_avg = d.get("ast") or 0
    stl_avg = d.get("stl") or 0
    blk_avg = d.get("blk") or 0
    tov_avg = d.get("tov") or 0

    total_fgm = d.get("total_fgm") or 0
    total_fga = d.get("total_fga") or 0
    total_tpm = d.get("total_tpm") or 0
    total_tpa = d.get("total_tpa") or 0
    total_ftm = d.get("total_ftm") or 0
    total_fta = d.get("total_fta") or 0

    d["fgp"] = _r(total_fgm / total_fga, 3) if total_fga > 0 else 0.0
    d["tpp"] = _r(total_tpm / total_tpa, 3) if total_tpa > 0 else 0.0
    d["ftp"] = _r(total_ftm / total_fta, 3) if total_fta > 0 else 0.0

    total_pts = pts_avg * gp
    total_reb = reb_avg * gp
    total_ast = ast_avg * gp
    total_stl = stl_avg * gp
    total_blk = blk_avg * gp
    total_tov = tov_avg * gp

    tsa = 2 * (total_fga + 0.44 * total_fta)
    d["ts_pct"] = _r(total_pts / tsa, 3) if tsa > 0 else 0.0
    d["efg_pct"] = (
        _r((total_fgm + 0.5 * total_tpm) / total_fga, 3) if total_fga > 0 else 0.0
    )

    pir_total = (
        total_pts
        + total_reb
        + total_ast
        + total_stl
        + total_blk
        - total_tov
        - (total_fga - total_fgm)
        - (total_fta - total_ftm)
    )
    d["pir"] = _r(pir_total / gp, 1) if gp > 0 else 0.0
    d["ast_to"] = _r(ast_avg / tov_avg, 2) if tov_avg > 0 else 0.0

    safe_min = min_avg if min_avg > 0 else 1
    d["pts36"] = _r(pts_avg * 36 / safe_min, 1)
    d["reb36"] = _r(reb_avg * 36 / safe_min, 1)
    d["ast36"] = _r(ast_avg * 36 / safe_min, 1)

    # --- Game Score & TOV% (require off_reb, def_reb, pf) ---
    off_reb = d.get("off_reb")
    def_reb = d.get("def_reb")
    pf = d.get("pf")

    if off_reb is not None and def_reb is not None and pf is not None:
        fgm_avg = total_fgm / gp if gp > 0 else 0
        fga_avg = total_fga / gp if gp > 0 else 0
        fta_avg = total_fta / gp if gp > 0 else 0
        ftm_avg = total_ftm / gp if gp > 0 else 0

        # Game Score (John Hollinger)
        game_score = (
            pts_avg
            + 0.4 * fgm_avg
            - 0.7 * fga_avg
            - 0.4 * (fta_avg - ftm_avg)
            + 0.7 * off_reb
            + 0.3 * def_reb
            + stl_avg
            + 0.7 * ast_avg
            + 0.7 * blk_avg
            - 0.4 * pf
            - tov_avg
        )
        d["game_score"] = _r(game_score, 1)

        # TOV% = 100 * TOV / (FGA + 0.44*FTA + TOV)
        tov_denom = fga_avg + 0.44 * fta_avg + tov_avg
        d["tov_pct"] = _r(100 * tov_avg / tov_denom, 1) if tov_denom > 0 else 0.0

    # --- Team-context stats (require team_stats) ---
    if team_stats and min_avg > 0 and gp > 0:
        ts = team_stats
        team_min_5 = ts["team_min"] / 5  # team minutes per "slot"

        # Per-game averages for player
        fgm_avg = total_fgm / gp if gp > 0 else 0
        fga_avg = total_fga / gp if gp > 0 else 0
        fta_avg = total_fta / gp if gp > 0 else 0

        # Team and opponent possessions (season totals)
        team_poss = estimate_possessions(
            ts["team_fga"], ts["team_fta"], ts["team_tov"], ts["team_oreb"]
        )
        opp_poss = estimate_possessions(
            ts["opp_fga"], ts["opp_fta"], ts["opp_tov"], ts["opp_oreb"]
        )

        # USG% = 100 * (FGA + 0.44*FTA + TOV) * (Team_MIN/5) / (MIN * (Team_FGA + 0.44*Team_FTA + Team_TOV))
        player_usage = (fga_avg + 0.44 * fta_avg + tov_avg) * gp
        team_usage = ts["team_fga"] + 0.44 * ts["team_fta"] + ts["team_tov"]
        total_player_min = min_avg * gp
        if team_usage > 0 and total_player_min > 0:
            d["usg_pct"] = _r(
                100 * player_usage * team_min_5 / (total_player_min * team_usage), 1
            )

        # ORtg = Team_PTS / Team_Poss * 100
        if team_poss > 0:
            d["off_rtg"] = _r(ts["team_pts"] / team_poss * 100, 1)

        # DRtg = Opp_PTS / Opp_Poss * 100
        if opp_poss > 0:
            d["def_rtg"] = _r(ts["opp_pts"] / opp_poss * 100, 1)

        # Net Rating
        if "off_rtg" in d and "def_rtg" in d:
            d["net_rtg"] = _r(d["off_rtg"] - d["def_rtg"], 1)

        # Pace = 40 * (Team_Poss + Opp_Poss) / (2 * Team_MIN/5)
        if team_min_5 > 0:
            d["pace"] = _r(40 * (team_poss + opp_poss) / (2 * team_min_5), 1)

        # --- Rate stats (Batch 3) ---
        off_reb_avg = d.get("off_reb") or 0
        def_reb_avg = d.get("def_reb") or 0

        # OREB% = 100 * OREB * (Team_MIN/5) / (MIN * (Team_OREB + Opp_DREB))
        oreb_denom = min_avg * (ts["team_oreb"] + ts["opp_dreb"])
        if oreb_denom > 0:
            d["oreb_pct"] = _r(100 * off_reb_avg * team_min_5 / oreb_denom, 1)

        # DREB% = 100 * DREB * (Team_MIN/5) / (MIN * (Team_DREB + Opp_OREB))
        dreb_denom = min_avg * (ts["team_dreb"] + ts["opp_oreb"])
        if dreb_denom > 0:
            d["dreb_pct"] = _r(100 * def_reb_avg * team_min_5 / dreb_denom, 1)

        # REB% = 100 * REB * (Team_MIN/5) / (MIN * (Team_REB + Opp_REB))
        reb_denom = min_avg * (ts["team_reb"] + ts["opp_reb"])
        if reb_denom > 0:
            d["reb_pct"] = _r(100 * reb_avg * team_min_5 / reb_denom, 1)

        # AST% = 100 * AST / ((MIN/(Team_MIN/5)) * Team_FGM - FGM)
        if team_min_5 > 0:
            min_frac = min_avg / team_min_5
            ast_denom = min_frac * ts["team_fgm"] - fgm_avg
            if ast_denom > 0:
                d["ast_pct"] = _r(100 * ast_avg / ast_denom, 1)

        # STL% = 100 * STL * (Team_MIN/5) / (MIN * Opp_Poss)
        stl_denom = min_avg * opp_poss
        if stl_denom > 0:
            d["stl_pct"] = _r(100 * stl_avg * team_min_5 / stl_denom, 1)

        # BLK% = 100 * BLK * (Team_MIN/5) / (MIN * (Opp_FGA - Opp_3PA))
        opp_2pa = ts["opp_fga"] - ts["opp_tpa"]
        blk_denom = min_avg * opp_2pa
        if blk_denom > 0:
            d["blk_pct"] = _r(100 * blk_avg * team_min_5 / blk_denom, 1)

    # --- PER (require team_stats + league_stats) ---
    if team_stats and league_stats and min_avg > 0 and gp > 0:
        d["per"] = _compute_per(d, gp, min_avg, team_stats, league_stats)

    return d


def _compute_per(
    d: Dict[str, Any],
    gp: int,
    min_avg: float,
    team_stats: Dict[str, Any],
    league_stats: Dict[str, Any],
) -> float:
    """Compute PER (Player Efficiency Rating) using Hollinger formula.

    Normalized so league average = 15.0.
    """
    ts = team_stats
    lg = league_stats

    # Player season totals
    total_fgm = d.get("total_fgm") or 0
    total_fga = d.get("total_fga") or 0
    total_tpm = d.get("total_tpm") or 0
    total_ftm = d.get("total_ftm") or 0
    total_fta = d.get("total_fta") or 0
    total_min = min_avg * gp

    ast_total = (d.get("ast") or 0) * gp
    stl_total = (d.get("stl") or 0) * gp
    blk_total = (d.get("blk") or 0) * gp
    tov_total = (d.get("tov") or 0) * gp
    pf_total = (d.get("pf") or 0) * gp
    off_reb_total = (d.get("off_reb") or 0) * gp
    def_reb_total = (d.get("def_reb") or 0) * gp

    if total_min <= 0:
        return 0.0

    # League factors
    lg_min = lg["lg_min"] or 1
    lg_pts = lg["lg_pts"] or 1
    lg_fga = lg["lg_fga"] or 1
    lg_fta = lg["lg_fta"] or 1
    lg_ftm = lg["lg_ftm"] or 0
    lg_oreb = lg["lg_oreb"] or 0
    lg_reb = lg["lg_reb"] or 1
    lg_ast = lg["lg_ast"] or 0
    lg_fgm = lg["lg_fgm"] or 0
    lg_tov = lg["lg_tov"] or 0
    lg_pf = lg["lg_pf"] or 1

    # Team pace / league pace factor
    team_min_5 = ts["team_min"] / 5 if ts["team_min"] > 0 else 1
    team_poss = estimate_possessions(
        ts["team_fga"], ts["team_fta"], ts["team_tov"], ts["team_oreb"]
    )
    team_pace = 40 * team_poss / team_min_5 if team_min_5 > 0 else 1

    lg_pace = lg.get("lg_pace") or 1

    pace_adj = lg_pace / team_pace if team_pace > 0 else 1

    # Hollinger's intermediate factors
    if lg_ftm > 0 and lg_fgm > 0:
        factor = (2 / 3) - (0.5 * (lg_ast / lg_fgm)) / (2 * (lg_fgm / lg_ftm))
    else:
        factor = 0.44

    lg_poss_denom = lg_fga - lg_oreb + lg_tov + 0.44 * lg_fta
    vop = lg_pts / lg_poss_denom if lg_poss_denom > 0 else 1
    drbp = (lg_reb - lg_oreb) / lg_reb if lg_reb > 0 else 0.7

    # Full Hollinger uPER formula
    team_fgm = ts.get("team_fgm", 0)
    if team_fgm > 0:
        team_ast_ratio = ts["team_ast"] / team_fgm

        pf_penalty = pf_total * (lg_ftm / lg_pf) * vop if lg_pf > 0 else 0

        uper = (1 / total_min) * (
            total_tpm
            + (2 / 3) * ast_total
            + (2 - factor * team_ast_ratio) * total_fgm
            + total_ftm * 0.5 * (1 + (1 - team_ast_ratio) + (2 / 3) * team_ast_ratio)
            - vop * tov_total
            - vop * drbp * (total_fga - total_fgm)
            - vop * 0.44 * (0.44 + 0.56 * drbp) * (total_fta - total_ftm)
            + vop * (1 - drbp) * def_reb_total
            + vop * drbp * off_reb_total
            + vop * stl_total
            + vop * drbp * blk_total
            - pf_penalty
        )
    else:
        uper = 0

    # Normalize: aPER = pace_adj * uPER, then scale so league avg = 15
    a_per = pace_adj * uper

    # lg_aPER: league average uPER per minute, approximated as lg_pts / lg_min
    lg_a_per = lg_pts / lg_min if lg_min > 0 else 1
    if lg_a_per > 0:
        per = a_per * (15 / lg_a_per)
    else:
        per = 0.0

    return _r(per, 1)
