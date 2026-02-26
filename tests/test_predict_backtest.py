"""Tests for prediction backtest script compatibility queries."""

import sqlite3

import predict_backtest


def _create_games_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE games (
            id TEXT PRIMARY KEY,
            season_id TEXT,
            game_date TEXT,
            home_score INTEGER,
            away_score INTEGER
        )
        """
    )


def test_load_pregame_rows_legacy_uses_created_at_filter(tmp_path):
    db_path = tmp_path / "legacy-created.db"
    conn = sqlite3.connect(db_path)
    try:
        _create_games_table(conn)
        conn.execute(
            """
            CREATE TABLE game_team_predictions (
                game_id TEXT PRIMARY KEY,
                home_win_prob REAL,
                created_at TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO games (id, season_id, game_date, home_score, away_score)
            VALUES ('g1', '046', '2025-10-18', 70, 65)
            """
        )
        conn.execute(
            """
            INSERT INTO game_team_predictions (game_id, home_win_prob, created_at)
            VALUES ('g1', 61.0, '2025-10-19')
            """
        )
        conn.commit()
    finally:
        conn.close()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = predict_backtest._load_pregame_rows(conn, "046")
    finally:
        conn.close()

    assert rows == []


def test_load_pregame_rows_legacy_without_time_columns(tmp_path):
    db_path = tmp_path / "legacy-no-time.db"
    conn = sqlite3.connect(db_path)
    try:
        _create_games_table(conn)
        conn.execute(
            """
            CREATE TABLE game_team_predictions (
                game_id TEXT PRIMARY KEY,
                home_win_prob REAL
            )
            """
        )
        conn.execute(
            """
            INSERT INTO games (id, season_id, game_date, home_score, away_score)
            VALUES ('g1', '046', '2025-10-18', 70, 65)
            """
        )
        conn.execute(
            """
            INSERT INTO game_team_predictions (game_id, home_win_prob)
            VALUES ('g1', 61.0)
            """
        )
        conn.commit()
    finally:
        conn.close()

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = predict_backtest._load_pregame_rows(conn, "046")
    finally:
        conn.close()

    assert len(rows) == 1
    assert rows[0].game_id == "g1"
    assert rows[0].home_win_prob == 61.0
