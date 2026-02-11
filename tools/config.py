#!/usr/bin/env python3
"""Centralized configuration for WKBL Stats."""

import logging
import os

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
    "turnover": "other",
    "team_turnover": "other",
    "foul": "other",
    "tech_foul": "other",
    "sub_in": "substitution",
    "sub_out": "substitution",
    "fastbreak_made": "scoring",
    "fastbreak_miss": "scoring",
    "good_defense": "defense",
    "timeout": "other",
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
