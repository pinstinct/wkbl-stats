"""Tests for prediction backfill in ingest_wkbl."""

import sys
from pathlib import Path

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
        args=None,
        schedule_info=schedule_info,
        end_date="20260209",
        season_code="046",
    )

    assert inserted_game_ids == ["04601068"]
