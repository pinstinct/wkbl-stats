#!/usr/bin/env python3
"""Centralized configuration for WKBL Stats."""

import logging
import os


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_csv_env(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


# URL Constants
BASE_URL = "https://datalab.wkbl.or.kr"
PLAYER_RECORD_WRAPPER = BASE_URL + "/playerRecord"
GAME_LIST_MONTH = BASE_URL + "/game/list/month"
PLAYER_LIST = "https://www.wkbl.or.kr/player/player_list.asp"
PLAYER_LIST_RETIRED = "https://www.wkbl.or.kr/player/player_list.asp?player_group=11"
PLAYER_LIST_FOREIGN = "https://www.wkbl.or.kr/player/player_list.asp?player_group=F11"
TEAM_STANDINGS_URL = "https://www.wkbl.or.kr/game/ajax/ajax_team_rank.asp"
PLAY_BY_PLAY_URL = BASE_URL + "/playByPlay"
SHOT_CHART_URL = BASE_URL + "/shotCharts"
TEAM_ANALYSIS_URL = BASE_URL + "/teamAnalysis"
TEAM_CATEGORY_STATS_URL = "https://www.wkbl.or.kr/game/ajax/ajax_part_team_rank.asp"
HEAD_TO_HEAD_URL = "https://www.wkbl.or.kr/game/ajax/ajax_report.asp"
MVP_URL = "https://www.wkbl.or.kr/game/today_mvp.asp"

# WKBL team codes for wkbl.or.kr endpoints (different from DB team IDs)
WKBL_TEAM_CODES = {
    "kb": "01",
    "samsung": "03",
    "woori": "05",
    "shinhan": "07",
    "hana": "09",
    "bnk": "11",
}

# Team category stats part numbers → stat names
TEAM_CATEGORY_PARTS = {
    1: "pts",
    2: "pts_against",
    3: "reb",
    4: "ast",
    5: "stl",
    6: "blk",
    7: "tpm",
    8: "two_pm",
    9: "ftm",
    10: "tpp",
    11: "two_pp",
    12: "ftp",
}

# Play-by-play event type mapping (Korean → English code)
EVENT_TYPE_MAP = {
    "2점슛성공": "2pt_made",
    "2점슛시도": "2pt_miss",
    "3점슛성공": "3pt_made",
    "3점슛시도": "3pt_miss",
    "페인트존2점슛성공": "paint_2pt_made",
    "자유투성공": "ft_made",
    "자유투실패": "ft_miss",
    "공격리바운드": "off_rebound",
    "수비리바운드": "def_rebound",
    "팀공격리바운드": "team_off_rebound",
    "팀수비리바운드": "team_def_rebound",
    "어시스트": "assist",
    "스틸": "steal",
    "블록": "block",
    "턴오버": "turnover",
    "팀턴오버": "team_turnover",
    "파울": "foul",
    "테크니컬파울": "tech_foul",
    "교체(IN)": "sub_in",
    "교체(OUT)": "sub_out",
    "속공성공": "fastbreak_made",
    "속공실패": "fastbreak_miss",
    "굿디펜스": "good_defense",
    "정규작전타임": "timeout",
    "UnsportsManLike": "unsportsmanlike_foul",
}

# Event type categories
EVENT_TYPE_CATEGORIES = {
    "2pt_made": "scoring",
    "2pt_miss": "scoring",
    "3pt_made": "scoring",
    "3pt_miss": "scoring",
    "paint_2pt_made": "scoring",
    "ft_made": "scoring",
    "ft_miss": "scoring",
    "off_rebound": "rebounding",
    "def_rebound": "rebounding",
    "team_off_rebound": "rebounding",
    "team_def_rebound": "rebounding",
    "assist": "playmaking",
    "steal": "defense",
    "block": "defense",
    "turnover": "turnover",
    "team_turnover": "turnover",
    "foul": "foul",
    "tech_foul": "foul",
    "sub_in": "substitution",
    "sub_out": "substitution",
    "fastbreak_made": "scoring",
    "fastbreak_miss": "scoring",
    "good_defense": "defense",
    "timeout": "other",
    "unsportsmanlike_foul": "foul",
}


def get_shot_zone(x, y):
    """Classify shot zone from WKBL court coordinates.

    Court coordinate system (half court, 0-based px):
      X range: ~0-291, Y range: ~18-176
      Basket is roughly at (150, 10) based on coordinate distribution.

    Args:
        x: X coordinate (px)
        y: Y coordinate (px)

    Returns:
        Shot zone string: paint, mid_range, three_pt
    """
    # Distance from basket center (approx 150, 10)
    bx, by = 150.0, 10.0
    dx = x - bx
    dy = y - by
    dist = (dx * dx + dy * dy) ** 0.5

    # Paint area (roughly within 50px of basket)
    if dist <= 50:
        return "paint"
    # Three-point line (roughly 120px from basket)
    if dist >= 120:
        return "three_pt"
    return "mid_range"


# Server Settings
HOST = os.getenv("HOST", "")
PORT = int(os.getenv("PORT", "8000"))

# API Security Settings
API_ALLOW_ORIGINS = _parse_csv_env(
    "API_ALLOW_ORIGINS",
    "http://localhost:8000,http://127.0.0.1:8000",
)
API_ALLOW_METHODS = _parse_csv_env("API_ALLOW_METHODS", "GET")
API_ALLOW_HEADERS = _parse_csv_env("API_ALLOW_HEADERS", "Content-Type")
API_ALLOW_CREDENTIALS = _parse_bool_env("API_ALLOW_CREDENTIALS", False)
API_TRUST_PROXY = _parse_bool_env("API_TRUST_PROXY", True)
API_TRUSTED_PROXIES = _parse_csv_env(
    "API_TRUSTED_PROXIES",
    "127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,localhost",
)
API_RATE_LIMIT_PER_MINUTE = int(os.getenv("API_RATE_LIMIT_PER_MINUTE", "60"))
API_SEARCH_RATE_LIMIT_PER_MINUTE = int(
    os.getenv("API_SEARCH_RATE_LIMIT_PER_MINUTE", "20")
)
API_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("API_RATE_LIMIT_WINDOW_SECONDS", "60"))
API_MAX_REQUEST_BYTES = int(os.getenv("API_MAX_REQUEST_BYTES", str(1024 * 1024)))
API_RATE_LIMIT_MAX_KEYS = int(os.getenv("API_RATE_LIMIT_MAX_KEYS", "10000"))
API_RATE_LIMIT_SWEEP_EVERY = int(os.getenv("API_RATE_LIMIT_SWEEP_EVERY", "200"))

# Response Security Header Settings
SECURITY_HSTS_MAX_AGE = int(os.getenv("SECURITY_HSTS_MAX_AGE", "31536000"))
SECURITY_HSTS_INCLUDE_SUBDOMAINS = _parse_bool_env(
    "SECURITY_HSTS_INCLUDE_SUBDOMAINS", True
)
SECURITY_HSTS_PRELOAD = _parse_bool_env("SECURITY_HSTS_PRELOAD", False)
SECURITY_REFERRER_POLICY = os.getenv(
    "SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin"
)
SECURITY_PERMISSIONS_POLICY = os.getenv(
    "SECURITY_PERMISSIONS_POLICY",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
)
SECURITY_FRAME_OPTIONS = os.getenv("SECURITY_FRAME_OPTIONS", "DENY")

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
STATUS_PATH = os.path.join(CACHE_DIR, "ingest_status.json")
OUTPUT_PATH = os.path.join(DATA_DIR, "wkbl-active.json")
DB_PATH = os.path.join(DATA_DIR, "wkbl.db")

# Season Settings
CURRENT_SEASON = "2025-26"

# Season code to label mapping (WKBL season codes)
SEASON_CODES = {
    "041": "2020-21",
    "042": "2021-22",
    "043": "2022-23",
    "044": "2023-24",
    "045": "2024-25",
    "046": "2025-26",
}

# Request Settings
USER_AGENT = "wkbl-stats-ingest/0.1"
TIMEOUT = 30
DELAY = 0.15
MAX_RETRIES = 3
RETRY_BACKOFF = 2.0


def setup_logging(name, level=logging.INFO):
    """Configure and return a logger with consistent formatting."""
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "[%(asctime)s] %(levelname)s - %(name)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(level)
    return logger
