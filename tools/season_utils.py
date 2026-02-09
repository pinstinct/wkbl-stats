"""Season resolution helpers shared by API handlers."""

from __future__ import annotations

from typing import Optional, Tuple

from config import SEASON_CODES


def latest_season_code() -> str:
    """Return the latest known season code."""
    return max(SEASON_CODES.keys())


def resolve_season(season: Optional[str]) -> Tuple[Optional[str], str]:
    """Resolve season query value into (season_id, label)."""
    if season == "all":
        return None, "전체"

    season_id = season or latest_season_code()
    return season_id, SEASON_CODES.get(season_id, season_id)
