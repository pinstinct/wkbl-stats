"""Shared stat calculation utilities for API/database layers."""

from __future__ import annotations

from typing import Any, Dict, Optional


def _r(value: float, digits: int) -> float:
    return round(value, digits)


def estimate_possessions(
    fga: float,
    fta: float,
    tov: float,
    oreb: float,
    *,
    strategy: str = "simple",
    fgm: Optional[float] = None,
    opp_fga: Optional[float] = None,
    opp_fta: Optional[float] = None,
    opp_tov: Optional[float] = None,
    opp_oreb: Optional[float] = None,
    opp_fgm: Optional[float] = None,
    opp_dreb: Optional[float] = None,
    team_dreb: Optional[float] = None,
) -> float:
    """Estimate possessions with selectable strategy.

    Strategies:
    - simple: FGA + 0.44*FTA + TOV - OREB
    - bbr_standard: BBR team possession estimator with opponent/ORB adjustments
    """
    if strategy == "bbr_standard":
        if (
            fgm is None
            or opp_fga is None
            or opp_fta is None
            or opp_tov is None
            or opp_oreb is None
            or opp_fgm is None
            or opp_dreb is None
            or team_dreb is None
        ):
            strategy = "simple"
        else:
            team_orb_pct = _safe_div(oreb, oreb + opp_dreb)
            opp_orb_pct = _safe_div(opp_oreb, opp_oreb + team_dreb)
            team_term = fga + 0.4 * fta - 1.07 * team_orb_pct * (fga - fgm) + tov
            opp_term = (
                opp_fga
                + 0.4 * opp_fta
                - 1.07 * opp_orb_pct * (opp_fga - opp_fgm)
                + opp_tov
            )
            return _r(0.5 * (team_term + opp_term), 1)
    return _r(fga + 0.44 * fta + tov - oreb, 1)


def _safe_div(n: float, d: float) -> float:
    return n / d if d else 0.0


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _total_from_row(d: Dict[str, Any], total_key: str, avg_key: str, gp: int) -> float:
    total = d.get(total_key)
    if total is not None:
        return float(total)
    return float((d.get(avg_key) or 0) * gp)


def _compute_player_off_rtg(
    *,
    total_pts: float,
    total_ast: float,
    total_tov: float,
    total_fgm: float,
    total_fga: float,
    total_tpm: float,
    total_ftm: float,
    total_fta: float,
    total_oreb: float,
    ts: Dict[str, Any],
) -> Optional[tuple[float, float, float]]:
    """Estimate player ORtg from box score (Dean Oliver / BBR style approximation)."""
    team_fga = ts.get("team_fga", 0) or 0
    team_fta = ts.get("team_fta", 0) or 0
    team_tov = ts.get("team_tov", 0) or 0
    team_oreb = ts.get("team_oreb", 0) or 0
    team_fgm = ts.get("team_fgm", 0) or 0
    team_ast = ts.get("team_ast", 0) or 0
    team_pts = ts.get("team_pts", 0) or 0
    team_ftm = ts.get("team_ftm", 0) or 0
    team_tpm = ts.get("team_tpm", 0) or 0
    opp_dreb = ts.get("opp_dreb", 0) or 0

    team_orb_pct = _safe_div(team_oreb, team_oreb + opp_dreb)
    team_scoring_poss = team_fgm + (
        (1 - (1 - _safe_div(team_ftm, team_fta)) ** 2) * 0.44 * team_fta
    )
    team_play_pct = _safe_div(
        team_scoring_poss,
        team_fga + 0.44 * team_fta + team_tov,
    )

    orb_weight_denom = (1 - team_orb_pct) * team_play_pct + team_orb_pct * (
        1 - team_play_pct
    )
    team_orb_weight = _safe_div((1 - team_orb_pct) * team_play_pct, orb_weight_denom)

    q_ast = _clamp(0.5 * _safe_div(team_ast, team_fgm), 0.0, 1.0)

    fg_part = 0.0
    if total_fga > 0:
        fg_part = total_fgm * (
            1 - 0.5 * _safe_div(total_pts - total_ftm, 2 * total_fga) * q_ast
        )

    ast_part = 0.0
    ast_denom = 2 * (team_fga - total_fga)
    if ast_denom > 0:
        ast_part = (
            0.5
            * _safe_div(
                (team_pts - team_ftm) - (total_pts - total_ftm),
                ast_denom,
            )
            * total_ast
        )

    ft_part = 0.0
    if total_fta > 0:
        ft_part = (1 - (1 - _safe_div(total_ftm, total_fta)) ** 2) * 0.44 * total_fta

    team_scoring_share = _safe_div(team_oreb, team_scoring_poss)
    scoring_decay = 1 - team_scoring_share * team_orb_weight * team_play_pct
    sc_poss = (
        fg_part + ast_part + ft_part
    ) * scoring_decay + total_oreb * team_orb_weight * team_play_pct

    fgx_poss = (total_fga - total_fgm) * (1 - 1.07 * team_orb_pct)
    ftx_poss = (
        (1 - _safe_div(total_ftm * total_ftm, total_fta * total_fta))
        * 0.44
        * (total_fta)
    )
    tot_poss = sc_poss + fgx_poss + ftx_poss + total_tov
    if tot_poss <= 0:
        return None

    pprod_fg = 0.0
    if total_fga > 0:
        pprod_fg = (
            2
            * (total_fgm + 0.5 * total_tpm)
            * (1 - 0.5 * _safe_div(total_pts - total_ftm, 2 * total_fga) * q_ast)
        )

    pprod_ast = 0.0
    if (team_fgm - total_fgm) > 0 and (team_fga - total_fga) > 0:
        pprod_ast = (
            2
            * _safe_div(
                (team_fgm - total_fgm) + 0.5 * (team_tpm - total_tpm),
                (team_fgm - total_fgm),
            )
            * 0.5
            * _safe_div(
                (team_pts - team_ftm) - (total_pts - total_ftm),
                2 * (team_fga - total_fga),
            )
            * total_ast
        )

    pprod_orb = 0.0
    if team_scoring_poss > 0:
        pprod_orb = (
            total_oreb
            * team_orb_weight
            * team_play_pct
            * _safe_div(team_pts, team_scoring_poss)
        )

    pprod = (pprod_fg + pprod_ast + total_ftm) * scoring_decay + pprod_orb
    if pprod <= 0:
        return (0.0, 0.0, tot_poss)
    return (_r(100 * pprod / tot_poss, 1), pprod, tot_poss)


def _compute_player_def_rtg(
    *,
    total_stl: float,
    total_blk: float,
    total_dreb: float,
    total_pf: float,
    total_min: float,
    ts: Dict[str, Any],
) -> Optional[float]:
    """Estimate player DRtg from box score stops (BBR-inspired approximation)."""
    poss_strategy = ts.get("poss_strategy", "simple")
    opp_poss = estimate_possessions(
        ts.get("opp_fga", 0) or 0,
        ts.get("opp_fta", 0) or 0,
        ts.get("opp_tov", 0) or 0,
        ts.get("opp_oreb", 0) or 0,
        strategy=poss_strategy,
        fgm=ts.get("opp_fgm"),
        opp_fga=ts.get("team_fga"),
        opp_fta=ts.get("team_fta"),
        opp_tov=ts.get("team_tov"),
        opp_oreb=ts.get("team_oreb"),
        opp_fgm=ts.get("team_fgm"),
        opp_dreb=ts.get("team_dreb"),
        team_dreb=ts.get("opp_dreb"),
    )
    if opp_poss <= 0:
        return None

    team_drtg = _safe_div(ts.get("opp_pts", 0) or 0, opp_poss) * 100
    team_min_5 = _safe_div(ts.get("team_min", 0) or 0, 5)
    if total_min <= 0 or team_min_5 <= 0:
        return _r(team_drtg, 1)

    opp_orb_pct = _safe_div(
        ts.get("opp_oreb", 0) or 0,
        (ts.get("opp_oreb", 0) or 0) + (ts.get("team_dreb", 0) or 0),
    )
    stops1 = total_stl + (0.7 * total_blk) + total_dreb * (1 - opp_orb_pct)

    team_pf = ts.get("team_pf", 0) or 0
    opp_fta = ts.get("opp_fta", 0) or 0
    opp_ftm = ts.get("opp_ftm", 0) or 0
    stop_ft = 0.0
    if team_pf > 0 and opp_fta > 0:
        stop_ft = (
            _safe_div(total_pf, team_pf)
            * 0.4
            * opp_fta
            * (1 - _safe_div(opp_ftm * opp_ftm, opp_fta * opp_fta))
        )

    player_opp_poss = opp_poss * _safe_div(total_min, team_min_5)
    if player_opp_poss <= 0:
        return _r(team_drtg, 1)

    stop_pct = _clamp(_safe_div(stops1 + stop_ft, player_opp_poss), 0.0, 1.0)
    # Keep DRtg anchored to team defense while reflecting player stop activity.
    def_rtg = team_drtg * (1 - 0.2 * stop_pct)
    return _r(_clamp(def_rtg, 50.0, 150.0), 1)


def _compute_ws_components(
    *,
    pprod: float,
    tot_poss: float,
    player_def_rtg: float,
    total_min: float,
    team_poss: float,
    opp_poss: float,
    team_stats: Dict[str, Any],
    league_stats: Dict[str, Any],
) -> Optional[tuple[float, float, float, float]]:
    """Compute OWS/DWS/WS/WS40 using BBR-style simplified formulas."""
    lg_pts = league_stats.get("lg_pts", 0) or 0
    lg_poss = league_stats.get("lg_poss", 0) or 0
    lg_pace = league_stats.get("lg_pace", 0) or 0
    lg_min = league_stats.get("lg_min", 0) or 0

    team_min_5 = _safe_div(team_stats.get("team_min", 0) or 0, 5)
    if (
        pprod < 0
        or tot_poss <= 0
        or total_min <= 0
        or lg_pts <= 0
        or lg_poss <= 0
        or lg_pace <= 0
        or lg_min <= 0
        or team_min_5 <= 0
        or team_poss <= 0
        or opp_poss <= 0
    ):
        return None

    lg_gp = _safe_div(lg_min, 400)  # 40min * 5 players * 2 teams
    lg_ppg = _safe_div(lg_pts, lg_gp)
    if lg_ppg <= 0:
        return None

    team_pace = _safe_div(40 * team_poss, team_min_5)
    marginal_ppw = 2 * lg_ppg * _safe_div(team_pace, lg_pace)
    if marginal_ppw <= 0:
        return None

    lg_pts_per_poss = _safe_div(lg_pts, lg_poss)
    marginal_offense = pprod - 0.92 * lg_pts_per_poss * tot_poss
    ows = max(0.0, marginal_offense / marginal_ppw)

    lg_drtg = 100 * lg_pts_per_poss
    player_def_poss = opp_poss * _safe_div(total_min, team_min_5)
    player_def_pts_saved = _safe_div(lg_drtg - player_def_rtg, 100) * player_def_poss
    replacement_def = 0.08 * lg_ppg * _safe_div(total_min, team_min_5)
    marginal_defense = player_def_pts_saved + replacement_def
    dws = marginal_defense / marginal_ppw

    ws = ows + dws
    ws_40 = _safe_div(ws, total_min) * 40
    return (_r(ows, 2), _r(dws, 2), _r(ws, 2), _r(ws_40, 3))


def _estimate_team_and_opp_possessions(ts: Dict[str, Any]) -> tuple[float, float]:
    """Estimate team/opponent possessions using configured strategy."""
    poss_strategy = ts.get("poss_strategy", "simple")
    team_poss = estimate_possessions(
        ts["team_fga"],
        ts["team_fta"],
        ts["team_tov"],
        ts["team_oreb"],
        strategy=poss_strategy,
        fgm=ts.get("team_fgm"),
        opp_fga=ts.get("opp_fga"),
        opp_fta=ts.get("opp_fta"),
        opp_tov=ts.get("opp_tov"),
        opp_oreb=ts.get("opp_oreb"),
        opp_fgm=ts.get("opp_fgm"),
        opp_dreb=ts.get("opp_dreb"),
        team_dreb=ts.get("team_dreb"),
    )
    opp_poss = estimate_possessions(
        ts["opp_fga"],
        ts["opp_fta"],
        ts["opp_tov"],
        ts["opp_oreb"],
        strategy=poss_strategy,
        fgm=ts.get("opp_fgm"),
        opp_fga=ts.get("team_fga"),
        opp_fta=ts.get("team_fta"),
        opp_tov=ts.get("team_tov"),
        opp_oreb=ts.get("team_oreb"),
        opp_fgm=ts.get("team_fgm"),
        opp_dreb=ts.get("team_dreb"),
        team_dreb=ts.get("opp_dreb"),
    )
    return team_poss, opp_poss


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
    d["tpar"] = _r(total_tpa / total_fga, 3) if total_fga > 0 else 0.0
    d["ftr"] = _r(total_fta / total_fga, 3) if total_fga > 0 else 0.0

    total_pts = pts_avg * gp
    total_reb = reb_avg * gp
    total_ast = _total_from_row(d, "total_ast", "ast", gp)
    total_stl = _total_from_row(d, "total_stl", "stl", gp)
    total_blk = _total_from_row(d, "total_blk", "blk", gp)
    total_tov = _total_from_row(d, "total_tov", "tov", gp)
    total_off_reb = _total_from_row(d, "total_off_reb", "off_reb", gp)
    total_def_reb = _total_from_row(d, "total_def_reb", "def_reb", gp)
    total_pf = _total_from_row(d, "total_pf", "pf", gp)
    total_min = min_avg * gp

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
        team_poss, opp_poss = _estimate_team_and_opp_possessions(ts)

        # USG% = 100 * (FGA + 0.44*FTA + TOV) * (Team_MIN/5) / (MIN * (Team_FGA + 0.44*Team_FTA + Team_TOV))
        player_usage = (fga_avg + 0.44 * fta_avg + tov_avg) * gp
        team_usage = ts["team_fga"] + 0.44 * ts["team_fta"] + ts["team_tov"]
        total_player_min = min_avg * gp
        if team_usage > 0 and total_player_min > 0:
            d["usg_pct"] = _r(
                100 * player_usage * team_min_5 / (total_player_min * team_usage), 1
            )

        # Player ORtg/DRtg: box-score estimate (Dean Oliver / BBR style).
        off_rtg_data = _compute_player_off_rtg(
            total_pts=total_pts,
            total_ast=total_ast,
            total_tov=total_tov,
            total_fgm=total_fgm,
            total_fga=total_fga,
            total_tpm=total_tpm,
            total_ftm=total_ftm,
            total_fta=total_fta,
            total_oreb=total_off_reb,
            ts=ts,
        )
        pprod = None
        tot_poss = None
        if off_rtg_data is not None:
            off_rtg, pprod, tot_poss = off_rtg_data
            d["off_rtg"] = off_rtg

        def_rtg = _compute_player_def_rtg(
            total_stl=total_stl,
            total_blk=total_blk,
            total_dreb=total_def_reb,
            total_pf=total_pf,
            total_min=total_min,
            ts=ts,
        )
        if def_rtg is not None:
            d["def_rtg"] = def_rtg

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

        if (
            league_stats
            and pprod is not None
            and tot_poss is not None
            and d.get("def_rtg") is not None
            and "team_wins" in ts
            and "team_losses" in ts
        ):
            ws = _compute_ws_components(
                pprod=pprod,
                tot_poss=tot_poss,
                player_def_rtg=d["def_rtg"],
                total_min=total_min,
                team_poss=team_poss,
                opp_poss=opp_poss,
                team_stats=ts,
                league_stats=league_stats,
            )
            if ws is not None:
                ows, dws, total_ws, ws_40 = ws
                d["ows"] = ows
                d["dws"] = dws
                d["ws"] = total_ws
                d["ws_40"] = ws_40

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
    """Compute PER (Player Efficiency Rating) using Hollinger-style uPER."""
    ts = team_stats
    lg = league_stats

    # Player season totals
    total_fgm = d.get("total_fgm") or 0
    total_fga = d.get("total_fga") or 0
    total_tpm = d.get("total_tpm") or 0
    total_ftm = d.get("total_ftm") or 0
    total_fta = d.get("total_fta") or 0
    total_min = min_avg * gp

    ast_total = _total_from_row(d, "total_ast", "ast", gp)
    stl_total = _total_from_row(d, "total_stl", "stl", gp)
    blk_total = _total_from_row(d, "total_blk", "blk", gp)
    tov_total = _total_from_row(d, "total_tov", "tov", gp)
    pf_total = _total_from_row(d, "total_pf", "pf", gp)
    off_reb_total = _total_from_row(d, "total_off_reb", "off_reb", gp)
    def_reb_total = _total_from_row(d, "total_def_reb", "def_reb", gp)

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
    if lg_ftm > 0 and lg_fgm > 0 and lg_fga > 0:
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

        pf_penalty = 0.0
        if lg_pf > 0:
            pf_penalty = pf_total * ((lg_ftm / lg_pf) - 0.44 * (lg_fta / lg_pf) * vop)

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

    # Normalize: aPER = pace_adj * uPER, then scale so league average = 15.
    a_per = pace_adj * uper

    lg_a_per = lg.get("lg_aper")
    if not lg_a_per:
        lg_a_per = lg_pts / lg_min if lg_min > 0 else 1
    if lg_a_per > 0:
        per = a_per * (15 / lg_a_per)
    else:
        per = 0.0

    return _r(per, 1)
