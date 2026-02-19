"""TDD tests for P0 refactor tasks.

These tests lock expected behavior before refactoring implementation.
"""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def test_compute_advanced_stats_values():
    """Advanced stat calculation should be centralized and deterministic."""
    from stats import compute_advanced_stats

    row = {
        "gp": 1,
        "min": 30.0,
        "pts": 18.0,
        "reb": 5.0,
        "ast": 4.0,
        "stl": 2.0,
        "blk": 1.0,
        "tov": 3.0,
        "total_fgm": 7,
        "total_fga": 14,
        "total_tpm": 2,
        "total_tpa": 5,
        "total_ftm": 2,
        "total_fta": 3,
    }

    computed = compute_advanced_stats(row)

    assert computed["fgp"] == 0.5
    assert computed["tpp"] == 0.4
    assert computed["ftp"] == 0.667
    assert computed["ts_pct"] == 0.587
    assert computed["efg_pct"] == 0.571
    assert computed["ast_to"] == 1.33
    assert computed["pir"] == 19.0
    assert computed["pts36"] == 21.6
    assert computed["reb36"] == 6.0
    assert computed["ast36"] == 4.8


def test_compute_game_score():
    """Game Score = PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM)
    + 0.7*OREB + 0.3*DREB + STL + 0.7*AST + 0.7*BLK - 0.4*PF - TOV"""
    from stats import compute_advanced_stats

    row = {
        "gp": 1,
        "min": 30.0,
        "pts": 18.0,
        "reb": 5.0,
        "ast": 4.0,
        "stl": 2.0,
        "blk": 1.0,
        "tov": 3.0,
        "off_reb": 1.0,
        "def_reb": 4.0,
        "pf": 2.0,
        "total_fgm": 7,
        "total_fga": 14,
        "total_tpm": 2,
        "total_tpa": 5,
        "total_ftm": 2,
        "total_fta": 3,
    }

    computed = compute_advanced_stats(row)

    # GmSc = 18 + 0.4*7 - 0.7*14 - 0.4*(3-2) + 0.7*1 + 0.3*4
    #        + 2 + 0.7*4 + 0.7*1 - 0.4*2 - 3
    #      = 18 + 2.8 - 9.8 - 0.4 + 0.7 + 1.2 + 2 + 2.8 + 0.7 - 0.8 - 3
    #      = 14.2
    assert computed["game_score"] == 14.2


def test_compute_game_score_without_extra_fields():
    """Game Score should not appear when off_reb/def_reb/pf are missing."""
    from stats import compute_advanced_stats

    row = {
        "gp": 1,
        "min": 30.0,
        "pts": 18.0,
        "reb": 5.0,
        "ast": 4.0,
        "stl": 2.0,
        "blk": 1.0,
        "tov": 3.0,
        "total_fgm": 7,
        "total_fga": 14,
        "total_tpm": 2,
        "total_tpa": 5,
        "total_ftm": 2,
        "total_fta": 3,
    }

    computed = compute_advanced_stats(row)
    assert "game_score" not in computed


def test_compute_tov_pct():
    """TOV% = 100 * TOV / (FGA + 0.44*FTA + TOV)"""
    from stats import compute_advanced_stats

    row = {
        "gp": 1,
        "min": 30.0,
        "pts": 18.0,
        "reb": 5.0,
        "ast": 4.0,
        "stl": 2.0,
        "blk": 1.0,
        "tov": 3.0,
        "off_reb": 1.0,
        "def_reb": 4.0,
        "pf": 2.0,
        "total_fgm": 7,
        "total_fga": 14,
        "total_tpm": 2,
        "total_tpa": 5,
        "total_ftm": 2,
        "total_fta": 3,
    }

    computed = compute_advanced_stats(row)

    # TOV% = 100 * 3 / (14 + 0.44*3 + 3) = 100 * 3 / 18.32 = 16.4
    assert computed["tov_pct"] == 16.4


def test_compute_tov_pct_zero_usage():
    """TOV% should be 0.0 when denominator is zero."""
    from stats import compute_advanced_stats

    row = {
        "gp": 1,
        "min": 5.0,
        "pts": 0.0,
        "reb": 0.0,
        "ast": 0.0,
        "stl": 0.0,
        "blk": 0.0,
        "tov": 0.0,
        "off_reb": 0.0,
        "def_reb": 0.0,
        "pf": 0.0,
        "total_fgm": 0,
        "total_fga": 0,
        "total_tpm": 0,
        "total_tpa": 0,
        "total_ftm": 0,
        "total_fta": 0,
    }

    computed = compute_advanced_stats(row)
    assert computed["tov_pct"] == 0.0


# ============================================================================
# Batch 2: Team-context stats (USG%, ORtg, DRtg, Net, Pace)
# ============================================================================

# Shared fixtures for team-context tests
_BASE_ROW = {
    "gp": 10,
    "min": 30.0,
    "pts": 18.0,
    "reb": 5.0,
    "ast": 4.0,
    "stl": 2.0,
    "blk": 1.0,
    "tov": 3.0,
    "off_reb": 1.0,
    "def_reb": 4.0,
    "pf": 2.0,
    "total_fgm": 70,
    "total_fga": 140,
    "total_tpm": 20,
    "total_tpa": 50,
    "total_ftm": 20,
    "total_fta": 30,
}

_TEAM_STATS = {
    "team_fga": 800,
    "team_fta": 200,
    "team_tov": 150,
    "team_oreb": 120,
    "team_dreb": 300,
    "team_fgm": 350,
    "team_ast": 200,
    "team_pts": 900,
    "team_min": 2000,  # 10 games * 200 min (5 players * 40 min)
    "team_gp": 10,
    "team_stl": 80,
    "team_blk": 30,
    "team_pf": 180,
    "team_ftm": 100,
    "team_tpm": 80,
    "team_tpa": 250,
    "team_reb": 420,
    "opp_fga": 780,
    "opp_fta": 190,
    "opp_ftm": 130,
    "opp_tov": 140,
    "opp_oreb": 110,
    "opp_dreb": 280,
    "opp_pts": 850,
    "opp_tpa": 230,
    "opp_tpm": 70,
    "opp_fgm": 330,
    "opp_ast": 210,
    "opp_stl": 75,
    "opp_blk": 28,
    "opp_pf": 190,
    "opp_reb": 390,
}


def test_estimate_possessions():
    """Possessions = FGA + 0.44*FTA + TOV - OREB"""
    from stats import estimate_possessions

    # 800 + 0.44*200 + 150 - 120 = 918.0
    result = estimate_possessions(fga=800, fta=200, tov=150, oreb=120)
    assert result == 918.0


def test_compute_usg_pct():
    """USG% = 100 * (FGA + 0.44*FTA + TOV) * (Team_MIN/5)
    / (MIN * (Team_FGA + 0.44*Team_FTA + Team_TOV))"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # player usage actions (per game): FGA=14 + 0.44*3 + TOV=3 = 18.32
    # team usage actions (season totals): 800 + 0.44*200 + 150 = 1038
    # USG% = 100 * (18.32 * 10) * (2000/5) / (300 * 1038)
    #       = 100 * 183.2 * 400 / (300 * 1038)
    #       = 100 * 73280 / 311400 = 23.5
    assert computed["usg_pct"] == 23.5


def test_compute_ortg_drtg_net():
    """Player ORtg/DRtg should vary by player box-score profile."""
    from stats import compute_advanced_stats

    player_a = dict(_BASE_ROW)
    player_b = dict(_BASE_ROW)
    player_b.update(
        {
            "pts": 10.0,
            "ast": 1.0,
            "stl": 0.5,
            "blk": 0.2,
            "tov": 2.0,
            "off_reb": 0.4,
            "def_reb": 2.5,
            "pf": 2.7,
            "total_fgm": 45,
            "total_fga": 120,
            "total_tpm": 8,
            "total_tpa": 35,
            "total_ftm": 12,
            "total_fta": 16,
        }
    )

    computed_a = compute_advanced_stats(player_a, team_stats=dict(_TEAM_STATS))
    computed_b = compute_advanced_stats(player_b, team_stats=dict(_TEAM_STATS))

    assert computed_a["off_rtg"] != computed_b["off_rtg"]
    assert computed_a["def_rtg"] != computed_b["def_rtg"]
    assert computed_a["net_rtg"] == round(
        computed_a["off_rtg"] - computed_a["def_rtg"], 1
    )
    assert computed_b["net_rtg"] == round(
        computed_b["off_rtg"] - computed_b["def_rtg"], 1
    )


def test_compute_pace():
    """Pace = 40 * (Team_Poss + Opp_Poss) / (2 * Team_MIN/5)"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # Team_Poss = 918, Opp_Poss = 893.6
    # Pace = 40 * (918 + 893.6) / (2 * 400) = 40 * 1811.6 / 800 = 90.6
    assert computed["pace"] == 90.6


def test_no_team_context_skips_advanced():
    """Without team_stats, team-context stats should not be present."""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW))
    for key in ["usg_pct", "off_rtg", "def_rtg", "net_rtg", "pace"]:
        assert key not in computed


# ============================================================================
# Batch 3: Rate stats (OREB%, DREB%, AST%, STL%, BLK%)
# ============================================================================


def test_compute_oreb_pct():
    """OREB% = 100 * OREB * (Team_MIN/5) / (MIN * (Team_OREB + Opp_DREB))"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # OREB% = 100 * 1.0 * (2000/5) / (30.0 * (120 + 280))
    #       = 100 * 400 / (30 * 400) = 100 * 400 / 12000 = 3.3
    assert computed["oreb_pct"] == 3.3


def test_compute_dreb_pct():
    """DREB% = 100 * DREB * (Team_MIN/5) / (MIN * (Team_DREB + Opp_OREB))"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # DREB% = 100 * 4.0 * (2000/5) / (30.0 * (300 + 110))
    #       = 100 * 1600 / (30 * 410) = 100 * 1600 / 12300 = 13.0
    assert computed["dreb_pct"] == 13.0


def test_compute_reb_pct():
    """REB% = 100 * REB * (Team_MIN/5) / (MIN * (Team_REB + Opp_REB))"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # REB% = 100 * 5.0 * (2000/5) / (30.0 * (420 + 390))
    #       = 100 * 2000 / (30 * 810) = 100 * 2000 / 24300 = 8.2
    assert computed["reb_pct"] == 8.2


def test_compute_ast_pct():
    """AST% = 100 * AST / ((MIN/(Team_MIN/5)) * Team_FGM - FGM)"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # player_min_frac = 30.0 / (2000/5) = 30/400 = 0.075
    # AST% = 100 * 4.0 / (0.075 * 350 - 7.0) = 100 * 4.0 / (26.25 - 7) = 100 * 4 / 19.25 = 20.8
    assert computed["ast_pct"] == 20.8


def test_compute_stl_pct():
    """STL% = 100 * STL * (Team_MIN/5) / (MIN * Opp_Poss)"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # Opp_Poss = 780 + 0.44*190 + 140 - 110 = 893.6
    # STL% = 100 * 2.0 * 400 / (30.0 * 893.6) = 100 * 800 / 26808 = 3.0
    assert computed["stl_pct"] == 3.0


def test_compute_blk_pct():
    """BLK% = 100 * BLK * (Team_MIN/5) / (MIN * (Opp_FGA - Opp_3PA))"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))

    # BLK% = 100 * 1.0 * 400 / (30.0 * (780 - 230)) = 100 * 400 / 16500 = 2.4
    assert computed["blk_pct"] == 2.4


# ============================================================================
# Batch 4: PER
# ============================================================================

_LEAGUE_STATS = {
    "lg_pts": 5400,
    "lg_fga": 4800,
    "lg_fta": 1200,
    "lg_ftm": 600,
    "lg_oreb": 660,
    "lg_reb": 2520,
    "lg_ast": 1200,
    "lg_fgm": 2100,
    "lg_tov": 900,
    "lg_pf": 1080,
    "lg_min": 12000,
    "lg_pace": 90.0,
    "lg_poss": 5400,
}


def test_compute_per():
    """PER: Hollinger formula, normalized so league average ~ 15.0"""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(
        dict(_BASE_ROW),
        team_stats=dict(_TEAM_STATS),
        league_stats=dict(_LEAGUE_STATS),
    )

    assert "per" in computed
    # PER should be a positive number for a productive player
    assert computed["per"] > 0
    # This player has 18pts/5reb/4ast - should have reasonable PER (10-25 range)
    assert 10 < computed["per"] < 30


def test_per_without_league_context():
    """Without league_stats, PER should not be present."""
    from stats import compute_advanced_stats

    computed = compute_advanced_stats(dict(_BASE_ROW), team_stats=dict(_TEAM_STATS))
    assert "per" not in computed


def test_season_resolver_latest_and_all():
    """Season resolver should consistently handle default and 'all'."""
    from season_utils import resolve_season

    all_id, all_label = resolve_season("all")
    assert all_id is None
    assert all_label == "전체"

    latest_id, latest_label = resolve_season(None)
    assert latest_id == "046"
    assert latest_label == "2025-26"
