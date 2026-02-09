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


def test_season_resolver_latest_and_all():
    """Season resolver should consistently handle default and 'all'."""
    from season_utils import resolve_season

    all_id, all_label = resolve_season("all")
    assert all_id is None
    assert all_label == "전체"

    latest_id, latest_label = resolve_season(None)
    assert latest_id == "046"
    assert latest_label == "2025-26"
