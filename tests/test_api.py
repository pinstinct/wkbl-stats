"""
Tests for api.py - FastAPI REST API endpoints.
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


@pytest.fixture
def client(populated_db, monkeypatch):
    """Create a test client with populated database."""

    # The database module should already be patched from populated_db fixture
    from api import app

    return TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check(self, client):
        """Test health check returns OK."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


class TestPlayersEndpoint:
    """Tests for /players endpoint."""

    def test_get_players(self, client, sample_player, sample_season):
        """Test getting players list."""
        response = client.get(f"/players?season={sample_season['season_id']}")
        assert response.status_code == 200
        data = response.json()
        assert "players" in data

    def test_get_players_with_active_filter(self, client, sample_season):
        """Test getting only active players."""
        response = client.get(
            f"/players?season={sample_season['season_id']}&active_only=true"
        )
        assert response.status_code == 200
        data = response.json()
        assert "players" in data

    def test_get_players_all_seasons(self, client):
        """Test getting players for all seasons."""
        response = client.get("/players?season=all")
        assert response.status_code == 200
        data = response.json()
        assert "players" in data


class TestPlayerDetailEndpoint:
    """Tests for /players/{id} endpoint."""

    def test_get_player_detail(self, client, sample_player):
        """Test getting player details."""
        response = client.get(f"/players/{sample_player['player_id']}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_player["player_id"]
        assert data["name"] == sample_player["name"]

    def test_get_player_detail_not_found(self, client):
        """Test getting non-existent player."""
        response = client.get("/players/nonexistent")
        assert response.status_code == 404


class TestPlayerGamelogEndpoint:
    """Tests for /players/{id}/gamelog endpoint."""

    def test_get_player_gamelog(self, client, sample_player, sample_season):
        """Test getting player game log."""
        response = client.get(
            f"/players/{sample_player['player_id']}/gamelog?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "games" in data
        assert len(data["games"]) > 0


class TestPlayerCompareEndpoint:
    """Tests for /players/compare endpoint."""

    def test_compare_players(
        self, client, sample_player, sample_player2, sample_season
    ):
        """Test comparing multiple players."""
        ids = f"{sample_player['player_id']},{sample_player2['player_id']}"
        response = client.get(
            f"/players/compare?ids={ids}&season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "players" in data

    def test_compare_players_invalid_count(self, client, sample_player):
        """Test comparing with single player should fail."""
        response = client.get(f"/players/compare?ids={sample_player['player_id']}")
        assert response.status_code == 400  # Bad request - need 2-4 players


class TestTeamsEndpoint:
    """Tests for /teams endpoint."""

    def test_get_teams(self, client):
        """Test getting teams list."""
        response = client.get("/teams")
        assert response.status_code == 200
        data = response.json()
        assert "teams" in data
        assert len(data["teams"]) >= 2  # At least our two sample teams


class TestTeamDetailEndpoint:
    """Tests for /teams/{id} endpoint."""

    def test_get_team_detail(self, client, sample_team, sample_season):
        """Test getting team details."""
        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_team["id"]

    def test_get_team_detail_not_found(self, client):
        """Test getting non-existent team."""
        response = client.get("/teams/nonexistent")
        assert response.status_code == 404


class TestGamesEndpoint:
    """Tests for /games endpoint."""

    def test_get_games(self, client, sample_season):
        """Test getting games list."""
        response = client.get(f"/games?season={sample_season['season_id']}")
        assert response.status_code == 200
        data = response.json()
        assert "games" in data
        assert len(data["games"]) > 0


class TestGameBoxscoreEndpoint:
    """Tests for /games/{id} endpoint."""

    def test_get_game_boxscore(self, client, sample_game):
        """Test getting game boxscore."""
        response = client.get(f"/games/{sample_game['game_id']}")
        assert response.status_code == 200
        data = response.json()
        assert "id" in data or "game_id" in data or "home" in data or "away" in data

    def test_get_game_boxscore_not_found(self, client):
        """Test getting non-existent game."""
        response = client.get("/games/nonexistent")
        assert response.status_code == 404


class TestSeasonsEndpoint:
    """Tests for /seasons endpoint."""

    def test_get_seasons(self, client):
        """Test getting seasons list."""
        response = client.get("/seasons")
        assert response.status_code == 200
        data = response.json()
        assert "seasons" in data


class TestStandingsEndpoint:
    """Tests for /seasons/{id}/standings endpoint."""

    def test_get_standings(self, client, sample_season, sample_team):
        """Test getting team standings."""
        # First insert a standing
        import database

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

        response = client.get(f"/seasons/{sample_season['season_id']}/standings")
        assert response.status_code == 200
        data = response.json()
        assert "standings" in data


class TestLeadersEndpoint:
    """Tests for /leaders endpoint."""

    def test_get_leaders(self, client, sample_season):
        """Test getting statistical leaders."""
        response = client.get(
            f"/leaders?season={sample_season['season_id']}&category=pts"
        )
        assert response.status_code == 200
        data = response.json()
        assert "leaders" in data

    def test_get_leaders_all_categories(self, client, sample_season):
        """Test getting leaders for all categories."""
        response = client.get(f"/leaders/all?season={sample_season['season_id']}")
        assert response.status_code == 200
        data = response.json()
        # Should have multiple categories
        assert isinstance(data, dict)


class TestSearchEndpoint:
    """Tests for /search endpoint."""

    def test_search_players(self, client, sample_player):
        """Test searching for players."""
        response = client.get(f"/search?q={sample_player['name'][:3]}")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data or "players" in data or "teams" in data

    def test_search_empty_query(self, client):
        """Test search with empty query."""
        response = client.get("/search?q=")
        assert response.status_code in [
            200,
            400,
            422,
        ]  # Either empty result, bad request, or validation error


class TestPlayerHighlightsEndpoint:
    """Tests for /players/{id}/highlights endpoint."""

    def test_get_player_highlights(self, client, sample_player):
        """Test getting player highlights."""
        response = client.get(f"/players/{sample_player['player_id']}/highlights")
        assert response.status_code == 200
        data = response.json()
        # Should have some highlight data
        assert isinstance(data, dict)
