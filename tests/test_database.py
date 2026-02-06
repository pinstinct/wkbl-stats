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
