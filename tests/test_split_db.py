"""Tests for tools/split_db.py — database splitting logic."""

import os
import sqlite3

import pytest

# RED: 이 import는 모듈이 없으므로 실패해야 함
from tools.split_db import DETAIL_TABLES, split_database


@pytest.fixture()
def sample_db(tmp_path):
    """Create a sample database with core and detail tables."""
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    # Core tables
    conn.execute("CREATE TABLE seasons (id TEXT PRIMARY KEY, label TEXT)")
    conn.execute("INSERT INTO seasons VALUES ('046', '2025-26')")
    conn.execute("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO teams VALUES ('kb', 'KB스타즈')")
    conn.execute("CREATE TABLE players (id TEXT PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO players VALUES ('001', '선수A')")
    conn.execute("INSERT INTO players VALUES ('002', '선수B')")
    conn.execute("CREATE TABLE games (id TEXT PRIMARY KEY, season_id TEXT, date TEXT)")
    conn.execute("INSERT INTO games VALUES ('04601001', '046', '20250101')")
    conn.execute(
        "CREATE TABLE player_games (game_id TEXT, player_id TEXT, pts INTEGER)"
    )
    conn.execute("INSERT INTO player_games VALUES ('04601001', '001', 20)")
    conn.execute("INSERT INTO player_games VALUES ('04601001', '002', 15)")
    conn.execute("CREATE TABLE event_types (code TEXT PRIMARY KEY, name TEXT)")
    conn.execute("INSERT INTO event_types VALUES ('P2', '2점 성공')")

    # Detail tables (large per-event data)
    conn.execute(
        "CREATE TABLE play_by_play (id INTEGER PRIMARY KEY, game_id TEXT, event TEXT)"
    )
    for i in range(100):
        conn.execute("INSERT INTO play_by_play VALUES (?, '04601001', 'event')", (i,))
    conn.execute(
        "CREATE TABLE shot_charts (id INTEGER PRIMARY KEY, game_id TEXT, x REAL, y REAL)"
    )
    for i in range(50):
        conn.execute("INSERT INTO shot_charts VALUES (?, '04601001', 1.0, 2.0)", (i,))
    conn.execute(
        "CREATE TABLE lineup_stints (id INTEGER PRIMARY KEY, game_id TEXT, quarter INTEGER)"
    )
    for i in range(30):
        conn.execute("INSERT INTO lineup_stints VALUES (?, '04601001', 1)", (i,))
    conn.execute(
        "CREATE TABLE position_matchups (id INTEGER PRIMARY KEY, game_id TEXT)"
    )
    conn.execute("INSERT INTO position_matchups VALUES (1, '04601001')")

    conn.commit()
    conn.close()
    return db_path


def _get_tables(db_path):
    """Get all table names from a database."""
    conn = sqlite3.connect(db_path)
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    return tables


def _count_rows(db_path, table):
    """Count rows in a table."""
    conn = sqlite3.connect(db_path)
    cursor = conn.execute(f"SELECT COUNT(*) FROM [{table}]")  # noqa: S608
    count = cursor.fetchone()[0]
    conn.close()
    return count


class TestSplitDatabase:
    def test_core_has_essential_tables(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        tables = _get_tables(core)
        for t in [
            "seasons",
            "teams",
            "players",
            "games",
            "player_games",
            "event_types",
        ]:
            assert t in tables, f"Core DB missing table: {t}"

    def test_core_excludes_detail_tables(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        tables = _get_tables(core)
        for t in DETAIL_TABLES:
            assert t not in tables, f"Core DB should not have: {t}"

    def test_detail_has_only_detail_tables(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        tables = _get_tables(detail)
        for t in tables:
            assert t in DETAIL_TABLES, f"Detail DB has unexpected table: {t}"

    def test_detail_has_all_detail_tables(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        tables = _get_tables(detail)
        for t in DETAIL_TABLES:
            assert t in tables, f"Detail DB missing table: {t}"

    def test_source_unmodified(self, sample_db, tmp_path):
        original_size = os.path.getsize(sample_db)
        original_tables = _get_tables(sample_db)

        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        assert os.path.getsize(sample_db) == original_size
        assert _get_tables(sample_db) == original_tables

    def test_row_counts_preserved(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        # Core tables
        assert _count_rows(core, "seasons") == 1
        assert _count_rows(core, "teams") == 1
        assert _count_rows(core, "players") == 2
        assert _count_rows(core, "games") == 1
        assert _count_rows(core, "player_games") == 2

        # Detail tables
        assert _count_rows(detail, "play_by_play") == 100
        assert _count_rows(detail, "shot_charts") == 50
        assert _count_rows(detail, "lineup_stints") == 30
        assert _count_rows(detail, "position_matchups") == 1

    def test_returns_table_lists_and_sizes(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        result = split_database(sample_db, core, detail)

        assert "core_tables" in result
        assert "detail_tables" in result
        assert "core_size" in result
        assert "detail_size" in result
        assert len(result["core_tables"]) == 6
        assert len(result["detail_tables"]) == 4
        assert result["core_size"] > 0
        assert result["detail_size"] > 0

    def test_core_smaller_than_source(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        split_database(sample_db, core, detail)

        src_size = os.path.getsize(sample_db)
        core_size = os.path.getsize(core)
        assert core_size < src_size

    def test_source_not_found_raises(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            split_database(
                str(tmp_path / "nonexistent.db"),
                str(tmp_path / "core.db"),
                str(tmp_path / "detail.db"),
            )

    def test_overwrites_existing_output(self, sample_db, tmp_path):
        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")

        # Create dummy files
        with open(core, "w") as f:
            f.write("dummy")
        with open(detail, "w") as f:
            f.write("dummy")

        split_database(sample_db, core, detail)

        # Should be valid databases now
        assert len(_get_tables(core)) > 0
        assert len(_get_tables(detail)) > 0

    def test_db_without_detail_tables(self, tmp_path):
        """Source DB with no detail tables — detail DB should be empty."""
        db_path = str(tmp_path / "small.db")
        conn = sqlite3.connect(db_path)
        conn.execute("CREATE TABLE seasons (id TEXT)")
        conn.execute("INSERT INTO seasons VALUES ('046')")
        conn.commit()
        conn.close()

        core = str(tmp_path / "core.db")
        detail = str(tmp_path / "detail.db")
        result = split_database(db_path, core, detail)

        assert result["core_tables"] == ["seasons"]
        assert result["detail_tables"] == []
        assert _get_tables(detail) == []
