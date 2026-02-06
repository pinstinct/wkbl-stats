"""
Shared pytest fixtures for WKBL Stats tests.
"""

import sys
import tempfile
from pathlib import Path
from typing import Generator

import pytest

# Add tools directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


@pytest.fixture
def temp_db_path() -> Generator[Path, None, None]:
    """Create a temporary database file for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        temp_path = Path(f.name)
    yield temp_path
    # Cleanup
    if temp_path.exists():
        temp_path.unlink()


@pytest.fixture
def test_db(temp_db_path: Path, monkeypatch) -> Generator[Path, None, None]:
    """Initialize a test database with schema."""
    # Patch DB_PATH in database module
    import database

    monkeypatch.setattr(database, "DB_PATH", temp_db_path)

    # Initialize the database
    database.init_db()

    yield temp_db_path


@pytest.fixture
def sample_season():
    """Sample season data."""
    return {
        "season_id": "046",
        "label": "2025-26",
        "start_date": "2025-10-18",
        "end_date": "2026-03-15",
    }


@pytest.fixture
def sample_team():
    """Sample team data."""
    return {
        "id": "samsung",
        "name": "삼성생명",
        "short_name": "삼성",
    }


@pytest.fixture
def sample_team2():
    """Another sample team data."""
    return {
        "id": "kb",
        "name": "KB스타즈",
        "short_name": "KB",
    }


@pytest.fixture
def sample_player():
    """Sample player data."""
    return {
        "player_id": "095001",
        "name": "테스트선수",
        "team_id": "samsung",
        "position": "G",
        "height": "175cm",
        "birth_date": "1995-01-15",
        "is_active": 1,
    }


@pytest.fixture
def sample_player2():
    """Another sample player data."""
    return {
        "player_id": "095002",
        "name": "테스트선수2",
        "team_id": "kb",
        "position": "F",
        "height": "180cm",
        "birth_date": "1998-05-20",
        "is_active": 1,
    }


@pytest.fixture
def sample_game(sample_season, sample_team, sample_team2):
    """Sample game data."""
    return {
        "game_id": "04601001",
        "season_id": sample_season["season_id"],
        "game_date": "2025-10-18",
        "home_team_id": sample_team["id"],
        "away_team_id": sample_team2["id"],
        "home_score": 75,
        "away_score": 68,
        "game_type": "regular",
    }


@pytest.fixture
def sample_player_game(sample_game, sample_player, sample_team):
    """Sample player game stats."""
    return {
        "game_id": sample_game["game_id"],
        "player_id": sample_player["player_id"],
        "team_id": sample_team["id"],
        "stats": {
            "minutes": 32.5,
            "pts": 18,
            "reb": 5,
            "ast": 4,
            "stl": 2,
            "blk": 1,
            "tov": 3,
            "pf": 2,
            "off_reb": 1,
            "def_reb": 4,
            "fgm": 7,
            "fga": 14,
            "tpm": 2,
            "tpa": 5,
            "ftm": 2,
            "fta": 3,
            "two_pm": 5,
            "two_pa": 9,
        },
    }


@pytest.fixture
def populated_db(
    test_db,
    sample_season,
    sample_team,
    sample_team2,
    sample_player,
    sample_player2,
    sample_game,
    sample_player_game,
):
    """Database with sample data inserted."""
    import database

    # Insert season first
    database.insert_season(**sample_season)

    # Insert teams
    with database.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team["id"], sample_team["name"], sample_team["short_name"]),
        )
        cursor.execute(
            "INSERT OR REPLACE INTO teams (id, name, short_name) VALUES (?, ?, ?)",
            (sample_team2["id"], sample_team2["name"], sample_team2["short_name"]),
        )
        conn.commit()

    # Insert players
    database.insert_player(**sample_player)
    database.insert_player(**sample_player2)

    # Insert game
    database.insert_game(**sample_game)

    # Insert player game stats
    database.insert_player_game(**sample_player_game)

    yield test_db
