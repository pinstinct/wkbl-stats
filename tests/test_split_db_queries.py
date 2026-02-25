"""Tests for split DB cross-database query patterns.

Validates that the SQL patterns used in db.js work correctly
against split databases (core + detail). These are contract tests
ensuring the frontend query logic is compatible with the DB split.

Bug context: After splitting wkbl.db into core (games, players, etc.)
and detail (shot_charts, lineup_stints, etc.), queries that JOIN
across both table sets fail because each DB only has its own tables.
The fix uses a two-step pattern: get IDs from core DB, then query
detail DB with WHERE IN (ids).
"""

import sqlite3

import pytest

from tools.split_db import split_database


@pytest.fixture()
def split_dbs(tmp_path):
    """Create realistic split databases with cross-referenced data."""
    db_path = str(tmp_path / "full.db")
    conn = sqlite3.connect(db_path)

    # Core tables
    conn.execute("CREATE TABLE seasons (id TEXT PRIMARY KEY, label TEXT)")
    conn.execute("INSERT INTO seasons VALUES ('046', '2025-26')")
    conn.execute("INSERT INTO seasons VALUES ('045', '2024-25')")

    conn.execute("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT, short_name TEXT)")
    conn.execute("INSERT INTO teams VALUES ('kb', 'KB스타즈', 'KB')")
    conn.execute("INSERT INTO teams VALUES ('samsung', '삼성생명', '삼성')")

    conn.execute("CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT, team_id TEXT)")
    conn.execute("INSERT INTO players VALUES ('001', '선수A', 'kb')")
    conn.execute("INSERT INTO players VALUES ('002', '선수B', 'samsung')")

    conn.execute(
        "CREATE TABLE games (id TEXT PRIMARY KEY, season_id TEXT, "
        "game_date TEXT, home_team_id TEXT, away_team_id TEXT, "
        "home_score INTEGER, away_score INTEGER)"
    )
    # Season 046 games
    conn.execute(
        "INSERT INTO games VALUES "
        "('04601010', '046', '20251101', 'kb', 'samsung', 75, 70)"
    )
    conn.execute(
        "INSERT INTO games VALUES "
        "('04601020', '046', '20251115', 'samsung', 'kb', 80, 72)"
    )
    # Season 045 game
    conn.execute(
        "INSERT INTO games VALUES "
        "('04501010', '045', '20241101', 'kb', 'samsung', 65, 60)"
    )

    conn.execute(
        "CREATE TABLE player_games (game_id TEXT, player_id TEXT, "
        "team_id TEXT, pts INTEGER, minutes REAL)"
    )
    conn.execute("INSERT INTO player_games VALUES ('04601010', '001', 'kb', 20, 30.5)")
    conn.execute("INSERT INTO player_games VALUES ('04601020', '001', 'kb', 15, 28.0)")
    conn.execute("INSERT INTO player_games VALUES ('04501010', '001', 'kb', 18, 32.0)")

    # Detail tables
    conn.execute(
        "CREATE TABLE shot_charts (id INTEGER PRIMARY KEY, game_id TEXT, "
        "player_id TEXT, team_id TEXT, x REAL, y REAL, made INTEGER, "
        "quarter INTEGER, game_minute INTEGER, game_second INTEGER, shot_zone TEXT)"
    )
    # Player 001 shots in season 046
    conn.execute(
        "INSERT INTO shot_charts VALUES "
        "(1, '04601010', '001', 'kb', 1.0, 2.0, 1, 1, 5, 30, 'paint')"
    )
    conn.execute(
        "INSERT INTO shot_charts VALUES "
        "(2, '04601010', '001', 'kb', 3.0, 4.0, 0, 2, 3, 15, 'mid')"
    )
    conn.execute(
        "INSERT INTO shot_charts VALUES "
        "(3, '04601020', '001', 'kb', 5.0, 6.0, 1, 1, 8, 0, 'three')"
    )
    # Player 001 shot in season 045
    conn.execute(
        "INSERT INTO shot_charts VALUES "
        "(4, '04501010', '001', 'kb', 2.0, 3.0, 1, 1, 6, 0, 'paint')"
    )
    # Player 002 shot
    conn.execute(
        "INSERT INTO shot_charts VALUES "
        "(5, '04601010', '002', 'samsung', 7.0, 8.0, 0, 1, 4, 0, 'three')"
    )

    conn.execute(
        "CREATE TABLE lineup_stints (id INTEGER PRIMARY KEY, game_id TEXT, "
        "team_id TEXT, quarter INTEGER, "
        "player1_id TEXT, player2_id TEXT, player3_id TEXT, "
        "player4_id TEXT, player5_id TEXT, "
        "start_score_for INTEGER, end_score_for INTEGER, "
        "start_score_against INTEGER, end_score_against INTEGER, "
        "duration_seconds INTEGER)"
    )
    conn.execute(
        "INSERT INTO lineup_stints VALUES "
        "(1, '04601010', 'kb', 1, '001', '002', NULL, NULL, NULL, "
        "0, 10, 0, 8, 300)"
    )
    conn.execute(
        "INSERT INTO lineup_stints VALUES "
        "(2, '04601020', 'kb', 1, '001', NULL, NULL, NULL, NULL, "
        "0, 5, 0, 7, 240)"
    )

    conn.execute(
        "CREATE TABLE play_by_play (id INTEGER PRIMARY KEY, game_id TEXT, event TEXT)"
    )
    conn.execute("INSERT INTO play_by_play VALUES (1, '04601010', 'score')")

    conn.execute(
        "CREATE TABLE position_matchups (id INTEGER PRIMARY KEY, game_id TEXT)"
    )
    conn.execute("INSERT INTO position_matchups VALUES (1, '04601010')")

    conn.commit()
    conn.close()

    core_path = str(tmp_path / "core.db")
    detail_path = str(tmp_path / "detail.db")
    split_database(db_path, core_path, detail_path)

    return core_path, detail_path


class TestSplitDbShotChartQueries:
    """Validate getPlayerShotChart() query patterns against split DBs."""

    def test_cross_db_subquery_fails_on_detail(self, split_dbs):
        """BUG REPRO: detail DB has no games table, so subquery fails."""
        _, detail_path = split_dbs
        conn = sqlite3.connect(detail_path)
        with pytest.raises(sqlite3.OperationalError, match="no such table: games"):
            conn.execute(
                "SELECT * FROM shot_charts WHERE player_id = ? "
                "AND game_id IN (SELECT id FROM games WHERE season_id = ?)",
                ("001", "046"),
            )
        conn.close()

    def test_cross_db_subquery_fails_on_core(self, split_dbs):
        """BUG REPRO: core DB has no shot_charts table."""
        core_path, _ = split_dbs
        conn = sqlite3.connect(core_path)
        with pytest.raises(
            sqlite3.OperationalError, match="no such table: shot_charts"
        ):
            conn.execute("SELECT * FROM shot_charts WHERE player_id = ?", ("001",))
        conn.close()

    def test_two_step_pattern_with_season(self, split_dbs):
        """FIX: get game IDs from core, then query detail with IN clause."""
        core_path, detail_path = split_dbs
        core = sqlite3.connect(core_path)
        detail = sqlite3.connect(detail_path)

        # Step 1: get season game IDs from core DB
        game_ids = [
            r[0]
            for r in core.execute(
                "SELECT id FROM games WHERE season_id = ?", ("046",)
            ).fetchall()
        ]
        assert len(game_ids) == 2

        # Step 2: query shot_charts from detail DB
        ph = ",".join("?" * len(game_ids))
        shots = detail.execute(
            f"SELECT * FROM shot_charts WHERE player_id = ? AND game_id IN ({ph})",
            ["001", *game_ids],
        ).fetchall()
        assert len(shots) == 3  # 3 shots in season 046

        core.close()
        detail.close()

    def test_two_step_pattern_filters_other_season(self, split_dbs):
        """Season filter correctly excludes shots from other seasons."""
        core_path, detail_path = split_dbs
        core = sqlite3.connect(core_path)
        detail = sqlite3.connect(detail_path)

        # Season 045 games
        game_ids = [
            r[0]
            for r in core.execute(
                "SELECT id FROM games WHERE season_id = ?", ("045",)
            ).fetchall()
        ]
        assert len(game_ids) == 1

        ph = ",".join("?" * len(game_ids))
        shots = detail.execute(
            f"SELECT * FROM shot_charts WHERE player_id = ? AND game_id IN ({ph})",
            ["001", *game_ids],
        ).fetchall()
        assert len(shots) == 1  # only 1 shot in season 045

        core.close()
        detail.close()

    def test_no_season_filter_returns_all(self, split_dbs):
        """Without season filter, all player shots returned from detail DB."""
        _, detail_path = split_dbs
        detail = sqlite3.connect(detail_path)

        shots = detail.execute(
            "SELECT * FROM shot_charts WHERE player_id = ?", ("001",)
        ).fetchall()
        assert len(shots) == 4  # all 4 shots across both seasons

        detail.close()

    def test_enrichment_from_core(self, split_dbs):
        """After getting shots from detail, game context comes from core."""
        core_path, detail_path = split_dbs
        core = sqlite3.connect(core_path)
        core.row_factory = sqlite3.Row
        detail = sqlite3.connect(detail_path)
        detail.row_factory = sqlite3.Row

        shots = detail.execute(
            "SELECT * FROM shot_charts WHERE player_id = ?", ("001",)
        ).fetchall()
        game_ids = list({s["game_id"] for s in shots})
        ph = ",".join("?" * len(game_ids))

        game_rows = core.execute(
            f"SELECT g.id, g.game_date, g.home_team_id, g.away_team_id, "
            f"ht.name as home_name, at.name as away_name "
            f"FROM games g "
            f"LEFT JOIN teams ht ON ht.id = g.home_team_id "
            f"LEFT JOIN teams at ON at.id = g.away_team_id "
            f"WHERE g.id IN ({ph})",
            game_ids,
        ).fetchall()

        game_map = {g["id"]: g for g in game_rows}
        assert "04601010" in game_map
        assert game_map["04601010"]["home_name"] == "KB스타즈"
        assert game_map["04601010"]["away_name"] == "삼성생명"

        core.close()
        detail.close()

    def test_empty_season_returns_empty(self, split_dbs):
        """Non-existent season returns no game IDs → no shots."""
        core_path, _ = split_dbs
        core = sqlite3.connect(core_path)

        game_ids = [
            r[0]
            for r in core.execute(
                "SELECT id FROM games WHERE season_id = ?", ("999",)
            ).fetchall()
        ]
        assert len(game_ids) == 0

        core.close()


class TestSplitDbPlusMinusQueries:
    """Validate getSeasonPlayerPlusMinusMap() query patterns against split DBs."""

    def test_lineup_stints_not_in_core(self, split_dbs):
        """BUG REPRO: core DB has no lineup_stints table."""
        core_path, _ = split_dbs
        conn = sqlite3.connect(core_path)
        with pytest.raises(
            sqlite3.OperationalError, match="no such table: lineup_stints"
        ):
            conn.execute("SELECT * FROM lineup_stints")
        conn.close()

    def test_lineup_stints_join_games_fails_on_detail(self, split_dbs):
        """BUG REPRO: detail DB has no games table for JOIN."""
        _, detail_path = split_dbs
        conn = sqlite3.connect(detail_path)
        with pytest.raises(sqlite3.OperationalError, match="no such table: games"):
            conn.execute(
                "SELECT ls.* FROM lineup_stints ls "
                "JOIN games g ON g.id = ls.game_id WHERE g.season_id = ?",
                ("046",),
            )
        conn.close()

    def test_two_step_pattern_lineup(self, split_dbs):
        """FIX: get game IDs from core, then query lineup_stints from detail."""
        core_path, detail_path = split_dbs
        core = sqlite3.connect(core_path)
        detail = sqlite3.connect(detail_path)
        detail.row_factory = sqlite3.Row

        # Step 1: season game IDs from core
        game_ids = [
            r[0]
            for r in core.execute(
                "SELECT id FROM games WHERE season_id = ?", ("046",)
            ).fetchall()
        ]
        assert len(game_ids) == 2

        # Step 2: lineup_stints from detail with player unpacking (CTE pattern)
        ph = ",".join("?" * len(game_ids))
        rows = detail.execute(
            f"WITH stint_diff AS ("
            f"  SELECT game_id, team_id, player1_id AS player_id, "
            f"    (COALESCE(end_score_for, 0) - COALESCE(start_score_for, 0)) "
            f"    - (COALESCE(end_score_against, 0) - COALESCE(start_score_against, 0)) AS diff, "
            f"    COALESCE(duration_seconds, 0) AS duration_seconds "
            f"  FROM lineup_stints WHERE game_id IN ({ph}) "
            f"  UNION ALL "
            f"  SELECT game_id, team_id, player2_id AS player_id, "
            f"    (COALESCE(end_score_for, 0) - COALESCE(start_score_for, 0)) "
            f"    - (COALESCE(end_score_against, 0) - COALESCE(start_score_against, 0)) AS diff, "
            f"    COALESCE(duration_seconds, 0) AS duration_seconds "
            f"  FROM lineup_stints WHERE game_id IN ({ph}) "
            f") SELECT player_id, team_id, SUM(diff) AS total_pm, "
            f"  SUM(duration_seconds) AS on_court_seconds, "
            f"  COUNT(DISTINCT game_id) AS gp "
            f"FROM stint_diff WHERE player_id IS NOT NULL "
            f"GROUP BY player_id, team_id",
            [*game_ids, *game_ids],
        ).fetchall()

        # Player 001: game1 diff = (10-0)-(8-0)=+2, game2 diff = (5-0)-(7-0)=-2
        # Player 002: game1 diff = +2
        pm_map = {r["player_id"]: r for r in rows}
        assert "001" in pm_map
        assert pm_map["001"]["total_pm"] == 0  # +2 + -2 = 0
        assert pm_map["001"]["gp"] == 2
        assert pm_map["001"]["on_court_seconds"] == 540  # 300 + 240

        assert "002" in pm_map
        assert pm_map["002"]["total_pm"] == 2
        assert pm_map["002"]["gp"] == 1

        core.close()
        detail.close()

    def test_other_season_excluded(self, split_dbs):
        """Season filter excludes lineup_stints from other seasons."""
        core_path, detail_path = split_dbs
        core = sqlite3.connect(core_path)
        detail = sqlite3.connect(detail_path)

        # Season 045 — no lineup_stints exist for that season's games
        game_ids = [
            r[0]
            for r in core.execute(
                "SELECT id FROM games WHERE season_id = ?", ("045",)
            ).fetchall()
        ]
        ph = ",".join("?" * len(game_ids))
        rows = detail.execute(
            f"SELECT * FROM lineup_stints WHERE game_id IN ({ph})",
            game_ids,
        ).fetchall()
        assert len(rows) == 0

        core.close()
        detail.close()
