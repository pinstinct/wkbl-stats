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

# Server Settings
HOST = ""
PORT = 8000

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
