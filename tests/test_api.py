"""
Tests for api.py - FastAPI REST API endpoints.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def load_contract_fixture(name: str) -> dict:
    """Load API contract fixture JSON from tests/fixtures."""
    fixture_path = Path(__file__).parent / "fixtures" / name
    return json.loads(fixture_path.read_text(encoding="utf-8"))


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

    def test_get_players_include_no_games_toggle(
        self, client, sample_team, sample_season
    ):
        """include_no_games should control zero-game active roster visibility."""
        import database

        # Active player with no games in season
        database.insert_player(
            player_id="095999",
            name="무경기선수",
            team_id=sample_team["id"],
            position="G",
            height="170cm",
            birth_date="2000-01-01",
            is_active=1,
        )

        include_resp = client.get(
            f"/players?season={sample_season['season_id']}&active_only=true&include_no_games=true"
        )
        assert include_resp.status_code == 200
        include_ids = {p["id"] for p in include_resp.json()["players"]}
        assert "095999" in include_ids

        exclude_resp = client.get(
            f"/players?season={sample_season['season_id']}&active_only=true&include_no_games=false"
        )
        assert exclude_resp.status_code == 200
        exclude_ids = {p["id"] for p in exclude_resp.json()["players"]}
        assert "095999" not in exclude_ids

    def test_get_players_include_no_games_inactive_historical_team_inference(
        self, client, sample_season, sample_team, sample_team2
    ):
        """Inactive gp=0 players should still resolve team by latest season <= requested."""
        import database

        # Older season for historical team assignment
        database.insert_season("045", "2024-25", "2024-10-01", "2025-03-31")

        # Inactive player currently attached to another team in players table
        database.insert_player(
            player_id="095998",
            name="히스토리선수",
            team_id=sample_team2["id"],
            position="F",
            height="178cm",
            birth_date="1990-01-01",
            is_active=0,
        )

        # Last played in older season for sample_team
        database.insert_game(
            game_id="04501001",
            season_id="045",
            game_date="2024-10-10",
            home_team_id=sample_team["id"],
            away_team_id=sample_team2["id"],
            home_score=70,
            away_score=68,
        )
        database.insert_player_game(
            game_id="04501001",
            player_id="095998",
            team_id=sample_team["id"],
            stats={
                "minutes": 10,
                "pts": 2,
                "reb": 1,
                "ast": 0,
                "stl": 0,
                "blk": 0,
                "tov": 0,
            },
        )

        # Requested season has no game records for this player (gp=0 in season 046)
        resp = client.get(
            f"/players?season={sample_season['season_id']}&active_only=false&include_no_games=true&team={sample_team['id']}"
        )
        assert resp.status_code == 200
        rows = resp.json()["players"]
        by_id = {p["id"]: p for p in rows}

        assert "095998" in by_id
        assert by_id["095998"]["gp"] == 0
        # Must use historical team <= requested season, not current players.team_id
        assert by_id["095998"]["team_id"] == sample_team["id"]

    def test_get_players_contract_fixture(self, client, sample_player, sample_season):
        """players response should match contract fixture for core stat fields."""
        fixture = load_contract_fixture("api_contracts.json")
        expected = fixture["players"]["sample_player_core_stats"]

        response = client.get(
            f"/players?season={sample_season['season_id']}&active_only=true&include_no_games=false"
        )
        assert response.status_code == 200
        rows = response.json()["players"]
        by_id = {p["id"]: p for p in rows}
        assert sample_player["player_id"] in by_id
        row = by_id[sample_player["player_id"]]

        for key, value in expected.items():
            assert row[key] == value

    def test_get_players_past_season_excludes_future_only_active_rookie(
        self, client, sample_team, sample_team2
    ):
        """Past-season filter must not include players with no career games up to that season."""
        import database

        database.insert_season("045", "2024-25", "2024-10-01", "2025-03-31")
        database.insert_season("047", "2026-27", "2026-10-01", "2027-03-31")

        # Active player appears in players table now, but has no games up to season 045.
        database.insert_player(
            player_id="095996",
            name="미래데뷔선수",
            team_id=sample_team["id"],
            position="G",
            height="173cm",
            birth_date="2003-01-01",
            is_active=1,
        )

        # This player debuts later in 047 for a different team.
        database.insert_game(
            game_id="04701001",
            season_id="047",
            game_date="2026-10-10",
            home_team_id=sample_team2["id"],
            away_team_id=sample_team["id"],
            home_score=66,
            away_score=64,
        )
        database.insert_player_game(
            game_id="04701001",
            player_id="095996",
            team_id=sample_team2["id"],
            stats={
                "minutes": 5,
                "pts": 0,
                "reb": 1,
                "ast": 0,
                "stl": 0,
                "blk": 0,
                "tov": 0,
            },
        )

        response = client.get(
            f"/players?season=045&active_only=true&include_no_games=true&team={sample_team['id']}"
        )
        assert response.status_code == 200
        ids = {p["id"] for p in response.json()["players"]}
        assert "095996" not in ids


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

    def test_get_team_detail_roster_includes_active_no_games_player(
        self, client, sample_team, sample_season
    ):
        """Team detail roster should include active players even if gp=0 in season."""
        import database

        database.insert_player(
            player_id="095997",
            name="로스터무경기",
            team_id=sample_team["id"],
            position="C",
            height="185cm",
            birth_date="2001-01-01",
            is_active=1,
        )

        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        roster_ids = {p["id"] for p in response.json().get("roster", [])}
        assert "095997" in roster_ids

    def test_get_team_detail_recent_games_excludes_future_games(
        self, client, sample_team, sample_team2, sample_season
    ):
        """Recent games should only include completed games with scores."""
        import database

        database.insert_game(
            game_id="04601999",
            season_id=sample_season["season_id"],
            game_date="2026-03-10",
            home_team_id=sample_team["id"],
            away_team_id=sample_team2["id"],
            home_score=None,
            away_score=None,
        )

        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        recent_ids = {g["game_id"] for g in response.json().get("recent_games", [])}
        assert "04601999" not in recent_ids

    def test_get_team_detail_contract_fixture(self, client, sample_team, sample_season):
        """team detail response should follow stable shape/value contract."""
        fixture = load_contract_fixture("api_contracts.json")
        expected = fixture["team_detail"]["sample_team_core"]

        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()

        assert data["id"] == expected["id"]
        assert data["name"] == expected["name"]
        assert isinstance(data["roster"], list)
        assert isinstance(data["recent_games"], list)
        assert len(data["recent_games"]) >= 1

        recent = data["recent_games"][0]
        for key, value in expected["latest_recent_game"].items():
            assert recent[key] == value


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

    def test_get_game_boxscore(self, client, sample_game, sample_player):
        """Test getting game boxscore."""
        response = client.get(f"/games/{sample_game['game_id']}")
        assert response.status_code == 200
        data = response.json()
        # Check boxscore structure - API uses home_team_stats/away_team_stats
        assert "id" in data
        assert data["id"] == sample_game["game_id"]
        assert "home_team_stats" in data
        assert "away_team_stats" in data
        # Check player stats are included in home team
        assert len(data["home_team_stats"]) > 0
        player_ids = [p["player_id"] for p in data["home_team_stats"]]
        assert sample_player["player_id"] in player_ids

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

    def test_get_leaders_different_categories(self, client, sample_season):
        """Test getting leaders for different stat categories."""
        categories = ["pts", "reb", "ast", "stl", "blk"]
        for category in categories:
            response = client.get(
                f"/leaders?season={sample_season['season_id']}&category={category}"
            )
            assert response.status_code == 200
            data = response.json()
            assert "leaders" in data

    def test_get_leaders_all_categories(self, client, sample_season):
        """Test getting leaders for all categories."""
        response = client.get(f"/leaders/all?season={sample_season['season_id']}")
        assert response.status_code == 200
        data = response.json()
        # Should have categories wrapper
        assert isinstance(data, dict)
        assert "categories" in data
        # Check expected categories exist inside categories
        categories = data["categories"]
        expected_keys = ["pts", "reb", "ast", "stl", "blk"]
        for key in expected_keys:
            assert key in categories, f"Missing category: {key}"
            assert isinstance(categories[key], list)


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
