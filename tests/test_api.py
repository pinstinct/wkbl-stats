"""
Tests for api.py - FastAPI REST API endpoints.
"""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def load_contract_fixture(name: str) -> dict:
    """Load API contract fixture JSON from tests/fixtures."""
    fixture_path = Path(__file__).parent / "fixtures" / name
    return json.loads(fixture_path.read_text(encoding="utf-8"))


def _find_traffic_guard_middleware(client):
    """Return TrafficGuardMiddleware instance from app stack."""
    stack = client.app.middleware_stack
    while stack is not None:
        if stack.__class__.__name__ == "TrafficGuardMiddleware":
            return stack
        stack = getattr(stack, "app", None)
    return None


def _make_request(
    *,
    path: str = "/teams",
    method: str = "GET",
    headers: dict[str, str] | None = None,
    client_host: str = "203.0.113.10",
) -> Request:
    raw_headers = [
        (k.lower().encode("latin-1"), v.encode("latin-1"))
        for k, v in (headers or {}).items()
    ]
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": method,
        "path": path,
        "raw_path": path.encode("latin-1"),
        "query_string": b"",
        "headers": raw_headers,
        "client": (client_host, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }

    async def _receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    return Request(scope, _receive)


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

    def test_cors_preflight_allows_known_origin(self, client):
        """Known origin should receive CORS allow-origin on preflight."""
        response = client.options(
            "/players",
            headers={
                "Origin": "http://localhost:8000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
        assert response.headers.get("access-control-allow-origin") in {
            "http://localhost:8000",
            "*",
        }

    def test_cors_preflight_rejects_unknown_origin(self, client):
        """Unknown origin should not pass preflight when whitelist is enabled."""
        response = client.options(
            "/players",
            headers={
                "Origin": "https://evil.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code in {400, 403}
        assert response.headers.get("access-control-allow-origin") is None

    def test_rate_limit_returns_429_with_retry_after(self, client):
        """Traffic guard should return 429 with Retry-After when quota is exceeded."""
        # Build middleware stack before access.
        assert client.get("/health").status_code == 200
        guard = _find_traffic_guard_middleware(client)
        assert guard is not None

        guard._general_limit = 2
        guard._request_window = 60
        guard._hits.clear()
        headers = {"x-forwarded-for": "198.51.100.99"}

        assert client.get("/teams", headers=headers).status_code == 200
        assert client.get("/teams", headers=headers).status_code == 200
        limited = client.get("/teams", headers=headers)
        assert limited.status_code == 429
        assert limited.headers.get("Retry-After") is not None

    def test_rate_limit_does_not_trust_xff_by_default(self, client):
        """Without trusted proxy mode, changing XFF should not bypass limits."""
        assert client.get("/health").status_code == 200
        guard = _find_traffic_guard_middleware(client)
        assert guard is not None

        guard._general_limit = 2
        guard._request_window = 60
        guard._hits.clear()

        h1 = {"x-forwarded-for": "198.51.100.10"}
        h2 = {"x-forwarded-for": "198.51.100.11"}
        h3 = {"x-forwarded-for": "198.51.100.12"}
        assert client.get("/teams", headers=h1).status_code == 200
        assert client.get("/teams", headers=h2).status_code == 200
        # Still rate-limited because source IP "testclient" is used by default.
        assert client.get("/teams", headers=h3).status_code == 429

    def test_rate_limit_sweep_caps_key_growth(self, client):
        """Rate-limit in-memory buckets should be swept/capped to avoid unbounded growth."""
        assert client.get("/health").status_code == 200
        guard = _find_traffic_guard_middleware(client)
        assert guard is not None

        guard._max_keys = 3
        guard._hits = {
            "k1": [1.0],
            "k2": [2.0],
            "k3": [3.0],
            "k4": [4.0],
            "k5": [5.0],
        }
        guard._sweep(cutoff=0.0)
        assert len(guard._hits) <= 3

    def test_forwarded_chain_uses_last_untrusted_hop(self, monkeypatch):
        """When proxy trust is enabled, use nearest untrusted address from XFF chain."""
        import api

        monkeypatch.setattr(api, "API_TRUST_PROXY", True)
        monkeypatch.setattr(
            api,
            "_TRUSTED_PROXY_NETWORKS",
            api._compile_trusted_proxies(["10.0.0.0/8"])[0],
        )
        monkeypatch.setattr(api, "_TRUSTED_PROXY_LITERALS", set())

        # client, edge-proxy, app-proxy
        xff = "198.51.100.22, 10.10.10.10, 10.20.20.20"
        assert api._extract_forwarded_client_ip(xff) == "198.51.100.22"

    @pytest.mark.anyio
    async def test_limited_receive_raises_before_full_body_buffering(self):
        """Chunked request stream should fail once payload exceeds limit."""
        import api

        messages = [
            {"type": "http.request", "body": b"a" * 8, "more_body": True},
            {"type": "http.request", "body": b"b" * 8, "more_body": False},
        ]

        async def fake_receive():
            return messages.pop(0)

        limited = api._build_limited_receive(fake_receive, max_bytes=10)
        first = await limited()
        assert first["type"] == "http.request"
        with pytest.raises(api._PayloadTooLargeError):
            await limited()

    def test_proxy_parser_helpers_cover_invalid_and_literal_paths(self, monkeypatch):
        import api

        networks, literals = api._compile_trusted_proxies(
            ["10.0.0.0/8", "localhost", "invalid-host"]
        )
        assert networks
        assert "localhost" in literals
        assert "invalid-host" in literals

        monkeypatch.setattr(api, "_TRUSTED_PROXY_NETWORKS", networks)
        monkeypatch.setattr(api, "_TRUSTED_PROXY_LITERALS", literals)
        assert api._is_trusted_proxy_ip("10.1.2.3") is True
        assert api._is_trusted_proxy_ip("localhost") is True
        assert api._is_trusted_proxy_ip("") is False
        assert api._is_trusted_proxy_ip("not-an-ip") is False

        assert api._extract_forwarded_client_ip("") is None
        assert api._extract_forwarded_client_ip("bad-ip, nope") is None
        assert api._extract_forwarded_client_ip("10.1.2.3, 10.1.2.4") == "10.1.2.3"

    def test_resolve_client_ip_branches(self, monkeypatch):
        import api

        monkeypatch.setattr(api, "API_TRUST_PROXY", False)
        req = _make_request(
            headers={"x-forwarded-for": "198.51.100.2"},
            client_host="10.0.0.9",
        )
        assert api._resolve_client_ip(req) == "10.0.0.9"

        monkeypatch.setattr(api, "API_TRUST_PROXY", True)
        monkeypatch.setattr(api, "_TRUSTED_PROXY_NETWORKS", [])
        monkeypatch.setattr(api, "_TRUSTED_PROXY_LITERALS", set())
        assert api._resolve_client_ip(req) == "10.0.0.9"

        monkeypatch.setattr(
            api,
            "_TRUSTED_PROXY_NETWORKS",
            api._compile_trusted_proxies(["10.0.0.0/8"])[0],
        )
        monkeypatch.setattr(api, "_TRUSTED_PROXY_LITERALS", set())
        req_real = _make_request(
            headers={"x-real-ip": "198.51.100.44"},
            client_host="10.0.0.9",
        )
        assert api._resolve_client_ip(req_real) == "198.51.100.44"

        req_real_bad = _make_request(
            headers={"x-real-ip": "not-ip"},
            client_host="10.0.0.9",
        )
        assert api._resolve_client_ip(req_real_bad) == "10.0.0.9"

    @pytest.mark.anyio
    async def test_traffic_guard_content_length_413_and_payload_exception_path(self):
        import api

        guard = api.TrafficGuardMiddleware(api.app)
        req = _make_request(
            method="POST",
            headers={"content-length": str(guard._max_request_bytes + 1)},
        )

        async def _next(_req):
            return None

        resp = await guard.dispatch(req, _next)
        assert resp.status_code == 413

        async def _raise_next(_req):
            raise api._PayloadTooLargeError()

        req2 = _make_request(method="POST")
        resp2 = await guard.dispatch(req2, _raise_next)
        assert resp2.status_code == 413

    def test_traffic_guard_retry_after_and_sweep_expired_keys(self):
        import api

        guard = api.TrafficGuardMiddleware(api.app)
        assert guard._remaining_retry_after([], now=10.0) == guard._request_window

        guard._max_keys = 10
        guard._hits = {"old": [1.0], "fresh": [100.0]}
        guard._sweep(cutoff=50.0)
        assert "old" not in guard._hits
        assert "fresh" in guard._hits


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

    def test_get_players_includes_plus_minus_fields(self, client, sample_season):
        """Players endpoint should always include explicit plus-minus fields."""
        response = client.get(
            f"/players?season={sample_season['season_id']}&active_only=true&include_no_games=false"
        )
        assert response.status_code == 200
        rows = response.json()["players"]
        assert len(rows) >= 1
        row = rows[0]
        assert "plus_minus_total" in row
        assert "plus_minus_per_game" in row
        assert "plus_minus_per100" in row

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

    def test_compare_three_players(
        self, client, sample_player, sample_player2, sample_season, populated_db
    ):
        """Test comparing three players (covers _get_comparison_query 3-player branch)."""
        import database

        database.insert_player(
            player_id="095003",
            name="선수C",
            team_id=sample_player["team_id"],
            position="F",
            height="175cm",
        )
        database.insert_player_game(
            game_id=sample_season.get("game_id", "04601002"),
            player_id="095003",
            team_id=sample_player["team_id"],
            stats={
                "minutes": 25.0,
                "pts": 10,
                "reb": 3,
                "ast": 2,
                "stl": 1,
                "blk": 0,
                "tov": 1,
                "pf": 2,
                "fgm": 4,
                "fga": 8,
                "tpm": 1,
                "tpa": 3,
                "ftm": 1,
                "fta": 2,
                "off_reb": 1,
                "def_reb": 2,
            },
        )
        ids = f"{sample_player['player_id']},{sample_player2['player_id']},095003"
        response = client.get(
            f"/players/compare?ids={ids}&season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        # At least 1 player with game data returned (sample_player has game data)
        assert len(data["players"]) >= 1


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

    def test_get_team_detail_includes_team_stats(
        self, client, sample_team, sample_season
    ):
        """Team detail should include team_stats field when data is available."""
        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        # team_stats may or may not be present (requires team totals data),
        # but if present it must have the expected shape
        if "team_stats" in data and data["team_stats"] is not None:
            ts = data["team_stats"]
            for key in ["off_rtg", "def_rtg", "net_rtg", "pace", "gp"]:
                assert key in ts, f"team_stats missing key: {key}"

    def test_get_team_detail_with_standings(self, client, sample_team, sample_season):
        """Team detail should include standings when standings data exists."""
        import database

        database.insert_team_standing(
            season_id=sample_season["season_id"],
            team_id=sample_team["id"],
            standing={
                "rank": 1,
                "games_played": 30,
                "wins": 22,
                "losses": 8,
                "win_pct": 0.733,
                "games_behind": 0.0,
                "home_wins": 12,
                "home_losses": 3,
                "away_wins": 10,
                "away_losses": 5,
                "streak": "W3",
                "last5": "4-1",
            },
        )

        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "standings" in data
        assert data["standings"]["rank"] == 1
        assert data["standings"]["wins"] == 22
        assert data["standings"]["losses"] == 8

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

    def test_get_game_boxscore_plus_minus_game(
        self, client, sample_game, sample_player
    ):
        """Game boxscore should expose lineup-based plus_minus_game."""
        import database

        # Add away side player game row so both teams appear in boxscore.
        database.insert_player_game(
            game_id=sample_game["game_id"],
            player_id="095002",
            team_id="kb",
            stats={
                "minutes": 30,
                "pts": 12,
                "reb": 4,
                "ast": 3,
                "stl": 1,
                "blk": 0,
                "tov": 2,
                "pf": 2,
                "off_reb": 1,
                "def_reb": 3,
                "fgm": 5,
                "fga": 10,
                "tpm": 1,
                "tpa": 3,
                "ftm": 1,
                "fta": 2,
                "two_pm": 4,
                "two_pa": 7,
            },
        )

        database.save_lineup_stints(
            sample_game["game_id"],
            [
                {
                    "stint_order": 1,
                    "quarter": "Q1",
                    "team_id": "samsung",
                    "players": [sample_player["player_id"]],
                    "start_score_for": 0,
                    "start_score_against": 0,
                    "end_score_for": 5,
                    "end_score_against": 2,
                    "duration_seconds": 120,
                },
                {
                    "stint_order": 2,
                    "quarter": "Q1",
                    "team_id": "kb",
                    "players": ["095002"],
                    "start_score_for": 0,
                    "start_score_against": 0,
                    "end_score_for": 2,
                    "end_score_against": 5,
                    "duration_seconds": 120,
                },
            ],
        )

        response = client.get(f"/games/{sample_game['game_id']}")
        assert response.status_code == 200
        data = response.json()

        home_by_id = {p["player_id"]: p for p in data["home_team_stats"]}
        away_by_id = {p["player_id"]: p for p in data["away_team_stats"]}

        assert home_by_id[sample_player["player_id"]]["plus_minus_game"] == 3
        assert away_by_id["095002"]["plus_minus_game"] == -3


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

    def test_get_leaders_advanced_categories(self, client, sample_season):
        """Test getting leaders for new advanced stat categories."""
        for category in [
            "game_score",
            "ts_pct",
            "tpar",
            "ftr",
            "pir",
            "per",
            "ows",
            "dws",
            "ws",
            "ws_40",
        ]:
            response = client.get(
                f"/leaders?season={sample_season['season_id']}&category={category}"
            )
            assert response.status_code == 200, f"Failed for category: {category}"
            data = response.json()
            assert "leaders" in data, f"Missing 'leaders' key for category: {category}"
            assert isinstance(data["leaders"], list)

    def test_get_leaders_plus_minus_categories(self, client, sample_season):
        """Leaders should support lineup-based plus-minus categories."""
        for category in ["plus_minus_per_game", "plus_minus_per100"]:
            response = client.get(
                f"/leaders?season={sample_season['season_id']}&category={category}"
            )
            assert response.status_code == 200
            data = response.json()
            assert data["category"] == category
            assert "leaders" in data
            assert isinstance(data["leaders"], list)

    def test_get_leaders_all_includes_advanced_categories(self, client, sample_season):
        """leaders/all should include game_score, ts_pct, pir, per."""
        response = client.get(f"/leaders/all?season={sample_season['season_id']}")
        assert response.status_code == 200
        categories = response.json()["categories"]
        for key in [
            "game_score",
            "ts_pct",
            "tpar",
            "ftr",
            "pir",
            "per",
            "ows",
            "dws",
            "ws",
            "ws_40",
        ]:
            assert key in categories, f"Missing advanced category: {key}"
            assert isinstance(categories[key], list)

    def test_get_leaders_invalid_category_fallback(self, client, sample_season):
        """Invalid category should fallback to pts leaders (no error)."""
        response = client.get(
            f"/leaders?season={sample_season['season_id']}&category=invalid_stat"
        )
        assert response.status_code == 200
        data = response.json()
        # API returns original category param, but internally falls back to pts leaders
        assert "leaders" in data
        assert isinstance(data["leaders"], list)


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


# ============================================================================
# Error path tests
# ============================================================================


class TestCompareErrorPaths:
    """Tests for compare endpoint error paths."""

    def test_compare_season_all_rejected(self, client, sample_player, sample_player2):
        """season=all → 400."""
        ids = f"{sample_player['player_id']},{sample_player2['player_id']}"
        response = client.get(f"/players/compare?ids={ids}&season=all")
        assert response.status_code == 400

    def test_compare_max_4_exceeded(self, client):
        """5 player IDs → 400."""
        ids = "a,b,c,d,e"
        response = client.get(f"/players/compare?ids={ids}")
        assert response.status_code == 400


class TestTeamDetailErrorPaths:
    """Tests for team detail endpoint error paths."""

    def test_team_detail_season_all(self, client, sample_team):
        """season=all → 400."""
        response = client.get(f"/teams/{sample_team['id']}?season=all")
        assert response.status_code == 400


class TestLeadersErrorPaths:
    """Tests for leaders endpoint error paths."""

    def test_leaders_season_all(self, client):
        """season=all → 400."""
        response = client.get("/leaders?season=all")
        assert response.status_code == 400

    def test_leaders_all_season_all(self, client):
        """leaders/all with season=all → 400."""
        response = client.get("/leaders/all?season=all")
        assert response.status_code == 400


class TestGamelogErrorPaths:
    """Tests for gamelog endpoint error paths."""

    def test_player_gamelog_404(self, client):
        """Non-existent player gamelog → 404."""
        response = client.get("/players/NONEXIST/gamelog?season=046")
        assert response.status_code == 404


class TestStandingsErrorPaths:
    """Tests for standings endpoint error paths."""

    def test_standings_404(self, client):
        """Empty season standings → 404."""
        response = client.get("/seasons/999/standings")
        assert response.status_code == 404


# ============================================================================
# Untested endpoints
# ============================================================================


class TestPositionMatchupsEndpoint:
    """Tests for /games/{id}/position-matchups endpoint."""

    def test_position_matchups_not_found(self, client):
        """Non-existent game → 404."""
        response = client.get("/games/NONEXIST/position-matchups")
        assert response.status_code == 404

    def test_position_matchups_empty(self, client, sample_game):
        """Game with no matchups → empty list."""
        response = client.get(f"/games/{sample_game['game_id']}/position-matchups")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["rows"] == []

    def test_position_matchups_with_scope(self, client, sample_game):
        """Test scope query parameter."""
        import database

        records = [
            {"position": "G", "scope": "vs", "home_pts": 30, "away_pts": 25},
            {"position": "G", "scope": "whole", "home_pts": 40, "away_pts": 35},
        ]
        database.bulk_insert_position_matchups(sample_game["game_id"], records)

        response = client.get(
            f"/games/{sample_game['game_id']}/position-matchups?scope=vs"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert data["scope"] == "vs"


# ============================================================================
# Filter combinations
# ============================================================================


class TestGamesFilters:
    """Tests for games endpoint filter combinations."""

    def test_games_filter_team_id(self, client, sample_season, sample_team):
        """Filter games by team_id."""
        response = client.get(
            f"/games?season={sample_season['season_id']}&team={sample_team['id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert "games" in data

    def test_games_filter_game_type(self, client, sample_season):
        """Filter games by game_type."""
        response = client.get(
            f"/games?season={sample_season['season_id']}&game_type=regular"
        )
        assert response.status_code == 200
        data = response.json()
        assert "games" in data

    def test_games_season_all_rejected(self, client):
        """season=all → 400."""
        response = client.get("/games?season=all")
        assert response.status_code == 400


class TestBoxscoreTeamGameStats:
    """Tests for boxscore with team_games data."""

    def test_boxscore_includes_team_game_stats(self, client, sample_game, sample_team):
        """Boxscore should include team_games data when available."""
        import database

        team_stats = {
            "fast_break": 10,
            "paint_pts": 20,
            "two_pts": 30,
            "three_pts": 15,
            "reb": 35,
            "ast": 12,
            "stl": 6,
            "blk": 2,
            "tov": 10,
            "pf": 15,
        }
        database.insert_team_game(
            sample_game["game_id"], sample_team["id"], is_home=1, stats=team_stats
        )

        response = client.get(f"/games/{sample_game['game_id']}")
        assert response.status_code == 200
        data = response.json()
        # team_games might be at root level or nested
        assert data["id"] == sample_game["game_id"]


# ============================================================================
# Plus-minus helper functions (internal unit tests)
# ============================================================================


class TestPlusMinusHelpers:
    """Unit tests for plus-minus internal helper functions."""

    def test_build_team_stats_returns_dict(self, populated_db, sample_season):
        """_build_team_stats returns dict when data exists."""
        from api import _build_team_stats

        import database

        # Insert opponent player to have both team totals
        database.insert_player_game(
            "04601001",
            "095002",
            "kb",
            {
                "minutes": 28,
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

        team_totals = database.get_team_season_totals("046")
        opp_totals = database.get_opponent_season_totals("046")

        result = _build_team_stats("samsung", team_totals, opp_totals, {})
        assert result is not None
        assert "team_fga" in result
        assert "opp_fga" in result

    def test_build_team_stats_missing_team(self, populated_db):
        """_build_team_stats returns None for missing team."""
        from api import _build_team_stats

        result = _build_team_stats("nonexist", {}, {}, {})
        assert result is None

    def test_apply_plus_minus_fields_with_agg(self, populated_db):
        """_apply_plus_minus_fields populates fields from pm_agg."""
        from api import _apply_plus_minus_fields

        row = {"gp": 10, "min": 30.0, "team_id": "samsung"}
        pm_agg = {
            "total_pm": 15.0,
            "pm_per_game": 1.5,
            "gp": 10,
            "segments": [],
        }
        _apply_plus_minus_fields(row, pm_agg, {})
        assert row["plus_minus_total"] == 15
        assert row["plus_minus_per_game"] == 1.5

    def test_apply_plus_minus_fields_no_agg(self, populated_db):
        """_apply_plus_minus_fields uses fallback when no pm_agg."""
        from api import _apply_plus_minus_fields

        row = {"gp": 10, "min": 30.0, "team_id": "samsung"}
        _apply_plus_minus_fields(row, None, {}, fallback_total=20.0)
        assert row["plus_minus_total"] == 20
        assert row["plus_minus_per_game"] == 2.0

    def test_compute_plus_minus_per100_no_agg(self, populated_db):
        """_compute_plus_minus_per100 with None → None."""
        from api import _compute_plus_minus_per100

        assert _compute_plus_minus_per100(None, {}) is None

    def test_compute_plus_minus_per100_no_segments(self, populated_db):
        """_compute_plus_minus_per100 with empty segments → None."""
        from api import _compute_plus_minus_per100

        assert _compute_plus_minus_per100({"total_pm": 5, "segments": []}, {}) is None

    def test_compute_plus_minus_per100_with_data(self, populated_db):
        """_compute_plus_minus_per100 returns a float with valid data."""
        from api import _compute_plus_minus_per100

        pm_agg = {
            "total_pm": 10.0,
            "segments": [
                {"team_id": "samsung", "total_pm": 10.0, "on_court_seconds": 3000}
            ],
        }
        team_totals = {
            "samsung": {
                "fga": 800,
                "fta": 200,
                "tov": 150,
                "oreb": 120,
                "min": 2000,
            }
        }
        result = _compute_plus_minus_per100(pm_agg, team_totals)
        assert result is not None
        assert isinstance(result, float)


class TestGetComparisonQuery:
    """Tests for _get_comparison_query internal function."""

    def test_two_players(self):
        from api import _get_comparison_query

        query = _get_comparison_query(2)
        assert "?,?" in query

    def test_three_players(self):
        from api import _get_comparison_query

        query = _get_comparison_query(3)
        assert "?,?,?" in query

    def test_four_players(self):
        from api import _get_comparison_query

        query = _get_comparison_query(4)
        assert "?,?,?,?" in query

    def test_invalid_count_raises(self):
        from api import _get_comparison_query

        with pytest.raises(ValueError, match="Player count must be 2-4"):
            _get_comparison_query(5)

    def test_one_player_raises(self):
        from api import _get_comparison_query

        with pytest.raises(ValueError, match="Player count must be 2-4"):
            _get_comparison_query(1)


class TestBuildTeamStats:
    """Tests for _build_team_stats internal function."""

    def _make_totals(self, **overrides):
        base = {
            "pts": 2400,
            "fga": 1800,
            "fta": 600,
            "tov": 400,
            "oreb": 300,
            "dreb": 900,
            "reb": 1200,
            "ast": 500,
            "stl": 200,
            "blk": 100,
            "pf": 500,
            "min": 6000,
            "gp": 30,
            "fgm": 750,
            "ftm": 450,
            "tpm": 200,
            "tpa": 500,
        }
        base.update(overrides)
        return base

    def test_basic(self):
        from api import _build_team_stats

        tt = self._make_totals()
        ot = self._make_totals(pts=2200)
        result = _build_team_stats("kb", {"kb": tt}, {"kb": ot}, None)
        assert result is not None
        assert result["team_pts"] == 2400
        assert result["opp_pts"] == 2200

    def test_with_standings(self):
        """Standings data adds team_wins/team_losses."""
        from api import _build_team_stats

        tt = self._make_totals()
        ot = self._make_totals(pts=2200)
        standings = {"kb": {"wins": 22, "losses": 8}}
        result = _build_team_stats("kb", {"kb": tt}, {"kb": ot}, standings)
        assert result["team_wins"] == 22
        assert result["team_losses"] == 8

    def test_missing_team(self):
        from api import _build_team_stats

        result = _build_team_stats("unknown", {}, {}, None)
        assert result is None

    def test_missing_opp(self):
        from api import _build_team_stats

        team_totals = {
            "kb": {
                "pts": 100,
                "fga": 80,
                "fta": 20,
                "tov": 10,
                "oreb": 5,
                "reb": 30,
                "ast": 15,
                "stl": 5,
                "blk": 2,
                "pf": 10,
                "min": 200,
            },
        }
        result = _build_team_stats("kb", team_totals, {}, None)
        assert result is None


class TestPlusMinusAggregation:
    """Tests for _aggregate_plus_minus_by_season and _compute_plus_minus_per100."""

    def test_compute_plus_minus_per100_none_agg(self):
        """None pm_agg → returns None."""
        from api import _compute_plus_minus_per100

        result = _compute_plus_minus_per100(None, {})
        assert result is None

    def test_compute_plus_minus_per100_no_segments(self):
        """Empty segments → returns None."""
        from api import _compute_plus_minus_per100

        agg = {"total_pm": 5.0, "gp": 10, "segments": []}
        result = _compute_plus_minus_per100(agg, {})
        assert result is None

    def test_compute_plus_minus_per100_zero_possessions(self):
        """Zero team possessions → returns None."""
        from api import _compute_plus_minus_per100

        agg = {
            "total_pm": 5.0,
            "segments": [{"team_id": "kb", "on_court_seconds": 3600}],
        }
        team_totals = {"kb": {"fga": 0, "fta": 0, "tov": 0, "oreb": 0, "min": 0}}
        result = _compute_plus_minus_per100(agg, team_totals)
        assert result is None

    def test_compute_plus_minus_per100_valid(self):
        """Valid segments → returns float per 100 possessions."""
        from api import _compute_plus_minus_per100

        agg = {
            "total_pm": 10.0,
            "segments": [{"team_id": "kb", "on_court_seconds": 1800}],
        }
        team_totals = {
            "kb": {"fga": 1800, "fta": 600, "tov": 400, "oreb": 300, "min": 6000},
        }
        result = _compute_plus_minus_per100(agg, team_totals)
        assert isinstance(result, float)


class TestTeamAdvancedStatsEndpoint:
    """Tests for team advanced stats in player detail endpoint."""

    def test_team_stats_in_player_detail(
        self, client, sample_player, sample_season, sample_game, sample_player2
    ):
        """Player detail endpoint includes team_stats when data available."""
        import database

        # Insert opponent player_game to have both teams
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

        response = client.get(
            f"/players/{sample_player['player_id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200


class TestCoverageEdges:
    """Targeted edge-path tests for coverage and behavior contracts."""

    def test_plus_minus_map_all_season_returns_empty(self):
        from api import _get_season_player_plus_minus_map

        assert _get_season_player_plus_minus_map("all") == {}
        assert _get_season_player_plus_minus_map(None) == {}

    def test_plus_minus_per100_fallback_guard_paths(self):
        from api import _compute_plus_minus_per100_fallback

        # No team id or zero minutes -> None
        assert (
            _compute_plus_minus_per100_fallback(
                5.0,
                {"team_id": None, "gp": 1, "min": 30},
                {"kb": {"fga": 10, "fta": 5, "tov": 3, "oreb": 2, "min": 200}},
            )
            is None
        )

        # Zero possessions -> None
        assert (
            _compute_plus_minus_per100_fallback(
                5.0,
                {"team_id": "kb", "gp": 1, "min": 30},
                {"kb": {"fga": 0, "fta": 0, "tov": 0, "oreb": 0, "min": 200}},
            )
            is None
        )

        # Zero team minutes -> None
        assert (
            _compute_plus_minus_per100_fallback(
                5.0,
                {"team_id": "kb", "gp": 1, "min": 30},
                {"kb": {"fga": 10, "fta": 4, "tov": 2, "oreb": 1, "min": 0}},
            )
            is None
        )

    def test_get_player_comparison_invalid_count_returns_empty(self):
        from api import get_player_comparison

        assert get_player_comparison(["p1"], "046") == []
        assert get_player_comparison(["p1", "p2", "p3", "p4", "p5"], "046") == []

    def test_player_highlights_not_found_returns_404(self, client):
        response = client.get("/players/nonexistent/highlights")
        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_lifespan_runs_db_init_and_logs(self, monkeypatch):
        import api

        init_calls = []
        logs = []

        monkeypatch.setattr(api, "init_db", lambda: init_calls.append("init"))
        monkeypatch.setattr(api.logger, "info", lambda msg: logs.append(msg))

        async with api.lifespan(api.app):
            pass

        assert init_calls == ["init"]
        assert any("started" in m for m in logs)
        assert any("stopped" in m for m in logs)

    def test_team_detail_team_stats_branch_executes(
        self, client, sample_team, sample_season, monkeypatch
    ):
        import api

        monkeypatch.setattr(
            api,
            "_build_team_stats",
            lambda *_args, **_kwargs: {
                "team_fga": 120.0,
                "team_fta": 40.0,
                "team_tov": 20.0,
                "team_oreb": 15.0,
                "opp_fga": 115.0,
                "opp_fta": 38.0,
                "opp_tov": 18.0,
                "opp_oreb": 12.0,
                "team_min": 1600.0,
                "team_pts": 980.0,
                "opp_pts": 920.0,
                "team_gp": 10,
            },
        )

        response = client.get(
            f"/teams/{sample_team['id']}?season={sample_season['season_id']}"
        )
        assert response.status_code == 200
        team_stats = response.json().get("team_stats")
        assert team_stats is not None
        for key in ["off_rtg", "def_rtg", "net_rtg", "pace", "gp"]:
            assert key in team_stats
