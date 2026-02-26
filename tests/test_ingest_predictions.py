"""Tests for prediction backfill in ingest_wkbl."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def test_backfill_predictions_for_game(
    test_db,
    sample_season,
    sample_team,
    sample_team2,
    sample_player,
    sample_player2,
    sample_game,
    sample_player_game,
):
    import database
    import ingest_wkbl

    database.insert_season(**sample_season)

    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team["id"], sample_team["name"], sample_team["short_name"]),
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team2["id"], sample_team2["name"], sample_team2["short_name"]),
        )
        conn.commit()

    database.insert_player(**sample_player)
    database.insert_player(**sample_player2)
    database.insert_game(**sample_game)

    database.insert_player_game(
        sample_player_game["game_id"],
        sample_player_game["player_id"],
        sample_player_game["team_id"],
        sample_player_game["stats"],
    )

    database.insert_player_game(
        sample_game["game_id"],
        sample_player2["player_id"],
        sample_team2["id"],
        {
            "minutes": 28.0,
            "pts": 12,
            "reb": 6,
            "ast": 3,
            "stl": 1,
            "blk": 0,
            "tov": 2,
            "pf": 2,
            "off_reb": 2,
            "def_reb": 4,
            "fgm": 5,
            "fga": 11,
            "tpm": 1,
            "tpa": 3,
            "ftm": 1,
            "fta": 2,
            "two_pm": 4,
            "two_pa": 8,
        },
    )

    assert not database.has_game_predictions(sample_game["game_id"])

    ingest_wkbl._generate_predictions_for_game_ids([sample_game["game_id"]])

    assert database.has_game_predictions(sample_game["game_id"])
    preds = database.get_game_predictions(sample_game["game_id"])
    assert preds["team"] is not None
    assert len(preds["players"]) > 0


def test_backfill_skips_existing_predictions(
    test_db,
    sample_season,
    sample_team,
    sample_team2,
    sample_player,
    sample_player2,
    sample_game,
    sample_player_game,
):
    import database
    import ingest_wkbl

    database.insert_season(**sample_season)

    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team["id"], sample_team["name"], sample_team["short_name"]),
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team2["id"], sample_team2["name"], sample_team2["short_name"]),
        )
        conn.commit()

    database.insert_player(**sample_player)
    database.insert_player(**sample_player2)
    database.insert_game(**sample_game)

    database.insert_player_game(
        sample_player_game["game_id"],
        sample_player_game["player_id"],
        sample_player_game["team_id"],
        sample_player_game["stats"],
    )

    base_predictions = [
        {
            "player_id": sample_player["player_id"],
            "team_id": sample_team["id"],
            "is_starter": 1,
            "predicted_pts": 10.0,
            "predicted_pts_low": 8.0,
            "predicted_pts_high": 12.0,
            "predicted_reb": 4.0,
            "predicted_reb_low": 3.0,
            "predicted_reb_high": 5.0,
            "predicted_ast": 3.0,
            "predicted_ast_low": 2.0,
            "predicted_ast_high": 4.0,
        }
    ]
    team_prediction = {
        "home_win_prob": 55.0,
        "away_win_prob": 45.0,
        "home_predicted_pts": 70.0,
        "away_predicted_pts": 65.0,
    }
    database.save_game_predictions(
        sample_game["game_id"], base_predictions, team_prediction
    )

    ingest_wkbl._generate_predictions_for_game_ids([sample_game["game_id"]])

    preds = database.get_game_predictions(sample_game["game_id"])
    assert len(preds["players"]) == 1
    assert preds["team"]["home_predicted_pts"] == team_prediction["home_predicted_pts"]


def test_save_future_games_skips_games_on_end_date(monkeypatch):
    import ingest_wkbl

    inserted_game_ids = []

    def _fake_insert_game(**kwargs):
        inserted_game_ids.append(kwargs["game_id"])

    monkeypatch.setattr(ingest_wkbl.database, "insert_game", _fake_insert_game)
    monkeypatch.setattr(
        ingest_wkbl, "_generate_predictions_for_games", lambda games, season_code: None
    )

    schedule_info = {
        # end_date 당일 경기는 이미 실제 점수가 수집될 수 있으므로 future NULL 저장 대상에서 제외
        "04601067": {
            "date": "20260209",
            "home_team": "KB스타즈",
            "away_team": "하나원큐",
        },
        "04601068": {
            "date": "20260210",
            "home_team": "우리은행",
            "away_team": "신한은행",
        },
    }

    ingest_wkbl._save_future_games(
        schedule_info=schedule_info,
        end_date="20260209",
        season_code="046",
    )

    assert inserted_game_ids == ["04601068"]


def test_rebuild_pregame_predictions_excludes_exhibition(test_db, monkeypatch):
    import database
    import ingest_wkbl

    database.insert_season("046", "2025-26")
    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('kb', 'KB스타즈')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('samsung', '삼성생명')"
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO games
            (id, season_id, game_date, home_team_id, away_team_id, home_score, away_score, game_type, is_exhibition)
            VALUES
            ('04601001', '046', '2026-01-04', 'kb', 'samsung', 80, 70, 'allstar', 1),
            ('04601002', '046', '2026-01-05', 'kb', 'samsung', 70, 65, 'regular', 0)
            """
        )
        conn.commit()

    called = []
    monkeypatch.setattr(
        ingest_wkbl, "_load_prediction_params", lambda: {"model_version": "v2"}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_team_standings", lambda _s: [])
    monkeypatch.setattr(ingest_wkbl.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(
        ingest_wkbl.database, "get_opponent_season_totals", lambda _s: {}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_league_season_totals", lambda _s: {})

    def _capture(game_id, *args, **kwargs):
        called.append(game_id)

    monkeypatch.setattr(ingest_wkbl, "_generate_predictions_for_game", _capture)

    ingest_wkbl._rebuild_pregame_predictions("046", repair_only=False)
    assert called == ["04601002"]


def test_repair_missing_pregame_predictions_targets_only_missing(test_db, monkeypatch):
    import database
    import ingest_wkbl

    database.insert_season("046", "2025-26")
    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('kb', 'KB스타즈')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('samsung', '삼성생명')"
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO games
            (id, season_id, game_date, home_team_id, away_team_id, home_score, away_score, game_type, is_exhibition)
            VALUES
            ('04601002', '046', '2026-01-05', 'kb', 'samsung', 70, 65, 'regular', 0),
            ('04601003', '046', '2026-01-06', 'kb', 'samsung', 68, 66, 'regular', 0)
            """
        )
        conn.execute(
            """
            INSERT INTO game_team_prediction_runs
            (game_id, prediction_kind, model_version, generated_at, home_win_prob, away_win_prob)
            VALUES ('04601003', 'pregame', 'v2', '2026-01-06 00:00:00', 55.0, 45.0)
            """
        )
        conn.commit()

    called = []
    monkeypatch.setattr(
        ingest_wkbl, "_load_prediction_params", lambda: {"model_version": "v2"}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_team_standings", lambda _s: [])
    monkeypatch.setattr(ingest_wkbl.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(
        ingest_wkbl.database, "get_opponent_season_totals", lambda _s: {}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_league_season_totals", lambda _s: {})

    def _capture(game_id, *args, **kwargs):
        called.append(game_id)

    monkeypatch.setattr(ingest_wkbl, "_generate_predictions_for_game", _capture)

    ingest_wkbl._rebuild_pregame_predictions("046", repair_only=True)
    assert called == ["04601002"]


def test_repair_missing_pregame_predictions_repairs_future_stamped_runs(
    test_db, monkeypatch
):
    import database
    import ingest_wkbl

    database.insert_season("046", "2025-26")
    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('kb', 'KB스타즈')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('samsung', '삼성생명')"
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO games
            (id, season_id, game_date, home_team_id, away_team_id, home_score, away_score, game_type, is_exhibition)
            VALUES ('04601003', '046', '2026-01-06', 'kb', 'samsung', 68, 66, 'regular', 0)
            """
        )
        # pregame run exists, but generated after game_date -> schedule pregame gate fails
        conn.execute(
            """
            INSERT INTO game_team_prediction_runs
            (game_id, prediction_kind, model_version, generated_at, home_win_prob, away_win_prob)
            VALUES ('04601003', 'pregame', 'v2', '2026-01-07 00:00:00', 55.0, 45.0)
            """
        )
        conn.commit()

    called = []
    monkeypatch.setattr(
        ingest_wkbl, "_load_prediction_params", lambda: {"model_version": "v2"}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_team_standings", lambda _s: [])
    monkeypatch.setattr(ingest_wkbl.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(
        ingest_wkbl.database, "get_opponent_season_totals", lambda _s: {}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_league_season_totals", lambda _s: {})

    def _capture(game_id, *args, **kwargs):
        called.append(game_id)

    monkeypatch.setattr(ingest_wkbl, "_generate_predictions_for_game", _capture)

    ingest_wkbl._rebuild_pregame_predictions("046", repair_only=True)
    assert called == ["04601003"]


def test_rebuild_pregame_predictions_returns_success_count_only(test_db, monkeypatch):
    import database
    import ingest_wkbl

    database.insert_season("046", "2025-26")
    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('kb', 'KB스타즈')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('samsung', '삼성생명')"
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO games
            (id, season_id, game_date, home_team_id, away_team_id, home_score, away_score, game_type, is_exhibition)
            VALUES ('04601004', '046', '2026-01-08', 'kb', 'samsung', 70, 65, 'regular', 0)
            """
        )
        conn.commit()

    monkeypatch.setattr(
        ingest_wkbl, "_load_prediction_params", lambda: {"model_version": "v2"}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_team_standings", lambda _s: [])
    monkeypatch.setattr(ingest_wkbl.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(
        ingest_wkbl.database, "get_opponent_season_totals", lambda _s: {}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_league_season_totals", lambda _s: {})

    # Simulate a failed generation path that emits no prediction rows.
    monkeypatch.setattr(
        ingest_wkbl, "_generate_predictions_for_game", lambda *args, **kwargs: None
    )

    succeeded = ingest_wkbl._rebuild_pregame_predictions("046", repair_only=False)
    assert succeeded == 0


def test_rebuild_success_counts_only_newly_created_runs(test_db, monkeypatch):
    import database
    import ingest_wkbl

    database.insert_season("046", "2025-26")
    with database.get_connection() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('kb', 'KB스타즈')"
        )
        conn.execute(
            "INSERT OR REPLACE INTO teams (id, name) VALUES ('samsung', '삼성생명')"
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO games
            (id, season_id, game_date, home_team_id, away_team_id, home_score, away_score, game_type, is_exhibition)
            VALUES ('04601005', '046', '2026-01-09', 'kb', 'samsung', 70, 65, 'regular', 0)
            """
        )
        # Existing historical pregame run
        conn.execute(
            """
            INSERT INTO game_team_prediction_runs
            (game_id, prediction_kind, model_version, generated_at, home_win_prob, away_win_prob)
            VALUES ('04601005', 'pregame', 'v2', '2026-01-09 00:00:00', 54.0, 46.0)
            """
        )
        conn.commit()

    monkeypatch.setattr(
        ingest_wkbl, "_load_prediction_params", lambda: {"model_version": "v2"}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_team_standings", lambda _s: [])
    monkeypatch.setattr(ingest_wkbl.database, "get_team_season_totals", lambda _s: {})
    monkeypatch.setattr(
        ingest_wkbl.database, "get_opponent_season_totals", lambda _s: {}
    )
    monkeypatch.setattr(ingest_wkbl.database, "get_league_season_totals", lambda _s: {})

    # Simulate generation failure: no new run should be created.
    monkeypatch.setattr(
        ingest_wkbl, "_generate_predictions_for_game", lambda *args, **kwargs: None
    )

    succeeded = ingest_wkbl._rebuild_pregame_predictions("046", repair_only=False)
    assert succeeded == 0


def test_rebuild_pregame_predictions_fails_fast_when_locked(test_db, monkeypatch):
    import ingest_wkbl

    monkeypatch.setattr(
        ingest_wkbl.os,
        "open",
        lambda *args, **kwargs: (_ for _ in ()).throw(FileExistsError()),
    )
    monkeypatch.setattr(
        ingest_wkbl, "_generate_predictions_for_game", lambda *a, **k: None
    )

    with pytest.raises(RuntimeError, match="already running"):
        ingest_wkbl._rebuild_pregame_predictions("046", repair_only=False)
