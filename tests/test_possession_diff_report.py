"""Tests for tools/possession_diff_report.py."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

import possession_diff_report as report


def test_build_team_stats_returns_none_when_team_or_opp_missing() -> None:
    assert report._build_team_stats("kb", {}, {}) is None
    assert report._build_team_stats("kb", {"kb": {"fga": 1}}, {}) is None


def test_build_team_stats_includes_standing_fields() -> None:
    team_totals = {
        "kb": {
            "fga": 10,
            "fta": 5,
            "tov": 2,
            "oreb": 3,
            "dreb": 7,
            "fgm": 4,
            "ast": 3,
            "pts": 15,
            "min": 200,
            "gp": 5,
            "stl": 2,
            "blk": 1,
            "pf": 6,
            "ftm": 4,
            "tpm": 3,
            "tpa": 8,
            "reb": 10,
        }
    }
    opp_totals = {
        "kb": {
            "fga": 11,
            "fta": 6,
            "ftm": 4,
            "tov": 3,
            "oreb": 4,
            "dreb": 6,
            "pts": 16,
            "tpa": 7,
            "tpm": 2,
            "fgm": 5,
            "ast": 4,
            "stl": 2,
            "blk": 1,
            "pf": 7,
            "reb": 10,
        }
    }
    standing = {"kb": {"wins": 8, "losses": 2}}

    stats = report._build_team_stats("kb", team_totals, opp_totals, standing)
    assert stats is not None
    assert stats["team_wins"] == 8
    assert stats["team_losses"] == 2
    assert stats["team_fga"] == 10
    assert stats["opp_fga"] == 11


def test_build_league_stats_returns_none_for_empty_league(monkeypatch) -> None:
    monkeypatch.setattr(
        report.database, "get_league_season_totals", lambda _season: {"pts": 0}
    )
    assert report._build_league_stats("046", {}, {}) is None


def test_rank_by_key_descending() -> None:
    rows = {
        "p1": {"ws": 1.2},
        "p2": {"ws": 3.1},
        "p3": {"ws": 0.5},
    }
    ranks = report._rank_by_key(rows, "ws")
    assert ranks["p2"] == 1
    assert ranks["p1"] == 2
    assert ranks["p3"] == 3


def test_generate_report_handles_no_players(monkeypatch) -> None:
    monkeypatch.setattr(report.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(report.database, "get_opponent_season_totals", lambda _s: {})
    monkeypatch.setattr(report.database, "get_team_wins_by_season", lambda _s: {})
    monkeypatch.setattr(report, "_load_players", lambda _s: [])

    out = report.generate_report("046")
    assert "No players found for this season." in out


def test_main_uses_explicit_db_path(monkeypatch, capsys: pytest.CaptureFixture[str]):
    monkeypatch.setattr(report, "generate_report", lambda _season: "ok-report")
    monkeypatch.setattr(
        "sys.argv",
        ["prog", "--season", "046", "--db-path", "/tmp/custom.db"],
    )

    report.main()
    assert report.database.DB_PATH == "/tmp/custom.db"
    assert "ok-report" in capsys.readouterr().out
