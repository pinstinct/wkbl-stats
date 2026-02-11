"""
WKBL Stats Database Module

SQLite database schema and operations for storing game-by-game player statistics.
"""

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import DB_PATH, EVENT_TYPE_CATEGORIES, EVENT_TYPE_MAP, setup_logging

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
    home_q1 INTEGER,
    home_q2 INTEGER,
    home_q3 INTEGER,
    home_q4 INTEGER,
    home_ot INTEGER,
    away_q1 INTEGER,
    away_q2 INTEGER,
    away_q3 INTEGER,
    away_q4 INTEGER,
    away_ot INTEGER,
    venue TEXT,
    game_type TEXT DEFAULT 'regular',  -- regular, playoff, allstar
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
    is_home INTEGER NOT NULL,           -- 1: 홈, 0: 원정

    -- 득점 세부
    fast_break_pts INTEGER DEFAULT 0,   -- 속공 득점
    paint_pts INTEGER DEFAULT 0,        -- 페인트존 득점
    two_pts INTEGER DEFAULT 0,          -- 2점슛 득점
    three_pts INTEGER DEFAULT 0,        -- 3점슛 득점

    -- 기타 스탯
    reb INTEGER DEFAULT 0,              -- 리바운드
    ast INTEGER DEFAULT 0,              -- 어시스트
    stl INTEGER DEFAULT 0,              -- 스틸
    blk INTEGER DEFAULT 0,              -- 블록
    tov INTEGER DEFAULT 0,              -- 턴오버
    pf INTEGER DEFAULT 0,               -- 파울

    created_at TEXT DEFAULT (datetime('now')),

    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (game_id, team_id)
);

-- 팀 순위 테이블
CREATE TABLE IF NOT EXISTS team_standings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,            -- 시즌 코드 (예: '046')
    team_id TEXT NOT NULL,              -- 팀 ID (예: 'kb')
    rank INTEGER NOT NULL,              -- 순위
    games_played INTEGER DEFAULT 0,     -- 경기 수
    wins INTEGER DEFAULT 0,             -- 승
    losses INTEGER DEFAULT 0,           -- 패
    win_pct REAL DEFAULT 0.0,           -- 승률 (0.000 ~ 1.000)
    games_behind REAL DEFAULT 0.0,      -- 승차 (게임 차)
    home_wins INTEGER DEFAULT 0,        -- 홈 승
    home_losses INTEGER DEFAULT 0,      -- 홈 패
    away_wins INTEGER DEFAULT 0,        -- 원정 승
    away_losses INTEGER DEFAULT 0,      -- 원정 패
    streak TEXT,                        -- 연속 기록 (예: 'W3', 'L2')
    last5 TEXT,                         -- 최근 5경기 (예: '3-2')
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (season_id, team_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_player_games_game ON player_games(game_id);
CREATE INDEX IF NOT EXISTS idx_player_games_player ON player_games(player_id);
CREATE INDEX IF NOT EXISTS idx_player_games_team ON player_games(team_id);
CREATE INDEX IF NOT EXISTS idx_games_season ON games(season_id);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_player_games_team_game ON player_games(team_id, game_id);
CREATE INDEX IF NOT EXISTS idx_player_games_player_game ON player_games(player_id, game_id);
CREATE INDEX IF NOT EXISTS idx_games_season_date_id ON games(season_id, game_date, id);
CREATE INDEX IF NOT EXISTS idx_team_games_game ON team_games(game_id);
CREATE INDEX IF NOT EXISTS idx_team_standings_season ON team_standings(season_id);

-- 경기 예측 테이블
CREATE TABLE IF NOT EXISTS game_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    is_starter INTEGER DEFAULT 0,       -- 1: 추천 선발 라인업
    predicted_pts REAL,
    predicted_pts_low REAL,
    predicted_pts_high REAL,
    predicted_reb REAL,
    predicted_reb_low REAL,
    predicted_reb_high REAL,
    predicted_ast REAL,
    predicted_ast_low REAL,
    predicted_ast_high REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (game_id, player_id)
);

-- 팀별 경기 예측 (승률 등)
CREATE TABLE IF NOT EXISTS game_team_predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    home_win_prob REAL,                 -- 홈팀 승률 예측 (0-100)
    away_win_prob REAL,                 -- 원정팀 승률 예측 (0-100)
    home_predicted_pts REAL,            -- 홈팀 예상 총득점
    away_predicted_pts REAL,            -- 원정팀 예상 총득점
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (game_id) REFERENCES games(id),
    UNIQUE (game_id)
);

CREATE INDEX IF NOT EXISTS idx_game_predictions_game ON game_predictions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_team_predictions_game ON game_team_predictions(game_id);

-- Play-by-Play 테이블
CREATE TABLE IF NOT EXISTS play_by_play (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    event_order INTEGER NOT NULL,
    quarter TEXT,                       -- Q1, Q2, Q3, Q4, OT
    game_clock TEXT,                    -- MM:SS
    team_id TEXT,
    player_id TEXT,
    event_type TEXT,                    -- score, foul, turnover, timeout, etc.
    event_detail TEXT,                  -- 2점슛, 3점슛, 자유투, etc.
    home_score INTEGER,
    away_score INTEGER,
    description TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    UNIQUE (game_id, event_order)
);

-- 샷 차트 테이블
CREATE TABLE IF NOT EXISTS shot_charts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    team_id TEXT,
    quarter TEXT,                       -- Q1, Q2, Q3, Q4, OT
    game_minute INTEGER,
    game_second INTEGER,
    x REAL,                            -- 코트 X 좌표
    y REAL,                            -- 코트 Y 좌표
    made INTEGER NOT NULL,             -- 1: 성공, 0: 실패
    shot_zone TEXT,                    -- paint, mid_range, three_pt
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (game_id, player_id, quarter, game_minute, game_second)
);

-- 팀 카테고리별 순위
CREATE TABLE IF NOT EXISTS team_category_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    category TEXT NOT NULL,            -- pts, reb, ast, stl, blk, etc.
    rank INTEGER,
    value REAL,
    games_played INTEGER,
    extra_values TEXT,                 -- JSON for additional values
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (season_id, team_id, category)
);

-- 상대전적 (Head-to-Head)
CREATE TABLE IF NOT EXISTS head_to_head (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    team1_id TEXT NOT NULL,
    team2_id TEXT NOT NULL,
    game_date TEXT NOT NULL,           -- YYYY-MM-DD
    game_number TEXT,                  -- 경기 번호
    venue TEXT,
    team1_scores TEXT,                 -- JSON: Q1-Q4, OT scores
    team2_scores TEXT,                 -- JSON: Q1-Q4, OT scores
    total_score TEXT,                  -- "65-58"
    winner_id TEXT,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (team1_id) REFERENCES teams(id),
    FOREIGN KEY (team2_id) REFERENCES teams(id),
    UNIQUE (season_id, team1_id, team2_id, game_date)
);

-- 경기 MVP
CREATE TABLE IF NOT EXISTS game_mvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    season_id TEXT NOT NULL,
    player_id TEXT,
    team_id TEXT,
    game_date TEXT,                    -- YYYY-MM-DD
    rank INTEGER,                     -- 1위, 2위, ...
    evaluation_score REAL,            -- EFF
    minutes REAL,
    pts INTEGER,
    reb INTEGER,
    ast INTEGER,
    stl INTEGER,
    blk INTEGER,
    tov INTEGER,
    FOREIGN KEY (season_id) REFERENCES seasons(id),
    FOREIGN KEY (player_id) REFERENCES players(id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    UNIQUE (season_id, game_date, rank)
);

CREATE INDEX IF NOT EXISTS idx_play_by_play_game ON play_by_play(game_id);
CREATE INDEX IF NOT EXISTS idx_shot_charts_game ON shot_charts(game_id);
CREATE INDEX IF NOT EXISTS idx_shot_charts_player ON shot_charts(player_id);
CREATE INDEX IF NOT EXISTS idx_team_category_stats_season ON team_category_stats(season_id);
CREATE INDEX IF NOT EXISTS idx_head_to_head_season ON head_to_head(season_id);
CREATE INDEX IF NOT EXISTS idx_game_mvp_season ON game_mvp(season_id);

-- 이벤트 유형 마스터 테이블
CREATE TABLE IF NOT EXISTS event_types (
    code TEXT PRIMARY KEY,
    name_kr TEXT NOT NULL,
    name_en TEXT,
    category TEXT                  -- scoring, rebounding, playmaking, defense, other
);

-- 메타데이터 테이블 (테이블/컬럼 설명)
CREATE TABLE IF NOT EXISTS _meta_descriptions (
    table_name TEXT NOT NULL,
    column_name TEXT,              -- NULL이면 테이블 설명
    description TEXT NOT NULL,
    PRIMARY KEY (table_name, column_name)
);
"""

# 테이블/컬럼 설명 메타데이터
# NOTE: 테이블 설명은 빈 문자열 ''을 사용 (NULL은 PRIMARY KEY에서 중복 허용됨)
META_DESCRIPTIONS = [
    # 테이블 설명 (column_name = '' for table-level descriptions)
    ("seasons", "", "시즌 정보"),
    ("teams", "", "팀 마스터 데이터"),
    ("players", "", "선수 마스터 데이터"),
    ("games", "", "경기 정보"),
    ("player_games", "", "경기별 선수 기록 (핵심 테이블)"),
    ("team_games", "", "경기별 팀 기록"),
    ("team_standings", "", "시즌 팀 순위"),
    # seasons 컬럼
    ("seasons", "id", "WKBL 시즌 코드 (예: 046)"),
    ("seasons", "label", "시즌 라벨 (예: 2025-26)"),
    ("seasons", "start_date", "시즌 시작일 (YYYY-MM-DD)"),
    ("seasons", "end_date", "시즌 종료일 (YYYY-MM-DD)"),
    ("seasons", "is_playoff", "플레이오프 여부 (0: 정규, 1: 플레이오프)"),
    # teams 컬럼
    ("teams", "id", "팀 ID (예: samsung, kb)"),
    ("teams", "name", "팀 정식 명칭 (예: 삼성생명)"),
    ("teams", "short_name", "팀 약칭 (예: 삼성)"),
    ("teams", "logo_url", "팀 로고 URL"),
    ("teams", "founded_year", "창단 연도"),
    # players 컬럼
    ("players", "id", "WKBL 선수 번호 (pno)"),
    ("players", "name", "선수명"),
    ("players", "birth_date", "생년월일 (YYYY-MM-DD)"),
    ("players", "height", "신장 (예: 175cm)"),
    ("players", "position", "포지션 (G/F/C)"),
    ("players", "team_id", "현재 소속팀 ID"),
    ("players", "is_active", "현역 여부 (1: 현역, 0: 은퇴)"),
    # games 컬럼
    ("games", "id", "WKBL game_id (예: 04601055)"),
    ("games", "season_id", "시즌 코드"),
    ("games", "game_date", "경기 날짜 (YYYY-MM-DD)"),
    ("games", "home_team_id", "홈팀 ID"),
    ("games", "away_team_id", "원정팀 ID"),
    ("games", "home_score", "홈팀 점수"),
    ("games", "away_score", "원정팀 점수"),
    ("games", "game_type", "경기 유형 (regular/playoff/allstar)"),
    # player_games 컬럼
    ("player_games", "id", "자동 증가 PK"),
    ("player_games", "game_id", "경기 ID"),
    ("player_games", "player_id", "선수 ID"),
    ("player_games", "team_id", "팀 ID"),
    ("player_games", "minutes", "출전 시간 (분)"),
    ("player_games", "pts", "득점"),
    ("player_games", "off_reb", "공격 리바운드"),
    ("player_games", "def_reb", "수비 리바운드"),
    ("player_games", "reb", "총 리바운드"),
    ("player_games", "ast", "어시스트"),
    ("player_games", "stl", "스틸"),
    ("player_games", "blk", "블록"),
    ("player_games", "tov", "턴오버"),
    ("player_games", "pf", "파울"),
    ("player_games", "fgm", "야투 성공 (2점+3점)"),
    ("player_games", "fga", "야투 시도"),
    ("player_games", "tpm", "3점슛 성공"),
    ("player_games", "tpa", "3점슛 시도"),
    ("player_games", "ftm", "자유투 성공"),
    ("player_games", "fta", "자유투 시도"),
    ("player_games", "two_pm", "2점슛 성공"),
    ("player_games", "two_pa", "2점슛 시도"),
    # team_games 컬럼
    ("team_games", "id", "자동 증가 PK"),
    ("team_games", "game_id", "경기 ID"),
    ("team_games", "team_id", "팀 ID"),
    ("team_games", "is_home", "홈 여부 (1: 홈, 0: 원정)"),
    ("team_games", "fast_break_pts", "속공 득점"),
    ("team_games", "paint_pts", "페인트존 득점"),
    ("team_games", "two_pts", "2점슛 득점"),
    ("team_games", "three_pts", "3점슛 득점"),
    ("team_games", "reb", "리바운드"),
    ("team_games", "ast", "어시스트"),
    ("team_games", "stl", "스틸"),
    ("team_games", "blk", "블록"),
    ("team_games", "tov", "턴오버"),
    ("team_games", "pf", "파울"),
    # team_standings 컬럼
    ("team_standings", "id", "자동 증가 PK"),
    ("team_standings", "season_id", "시즌 코드"),
    ("team_standings", "team_id", "팀 ID"),
    ("team_standings", "rank", "순위"),
    ("team_standings", "games_played", "경기 수"),
    ("team_standings", "wins", "승"),
    ("team_standings", "losses", "패"),
    ("team_standings", "win_pct", "승률 (0.000~1.000)"),
    ("team_standings", "games_behind", "승차 (게임 차)"),
    ("team_standings", "home_wins", "홈 승"),
    ("team_standings", "home_losses", "홈 패"),
    ("team_standings", "away_wins", "원정 승"),
    ("team_standings", "away_losses", "원정 패"),
    ("team_standings", "streak", "연속 기록 (예: W3, L2)"),
    ("team_standings", "last5", "최근 5경기 (예: 3-2)"),
    # game_predictions 테이블
    ("game_predictions", "", "경기별 선수 스탯 예측"),
    ("game_predictions", "game_id", "경기 ID"),
    ("game_predictions", "player_id", "선수 ID"),
    ("game_predictions", "is_starter", "추천 선발 여부 (1=선발)"),
    ("game_predictions", "predicted_pts", "예측 득점"),
    ("game_predictions", "predicted_reb", "예측 리바운드"),
    ("game_predictions", "predicted_ast", "예측 어시스트"),
    # game_team_predictions 테이블
    ("game_team_predictions", "", "경기별 팀 승률 예측"),
    ("game_team_predictions", "home_win_prob", "홈팀 승률 예측 (0-100)"),
    ("game_team_predictions", "away_win_prob", "원정팀 승률 예측 (0-100)"),
    # games 추가 컬럼
    ("games", "home_q1", "홈팀 1쿼터 점수"),
    ("games", "home_q2", "홈팀 2쿼터 점수"),
    ("games", "home_q3", "홈팀 3쿼터 점수"),
    ("games", "home_q4", "홈팀 4쿼터 점수"),
    ("games", "home_ot", "홈팀 연장전 점수"),
    ("games", "away_q1", "원정팀 1쿼터 점수"),
    ("games", "away_q2", "원정팀 2쿼터 점수"),
    ("games", "away_q3", "원정팀 3쿼터 점수"),
    ("games", "away_q4", "원정팀 4쿼터 점수"),
    ("games", "away_ot", "원정팀 연장전 점수"),
    ("games", "venue", "경기장 이름"),
    # play_by_play 테이블
    ("play_by_play", "", "경기 플레이바이플레이 이벤트"),
    ("play_by_play", "event_order", "이벤트 순서"),
    ("play_by_play", "event_type", "이벤트 유형 (score, foul 등)"),
    ("play_by_play", "game_clock", "경기 시계 (MM:SS)"),
    # shot_charts 테이블
    ("shot_charts", "", "경기 샷 차트 (슈팅 위치)"),
    ("shot_charts", "x", "코트 X 좌표"),
    ("shot_charts", "y", "코트 Y 좌표"),
    ("shot_charts", "made", "성공 여부 (1=성공, 0=실패)"),
    # team_category_stats 테이블
    ("team_category_stats", "", "팀 카테고리별 순위"),
    ("team_category_stats", "category", "카테고리 (pts, reb, ast 등)"),
    ("team_category_stats", "value", "카테고리 값"),
    # head_to_head 테이블
    ("head_to_head", "", "팀 간 상대전적"),
    ("head_to_head", "team1_scores", "팀1 쿼터별 점수 (JSON)"),
    ("head_to_head", "team2_scores", "팀2 쿼터별 점수 (JSON)"),
    # game_mvp 테이블
    ("game_mvp", "", "경기 MVP"),
    ("game_mvp", "evaluation_score", "EFF (효율 점수)"),
    ("game_mvp", "rank", "MVP 순위"),
]

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

        # Teams are seeded once and reused by ingest/API joins.
        # Insert teams master data
        cursor.executemany(
            """INSERT OR IGNORE INTO teams (id, name, short_name, logo_url, founded_year)
               VALUES (?, ?, ?, ?, ?)""",
            TEAMS_DATA,
        )

        # Insert meta descriptions
        cursor.executemany(
            """INSERT OR REPLACE INTO _meta_descriptions (table_name, column_name, description)
               VALUES (?, ?, ?)""",
            META_DESCRIPTIONS,
        )

        # Populate event_types from config
        event_type_data = [
            (code, name_kr, code, EVENT_TYPE_CATEGORIES.get(code, "other"))
            for name_kr, code in EVENT_TYPE_MAP.items()
        ]
        cursor.executemany(
            """INSERT OR IGNORE INTO event_types (code, name_kr, name_en, category)
               VALUES (?, ?, ?, ?)""",
            event_type_data,
        )

        conn.commit()
        logger.info(f"Database initialized at {DB_PATH}")


def insert_season(
    season_id: str,
    label: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    is_playoff: int = 0,
):
    """Insert or update a season."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO seasons (id, label, start_date, end_date, is_playoff)
               VALUES (?, ?, ?, ?, ?)""",
            (season_id, label, start_date, end_date, is_playoff),
        )
        conn.commit()


def insert_player(
    player_id: str,
    name: str,
    team_id: Optional[str] = None,
    position: Optional[str] = None,
    height: Optional[str] = None,
    birth_date: Optional[str] = None,
    is_active: int = 1,
):
    """Insert or update a player, preserving existing profile data."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO players (id, name, team_id, position, height, birth_date, is_active)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 team_id = excluded.team_id,
                 position = COALESCE(excluded.position, players.position),
                 height = COALESCE(excluded.height, players.height),
                 birth_date = COALESCE(excluded.birth_date, players.birth_date),
                 is_active = excluded.is_active""",
            (player_id, name, team_id, position, height, birth_date, is_active),
        )
        conn.commit()


def insert_game(
    game_id: str,
    season_id: str,
    game_date: str,
    home_team_id: str,
    away_team_id: str,
    home_score: Optional[int] = None,
    away_score: Optional[int] = None,
    game_type: str = "regular",
    home_q1: Optional[int] = None,
    home_q2: Optional[int] = None,
    home_q3: Optional[int] = None,
    home_q4: Optional[int] = None,
    home_ot: Optional[int] = None,
    away_q1: Optional[int] = None,
    away_q2: Optional[int] = None,
    away_q3: Optional[int] = None,
    away_q4: Optional[int] = None,
    away_ot: Optional[int] = None,
    venue: Optional[str] = None,
):
    """Insert or update a game."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO games
               (id, season_id, game_date, home_team_id, away_team_id,
                home_score, away_score, home_q1, home_q2, home_q3, home_q4, home_ot,
                away_q1, away_q2, away_q3, away_q4, away_ot, venue, game_type)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                season_id,
                game_date,
                home_team_id,
                away_team_id,
                home_score,
                away_score,
                home_q1,
                home_q2,
                home_q3,
                home_q4,
                home_ot,
                away_q1,
                away_q2,
                away_q3,
                away_q4,
                away_ot,
                venue,
                game_type,
            ),
        )
        conn.commit()


def insert_player_game(
    game_id: str, player_id: str, team_id: str, stats: Dict[str, Any]
):
    """Insert a player's game stats."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO player_games
               (game_id, player_id, team_id, minutes, pts, off_reb, def_reb, reb,
                ast, stl, blk, tov, pf, fgm, fga, tpm, tpa, ftm, fta, two_pm, two_pa)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                player_id,
                team_id,
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
            ),
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
            records,
        )
        conn.commit()
        logger.info(f"Inserted {len(records)} player game records")


def insert_team_game(game_id: str, team_id: str, is_home: int, stats: Dict[str, Any]):
    """Insert a team's game stats."""
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO team_games
               (game_id, team_id, is_home, fast_break_pts, paint_pts,
                two_pts, three_pts, reb, ast, stl, blk, tov, pf)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                game_id,
                team_id,
                is_home,
                stats.get("fast_break", 0),
                stats.get("paint_pts", 0),
                stats.get("two_pts", 0),
                stats.get("three_pts", 0),
                stats.get("reb", 0),
                stats.get("ast", 0),
                stats.get("stl", 0),
                stats.get("blk", 0),
                stats.get("tov", 0),
                stats.get("pf", 0),
            ),
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
            (team_id, season_id),
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
            (player_id, season_id),
        ).fetchone()

        if row:
            return dict(row)
        return None


def get_all_season_stats(season_id: str, active_only: bool = True) -> List[Dict]:
    """Get aggregated stats for all players in a season."""
    base_query = """SELECT
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
            WHERE g.season_id = ?"""

    if active_only:
        query = (
            base_query
            + " AND p.is_active = 1 GROUP BY pg.player_id ORDER BY AVG(pg.pts) DESC"
        )
    else:
        query = base_query + " GROUP BY pg.player_id ORDER BY AVG(pg.pts) DESC"

    with get_connection() as conn:
        rows = conn.execute(query, (season_id,)).fetchall()
        return [dict(row) for row in rows]


def get_game_boxscore(game_id: str) -> Optional[Dict[str, Any]]:
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
            (game_id,),
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
            (game_id,),
        ).fetchall()

        return {"game": dict(game), "players": [dict(p) for p in players]}


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
            (season_id,),
        ).fetchall()

        return [dict(row) for row in rows]


def get_existing_game_ids(season_id: Optional[str] = None) -> set:
    """Get set of game IDs already in database that have scores.

    Only returns games with non-NULL scores so that future games
    (saved with NULL scores) are re-fetched when scores become available.

    Args:
        season_id: Optional season filter. If None, returns all game IDs.

    Returns:
        Set of game_id strings that exist in the database with scores.
    """
    with get_connection() as conn:
        if season_id:
            rows = conn.execute(
                "SELECT id FROM games WHERE season_id = ? AND home_score IS NOT NULL",
                (season_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id FROM games WHERE home_score IS NOT NULL"
            ).fetchall()

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
            (season_id,),
        ).fetchone()

        return row["last_date"] if row and row["last_date"] else None


def insert_team_standing(season_id: str, team_id: str, standing: Dict[str, Any]):
    """Insert or update a team's standings.

    Args:
        season_id: Season code (e.g., '046')
        team_id: Team ID (e.g., 'kb')
        standing: Dict with standing data (rank, wins, losses, etc.)
    """
    with get_connection() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO team_standings
               (season_id, team_id, rank, games_played, wins, losses, win_pct,
                games_behind, home_wins, home_losses, away_wins, away_losses,
                streak, last5, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                season_id,
                team_id,
                standing.get("rank", 0),
                standing.get("games_played", 0),
                standing.get("wins", 0),
                standing.get("losses", 0),
                standing.get("win_pct", 0.0),
                standing.get("games_behind", 0.0),
                standing.get("home_wins", 0),
                standing.get("home_losses", 0),
                standing.get("away_wins", 0),
                standing.get("away_losses", 0),
                standing.get("streak"),
                standing.get("last5"),
            ),
        )
        conn.commit()


def bulk_insert_team_standings(season_id: str, standings: List[Dict[str, Any]]):
    """Bulk insert team standings for a season.

    Args:
        season_id: Season code (e.g., '046')
        standings: List of standing dicts with team_id and standing data
    """
    with get_connection() as conn:
        for standing in standings:
            conn.execute(
                """INSERT OR REPLACE INTO team_standings
                   (season_id, team_id, rank, games_played, wins, losses, win_pct,
                    games_behind, home_wins, home_losses, away_wins, away_losses,
                    streak, last5, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    season_id,
                    standing.get("team_id"),
                    standing.get("rank", 0),
                    standing.get("games_played", 0),
                    standing.get("wins", 0),
                    standing.get("losses", 0),
                    standing.get("win_pct", 0.0),
                    standing.get("games_behind", 0.0),
                    standing.get("home_wins", 0),
                    standing.get("home_losses", 0),
                    standing.get("away_wins", 0),
                    standing.get("away_losses", 0),
                    standing.get("streak"),
                    standing.get("last5"),
                ),
            )
        conn.commit()
        logger.info(f"Inserted {len(standings)} team standings for season {season_id}")


def get_team_standings(season_id: str) -> List[Dict]:
    """Get team standings for a season.

    Args:
        season_id: Season code (e.g., '046')

    Returns:
        List of team standing dicts sorted by rank
    """
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT ts.*, t.name as team_name, t.short_name
               FROM team_standings ts
               JOIN teams t ON ts.team_id = t.id
               WHERE ts.season_id = ?
               ORDER BY ts.rank""",
            (season_id,),
        ).fetchall()

        return [dict(row) for row in rows]


def get_table_description(table_name: str) -> Optional[str]:
    """Get description for a table."""
    with get_connection() as conn:
        row = conn.execute(
            """SELECT description FROM _meta_descriptions
               WHERE table_name = ? AND column_name = ''""",
            (table_name,),
        ).fetchone()
        return row["description"] if row else None


def get_column_descriptions(table_name: str) -> Dict[str, str]:
    """Get all column descriptions for a table."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT column_name, description FROM _meta_descriptions
               WHERE table_name = ? AND column_name != ''""",
            (table_name,),
        ).fetchall()
        return {row["column_name"]: row["description"] for row in rows}


def get_all_descriptions() -> Dict[str, Dict]:
    """Get all table and column descriptions.

    Returns:
        Dict with table names as keys, each containing:
        - 'description': table description
        - 'columns': dict of column_name -> description
    """
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT table_name, column_name, description FROM _meta_descriptions"
        ).fetchall()

    result: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        table = row["table_name"]
        if table not in result:
            result[table] = {"description": None, "columns": {}}

        # Empty string or NULL means table-level description
        if not row["column_name"]:
            result[table]["description"] = row["description"]
        else:
            result[table]["columns"][row["column_name"]] = row["description"]

    return result


def get_team_players(team_id: str, season_id: str) -> List[Dict]:
    """Get all players on a team for a season with their stats.

    Args:
        team_id: Team ID (e.g., 'kb')
        season_id: Season code (e.g., '046')

    Returns:
        List of player dicts with season averages and PIR
    """
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT
                p.id, p.name, p.position as pos, p.height,
                COUNT(pg.game_id) as gp,
                AVG(pg.pts) as pts,
                AVG(pg.reb) as reb,
                AVG(pg.ast) as ast,
                AVG(pg.stl) as stl,
                AVG(pg.blk) as blk,
                AVG(pg.tov) as tov,
                AVG(pg.pts + pg.reb + pg.ast + pg.stl + pg.blk
                    + (pg.fgm - pg.fga) + (pg.ftm - pg.fta) - pg.tov) as pir
            FROM players p
            JOIN player_games pg ON p.id = pg.player_id
            JOIN games g ON pg.game_id = g.id
            WHERE pg.team_id = ? AND g.season_id = ?
            GROUP BY p.id
            HAVING gp > 0
            ORDER BY pir DESC""",
            (team_id, season_id),
        ).fetchall()

        return [dict(row) for row in rows]


def get_player_recent_games(
    player_id: str, season_id: str, limit: int = 10
) -> List[Dict]:
    """Get recent game stats for a player.

    Args:
        player_id: Player ID
        season_id: Season code
        limit: Number of recent games to return

    Returns:
        List of game stats dicts ordered by date (most recent first)
    """
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT
                g.id as game_id, g.game_date,
                pg.pts, pg.reb, pg.ast, pg.stl, pg.blk, pg.tov, pg.minutes,
                g.home_team_id, g.away_team_id, pg.team_id
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            WHERE pg.player_id = ? AND g.season_id = ?
                AND g.home_score IS NOT NULL
            ORDER BY g.game_date DESC
            LIMIT ?""",
            (player_id, season_id, limit),
        ).fetchall()

        return [dict(row) for row in rows]


def save_game_predictions(
    game_id: str,
    predictions: List[Dict[str, Any]],
    team_prediction: Optional[Dict[str, Any]] = None,
):
    """Save player predictions for a game.

    Args:
        game_id: Game ID
        predictions: List of player prediction dicts with:
            - player_id, team_id, is_starter
            - predicted_pts, predicted_pts_low, predicted_pts_high
            - predicted_reb, predicted_reb_low, predicted_reb_high
            - predicted_ast, predicted_ast_low, predicted_ast_high
        team_prediction: Optional dict with:
            - home_win_prob, away_win_prob
            - home_predicted_pts, away_predicted_pts
    """
    with get_connection() as conn:
        # Save player predictions
        for pred in predictions:
            conn.execute(
                """INSERT OR REPLACE INTO game_predictions
                   (game_id, team_id, player_id, is_starter,
                    predicted_pts, predicted_pts_low, predicted_pts_high,
                    predicted_reb, predicted_reb_low, predicted_reb_high,
                    predicted_ast, predicted_ast_low, predicted_ast_high,
                    created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    game_id,
                    pred.get("team_id"),
                    pred.get("player_id"),
                    pred.get("is_starter", 0),
                    pred.get("predicted_pts"),
                    pred.get("predicted_pts_low"),
                    pred.get("predicted_pts_high"),
                    pred.get("predicted_reb"),
                    pred.get("predicted_reb_low"),
                    pred.get("predicted_reb_high"),
                    pred.get("predicted_ast"),
                    pred.get("predicted_ast_low"),
                    pred.get("predicted_ast_high"),
                ),
            )

        # Save team prediction
        if team_prediction:
            conn.execute(
                """INSERT OR REPLACE INTO game_team_predictions
                   (game_id, home_win_prob, away_win_prob,
                    home_predicted_pts, away_predicted_pts, created_at)
                   VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                (
                    game_id,
                    team_prediction.get("home_win_prob"),
                    team_prediction.get("away_win_prob"),
                    team_prediction.get("home_predicted_pts"),
                    team_prediction.get("away_predicted_pts"),
                ),
            )

        conn.commit()
        logger.info(f"Saved {len(predictions)} predictions for game {game_id}")


def get_game_predictions(game_id: str) -> Dict[str, Any]:
    """Get predictions for a game.

    Args:
        game_id: Game ID

    Returns:
        Dict with:
        - 'players': List of player predictions with player info
        - 'team': Team-level prediction (win prob, total pts)
    """
    with get_connection() as conn:
        # Get player predictions
        player_rows = conn.execute(
            """SELECT gp.*, p.name as player_name, t.name as team_name, t.short_name
               FROM game_predictions gp
               JOIN players p ON gp.player_id = p.id
               JOIN teams t ON gp.team_id = t.id
               WHERE gp.game_id = ?
               ORDER BY gp.is_starter DESC, gp.predicted_pts DESC""",
            (game_id,),
        ).fetchall()

        # Get team prediction
        team_row = conn.execute(
            "SELECT * FROM game_team_predictions WHERE game_id = ?",
            (game_id,),
        ).fetchone()

        return {
            "players": [dict(row) for row in player_rows],
            "team": dict(team_row) if team_row else None,
        }


def has_game_predictions(game_id: str) -> bool:
    """Check if predictions exist for a game."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM game_predictions WHERE game_id = ?",
            (game_id,),
        ).fetchone()
        return row["cnt"] > 0


def update_game_quarter_scores(game_id: str, data: Dict[str, Any]):
    """Update quarter scores and venue for an existing game.

    Args:
        game_id: Game ID
        data: Dict with optional keys: home_q1..home_ot, away_q1..away_ot, venue
    """
    with get_connection() as conn:
        conn.execute(
            """UPDATE games SET
                home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, home_ot = ?,
                away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, away_ot = ?,
                venue = ?
               WHERE id = ?""",
            (
                data.get("home_q1"),
                data.get("home_q2"),
                data.get("home_q3"),
                data.get("home_q4"),
                data.get("home_ot"),
                data.get("away_q1"),
                data.get("away_q2"),
                data.get("away_q3"),
                data.get("away_q4"),
                data.get("away_ot"),
                data.get("venue"),
                game_id,
            ),
        )
        conn.commit()


def bulk_update_quarter_scores(records: List[Dict[str, Any]]):
    """Bulk update quarter scores for multiple games.

    Args:
        records: List of dicts with game_id and quarter score data
    """
    with get_connection() as conn:
        for rec in records:
            conn.execute(
                """UPDATE games SET
                    home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, home_ot = ?,
                    away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, away_ot = ?,
                    venue = ?
                   WHERE id = ?""",
                (
                    rec.get("home_q1"),
                    rec.get("home_q2"),
                    rec.get("home_q3"),
                    rec.get("home_q4"),
                    rec.get("home_ot"),
                    rec.get("away_q1"),
                    rec.get("away_q2"),
                    rec.get("away_q3"),
                    rec.get("away_q4"),
                    rec.get("away_ot"),
                    rec.get("venue"),
                    rec["game_id"],
                ),
            )
        conn.commit()
        logger.info(f"Updated quarter scores for {len(records)} games")


def bulk_insert_play_by_play(game_id: str, events: List[Dict[str, Any]]):
    """Bulk insert play-by-play events for a game.

    Args:
        game_id: Game ID
        events: List of event dicts
    """
    with get_connection() as conn:
        for event in events:
            conn.execute(
                """INSERT OR REPLACE INTO play_by_play
                   (game_id, event_order, quarter, game_clock, team_id, player_id,
                    event_type, event_detail, home_score, away_score, description)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    game_id,
                    event.get("event_order"),
                    event.get("quarter"),
                    event.get("game_clock"),
                    event.get("team_id"),
                    event.get("player_id"),
                    event.get("event_type"),
                    event.get("event_detail"),
                    event.get("home_score"),
                    event.get("away_score"),
                    event.get("description"),
                ),
            )
        conn.commit()
        logger.info(f"Inserted {len(events)} play-by-play events for game {game_id}")


def get_play_by_play(game_id: str, quarter: Optional[str] = None) -> List[Dict]:
    """Get play-by-play events for a game.

    Args:
        game_id: Game ID
        quarter: Optional quarter filter (Q1, Q2, Q3, Q4, OT)

    Returns:
        List of event dicts ordered by event_order
    """
    with get_connection() as conn:
        if quarter:
            rows = conn.execute(
                """SELECT * FROM play_by_play
                   WHERE game_id = ? AND quarter = ?
                   ORDER BY event_order""",
                (game_id, quarter),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM play_by_play
                   WHERE game_id = ?
                   ORDER BY event_order""",
                (game_id,),
            ).fetchall()
        return [dict(row) for row in rows]


def bulk_insert_shot_charts(game_id: str, shots: List[Dict[str, Any]]):
    """Bulk insert shot chart data for a game.

    Args:
        game_id: Game ID
        shots: List of shot dicts
    """
    with get_connection() as conn:
        for shot in shots:
            conn.execute(
                """INSERT OR REPLACE INTO shot_charts
                   (game_id, player_id, team_id, quarter, game_minute, game_second,
                    x, y, made, shot_zone)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    game_id,
                    shot.get("player_id"),
                    shot.get("team_id"),
                    shot.get("quarter"),
                    shot.get("game_minute"),
                    shot.get("game_second"),
                    shot.get("x"),
                    shot.get("y"),
                    shot.get("made"),
                    shot.get("shot_zone"),
                ),
            )
        conn.commit()
        logger.info(f"Inserted {len(shots)} shot chart records for game {game_id}")


def get_shot_chart(game_id: str, player_id: Optional[str] = None) -> List[Dict]:
    """Get shot chart data for a game.

    Args:
        game_id: Game ID
        player_id: Optional player filter

    Returns:
        List of shot dicts
    """
    with get_connection() as conn:
        if player_id:
            rows = conn.execute(
                """SELECT * FROM shot_charts
                   WHERE game_id = ? AND player_id = ?
                   ORDER BY quarter, game_minute, game_second""",
                (game_id, player_id),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM shot_charts
                   WHERE game_id = ?
                   ORDER BY quarter, game_minute, game_second""",
                (game_id,),
            ).fetchall()
        return [dict(row) for row in rows]


def bulk_insert_team_category_stats(
    season_id: str, category: str, stats: List[Dict[str, Any]]
):
    """Bulk insert team category stats.

    Args:
        season_id: Season code
        category: Category name (pts, reb, ast, etc.)
        stats: List of team stat dicts
    """
    with get_connection() as conn:
        for stat in stats:
            conn.execute(
                """INSERT OR REPLACE INTO team_category_stats
                   (season_id, team_id, category, rank, value, games_played,
                    extra_values, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
                (
                    season_id,
                    stat.get("team_id"),
                    category,
                    stat.get("rank"),
                    stat.get("value"),
                    stat.get("games_played"),
                    stat.get("extra_values"),
                ),
            )
        conn.commit()
        logger.info(
            f"Inserted {len(stats)} team category stats "
            f"for {category} in season {season_id}"
        )


def get_team_category_stats(
    season_id: str, category: Optional[str] = None
) -> List[Dict]:
    """Get team category stats.

    Args:
        season_id: Season code
        category: Optional category filter

    Returns:
        List of team category stat dicts
    """
    with get_connection() as conn:
        if category:
            rows = conn.execute(
                """SELECT tcs.*, t.name as team_name, t.short_name
                   FROM team_category_stats tcs
                   JOIN teams t ON tcs.team_id = t.id
                   WHERE tcs.season_id = ? AND tcs.category = ?
                   ORDER BY tcs.rank""",
                (season_id, category),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT tcs.*, t.name as team_name, t.short_name
                   FROM team_category_stats tcs
                   JOIN teams t ON tcs.team_id = t.id
                   WHERE tcs.season_id = ?
                   ORDER BY tcs.category, tcs.rank""",
                (season_id,),
            ).fetchall()
        return [dict(row) for row in rows]


def bulk_insert_head_to_head(season_id: str, records: List[Dict[str, Any]]):
    """Bulk insert head-to-head records.

    Args:
        season_id: Season code
        records: List of H2H record dicts
    """
    with get_connection() as conn:
        for rec in records:
            conn.execute(
                """INSERT OR REPLACE INTO head_to_head
                   (season_id, team1_id, team2_id, game_date, game_number,
                    venue, team1_scores, team2_scores, total_score, winner_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    season_id,
                    rec.get("team1_id"),
                    rec.get("team2_id"),
                    rec.get("game_date"),
                    rec.get("game_number"),
                    rec.get("venue"),
                    rec.get("team1_scores"),
                    rec.get("team2_scores"),
                    rec.get("total_score"),
                    rec.get("winner_id"),
                ),
            )
        conn.commit()
        logger.info(
            f"Inserted {len(records)} head-to-head records for season {season_id}"
        )


def get_head_to_head(
    season_id: str,
    team1_id: Optional[str] = None,
    team2_id: Optional[str] = None,
) -> List[Dict]:
    """Get head-to-head records.

    Supports bidirectional lookup (team1 vs team2 or team2 vs team1).

    Args:
        season_id: Season code
        team1_id: Optional first team filter
        team2_id: Optional second team filter

    Returns:
        List of H2H record dicts
    """
    with get_connection() as conn:
        if team1_id and team2_id:
            rows = conn.execute(
                """SELECT * FROM head_to_head
                   WHERE season_id = ? AND (
                     (team1_id = ? AND team2_id = ?) OR
                     (team1_id = ? AND team2_id = ?)
                   )
                   ORDER BY game_date""",
                (season_id, team1_id, team2_id, team2_id, team1_id),
            ).fetchall()
        elif team1_id:
            rows = conn.execute(
                """SELECT * FROM head_to_head
                   WHERE season_id = ? AND (team1_id = ? OR team2_id = ?)
                   ORDER BY game_date""",
                (season_id, team1_id, team1_id),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM head_to_head
                   WHERE season_id = ?
                   ORDER BY team1_id, team2_id, game_date""",
                (season_id,),
            ).fetchall()
        return [dict(row) for row in rows]


def bulk_insert_game_mvp(season_id: str, records: List[Dict[str, Any]]):
    """Bulk insert game MVP records.

    Args:
        season_id: Season code
        records: List of MVP record dicts
    """
    with get_connection() as conn:
        for rec in records:
            conn.execute(
                """INSERT OR REPLACE INTO game_mvp
                   (season_id, player_id, team_id, game_date, rank,
                    evaluation_score, minutes, pts, reb, ast, stl, blk, tov)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    season_id,
                    rec.get("player_id"),
                    rec.get("team_id"),
                    rec.get("game_date"),
                    rec.get("rank"),
                    rec.get("evaluation_score"),
                    rec.get("minutes"),
                    rec.get("pts"),
                    rec.get("reb"),
                    rec.get("ast"),
                    rec.get("stl"),
                    rec.get("blk"),
                    rec.get("tov"),
                ),
            )
        conn.commit()
        logger.info(f"Inserted {len(records)} game MVP records for season {season_id}")


def get_game_mvp(season_id: str, game_date: Optional[str] = None) -> List[Dict]:
    """Get game MVP records.

    Args:
        season_id: Season code
        game_date: Optional date filter (YYYY-MM-DD)

    Returns:
        List of MVP record dicts with player info
    """
    with get_connection() as conn:
        if game_date:
            rows = conn.execute(
                """SELECT gm.*, p.name as player_name, t.name as team_name
                   FROM game_mvp gm
                   LEFT JOIN players p ON gm.player_id = p.id
                   LEFT JOIN teams t ON gm.team_id = t.id
                   WHERE gm.season_id = ? AND gm.game_date = ?
                   ORDER BY gm.rank""",
                (season_id, game_date),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT gm.*, p.name as player_name, t.name as team_name
                   FROM game_mvp gm
                   LEFT JOIN players p ON gm.player_id = p.id
                   LEFT JOIN teams t ON gm.team_id = t.id
                   WHERE gm.season_id = ?
                   ORDER BY gm.game_date DESC, gm.rank""",
                (season_id,),
            ).fetchall()
        return [dict(row) for row in rows]


if __name__ == "__main__":
    # Initialize database when run directly
    init_db()
    print(f"Database initialized at {DB_PATH}")
