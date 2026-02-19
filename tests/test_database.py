"""
Tests for database.py - SQLite database operations.
"""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


class TestDatabaseInit:
    """Tests for database initialization."""

    def test_init_db_creates_tables(self, test_db):
        """Test that init_db creates all required tables."""
        import database

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cursor.fetchall()}

        expected_tables = {
            "seasons",
            "teams",
            "players",
            "games",
            "player_games",
            "team_games",
            "team_standings",
            "game_predictions",
            "game_team_predictions",
            "_meta_descriptions",
            "play_by_play",
            "shot_charts",
            "team_category_stats",
            "head_to_head",
            "game_mvp",
            "event_types",
            "lineup_stints",
        }
        assert expected_tables.issubset(tables), (
            f"Missing tables: {expected_tables - tables}"
        )

    def test_init_db_is_idempotent(self, test_db):
        """Test that init_db can be called multiple times without error."""
        import database

        # Should not raise
        database.init_db()
        database.init_db()

    def test_init_db_creates_performance_indexes(self, test_db):
        """Test that composite indexes for season/team roster queries are created."""
        import database

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
            indexes = {row[0] for row in cursor.fetchall()}

        expected_indexes = {
            "idx_player_games_team_game",
            "idx_player_games_player_game",
            "idx_games_season_date_id",
        }
        assert expected_indexes.issubset(indexes), (
            f"Missing indexes: {expected_indexes - indexes}"
        )


class TestSeasonOperations:
    """Tests for season-related database operations."""

    def test_insert_season(self, test_db, sample_season):
        """Test inserting a season."""
        import database

        database.insert_season(**sample_season)

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, label FROM seasons WHERE id = ?",
                (sample_season["season_id"],),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == sample_season["season_id"]
        assert row[1] == sample_season["label"]


class TestPlayerOperations:
    """Tests for player-related database operations."""

    def test_insert_player(self, test_db, sample_player):
        """Test inserting a player."""
        import database

        # First insert team (foreign key constraint)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_player["team_id"], "Test Team"),
            )
            conn.commit()

        database.insert_player(**sample_player)

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, name, position FROM players WHERE id = ?",
                (sample_player["player_id"],),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == sample_player["player_id"]
        assert row[1] == sample_player["name"]
        assert row[2] == sample_player["position"]

    def test_insert_player_preserves_profile(self, test_db, sample_player):
        """Test that re-inserting a player without profile data preserves existing profile."""
        import database

        with database.get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_player["team_id"], "Test Team"),
            )
            conn.commit()

        # Insert player with full profile
        database.insert_player(**sample_player)

        # Re-insert same player without profile data (simulates incremental ingest)
        database.insert_player(
            player_id=sample_player["player_id"],
            name=sample_player["name"],
            team_id=sample_player["team_id"],
            position=None,
            height=None,
            birth_date=None,
            is_active=1,
        )

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT position, height, birth_date FROM players WHERE id = ?",
                (sample_player["player_id"],),
            )
            row = cursor.fetchone()

        assert row[0] == sample_player["position"]
        assert row[1] == sample_player["height"]
        assert row[2] == sample_player["birth_date"]


class TestGameOperations:
    """Tests for game-related database operations."""

    def test_insert_game(
        self, test_db, sample_season, sample_team, sample_team2, sample_game
    ):
        """Test inserting a game."""
        import database

        # Setup: insert season and teams
        database.insert_season(**sample_season)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team["id"], sample_team["name"]),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team2["id"], sample_team2["name"]),
            )
            conn.commit()

        database.insert_game(**sample_game)

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, home_team_id, away_team_id, home_score, away_score FROM games WHERE id = ?",
                (sample_game["game_id"],),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == sample_game["game_id"]
        assert row[1] == sample_game["home_team_id"]
        assert row[2] == sample_game["away_team_id"]
        assert row[3] == sample_game["home_score"]
        assert row[4] == sample_game["away_score"]

    def test_get_existing_game_ids(self, populated_db, sample_game):
        """Test getting existing game IDs."""
        import database

        game_ids = database.get_existing_game_ids()
        assert sample_game["game_id"] in game_ids

    def test_get_existing_game_ids_by_season(
        self, populated_db, sample_game, sample_season
    ):
        """Test getting existing game IDs filtered by season."""
        import database

        game_ids = database.get_existing_game_ids(sample_season["season_id"])
        assert sample_game["game_id"] in game_ids

        # Non-existent season should return empty
        game_ids = database.get_existing_game_ids("999")
        assert len(game_ids) == 0


class TestPlayerGameOperations:
    """Tests for player game stats operations."""

    def test_insert_player_game(self, populated_db, sample_player_game):
        """Test inserting player game stats."""
        import database

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT pts, reb, ast FROM player_games WHERE game_id = ? AND player_id = ?",
                (sample_player_game["game_id"], sample_player_game["player_id"]),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == sample_player_game["stats"]["pts"]
        assert row[1] == sample_player_game["stats"]["reb"]
        assert row[2] == sample_player_game["stats"]["ast"]

    def test_bulk_insert_player_games(
        self,
        test_db,
        sample_season,
        sample_team,
        sample_team2,
        sample_player,
        sample_game,
    ):
        """Test bulk inserting player game stats."""
        import database

        # Setup
        database.insert_season(**sample_season)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team["id"], sample_team["name"]),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team2["id"], sample_team2["name"]),
            )
            conn.commit()
        database.insert_player(**sample_player)
        database.insert_game(**sample_game)

        # Bulk insert
        records = [
            {
                "game_id": sample_game["game_id"],
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "minutes": 30.0,
                "pts": 15,
                "reb": 8,
                "ast": 3,
                "off_reb": 2,
                "def_reb": 6,
                "stl": 1,
                "blk": 0,
                "tov": 2,
                "pf": 2,
                "fgm": 6,
                "fga": 12,
                "tpm": 1,
                "tpa": 3,
                "ftm": 2,
                "fta": 2,
                "two_pm": 5,
                "two_pa": 9,
            }
        ]
        database.bulk_insert_player_games(records)

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT pts FROM player_games WHERE game_id = ?",
                (sample_game["game_id"],),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == 15


class TestSeasonStats:
    """Tests for season statistics queries."""

    def test_get_all_season_stats(self, populated_db, sample_season, sample_player):
        """Test getting all season stats."""
        import database

        stats = database.get_all_season_stats(
            sample_season["season_id"], active_only=True
        )

        assert len(stats) > 0
        player_stats = next(
            (s for s in stats if s["id"] == sample_player["player_id"]), None
        )
        assert player_stats is not None
        assert player_stats["pts"] == 18.0  # From sample_player_game
        assert player_stats["gp"] == 1

    def test_get_player_season_stats(self, populated_db, sample_player, sample_season):
        """Test getting specific player's season stats."""
        import database

        stats = database.get_player_season_stats(
            sample_player["player_id"], sample_season["season_id"]
        )

        assert stats is not None
        assert stats["pts"] == 18.0
        assert stats["reb"] == 5.0
        assert stats["ast"] == 4.0


class TestBoxscore:
    """Tests for boxscore functionality."""

    def test_get_game_boxscore(self, populated_db, sample_game, sample_player):
        """Test getting game boxscore."""
        import database

        boxscore = database.get_game_boxscore(sample_game["game_id"])

        assert boxscore is not None
        assert "home" in boxscore or "away" in boxscore or "players" in boxscore

    def test_get_game_boxscore_nonexistent(self, populated_db):
        """Test getting boxscore for non-existent game."""
        import database

        boxscore = database.get_game_boxscore("nonexistent")
        assert boxscore is None


class TestTeamOperations:
    """Tests for team-related operations."""

    def test_get_team_players(
        self, populated_db, sample_team, sample_season, sample_player
    ):
        """Test getting team players."""
        import database

        players = database.get_team_players(
            sample_team["id"], sample_season["season_id"]
        )

        assert len(players) > 0
        player_ids = [p["id"] for p in players]
        assert sample_player["player_id"] in player_ids


class TestTeamStandings:
    """Tests for team standings operations."""

    def test_insert_and_get_standings(self, test_db, sample_season, sample_team):
        """Test inserting and retrieving team standings."""
        import database

        # Setup
        database.insert_season(**sample_season)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team["id"], sample_team["name"]),
            )
            conn.commit()

        standing = {
            "team_id": sample_team["id"],
            "rank": 1,
            "wins": 10,
            "losses": 5,
            "win_pct": 0.667,
            "games_behind": 0.0,
            "home_wins": 6,
            "home_losses": 2,
            "away_wins": 4,
            "away_losses": 3,
        }
        database.insert_team_standing(
            sample_season["season_id"], sample_team["id"], standing
        )

        standings = database.get_team_standings(sample_season["season_id"])

        assert len(standings) > 0
        team_standing = next(
            (s for s in standings if s["team_id"] == sample_team["id"]), None
        )
        assert team_standing is not None
        assert team_standing["rank"] == 1
        assert team_standing["wins"] == 10


class TestPredictions:
    """Tests for prediction operations."""

    def test_save_and_get_predictions(
        self, populated_db, sample_game, sample_player, sample_team
    ):
        """Test saving and retrieving predictions."""
        import database

        player_predictions = [
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "is_starter": 1,
                "predicted_pts": 15.5,
                "predicted_pts_low": 10.0,
                "predicted_pts_high": 21.0,
                "predicted_reb": 5.0,
                "predicted_reb_low": 3.0,
                "predicted_reb_high": 7.0,
                "predicted_ast": 4.0,
                "predicted_ast_low": 2.0,
                "predicted_ast_high": 6.0,
            }
        ]
        team_prediction = {
            "home_win_prob": 55.0,
            "away_win_prob": 45.0,
            "home_predicted_pts": 72.5,
            "away_predicted_pts": 68.0,
        }

        database.save_game_predictions(
            sample_game["game_id"], player_predictions, team_prediction
        )

        # Retrieve and verify
        result = database.get_game_predictions(sample_game["game_id"])

        assert result is not None
        assert "players" in result
        assert "team" in result
        assert len(result["players"]) > 0

        player_pred = result["players"][0]
        assert player_pred["predicted_pts"] == 15.5

        team_pred = result["team"]
        assert team_pred["home_win_prob"] == 55.0

    def test_has_game_predictions(
        self, populated_db, sample_game, sample_player, sample_team
    ):
        """Test checking if predictions exist."""
        import database

        # Initially no predictions
        assert database.has_game_predictions(sample_game["game_id"]) is False

        # Add predictions
        player_predictions = [
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "is_starter": 1,
                "predicted_pts": 15.5,
            }
        ]
        team_prediction = {"home_win_prob": 55.0}
        database.save_game_predictions(
            sample_game["game_id"], player_predictions, team_prediction
        )

        # Now predictions should exist
        assert database.has_game_predictions(sample_game["game_id"]) is True

    def test_predictions_for_future_game(
        self, test_db, sample_season, sample_team, sample_team2, sample_player
    ):
        """Test predictions work for future games (NULL scores)."""
        import database

        # Setup: create a future game with NULL scores
        database.insert_season(**sample_season)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team["id"], sample_team["name"]),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team2["id"], sample_team2["name"]),
            )
            conn.commit()

        database.insert_player(**sample_player)

        # Insert future game with NULL scores
        future_game_id = "04699001"
        database.insert_game(
            game_id=future_game_id,
            season_id=sample_season["season_id"],
            game_date="2026-12-31",
            home_team_id=sample_team["id"],
            away_team_id=sample_team2["id"],
            home_score=None,  # Future game
            away_score=None,
            game_type="regular",
        )

        # Verify game saved with NULL scores
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT home_score, away_score FROM games WHERE id = ?",
                (future_game_id,),
            )
            row = cursor.fetchone()
        assert row[0] is None
        assert row[1] is None

        # Save predictions for future game
        player_predictions = [
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "is_starter": 1,
                "predicted_pts": 18.5,
                "predicted_pts_low": 12.0,
                "predicted_pts_high": 25.0,
                "predicted_reb": 6.0,
                "predicted_ast": 4.0,
            }
        ]
        team_prediction = {
            "home_win_prob": 52.5,
            "away_win_prob": 47.5,
            "home_predicted_pts": 68.0,
            "away_predicted_pts": 65.0,
        }
        database.save_game_predictions(
            future_game_id, player_predictions, team_prediction
        )

        # Verify predictions saved
        result = database.get_game_predictions(future_game_id)
        assert result["team"]["home_win_prob"] == 52.5
        assert result["team"]["away_win_prob"] == 47.5
        assert len(result["players"]) == 1
        assert result["players"][0]["predicted_pts"] == 18.5


class TestPlayerRecentGames:
    """Tests for player recent games query."""

    def test_get_player_recent_games(self, populated_db, sample_player, sample_season):
        """Test getting player's recent games."""
        import database

        games = database.get_player_recent_games(
            sample_player["player_id"], sample_season["season_id"], limit=10
        )

        assert len(games) > 0
        assert games[0]["pts"] == 18  # From sample_player_game

    def test_get_player_recent_games_empty(self, populated_db, sample_season):
        """Test getting recent games for player with no games."""
        import database

        games = database.get_player_recent_games(
            "nonexistent", sample_season["season_id"], limit=10
        )
        assert len(games) == 0


class TestTeamGameOperations:
    """Tests for team game stats operations."""

    def test_insert_team_game(self, populated_db, sample_game, sample_team):
        """Test inserting team game stats."""
        import database

        team_stats = {
            "fast_break": 12,
            "paint_pts": 24,
            "two_pts": 36,
            "three_pts": 18,
            "reb": 35,
            "ast": 15,
            "stl": 8,
            "blk": 3,
            "tov": 12,
            "pf": 18,
        }
        database.insert_team_game(
            sample_game["game_id"], sample_team["id"], is_home=1, stats=team_stats
        )

        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT fast_break_pts, paint_pts, reb FROM team_games WHERE game_id = ? AND team_id = ?",
                (sample_game["game_id"], sample_team["id"]),
            )
            row = cursor.fetchone()

        assert row is not None
        assert row[0] == 12  # fast_break_pts
        assert row[1] == 24  # paint_pts
        assert row[2] == 35  # reb

    def test_get_team_season_stats(
        self, populated_db, sample_game, sample_team, sample_season
    ):
        """Test getting team season stats."""
        import database

        # Insert team game stats first
        team_stats = {
            "fast_break": 10,
            "paint_pts": 20,
            "reb": 30,
            "ast": 12,
            "stl": 6,
            "blk": 2,
            "tov": 10,
            "pf": 15,
        }
        database.insert_team_game(
            sample_game["game_id"], sample_team["id"], is_home=1, stats=team_stats
        )

        stats = database.get_team_season_stats(
            sample_team["id"], sample_season["season_id"]
        )

        assert stats is not None
        assert stats["games"] == 1
        assert stats["reb"] == 30.0
        assert stats["ast"] == 12.0

    def test_get_team_season_stats_nonexistent(self, populated_db, sample_season):
        """Test getting team season stats for nonexistent team."""
        import database

        stats = database.get_team_season_stats(
            "nonexistent", sample_season["season_id"]
        )
        assert stats is None


class TestGameQueries:
    """Tests for game query operations."""

    def test_get_games_in_season(self, populated_db, sample_season, sample_game):
        """Test getting all games in a season."""
        import database

        games = database.get_games_in_season(sample_season["season_id"])

        assert len(games) > 0
        game_ids = [g["id"] for g in games]
        assert sample_game["game_id"] in game_ids

        # Verify game data structure
        game = next(g for g in games if g["id"] == sample_game["game_id"])
        assert "home_team_name" in game
        assert "away_team_name" in game
        assert game["home_score"] == 75
        assert game["away_score"] == 68

    def test_get_games_in_season_empty(self, test_db):
        """Test getting games from empty season."""
        import database

        games = database.get_games_in_season("999")
        assert len(games) == 0

    def test_get_last_game_date(self, populated_db, sample_season, sample_game):
        """Test getting the most recent game date."""
        import database

        last_date = database.get_last_game_date(sample_season["season_id"])

        assert last_date is not None
        assert last_date == sample_game["game_date"]

    def test_get_last_game_date_empty_season(self, test_db):
        """Test getting last game date from empty season."""
        import database

        last_date = database.get_last_game_date("999")
        assert last_date is None


class TestBulkTeamStandings:
    """Tests for bulk team standings operations."""

    def test_bulk_insert_team_standings(
        self, test_db, sample_season, sample_team, sample_team2
    ):
        """Test bulk inserting team standings."""
        import database

        # Setup
        database.insert_season(**sample_season)
        with database.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team["id"], sample_team["name"]),
            )
            cursor.execute(
                "INSERT OR REPLACE INTO teams (id, name) VALUES (?, ?)",
                (sample_team2["id"], sample_team2["name"]),
            )
            conn.commit()

        standings = [
            {
                "team_id": sample_team["id"],
                "rank": 1,
                "wins": 12,
                "losses": 3,
                "win_pct": 0.8,
                "games_behind": 0.0,
                "home_wins": 7,
                "home_losses": 1,
                "away_wins": 5,
                "away_losses": 2,
            },
            {
                "team_id": sample_team2["id"],
                "rank": 2,
                "wins": 10,
                "losses": 5,
                "win_pct": 0.667,
                "games_behind": 2.0,
                "home_wins": 6,
                "home_losses": 2,
                "away_wins": 4,
                "away_losses": 3,
            },
        ]
        database.bulk_insert_team_standings(sample_season["season_id"], standings)

        result = database.get_team_standings(sample_season["season_id"])

        assert len(result) == 2
        # Verify first team
        team1 = next(s for s in result if s["team_id"] == sample_team["id"])
        assert team1["rank"] == 1
        assert team1["wins"] == 12
        # Verify second team
        team2 = next(s for s in result if s["team_id"] == sample_team2["id"])
        assert team2["rank"] == 2
        assert team2["games_behind"] == 2.0


class TestQuarterScores:
    """Tests for game quarter scores and venue."""

    def test_update_game_quarter_scores(self, populated_db, sample_game):
        """Test updating quarter scores for an existing game."""
        import database

        data = {
            "home_q1": 20,
            "home_q2": 18,
            "home_q3": 22,
            "home_q4": 15,
            "home_ot": None,
            "away_q1": 16,
            "away_q2": 20,
            "away_q3": 14,
            "away_q4": 18,
            "away_ot": None,
            "venue": "인천도원체육관",
        }
        database.update_game_quarter_scores(sample_game["game_id"], data)

        with database.get_connection() as conn:
            row = conn.execute(
                "SELECT home_q1, home_q2, away_q3, venue FROM games WHERE id = ?",
                (sample_game["game_id"],),
            ).fetchone()

        assert row is not None
        assert row[0] == 20  # home_q1
        assert row[1] == 18  # home_q2
        assert row[2] == 14  # away_q3
        assert row[3] == "인천도원체육관"

    def test_bulk_update_quarter_scores(self, populated_db, sample_game):
        """Test bulk updating quarter scores."""
        import database

        records = [
            {
                "game_id": sample_game["game_id"],
                "home_q1": 22,
                "home_q2": 19,
                "home_q3": 20,
                "home_q4": 14,
                "away_q1": 18,
                "away_q2": 15,
                "away_q3": 17,
                "away_q4": 18,
                "venue": "잠실실내체육관",
            }
        ]
        database.bulk_update_quarter_scores(records)

        with database.get_connection() as conn:
            row = conn.execute(
                "SELECT home_q1, away_q4, venue FROM games WHERE id = ?",
                (sample_game["game_id"],),
            ).fetchone()

        assert row[0] == 22
        assert row[1] == 18
        assert row[2] == "잠실실내체육관"


class TestPopulateQuarterScoresFromH2H:
    """Tests for populate_quarter_scores_from_h2h()."""

    def test_populates_from_h2h_match(self, populated_db, sample_game, sample_season):
        """Test quarter scores populated when H2H matches game by date+teams."""
        import database

        # Insert H2H record matching the sample game (team1=home, team2=away)
        database.bulk_insert_head_to_head(
            sample_season["season_id"],
            [
                {
                    "team1_id": "samsung",
                    "team2_id": "kb",
                    "game_date": "2025-10-18",
                    "game_number": "1",
                    "venue": "수원체육관",
                    "team1_scores": "20-18-22-15-0",
                    "team2_scores": "17-15-19-17-0",
                    "total_score": "75-68",
                    "winner_id": "samsung",
                }
            ],
        )

        updated = database.populate_quarter_scores_from_h2h(sample_season["season_id"])
        assert updated == 1

        with database.get_connection() as conn:
            row = conn.execute(
                "SELECT home_q1, home_q2, home_q3, home_q4, home_ot, "
                "away_q1, away_q2, away_q3, away_q4, away_ot, venue "
                "FROM games WHERE id = ?",
                (sample_game["game_id"],),
            ).fetchone()

        assert row["home_q1"] == 20
        assert row["home_q2"] == 18
        assert row["home_q3"] == 22
        assert row["home_q4"] == 15
        assert row["home_ot"] == 0
        assert row["away_q1"] == 17
        assert row["away_q2"] == 15
        assert row["away_q3"] == 19
        assert row["away_q4"] == 17
        assert row["venue"] == "수원체육관"

    def test_populates_reversed_team_order(
        self, populated_db, sample_game, sample_season
    ):
        """Test matching when H2H team order is reversed from game."""
        import database

        # Insert H2H with team1=kb (away), team2=samsung (home)
        database.bulk_insert_head_to_head(
            sample_season["season_id"],
            [
                {
                    "team1_id": "kb",
                    "team2_id": "samsung",
                    "game_date": "2025-10-18",
                    "game_number": "1",
                    "venue": "청주체육관",
                    "team1_scores": "17-15-19-17-0",
                    "team2_scores": "20-18-22-15-0",
                    "total_score": "68-75",
                    "winner_id": "samsung",
                }
            ],
        )

        updated = database.populate_quarter_scores_from_h2h(sample_season["season_id"])
        assert updated == 1

        with database.get_connection() as conn:
            row = conn.execute(
                "SELECT home_q1, away_q1, venue FROM games WHERE id = ?",
                (sample_game["game_id"],),
            ).fetchone()

        # samsung is home → should get team2_scores (20-18-22-15-0)
        assert row["home_q1"] == 20
        # kb is away → should get team1_scores (17-15-19-17-0)
        assert row["away_q1"] == 17
        assert row["venue"] == "청주체육관"


class TestResolveOrphanPlayers:
    """Tests for resolve_orphan_players() DB-level resolution."""

    def test_resolves_cross_season_transfer(self, test_db):
        """Orphan player with non-numeric ID resolved to correct pno."""
        import database

        # Set up two seasons
        database.insert_season(season_id="041", label="2020-21")
        database.insert_season(season_id="043", label="2022-23")

        with database.get_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO teams (id, name) VALUES ('hana', '하나은행')"
            )
            conn.execute(
                "INSERT OR IGNORE INTO teams (id, name) VALUES ('woori', '우리은행')"
            )
            conn.commit()

        # Orphan player (played for hana in 041)
        database.insert_player(
            player_id="고아라_하나은행", name="고아라", team_id="hana"
        )
        # Real pno player (played for woori in 043)
        database.insert_player(player_id="095068", name="고아라", team_id="woori")
        # Another 고아라 with different pno but no games
        database.insert_player(player_id="095027", name="고아라", team_id="other")

        # Insert games for seasons
        database.insert_game(
            game_id="04101010",
            season_id="041",
            game_date="2020-11-01",
            home_team_id="hana",
            away_team_id="woori",
        )
        database.insert_game(
            game_id="04301010",
            season_id="043",
            game_date="2022-11-01",
            home_team_id="woori",
            away_team_id="hana",
        )

        # Orphan has games in season 041
        database.insert_player_game(
            game_id="04101010",
            player_id="고아라_하나은행",
            team_id="hana",
            stats={
                "pts": 10,
                "reb": 5,
                "ast": 3,
                "minutes": 20,
                "stl": 0,
                "blk": 0,
                "tov": 0,
                "pf": 0,
                "off_reb": 0,
                "def_reb": 5,
                "fgm": 4,
                "fga": 8,
                "tpm": 0,
                "tpa": 0,
                "ftm": 2,
                "fta": 2,
                "two_pm": 4,
                "two_pa": 8,
            },
        )
        # Real pno has games in season 043
        database.insert_player_game(
            game_id="04301010",
            player_id="095068",
            team_id="woori",
            stats={
                "pts": 12,
                "reb": 3,
                "ast": 2,
                "minutes": 25,
                "stl": 1,
                "blk": 0,
                "tov": 1,
                "pf": 2,
                "off_reb": 1,
                "def_reb": 2,
                "fgm": 5,
                "fga": 10,
                "tpm": 0,
                "tpa": 0,
                "ftm": 2,
                "fta": 3,
                "two_pm": 5,
                "two_pa": 10,
            },
        )

        resolved = database.resolve_orphan_players()
        assert resolved == 1

        # Verify orphan was deleted
        with database.get_connection() as conn:
            orphan = conn.execute(
                "SELECT * FROM players WHERE id = '고아라_하나은행'"
            ).fetchone()
            assert orphan is None

            # Verify player_games reference was updated
            pg = conn.execute(
                "SELECT player_id FROM player_games WHERE game_id = '04101010'"
            ).fetchone()
            assert pg["player_id"] == "095068"

    def test_tiebreak_by_minutes(self, test_db):
        """Resolves tie using avg minutes similarity (veteran vs rookie)."""
        import database

        database.insert_season(season_id="041", label="2020-21")
        database.insert_season(season_id="044", label="2023-24")

        with database.get_connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO teams (id, name) VALUES ('woori', '우리은행')"
            )
            conn.execute(
                "INSERT OR IGNORE INTO teams (id, name) VALUES ('hana', '하나은행')"
            )
            conn.execute("INSERT OR IGNORE INTO teams (id, name) VALUES ('bnk', 'BNK')")
            conn.commit()

        database.insert_player(
            player_id="김정은_우리은행", name="김정은", team_id="woori"
        )
        database.insert_player(player_id="095041", name="김정은", team_id="hana")
        database.insert_player(player_id="095899", name="김정은", team_id="bnk")

        database.insert_game(
            game_id="04101020",
            season_id="041",
            game_date="2020-11-01",
            home_team_id="woori",
            away_team_id="hana",
        )
        database.insert_game(
            game_id="04401020",
            season_id="044",
            game_date="2023-11-01",
            home_team_id="hana",
            away_team_id="bnk",
        )

        # Orphan: ~30 min (veteran)
        database.insert_player_game(
            game_id="04101020",
            player_id="김정은_우리은행",
            team_id="woori",
            stats={
                "pts": 10,
                "reb": 5,
                "ast": 3,
                "minutes": 30,
                "stl": 0,
                "blk": 0,
                "tov": 0,
                "pf": 0,
                "off_reb": 0,
                "def_reb": 5,
                "fgm": 4,
                "fga": 8,
                "tpm": 0,
                "tpa": 0,
                "ftm": 2,
                "fta": 2,
                "two_pm": 4,
                "two_pa": 8,
            },
        )
        # 095041: ~29 min (similar to orphan → transfer match)
        database.insert_player_game(
            game_id="04401020",
            player_id="095041",
            team_id="hana",
            stats={
                "pts": 8,
                "reb": 3,
                "ast": 2,
                "minutes": 29,
                "stl": 0,
                "blk": 0,
                "tov": 0,
                "pf": 0,
                "off_reb": 0,
                "def_reb": 3,
                "fgm": 3,
                "fga": 7,
                "tpm": 0,
                "tpa": 0,
                "ftm": 2,
                "fta": 3,
                "two_pm": 3,
                "two_pa": 7,
            },
        )
        # 095899: ~10 min (rookie, very different)
        database.insert_player_game(
            game_id="04401020",
            player_id="095899",
            team_id="bnk",
            stats={
                "pts": 2,
                "reb": 1,
                "ast": 0,
                "minutes": 10,
                "stl": 0,
                "blk": 0,
                "tov": 0,
                "pf": 0,
                "off_reb": 0,
                "def_reb": 1,
                "fgm": 1,
                "fga": 3,
                "tpm": 0,
                "tpa": 0,
                "ftm": 0,
                "fta": 0,
                "two_pm": 1,
                "two_pa": 3,
            },
        )

        resolved = database.resolve_orphan_players()
        assert resolved == 1

        with database.get_connection() as conn:
            # Orphan should be deleted
            orphan = conn.execute(
                "SELECT * FROM players WHERE id = '김정은_우리은행'"
            ).fetchone()
            assert orphan is None
            # Games should be under 095041
            pg = conn.execute(
                "SELECT player_id FROM player_games WHERE game_id = '04101020'"
            ).fetchone()
            assert pg["player_id"] == "095041"


class TestPlayByPlay:
    """Tests for play-by-play operations."""

    def test_bulk_insert_and_get(self, populated_db, sample_game, sample_team):
        """Test inserting and retrieving play-by-play events."""
        import database

        events = [
            {
                "event_order": 1,
                "quarter": "Q1",
                "game_clock": "09:45",
                "team_id": sample_team["id"],
                "player_id": None,
                "event_type": "score",
                "home_score": 2,
                "away_score": 0,
                "description": "삼성 2점슛 성공",
            },
            {
                "event_order": 2,
                "quarter": "Q1",
                "game_clock": "09:20",
                "team_id": None,
                "player_id": None,
                "event_type": "foul",
                "home_score": 2,
                "away_score": 0,
                "description": "파울",
            },
            {
                "event_order": 3,
                "quarter": "Q2",
                "game_clock": "08:00",
                "team_id": sample_team["id"],
                "player_id": None,
                "event_type": "score",
                "home_score": 5,
                "away_score": 2,
                "description": "삼성 3점슛 성공",
            },
        ]
        database.bulk_insert_play_by_play(sample_game["game_id"], events)

        # Get all events
        result = database.get_play_by_play(sample_game["game_id"])
        assert len(result) == 3
        assert result[0]["event_order"] == 1
        assert result[0]["quarter"] == "Q1"

    def test_get_play_by_play_quarter_filter(
        self, populated_db, sample_game, sample_team
    ):
        """Test filtering play-by-play by quarter."""
        import database

        events = [
            {
                "event_order": 1,
                "quarter": "Q1",
                "game_clock": "09:45",
                "event_type": "score",
                "home_score": 2,
                "away_score": 0,
            },
            {
                "event_order": 2,
                "quarter": "Q2",
                "game_clock": "08:00",
                "event_type": "score",
                "home_score": 5,
                "away_score": 2,
            },
        ]
        database.bulk_insert_play_by_play(sample_game["game_id"], events)

        q1_events = database.get_play_by_play(sample_game["game_id"], quarter="Q1")
        assert len(q1_events) == 1
        assert q1_events[0]["quarter"] == "Q1"


class TestShotCharts:
    """Tests for shot chart operations."""

    def test_bulk_insert_and_get(self, populated_db, sample_game, sample_player):
        """Test inserting and retrieving shot chart data."""
        import database

        shots = [
            {
                "player_id": sample_player["player_id"],
                "team_id": "samsung",
                "quarter": "Q1",
                "game_minute": 9,
                "game_second": 30,
                "x": 45.5,
                "y": 60.2,
                "made": 1,
                "shot_zone": "paint",
            },
            {
                "player_id": sample_player["player_id"],
                "team_id": "samsung",
                "quarter": "Q1",
                "game_minute": 8,
                "game_second": 15,
                "x": 70.0,
                "y": 30.0,
                "made": 0,
                "shot_zone": "three_pt",
            },
        ]
        database.bulk_insert_shot_charts(sample_game["game_id"], shots)

        result = database.get_shot_chart(sample_game["game_id"])
        assert len(result) == 2
        assert result[0]["made"] == 0  # Ordered by time, 8:15 before 9:30
        assert result[1]["x"] == 45.5

    def test_get_shot_chart_player_filter(
        self, populated_db, sample_game, sample_player, sample_player2
    ):
        """Test filtering shot chart by player."""
        import database

        shots = [
            {
                "player_id": sample_player["player_id"],
                "quarter": "Q1",
                "game_minute": 9,
                "game_second": 30,
                "x": 45.5,
                "y": 60.2,
                "made": 1,
            },
            {
                "player_id": sample_player2["player_id"],
                "quarter": "Q1",
                "game_minute": 8,
                "game_second": 10,
                "x": 30.0,
                "y": 40.0,
                "made": 0,
            },
        ]
        database.bulk_insert_shot_charts(sample_game["game_id"], shots)

        result = database.get_shot_chart(
            sample_game["game_id"], player_id=sample_player["player_id"]
        )
        assert len(result) == 1
        assert result[0]["player_id"] == sample_player["player_id"]


class TestTeamCategoryStats:
    """Tests for team category stats operations."""

    def test_insert_and_get_by_category(self, populated_db, sample_season, sample_team):
        """Test inserting and retrieving team category stats."""
        import database

        stats = [
            {
                "team_id": sample_team["id"],
                "rank": 1,
                "value": 78.5,
                "games_played": 20,
                "extra_values": '{"total": 1570}',
            },
        ]
        database.bulk_insert_team_category_stats(
            sample_season["season_id"], "pts", stats
        )

        result = database.get_team_category_stats(
            sample_season["season_id"], category="pts"
        )
        assert len(result) == 1
        assert result[0]["rank"] == 1
        assert result[0]["value"] == 78.5
        assert result[0]["team_name"] == "삼성생명"

    def test_get_all_categories(
        self, populated_db, sample_season, sample_team, sample_team2
    ):
        """Test retrieving all team category stats."""
        import database

        database.bulk_insert_team_category_stats(
            sample_season["season_id"],
            "pts",
            [{"team_id": sample_team["id"], "rank": 1, "value": 78.5}],
        )
        database.bulk_insert_team_category_stats(
            sample_season["season_id"],
            "reb",
            [{"team_id": sample_team2["id"], "rank": 1, "value": 40.2}],
        )

        result = database.get_team_category_stats(sample_season["season_id"])
        assert len(result) == 2
        categories = {r["category"] for r in result}
        assert categories == {"pts", "reb"}


class TestHeadToHead:
    """Tests for head-to-head operations."""

    def test_insert_and_get(
        self, populated_db, sample_season, sample_team, sample_team2
    ):
        """Test inserting and retrieving H2H records."""
        import database

        records = [
            {
                "team1_id": sample_team["id"],
                "team2_id": sample_team2["id"],
                "game_date": "2025-11-01",
                "game_number": "1",
                "venue": "인천도원체육관",
                "team1_scores": '{"q1": 20, "q2": 18, "q3": 22, "q4": 15}',
                "team2_scores": '{"q1": 16, "q2": 20, "q3": 14, "q4": 18}',
                "total_score": "75-68",
                "winner_id": sample_team["id"],
            }
        ]
        database.bulk_insert_head_to_head(sample_season["season_id"], records)

        result = database.get_head_to_head(
            sample_season["season_id"], sample_team["id"], sample_team2["id"]
        )
        assert len(result) == 1
        assert result[0]["winner_id"] == sample_team["id"]
        assert result[0]["venue"] == "인천도원체육관"

    def test_bidirectional_lookup(
        self, populated_db, sample_season, sample_team, sample_team2
    ):
        """Test that H2H lookup works in both directions."""
        import database

        records = [
            {
                "team1_id": sample_team["id"],
                "team2_id": sample_team2["id"],
                "game_date": "2025-11-01",
                "total_score": "75-68",
                "winner_id": sample_team["id"],
            }
        ]
        database.bulk_insert_head_to_head(sample_season["season_id"], records)

        # Query in reverse order (team2 vs team1)
        result = database.get_head_to_head(
            sample_season["season_id"], sample_team2["id"], sample_team["id"]
        )
        assert len(result) == 1
        assert result[0]["winner_id"] == sample_team["id"]


class TestGameMVP:
    """Tests for game MVP operations."""

    def test_insert_and_get(
        self, populated_db, sample_season, sample_player, sample_team
    ):
        """Test inserting and retrieving game MVP records."""
        import database

        records = [
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "game_date": "2025-11-01",
                "rank": 1,
                "evaluation_score": 28.5,
                "minutes": 35.0,
                "pts": 25,
                "reb": 8,
                "ast": 5,
                "stl": 3,
                "blk": 1,
                "tov": 2,
            },
        ]
        database.bulk_insert_game_mvp(sample_season["season_id"], records)

        result = database.get_game_mvp(sample_season["season_id"])
        assert len(result) == 1
        assert result[0]["rank"] == 1
        assert result[0]["evaluation_score"] == 28.5
        assert result[0]["player_name"] == sample_player["name"]

    def test_get_by_date(self, populated_db, sample_season, sample_player, sample_team):
        """Test filtering MVP records by date."""
        import database

        records = [
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "game_date": "2025-11-01",
                "rank": 1,
                "evaluation_score": 28.5,
                "pts": 25,
            },
            {
                "player_id": sample_player["player_id"],
                "team_id": sample_team["id"],
                "game_date": "2025-11-05",
                "rank": 1,
                "evaluation_score": 22.0,
                "pts": 20,
            },
        ]
        database.bulk_insert_game_mvp(sample_season["season_id"], records)

        result = database.get_game_mvp(
            sample_season["season_id"], game_date="2025-11-01"
        )
        assert len(result) == 1
        assert result[0]["pts"] == 25


class TestTeamSeasonTotals:
    """Tests for team/opponent/league season aggregate functions."""

    def _insert_opponent_player_game(self, database, sample_game, sample_player2):
        """Insert an away-team player game for a complete game context."""
        database.insert_player_game(
            game_id=sample_game["game_id"],
            player_id=sample_player2["player_id"],
            team_id="kb",
            stats={
                "minutes": 28.0,
                "pts": 15,
                "reb": 6,
                "ast": 3,
                "stl": 1,
                "blk": 0,
                "tov": 2,
                "pf": 3,
                "off_reb": 2,
                "def_reb": 4,
                "fgm": 6,
                "fga": 13,
                "tpm": 1,
                "tpa": 4,
                "ftm": 2,
                "fta": 2,
                "two_pm": 5,
                "two_pa": 9,
            },
        )

    def test_get_team_season_totals(self, populated_db, sample_game, sample_player2):
        """Team season totals should aggregate player_games per team."""
        import database

        self._insert_opponent_player_game(database, sample_game, sample_player2)

        result = database.get_team_season_totals("046")
        assert "samsung" in result
        assert "kb" in result

        samsung = result["samsung"]
        assert samsung["fga"] == 14
        assert samsung["fta"] == 3
        assert samsung["tov"] == 3
        assert samsung["oreb"] == 1
        assert samsung["dreb"] == 4
        assert samsung["pts"] == 18
        assert samsung["min"] == 32.5
        assert samsung["fgm"] == 7
        assert samsung["ast"] == 4
        assert samsung["stl"] == 2
        assert samsung["blk"] == 1
        assert samsung["pf"] == 2
        assert samsung["ftm"] == 2
        assert samsung["tpm"] == 2
        assert samsung["tpa"] == 5
        assert samsung["reb"] == 5
        assert samsung["gp"] == 1

    def test_get_opponent_season_totals(
        self, populated_db, sample_game, sample_player2
    ):
        """Opponent totals should map each team to its opponents' aggregated stats."""
        import database

        self._insert_opponent_player_game(database, sample_game, sample_player2)

        result = database.get_opponent_season_totals("046")
        assert "samsung" in result
        assert "kb" in result

        # Samsung's opponent is KB
        samsung_opp = result["samsung"]
        assert samsung_opp["pts"] == 15
        assert samsung_opp["fga"] == 13
        assert samsung_opp["oreb"] == 2
        assert samsung_opp["dreb"] == 4

        # KB's opponent is Samsung
        kb_opp = result["kb"]
        assert kb_opp["pts"] == 18
        assert kb_opp["fga"] == 14

    def test_get_league_season_totals(self, populated_db, sample_game, sample_player2):
        """League totals should be the sum of all team totals."""
        import database

        self._insert_opponent_player_game(database, sample_game, sample_player2)

        result = database.get_league_season_totals("046")
        # League = samsung + kb totals
        assert result["pts"] == 18 + 15
        assert result["fga"] == 14 + 13
        assert result["min"] == 32.5 + 28.0
