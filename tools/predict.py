"""Prediction utilities for player stats, win probability, and lineup selection.

Extracted from ingest_wkbl.py for testability and modularity.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple


def _calc_game_score(g: Dict[str, Any]) -> float:
    """Calculate Hollinger Game Score for a single game record."""
    pts = g.get("pts") or 0
    fgm = g.get("fgm") or 0
    fga = g.get("fga") or 0
    ftm = g.get("ftm") or 0
    fta = g.get("fta") or 0
    off_reb = g.get("off_reb") or 0
    def_reb = g.get("def_reb") or 0
    stl = g.get("stl") or 0
    ast = g.get("ast") or 0
    blk = g.get("blk") or 0
    pf = g.get("pf") or 0
    tov = g.get("tov") or 0

    return (
        pts
        + 0.4 * fgm
        - 0.7 * fga
        - 0.4 * (fta - ftm)
        + 0.7 * off_reb
        + 0.3 * def_reb
        + stl
        + 0.7 * ast
        + 0.7 * blk
        - 0.4 * pf
        - tov
    )


def _game_score_weighted_avg(games: List[Dict], stat: str) -> float:
    """Compute Game Score weighted average for a stat across games."""
    if not games:
        return 0.0

    weights = []
    values = []
    for g in games:
        gs = _calc_game_score(g)
        weights.append(max(0.1, gs))  # clamp negative game scores
        values.append(g.get(stat) or 0)

    total_weight = sum(weights)
    if total_weight <= 0:
        return sum(values) / len(values)

    return sum(v * w for v, w in zip(values, weights)) / total_weight


def calculate_player_prediction(
    recent_games: List[Dict],
    player_stats: Dict[str, Any],
    is_home: bool,
    opp_context: Optional[Dict[str, float]] = None,
) -> Dict[str, Dict[str, float]]:
    """Calculate predicted stats for a player.

    Args:
        recent_games: Recent game stats (most recent first), up to 10 games.
        player_stats: Player's season averages (pts, reb, ast, stl, blk).
        is_home: Whether this is a home game.
        opp_context: Optional opponent context with stat-specific defense factors.
            Keys: pts_factor, reb_factor, ast_factor, stl_factor, blk_factor
            Values > 1.0 mean weak defense (allows more), < 1.0 strong defense.

    Returns:
        Dict with pts/reb/ast/stl/blk predictions including confidence intervals.
    """
    stats = ["pts", "reb", "ast", "stl", "blk"]

    prediction: Dict[str, Dict[str, float]] = {}

    if not recent_games:
        for stat in stats:
            val = player_stats.get(stat) or 0
            prediction[stat] = {
                "pred": round(val, 1),
                "low": round(max(0, val * 0.7), 1),
                "high": round(val * 1.3, 1),
            }
        return prediction

    # Minutes stability: CV of recent 5 games
    minutes_values = [g.get("minutes") or 0 for g in recent_games[:5]]
    min_avg = sum(minutes_values) / len(minutes_values) if minutes_values else 0
    if min_avg > 0 and len(minutes_values) > 1:
        min_variance = sum((m - min_avg) ** 2 for m in minutes_values) / len(
            minutes_values
        )
        min_std = math.sqrt(min_variance)
        cv = min_std / min_avg
    else:
        cv = 0.0

    for stat in stats:
        # Game Score weighted averages
        recent5 = recent_games[:5]
        recent10 = recent_games[:10]

        avg5 = _game_score_weighted_avg(recent5, stat)
        avg10 = _game_score_weighted_avg(recent10, stat)

        # Weighted average: 60% recent 5, 40% recent 10
        base_pred = avg5 * 0.6 + avg10 * 0.4

        # Home/away adjustment
        if is_home:
            base_pred *= 1.05
        else:
            base_pred *= 0.97

        # Trend bonus
        season_avg = player_stats.get(stat) or 0
        if season_avg > 0:
            if avg5 > season_avg * 1.1:
                base_pred *= 1.05  # Hot streak
            elif avg5 < season_avg * 0.9:
                base_pred *= 0.95  # Cold streak

        # Opponent defensive adjustment
        if opp_context:
            factor_key = f"{stat}_factor"
            opp_factor = opp_context.get(factor_key, 1.0)
            # Apply with damping (0.15 weight to prevent over-correction)
            base_pred *= 1.0 + (opp_factor - 1.0) * 0.15

        # Standard deviation for confidence interval
        values = [g.get(stat) or 0 for g in recent_games]
        plain_avg = sum(values) / len(values) if values else 0
        if len(values) > 1:
            variance = sum((v - plain_avg) ** 2 for v in values) / len(values)
            std_dev = math.sqrt(variance) if variance > 0 else base_pred * 0.15
        else:
            std_dev = base_pred * 0.15

        # Widen confidence interval for unstable minutes
        if cv > 0.3:
            std_dev *= 1.0 + (cv - 0.3)

        prediction[stat] = {
            "pred": round(base_pred, 1),
            "low": round(max(0, base_pred - std_dev), 1),
            "high": round(base_pred + std_dev, 1),
        }

    return prediction


def parse_last5(last5_str: Optional[str]) -> float:
    """Parse '3-2' → 0.6 win rate."""
    if not last5_str or "-" not in last5_str:
        return 0.5
    parts = last5_str.split("-")
    try:
        wins = int(parts[0])
        losses = int(parts[1])
    except (ValueError, IndexError):
        return 0.5
    total = wins + losses
    return wins / total if total > 0 else 0.5


def _normalize_rating(rating: float, center: float = 0, scale: float = 10) -> float:
    """Net Rating to 0~1 via sigmoid-like transformation."""
    return 1 / (1 + math.exp(-(rating - center) / scale))


def blend_probabilities(
    rules_home_prob: float,
    elo_home_prob: float,
    *,
    w_elo: float = 0.35,
) -> float:
    """Blend rules-based and Elo-based home win probabilities."""
    w_elo = max(0.0, min(1.0, w_elo))
    w_rules = 1.0 - w_elo
    blended = rules_home_prob * w_rules + elo_home_prob * w_elo
    return max(0.0, min(100.0, blended))


def calibrate_probability(
    raw_home_prob: float,
    bins: Optional[List[Dict[str, float]]] = None,
) -> float:
    """Calibrate home win probability using piecewise bins.

    bins format:
        [{"min": 40.0, "max": 50.0, "value": 47.0}, ...]
    If no bins are provided or no range matches, returns raw probability.
    """
    if not bins:
        return max(0.0, min(100.0, raw_home_prob))

    for b in bins:
        lo = b.get("min")
        hi = b.get("max")
        val = b.get("value")
        if lo is None or hi is None or val is None:
            continue
        if float(lo) <= raw_home_prob < float(hi):
            return max(0.0, min(100.0, float(val)))

    return max(0.0, min(100.0, raw_home_prob))


def _estimate_elo_home_prob(
    home_win_pct: float,
    away_win_pct: float,
    home_net_rtg: Optional[float],
    away_net_rtg: Optional[float],
    elo_cfg: Dict[str, Any],
) -> float:
    """Estimate home win probability from lightweight Elo-style ratings."""
    rating_base = float(elo_cfg.get("rating_base", 1500))
    home_adv = float(elo_cfg.get("home_advantage", 65))
    wp_weight = float(elo_cfg.get("win_pct_weight", 400))
    net_weight = float(elo_cfg.get("net_rtg_weight", 25))

    h_net = float(home_net_rtg or 0.0)
    a_net = float(away_net_rtg or 0.0)
    home_rating = (
        rating_base + (home_win_pct - 0.5) * wp_weight + h_net * net_weight + home_adv
    )
    away_rating = rating_base + (away_win_pct - 0.5) * wp_weight + a_net * net_weight
    return 100.0 / (1.0 + 10 ** ((away_rating - home_rating) / 400.0))


def calculate_win_probability(
    home_preds: List[Dict],
    away_preds: List[Dict],
    home_standing: Optional[Dict] = None,
    away_standing: Optional[Dict] = None,
    context: Optional[Dict[str, Any]] = None,
) -> Tuple[float, float]:
    """Calculate win probability for each team.

    Args:
        home_preds: List of home team player prediction dicts
        away_preds: List of away team player prediction dicts
        home_standing: Home team standing dict (win_pct, home_wins, etc.)
        away_standing: Away team standing dict
        context: Additional context dict with optional keys:
            - home_net_rtg, away_net_rtg: Team net ratings
            - h2h_factor: Home team H2H win rate (0-1)
            - home_last5, away_last5: Recent form strings ("3-2")
            - home_court_pct: Home team's home win %
            - model_params: optional v2 model params (elo/calibration)

    Returns:
        Tuple of (home_win_prob, away_win_prob) as percentages summing to 100
    """
    ctx = context or {}

    # 1. Predicted stats strength (25%)
    def _stat_strength(preds):
        return sum(
            (p.get("predicted_pts") or 0)
            + (p.get("predicted_reb") or 0) * 0.5
            + (p.get("predicted_ast") or 0) * 0.7
            for p in preds
        )

    home_strength = _stat_strength(home_preds)
    away_strength = _stat_strength(away_preds)
    total_strength = home_strength + away_strength

    if total_strength > 0:
        home_stat_score = home_strength / total_strength
        away_stat_score = away_strength / total_strength
    else:
        home_stat_score = 0.5
        away_stat_score = 0.5

    # 2. Net Rating (35%) — if available
    home_net_rtg = ctx.get("home_net_rtg")
    away_net_rtg = ctx.get("away_net_rtg")
    has_net_rtg = home_net_rtg is not None and away_net_rtg is not None

    if has_net_rtg:
        # has_net_rtg guarantees both are not None
        home_rtg_score = _normalize_rating(float(home_net_rtg))  # type: ignore[arg-type]
        away_rtg_score = _normalize_rating(float(away_net_rtg))  # type: ignore[arg-type]
    else:
        home_rtg_score = 0.5
        away_rtg_score = 0.5

    # 3. Win percentage (15%)
    home_win_pct = (home_standing.get("win_pct") or 0.5) if home_standing else 0.5
    away_win_pct = (away_standing.get("win_pct") or 0.5) if away_standing else 0.5

    # 4. H2H factor (10%)
    h2h_factor = ctx.get("h2h_factor", 0.5)

    # 5. Momentum / last5 (10%)
    home_momentum = parse_last5(ctx.get("home_last5"))
    away_momentum = parse_last5(ctx.get("away_last5"))

    # 6. Home court advantage (5%)
    home_court_pct = ctx.get("home_court_pct")
    if home_court_pct is None and home_standing:
        hw = home_standing.get("home_wins") or 0
        hl = home_standing.get("home_losses") or 0
        home_court_pct = hw / (hw + hl) if (hw + hl) > 0 else 0.5
    home_court_pct = home_court_pct if home_court_pct is not None else 0.5

    away_court_pct = 0.5
    if away_standing:
        aw = away_standing.get("away_wins") or 0
        al = away_standing.get("away_losses") or 0
        away_court_pct = aw / (aw + al) if (aw + al) > 0 else 0.5

    # Weight allocation: redistribute net_rtg weight if not available
    if has_net_rtg:
        w_rtg, w_stat, w_wp, w_h2h, w_mom, w_court = 0.35, 0.25, 0.15, 0.10, 0.10, 0.05
    else:
        # Redistribute net_rtg weight to stat strength and win_pct
        w_rtg, w_stat, w_wp, w_h2h, w_mom, w_court = 0.0, 0.45, 0.25, 0.10, 0.10, 0.10

    home_score = (
        w_rtg * home_rtg_score
        + w_stat * home_stat_score
        + w_wp * home_win_pct
        + w_h2h * h2h_factor
        + w_mom * home_momentum
        + w_court * home_court_pct
    )
    away_score = (
        w_rtg * away_rtg_score
        + w_stat * away_stat_score
        + w_wp * away_win_pct
        + w_h2h * (1 - h2h_factor)
        + w_mom * away_momentum
        + w_court * away_court_pct
    )

    total = home_score + away_score
    if total > 0:
        rules_home_prob = home_score / total * 100
    else:
        rules_home_prob = 50.0

    # Optional v2: blend with Elo probability and calibrate.
    model_params = ctx.get("model_params")
    if isinstance(model_params, dict):
        elo_cfg = model_params.get("elo", {})
        if elo_cfg.get("enabled"):
            elo_home_prob = _estimate_elo_home_prob(
                home_win_pct=float(home_win_pct),
                away_win_pct=float(away_win_pct),
                home_net_rtg=float(home_net_rtg) if home_net_rtg is not None else None,
                away_net_rtg=float(away_net_rtg) if away_net_rtg is not None else None,
                elo_cfg=elo_cfg if isinstance(elo_cfg, dict) else {},
            )
            w_elo = float(elo_cfg.get("blend_weight", 0.35))
            rules_home_prob = blend_probabilities(
                rules_home_prob,
                elo_home_prob,
                w_elo=w_elo,
            )

        bins = model_params.get("calibration_bins")
        if isinstance(bins, list):
            rules_home_prob = calibrate_probability(rules_home_prob, bins=bins)

    home_prob = round(max(0.0, min(100.0, rules_home_prob)), 1)
    away_prob = round(100 - home_prob, 1)

    return home_prob, away_prob


def select_optimal_lineup(
    players: List[Dict],
    recent_games_map: Optional[Dict[str, List[Dict]]] = None,
) -> List[Dict]:
    """Select optimal 5 players considering Game Score and position diversity.

    Args:
        players: List of player dicts (sorted by PIR from DB query)
        recent_games_map: Optional map of player_id -> recent games list
            for minutes filtering

    Returns:
        List of 5 players for the optimal lineup
    """
    if len(players) <= 5:
        return players

    # Filter by recent minutes (exclude < 15 min avg)
    if recent_games_map:
        eligible = []
        for p in players:
            recent = recent_games_map.get(p["id"], [])
            if recent:
                avg_min = sum(g.get("minutes") or 0 for g in recent[:5]) / min(
                    5, len(recent)
                )
                if avg_min >= 15:
                    eligible.append(p)
            else:
                eligible.append(p)  # No data → include
        if len(eligible) >= 5:
            players = eligible

    # Sort by Game Score (fall back to PIR)
    def player_score(p):
        gs = p.get("game_score")
        if gs is not None:
            return gs
        return p.get("pir") or 0

    sorted_players = sorted(players, key=player_score, reverse=True)

    # Position diversity selection
    lineup: List[Dict] = []
    positions = {"G": 0, "F": 0, "C": 0}
    limits = {"G": 2, "F": 2, "C": 1}

    # First pass: select by position
    for player in sorted_players:
        if len(lineup) >= 5:
            break
        pos = (player.get("pos") or "F")[0]
        if positions[pos] < limits[pos]:
            lineup.append(player)
            positions[pos] += 1

    # Second pass: fill remaining with best available
    for player in sorted_players:
        if len(lineup) >= 5:
            break
        if player not in lineup:
            lineup.append(player)

    return lineup[:5]
