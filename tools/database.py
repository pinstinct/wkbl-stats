"""
WKBL Stats Database Module

SQLite database schema and operations for storing game-by-game player statistics.
"""

import sqlite3
import logging
from pathlib import Path
from contextlib import contextmanager
from typing import Optional, List, Dict, Any

from config import DB_PATH, setup_logging

logger = setup_logging(__name__)

SCHEMA = """
-- 시즌 테이블
CREATE TABLE IF NOT EXISTS seasons (
    id TEXT PRIMARY KEY,           -- 예: '046' (WKBL 시즌 코드)
    label TEXT NOT NULL,           -- 예: '2025-26'
    start_date TEXT,               -- YYYY-MM-DD
    end_date TEXT,                 -- YYYY-MM-DD
    is_playoff INTEGER DEFAULT 0   -- 0: 정규시즌, 1: 플레이오프
);

-- 팀 테이블
CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,           -- 예: 'samsung', 'shinhan'
    name TEXT NOT NULL,            -- 예: '삼성생명'
    short_name TEXT,               -- 예: '삼성'
    logo_url TEXT,
    founded_year INTEGER
);

-- 선수 테이블
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,           -- WKBL pno
    name TEXT NOT NULL,
    birth_date TEXT,               -- YYYY-MM-DD
    height TEXT,                   -- 예: '175cm'
    position TEXT,                 -- G, F, C
    team_id TEXT,                  -- 현재 소속팀
    is_active INTEGER DEFAULT 1,   -- 1: 현역, 0: 은퇴
    FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- 경기 테이블
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,           -- WKBL game_id (예: '04601055')
    season_id TEXT NOT NULL,
    game_date TEXT NOT NULL,       -- YYYY-MM-DD
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    game_type TEXT DEFAULT 'regular',  -- regular, playoff, final
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (home_team_id) REFERENCES teams(id),
    FOREIGN KEY (away_team_id) REFERENCES teams(id)
);

-- 경기별 선수 기록 테이블 (핵심)
CREATE TABLE IF NOT EXISTS player_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    team_id TEXT NOT NULL,

    -- 출전 시간
    minutes REAL DEFAULT 0,        -- 분 단위 (예: 32.5)

    -- 기본 스탯
    pts INTEGER DEFAULT 0,         -- 득점
    off_reb INTEGER DEFAULT 0,     -- 공격 리바운드
    def_reb INTEGER DEFAULT 0,     -- 수비 리바운드
    reb INTEGER DEFAULT 0,         -- 총 리바운드
    ast INTEGER DEFAULT 0,         -- 어시스트
    stl INTEGER DEFAULT 0,         -- 스틸
    blk INTEGER DEFAULT 0,         -- 블록
    tov INTEGER DEFAULT 0,         -- 턴오버
    pf INTEGER DEFAULT 0,          -- 파울

    -- 슈팅 스탯
    fgm INTEGER DEFAULT 0,         -- 야투 성공 (2점 + 3점)
    fga INTEGER DEFAULT 0,         -- 야투 시도
    tpm INTEGER DEFAULT 0,         -- 3점슛 성공
    tpa INTEGER DEFAULT 0,         -- 3점슛 시도
    ftm INTEGER DEFAULT 0,         -- 자유투 성공
    fta INTEGER DEFAULT 0,         -- 자유투 시도

    -- 2점슛 (계산용)
    two_pm INTEGER DEFAULT 0,      -- 2점슛 성공
    two_pa INTEGER DEFAULT 0,      -- 2점슛 시도

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (game_id, player_id)
);

-- 팀별 경기 기록 테이블
CREATE TABLE IF NOT EXISTS team_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    is_home INTEGER NOT NULL,      -- 1: 홈, 0: 원정

    -- 득점 세부
    fast_break_pts INTEGER DEFAULT 0,   -- 속공 득점
    paint_pts INTEGER DEFAULT 0,        -- 페인트존 득점

    -- 슈팅
    two_pm INTEGER DEFAULT 0,
    two_pa INTEGER DEFAULT 0,
    tpm INTEGER DEFAULT 0,
    tpa INTEGER DEFAULT 0,
    ftm INTEGER DEFAULT 0,
    fta INTEGER DEFAULT 0,

    -- 기타 스탯
    reb INTEGER DEFAULT 0,
    ast INTEGER DEFAULT 0,
    stl INTEGER DEFAULT 0,
    blk INTEGER DEFAULT 0,
    tov INTEGER DEFAULT 0,
    pf INTEGER DEFAULT 0,

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (game_id, team_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_player_games_game ON player_games(game_id);
CREATE INDEX IF NOT EXISTS idx_player_games_player ON player_games(player_id);
CREATE INDEX IF NOT EXISTS idx_player_games_team ON player_games(team_id);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season_id);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_team_games_game ON team_games(game_id);
"""

# WKBL 팀 마스터 데이터
TEAMS_DATA = [
    ("samsung", "삼성생명", "삼성", None, 1967),
    ("shinhan", "신한은행", "신한", None, 1958),
    ("kb", "KB스타즈", "KB", None, 1958),
    ("woori", "우리은행", "우리", None, 1958),
    ("hana", "하나원큐", "하나", None, 1967),
    ("bnk", "BNK썸", "BNK", None, 2014),
]


@contextmanager
def get_connection():
    """Database connection context manager."""
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        yield conn
    finally:
        if conn:
            conn.close()


def init_db():
    """Initialize database with schema and master data."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.executescript(SCHEMA)

        # Insert teams master data
        cursor.executemany(
            """INSERT OR IGNORE INTO teams (id, name, short_name, logo_url, founded_year)
               VALUES (?, ?, ?, ?, ?)""",
            TEAMS_DATA
        )

        conn.commit()
        logger.info(f"Database initialized at {DB_PATH}")


def insert_season(season_id: str, label: str, start_date: str = None,
                  end_date: str = None, is_playoff: int = 0):
    """Insert or update a season."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO seasons (id, label, start_date, end_date, is_playoff)
               VALUES (?, ?, ?, ?, ?)""",
            (season_id, label, start_date, end_date, is_playoff)
        )
        conn.commit()


def insert_player(player_id: str, name: str, team_id: str = None,
                  position: str = None, height: str = None,
                  birth_date: str = None, is_active: int = 1):
    """Insert or update a player."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO players
               (id, name, team_id, position, height, birth_date, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (player_id, name, team_id, position, height, birth_date, is_active)
        )
        conn.commit()


def insert_game(game_id: str, season_id: str, game_date: str,
                home_team_id: str, away_team_id: str,
                home_score: int = None, away_score: int = None,
                game_type: str = "regular"):
    """Insert or update a game."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO games
               (id, season_id, game_date, home_team_id, away_team_id,
                home_score, away_score, game_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (game_id, season_id, game_date, home_team_id, away_team_id,
             home_score, away_score, game_type)
        )
        conn.commit()


def insert_player_game(game_id: str, player_id: str, team_id: str, stats: Dict[str, Any]):
    """Insert a player's game stats."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO player_games
               (game_id, player_id, team_id, minutes, pts, off_reb, def_reb, reb,
                ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta, two_pm, two_pa)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id, player_id, team_id,
                stats.get("minutes", 0),
                stats.get("pts", 0),
                stats.get("off_reb", 0),
                stats.get("def_reb", 0),
                stats.get("reb", 0),
                stats.get("ast", 0),
                stats.get("stl", 0),
                stats.get("blk", 0),
                stats.get("tov", 0),
                stats.get("pf", 0),
                stats.get("fgm", 0),
                stats.get("fga", 0),
                stats.get("tpm", 0),
                stats.get("tpa", 0),
                stats.get("ftm", 0),
                stats.get("fta", 0),
                stats.get("two_pm", 0),
                stats.get("two_pa", 0),
            )
        )
        conn.commit()


def bulk_insert_player_games(records: List[Dict[str, Any]]):
    """Bulk insert player game records."""
    with get_connection() as conn:
        conn.executemany(
            """INSERT OR REPLACE INTO player_games
               (game_id, player_id, team_id, minutes, pts, off_reb, def_reb, reb,
                ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta, two_pm, two_pa)
               VALUES (:game_id, :player_id, :team_id, :minutes, :pts, :off_reb,
                       :def_reb, :reb, :ast, :stl, :blk, :tov, :pf, :fgm, :fga,
                       :tpm, :tpa, :ftm, :fta, :two_pm, :two_pa)""",
            records
        )
        conn.commit()
        logger.info(f"Inserted {len(records)} player game records")


def insert_team_game(game_id: str, team_id: str, is_home: int, stats: Dict[str, Any]):
    """Insert a team's game stats."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO team_games
               (game_id, team_id, is_home, fast_break_pts, paint_pts,
                two_pm, two_pa, tpm, tpa, ftm, fta,
                reb, ast, stl, blk, tov, pf)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id, team_id, is_home,
                stats.get("fast_break", 0),
                stats.get("paint_pts", 0),
                stats.get("two_pm", 0),
                stats.get("two_pa", 0),
                stats.get("tpm", 0),
                stats.get("tpa", 0),
                stats.get("ftm", 0),
                stats.get("fta", 0),
                stats.get("reb", 0),
                stats.get("ast", 0),
                stats.get("stl", 0),
                stats.get("blk", 0),
                stats.get("tov", 0),
                stats.get("pf", 0),
            )
        )
        conn.commit()


def get_team_season_stats(team_id: str, season_id: str) -> Optional[Dict]:
    """Get aggregated season stats for a team."""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT
                t.name,
                COUNT(*) as games,
                AVG(tg.fast_break_pts) as fast_break_pts,
                AVG(tg.paint_pts) as paint_pts,
                AVG(tg.reb) as reb,
                AVG(tg.ast) as ast,
                AVG(tg.stl) as stl,
                AVG(tg.blk) as blk,
                AVG(tg.tov) as tov,
                AVG(tg.pf) as pf
            FROM team_games tg
            JOIN games g ON tg.game_id = g.id
            JOIN teams t ON tg.team_id = t.id
            WHERE tg.team_id = ? AND g.season_id = ?
            GROUP BY tg.team_id""",
            (team_id, season_id)
        ).fetchone()

        if row:
            return dict(row)
        return None


def get_player_season_stats(player_id: str, season_id: str) -> Optional[Dict]:
    """Get aggregated season stats for a player."""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT
                p.name,
                p.position,
                p.height,
                t.name as team,
                COUNT(*) as gp,
                AVG(pg.minutes) as min,
                AVG(pg.pts) as pts,
                AVG(pg.reb) as reb,
                AVG(pg.ast) as ast,
                AVG(pg.stl) as stl,
                AVG(pg.blk) as blk,
                AVG(pg.tov) as tov,
                SUM(pg.fgm) as total_fgm,
                SUM(pg.fga) as total_fga,
                SUM(pg.tpm) as total_tpm,
                SUM(pg.tpa) as total_tpa,
                SUM(pg.ftm) as total_ftm,
                SUM(pg.fta) as total_fta
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN players p ON pg.player_id = p.id
            JOIN teams t ON pg.team_id = t.id
            WHERE pg.player_id = ? AND g.season_id = ?
            GROUP BY pg.player_id""",
            (player_id, season_id)
        ).fetchone()

        if row:
            return dict(row)
        return None


def get_all_season_stats(season_id: str, active_only: bool = True) -> List[Dict]:
    """Get aggregated stats for all players in a season."""
    active_filter = "AND p.is_active = 1" if active_only else ""

    with get_connection() as conn:
        rows = conn.execute(
            f"""SELECT
                p.id,
                p.name,
                p.position as pos,
                p.height,
                t.name as team,
                COUNT(*) as gp,
                AVG(pg.minutes) as min,
                AVG(pg.pts) as pts,
                AVG(pg.reb) as reb,
                AVG(pg.ast) as ast,
                AVG(pg.stl) as stl,
                AVG(pg.blk) as blk,
                AVG(pg.tov) as tov,
                SUM(pg.fgm) as total_fgm,
                SUM(pg.fga) as total_fga,
                SUM(pg.tpm) as total_tpm,
                SUM(pg.tpa) as total_tpa,
                SUM(pg.ftm) as total_ftm,
                SUM(pg.fta) as total_fta,
                SUM(pg.pts) as total_pts,
                SUM(pg.minutes) as total_min
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN players p ON pg.player_id = p.id
            JOIN teams t ON pg.team_id = t.id
            WHERE g.season_id = ? {active_filter}
            GROUP BY pg.player_id
            ORDER BY AVG(pg.pts) DESC""",
            (season_id,)
        ).fetchall()

        return [dict(row) for row in rows]


def get_game_boxscore(game_id: str) -> Dict:
    """Get full boxscore for a game."""
    with get_connection() as conn:
        game = conn.execute(
            """SELECT g.*,
                      ht.name as home_team_name,
                      at.name as away_team_name
               FROM games g
               JOIN teams ht ON g.home_team_id = ht.id
               JOIN teams at ON g.away_team_id = at.id
               WHERE g.id = ?""",
            (game_id,)
        ).fetchone()

        if not game:
            return None

        players = conn.execute(
            """SELECT pg.*, p.name, p.position, t.name as team
               FROM player_games pg
               JOIN players p ON pg.player_id = p.id
               JOIN teams t ON pg.team_id = t.id
               WHERE pg.game_id = ?
               ORDER BY t.id, pg.minutes DESC""",
            (game_id,)
        ).fetchall()

        return {
            "game": dict(game),
            "players": [dict(p) for p in players]
        }


def get_games_in_season(season_id: str) -> List[Dict]:
    """Get all games in a season."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT g.*,
                      ht.name as home_team_name,
                      at.name as away_team_name
               FROM games g
               JOIN teams ht ON g.home_team_id = ht.id
               JOIN teams at ON g.away_team_id = at.id
               WHERE g.season_id = ?
               ORDER BY g.game_date""",
            (season_id,)
        ).fetchall()

        return [dict(row) for row in rows]


def get_existing_game_ids(season_id: str = None) -> set:
    """Get set of game IDs already in database.

    Args:
        season_id: Optional season filter. If None, returns all game IDs.

    Returns:
        Set of game_id strings that exist in the database.
    """
    with get_connection() as conn:
        if season_id:
            rows = conn.execute(
                "SELECT id FROM games WHERE season_id = ?",
                (season_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT id FROM games").fetchall()

        return {row["id"] for row in rows}


def get_last_game_date(season_id: str) -> Optional[str]:
    """Get the most recent game date in a season.

    Returns:
        Date string (YYYY-MM-DD) or None if no games exist.
    """
    with get_connection() as conn:
        row = conn.execute(
            """SELECT MAX(game_date) as last_date
               FROM games
               WHERE season_id = ?""",
            (season_id,)
        ).fetchone()

        return row["last_date"] if row and row["last_date"] else None


if __name__ == "__main__":
    # Initialize database when run directly
    init_db()
    print(f"Database initialized at {DB_PATH}")
