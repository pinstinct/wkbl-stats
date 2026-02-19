#!/usr/bin/env python3
"""
WKBL Stats REST API

FastAPI-based REST API server for WKBL basketball statistics.
Provides endpoints for players, teams, games, seasons, and leaderboards.
"""

from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import CURRENT_SEASON, SEASON_CODES, setup_logging
from database import (
    get_connection,
    get_league_season_totals,
    get_lineup_stints,
    get_opponent_season_totals,
    get_position_matchups,
    get_player_plus_minus_season,
    get_team_season_totals,
    init_db,
)
from season_utils import resolve_season
from stats import compute_advanced_stats, estimate_possessions

logger = setup_logging("api")


# =============================================================================
# Pydantic Models
# =============================================================================


class PlayerBase(BaseModel):
    id: str
    name: str
    team: Optional[str] = None
    team_id: Optional[str] = None
    position: Optional[str] = None
    height: Optional[str] = None
    is_active: bool = True


class PlayerStats(PlayerBase):
    """Player with season statistics."""

    season: str
    gp: int = 0
    min: float = 0.0
    pts: float = 0.0
    reb: float = 0.0
    ast: float = 0.0
    stl: float = 0.0
    blk: float = 0.0
    tov: float = 0.0
    fgp: float = 0.0  # FG%
    tpp: float = 0.0  # 3P%
    ftp: float = 0.0  # FT%


class PlayerGameLog(BaseModel):
    """Single game record for a player."""

    game_id: str
    game_date: str
    opponent: str
    is_home: bool
    result: str  # W/L
    minutes: float
    pts: int
    reb: int
    ast: int
    stl: int
    blk: int
    tov: int
    fgm: int
    fga: int
    tpm: int
    tpa: int
    ftm: int
    fta: int


class PlayerDetail(PlayerBase):
    """Player with detailed stats and game log."""

    birth_date: Optional[str] = None
    seasons: dict[str, dict] = {}
    recent_games: list[PlayerGameLog] = []


class TeamBase(BaseModel):
    id: str
    name: str
    short_name: Optional[str] = None


class TeamStanding(TeamBase):
    """Team with standings info."""

    rank: int
    wins: int
    losses: int
    win_pct: float
    games_behind: float
    home_record: str
    away_record: str
    streak: Optional[str] = None
    last5: Optional[str] = None


class TeamDetail(TeamBase):
    """Team with roster and season stats."""

    roster: list[PlayerBase] = []
    standings: Optional[TeamStanding] = None
    recent_games: list[dict] = []


class GameBase(BaseModel):
    id: str
    date: str
    home_team: str
    away_team: str
    home_score: Optional[int] = None
    away_score: Optional[int] = None
    game_type: str = "regular"


class GameBoxscore(GameBase):
    """Game with full boxscore."""

    home_team_stats: list[dict] = []
    away_team_stats: list[dict] = []


class SeasonBase(BaseModel):
    id: str
    label: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class LeaderCategory(BaseModel):
    """Leader in a statistical category."""

    category: str
    leaders: list[dict]


# =============================================================================
# Database Query Functions
# =============================================================================


def _build_team_stats(
    team_id: str,
    team_totals: dict[str, dict],
    opp_totals: dict[str, dict],
) -> Optional[dict]:
    """Build the team_stats dict for compute_advanced_stats from DB aggregates."""
    tt = team_totals.get(team_id)
    ot = opp_totals.get(team_id)
    if not tt or not ot:
        return None
    return {
        "team_fga": tt["fga"],
        "team_fta": tt["fta"],
        "team_tov": tt["tov"],
        "team_oreb": tt["oreb"],
        "team_dreb": tt["dreb"],
        "team_fgm": tt["fgm"],
        "team_ast": tt["ast"],
        "team_pts": tt["pts"],
        "team_min": tt["min"],
        "team_gp": tt["gp"],
        "team_stl": tt["stl"],
        "team_blk": tt["blk"],
        "team_pf": tt["pf"],
        "team_ftm": tt["ftm"],
        "team_tpm": tt["tpm"],
        "team_tpa": tt["tpa"],
        "team_reb": tt["reb"],
        "opp_fga": ot["fga"],
        "opp_fta": ot["fta"],
        "opp_ftm": ot["ftm"],
        "opp_tov": ot["tov"],
        "opp_oreb": ot["oreb"],
        "opp_dreb": ot["dreb"],
        "opp_pts": ot["pts"],
        "opp_tpa": ot["tpa"],
        "opp_tpm": ot["tpm"],
        "opp_fgm": ot["fgm"],
        "opp_ast": ot["ast"],
        "opp_stl": ot["stl"],
        "opp_blk": ot["blk"],
        "opp_pf": ot["pf"],
        "opp_reb": ot["reb"],
    }


def _build_league_stats(season_id: str, team_totals: dict[str, dict]) -> Optional[dict]:
    """Build the league_stats dict for compute_advanced_stats."""
    from stats import estimate_possessions

    lg = get_league_season_totals(season_id)
    if not lg or not lg.get("pts"):
        return None

    # Compute league pace: average across all teams
    total_poss = 0.0
    total_team_min_5 = 0.0
    for tt in team_totals.values():
        poss = estimate_possessions(tt["fga"], tt["fta"], tt["tov"], tt["oreb"])
        total_poss += poss
        total_team_min_5 += tt["min"] / 5

    lg_pace = 40 * total_poss / total_team_min_5 if total_team_min_5 > 0 else 0

    return {
        "lg_pts": lg["pts"],
        "lg_fga": lg["fga"],
        "lg_fta": lg["fta"],
        "lg_ftm": lg["ftm"],
        "lg_oreb": lg["oreb"],
        "lg_reb": lg["reb"],
        "lg_ast": lg["ast"],
        "lg_fgm": lg["fgm"],
        "lg_tov": lg["tov"],
        "lg_pf": lg["pf"],
        "lg_min": lg["min"],
        "lg_pace": lg_pace,
        "lg_poss": total_poss,
    }


def get_players(
    season_id: Optional[str] = None,
    team_id: Optional[str] = None,
    active_only: bool = True,
    include_no_games: bool = False,
) -> list[dict]:
    """Get all players with their season stats."""
    # Base query only returns players with at least one game row.
    query = """
        SELECT
            p.id,
            p.name,
            p.position as pos,
            p.height,
            p.is_active,
            t.name as team,
            t.id as team_id,
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
            SUM(pg.ast) as total_ast,
            SUM(pg.stl) as total_stl,
            SUM(pg.blk) as total_blk,
            SUM(pg.tov) as total_tov,
            SUM(pg.off_reb) as total_off_reb,
            SUM(pg.def_reb) as total_def_reb,
            SUM(pg.pf) as total_pf,
            AVG(pg.off_reb) as off_reb,
            AVG(pg.def_reb) as def_reb,
            AVG(pg.pf) as pf
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        JOIN players p ON pg.player_id = p.id
        JOIN teams t ON pg.team_id = t.id
        WHERE 1=1
    """
    params: list[Any] = []

    if season_id:
        query += " AND g.season_id = ?"
        params.append(season_id)

    if active_only:
        query += " AND p.is_active = 1"

    if team_id:
        query += " AND pg.team_id = ?"
        params.append(team_id)

    query += " GROUP BY pg.player_id ORDER BY AVG(pg.pts) DESC"

    # Pre-fetch team context for advanced stats
    team_totals: dict[str, dict] = {}
    opp_totals: dict[str, dict] = {}
    league_ctx: Optional[dict] = None
    if season_id:
        team_totals = get_team_season_totals(season_id)
        opp_totals = get_opponent_season_totals(season_id)
        league_ctx = _build_league_stats(season_id, team_totals)

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            for key in [
                "min",
                "pts",
                "reb",
                "ast",
                "stl",
                "blk",
                "tov",
                "off_reb",
                "def_reb",
                "pf",
            ]:
                d[key] = round(d[key], 1) if d[key] else 0.0
            ts = _build_team_stats(d.get("team_id", ""), team_totals, opp_totals)
            result.append(
                compute_advanced_stats(d, team_stats=ts, league_stats=league_ctx)
            )

        if include_no_games and season_id:
            # Contract: season player tables may include gp=0 players
            # (active current roster or historical inferred roster).
            player_ids = {p["id"] for p in result}
            no_games_rows = _get_no_games_rows(
                conn=conn,
                season_id=season_id,
                team_id=team_id,
                active_only=active_only,
            )
            for row in no_games_rows:
                d = dict(row)
                if d["id"] in player_ids:
                    continue
                d.update(
                    {
                        "gp": 0,
                        "min": 0.0,
                        "pts": 0.0,
                        "reb": 0.0,
                        "ast": 0.0,
                        "stl": 0.0,
                        "blk": 0.0,
                        "tov": 0.0,
                        "total_fgm": 0,
                        "total_fga": 0,
                        "total_tpm": 0,
                        "total_tpa": 0,
                        "total_ftm": 0,
                        "total_fta": 0,
                    }
                )
                result.append(compute_advanced_stats(d))

        return result


def _get_no_games_rows(
    conn: Any, season_id: str, team_id: Optional[str], active_only: bool
) -> list[Any]:
    """Build gp=0 rows for the requested season with historical team inference."""
    max_season_row = conn.execute(
        "SELECT MAX(season_id) AS max_season FROM games"
    ).fetchone()
    max_season = dict(max_season_row)["max_season"] if max_season_row else None
    is_latest_season = max_season == season_id

    historical_query = """
        SELECT
            p.id,
            p.name,
            p.position as pos,
            p.height,
            p.is_active,
            t.name as team,
            t.id as team_id
        FROM players p
        JOIN (
            SELECT pg.player_id, pg.team_id
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            WHERE g.season_id = (
                SELECT MAX(g2.season_id)
                FROM player_games pg2
                JOIN games g2 ON pg2.game_id = g2.id
                WHERE pg2.player_id = pg.player_id
                  AND g2.season_id <= ?
            )
            GROUP BY pg.player_id
        ) last_team ON last_team.player_id = p.id
        JOIN teams t ON last_team.team_id = t.id
        WHERE p.id NOT IN (
            SELECT pg.player_id
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            WHERE g.season_id = ?
        )
    """
    historical_params: list[Any] = [season_id, season_id]
    if active_only:
        historical_query += " AND p.is_active = 1"
    if team_id:
        historical_query += " AND last_team.team_id = ?"
        historical_params.append(team_id)
    rows = conn.execute(historical_query, historical_params).fetchall()

    if not is_latest_season:
        return [dict(row) for row in rows]

    fallback_query = """
        SELECT
            p.id,
            p.name,
            p.position as pos,
            p.height,
            p.is_active,
            t.name as team,
            t.id as team_id
        FROM players p
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE p.is_active = 1
          AND p.team_id IS NOT NULL
          AND p.id NOT IN (
              SELECT pg.player_id
              FROM player_games pg
              JOIN games g ON pg.game_id = g.id
              WHERE g.season_id <= ?
          )
    """
    fallback_params: list[Any] = [season_id]
    if active_only:
        fallback_query += " AND p.is_active = 1"
    if team_id:
        fallback_query += " AND p.team_id = ?"
        fallback_params.append(team_id)

    # Deduplicate players that may appear in both result sets.
    deduped = {dict(row)["id"]: dict(row) for row in rows}
    for row in conn.execute(fallback_query, fallback_params).fetchall():
        d = dict(row)
        deduped.setdefault(d["id"], d)

    return list(deduped.values())


def get_player_detail(player_id: str) -> Optional[dict]:
    """Get detailed player info with career stats."""
    with get_connection() as conn:
        # Basic player info
        player = conn.execute(
            """SELECT p.*, t.name as team
               FROM players p
               LEFT JOIN teams t ON p.team_id = t.id
               WHERE p.id = ?""",
            (player_id,),
        ).fetchone()

        if not player:
            return None

        result = dict(player)

        # Season-by-season stats
        seasons = conn.execute(
            """SELECT
                g.season_id,
                s.label as season_label,
                t.id as team_id,
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
                SUM(pg.ast) as total_ast,
                SUM(pg.stl) as total_stl,
                SUM(pg.blk) as total_blk,
                SUM(pg.tov) as total_tov,
                SUM(pg.off_reb) as total_off_reb,
                SUM(pg.def_reb) as total_def_reb,
                SUM(pg.pf) as total_pf,
                AVG(pg.off_reb) as off_reb,
                AVG(pg.def_reb) as def_reb,
                AVG(pg.pf) as pf
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN seasons s ON g.season_id = s.id
            JOIN teams t ON pg.team_id = t.id
            WHERE pg.player_id = ?
            GROUP BY g.season_id
            ORDER BY g.season_id DESC""",
            (player_id,),
        ).fetchall()

        # Pre-fetch team context per season
        season_contexts: dict[str, tuple] = {}
        for row in seasons:
            sid = dict(row)["season_id"]
            if sid not in season_contexts:
                tt = get_team_season_totals(sid)
                ot = get_opponent_season_totals(sid)
                lc = _build_league_stats(sid, tt)
                season_contexts[sid] = (tt, ot, lc)

        result["seasons"] = {}
        for row in seasons:
            d = dict(row)
            for key in [
                "min",
                "pts",
                "reb",
                "ast",
                "stl",
                "blk",
                "tov",
                "off_reb",
                "def_reb",
                "pf",
            ]:
                d[key] = round(d[key], 1) if d[key] else 0.0
            sid = d["season_id"]
            tt, ot, lc = season_contexts.get(sid, ({}, {}, None))
            player_team = d.get("team_id") or result.get("team_id", "")
            ts = _build_team_stats(player_team, tt, ot)
            season_stats = compute_advanced_stats(d, team_stats=ts, league_stats=lc)
            # Inject +/- from lineup_stints
            season_stats["plus_minus"] = get_player_plus_minus_season(player_id, sid)
            result["seasons"][sid] = season_stats

        # Recent game log (last 10 games)
        games = conn.execute(
            """SELECT
                pg.*,
                g.game_date,
                g.home_team_id,
                g.away_team_id,
                g.home_score,
                g.away_score,
                ht.name as home_team_name,
                at.name as away_team_name
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN teams ht ON g.home_team_id = ht.id
            JOIN teams at ON g.away_team_id = at.id
            WHERE pg.player_id = ?
            ORDER BY g.game_date DESC
            LIMIT 10""",
            (player_id,),
        ).fetchall()

        result["recent_games"] = []
        for row in games:
            d = dict(row)
            is_home = d["team_id"] == d["home_team_id"]
            opponent = d["away_team_name"] if is_home else d["home_team_name"]
            team_score = d["home_score"] if is_home else d["away_score"]
            opp_score = d["away_score"] if is_home else d["home_score"]
            won = team_score > opp_score if team_score and opp_score else None
            result["recent_games"].append(
                {
                    "game_id": d["game_id"],
                    "game_date": d["game_date"],
                    "opponent": opponent,
                    "is_home": is_home,
                    "result": "W" if won else "L" if won is False else "-",
                    "minutes": d["minutes"],
                    "pts": d["pts"],
                    "reb": d["reb"],
                    "ast": d["ast"],
                    "stl": d["stl"],
                    "blk": d["blk"],
                    "tov": d["tov"],
                    "fgm": d["fgm"],
                    "fga": d["fga"],
                    "tpm": d["tpm"],
                    "tpa": d["tpa"],
                    "ftm": d["ftm"],
                    "fta": d["fta"],
                }
            )

        return result


def get_player_game_log(player_id: str, season_id: Optional[str] = None) -> list[dict]:
    """Get full game log for a player."""
    query = """
        SELECT
            pg.*,
            g.game_date,
            g.season_id,
            g.home_team_id,
            g.away_team_id,
            g.home_score,
            g.away_score,
            ht.name as home_team_name,
            at.name as away_team_name
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        WHERE pg.player_id = ?
    """
    params: list[Any] = [player_id]

    if season_id:
        query += " AND g.season_id = ?"
        params.append(season_id)

    query += " ORDER BY g.game_date DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            is_home = d["team_id"] == d["home_team_id"]
            opponent = d["away_team_name"] if is_home else d["home_team_name"]
            team_score = d["home_score"] if is_home else d["away_score"]
            opp_score = d["away_score"] if is_home else d["home_score"]
            won = team_score > opp_score if team_score and opp_score else None
            result.append(
                {
                    "game_id": d["game_id"],
                    "game_date": d["game_date"],
                    "season_id": d["season_id"],
                    "opponent": opponent,
                    "is_home": is_home,
                    "result": "W" if won else "L" if won is False else "-",
                    "minutes": d["minutes"],
                    "pts": d["pts"],
                    "reb": d["reb"],
                    "ast": d["ast"],
                    "stl": d["stl"],
                    "blk": d["blk"],
                    "tov": d["tov"],
                    "fgm": d["fgm"],
                    "fga": d["fga"],
                    "tpm": d["tpm"],
                    "tpa": d["tpa"],
                    "ftm": d["ftm"],
                    "fta": d["fta"],
                }
            )
        return result


def get_teams() -> list[dict]:
    """Get all teams."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, short_name, founded_year FROM teams ORDER BY name"
        ).fetchall()
        return [dict(row) for row in rows]


def get_team_detail(team_id: str, season_id: str) -> Optional[dict]:
    """Get team detail with roster and standings."""
    with get_connection() as conn:
        team = conn.execute("SELECT * FROM teams WHERE id = ?", (team_id,)).fetchone()

        if not team:
            return None

        result = dict(team)

        # Current roster (played in season + active gp=0 players on current roster)
        roster = conn.execute(
            """SELECT id, name, position, height, is_active
            FROM (
                SELECT DISTINCT
                    p.id, p.name, p.position, p.height, p.is_active
                FROM player_games pg
                JOIN players p ON pg.player_id = p.id
                JOIN games g ON pg.game_id = g.id
                WHERE pg.team_id = ? AND g.season_id = ?
                UNION
                SELECT
                    p.id, p.name, p.position, p.height, p.is_active
                FROM players p
                WHERE p.team_id = ?
                  AND p.is_active = 1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM player_games pg
                      JOIN games g ON pg.game_id = g.id
                      WHERE pg.player_id = p.id
                        AND g.season_id = ?
                  )
            )
            ORDER BY name""",
            (team_id, season_id, team_id, season_id),
        ).fetchall()
        result["roster"] = [dict(p) for p in roster]

        # Standings
        standing = conn.execute(
            """SELECT * FROM team_standings
               WHERE team_id = ? AND season_id = ?""",
            (team_id, season_id),
        ).fetchone()
        if standing:
            s = dict(standing)
            result["standings"] = {
                "rank": s["rank"],
                "wins": s["wins"],
                "losses": s["losses"],
                "win_pct": s["win_pct"],
                "games_behind": s["games_behind"],
                "home_record": f"{s['home_wins']}-{s['home_losses']}",
                "away_record": f"{s['away_wins']}-{s['away_losses']}",
                "streak": s["streak"],
                "last5": s["last5"],
            }

        # Recent games
        games = conn.execute(
            """SELECT
                g.id, g.game_date, g.home_team_id, g.away_team_id,
                g.home_score, g.away_score,
                ht.name as home_team_name,
                at.name as away_team_name
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.id
            JOIN teams at ON g.away_team_id = at.id
            WHERE g.season_id = ?
              AND (g.home_team_id = ? OR g.away_team_id = ?)
              AND g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
            ORDER BY g.game_date DESC
            LIMIT 10""",
            (season_id, team_id, team_id),
        ).fetchall()

        result["recent_games"] = []
        for row in games:
            d = dict(row)
            is_home = d["home_team_id"] == team_id
            opponent = d["away_team_name"] if is_home else d["home_team_name"]
            team_score = d["home_score"] if is_home else d["away_score"]
            opp_score = d["away_score"] if is_home else d["home_score"]
            won = team_score > opp_score if team_score and opp_score else None
            result["recent_games"].append(
                {
                    "game_id": d["id"],
                    "date": d["game_date"],
                    "opponent": opponent,
                    "is_home": is_home,
                    "result": "W" if won else "L" if won is False else "-",
                    "score": f"{team_score}-{opp_score}"
                    if team_score and opp_score
                    else "-",
                }
            )

        # Compute team advanced stats (ORtg, DRtg, NetRtg, Pace)
        team_totals_all = get_team_season_totals(season_id)
        opp_totals_all = get_opponent_season_totals(season_id)
        ts = _build_team_stats(team_id, team_totals_all, opp_totals_all)
        if ts:
            team_poss = estimate_possessions(
                ts["team_fga"], ts["team_fta"], ts["team_tov"], ts["team_oreb"]
            )
            opp_poss = estimate_possessions(
                ts["opp_fga"], ts["opp_fta"], ts["opp_tov"], ts["opp_oreb"]
            )
            team_min_5 = ts["team_min"] / 5 if ts["team_min"] else 0
            off_rtg = (
                round(ts["team_pts"] / team_poss * 100, 1) if team_poss > 0 else None
            )
            def_rtg = (
                round(ts["opp_pts"] / team_poss * 100, 1) if team_poss > 0 else None
            )
            net_rtg = (
                round(off_rtg - def_rtg, 1)
                if off_rtg is not None and def_rtg is not None
                else None
            )
            avg_poss = (team_poss + opp_poss) / 2
            pace = round(40 * avg_poss / team_min_5, 1) if team_min_5 > 0 else None
            result["team_stats"] = {
                "off_rtg": off_rtg,
                "def_rtg": def_rtg,
                "net_rtg": net_rtg,
                "pace": pace,
                "gp": ts.get("team_gp", 0),
            }

        return result


def get_games(
    season_id: str,
    team_id: Optional[str] = None,
    game_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Get games list with optional filters."""
    query = """
        SELECT
            g.id, g.game_date, g.home_score, g.away_score, g.game_type,
            g.home_team_id, g.away_team_id,
            ht.name as home_team_name, ht.short_name as home_team_short,
            at.name as away_team_name, at.short_name as away_team_short
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        WHERE g.season_id = ?
    """
    params: list[Any] = [season_id]

    if team_id:
        query += " AND (g.home_team_id = ? OR g.away_team_id = ?)"
        params.extend([team_id, team_id])

    if game_type:
        query += " AND g.game_type = ?"
        params.append(game_type)

    query += " ORDER BY g.game_date DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]


def get_game_boxscore(game_id: str) -> Optional[dict]:
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

        result = dict(game)

        # Get player stats for both teams
        players = conn.execute(
            """SELECT
                pg.*,
                p.name as player_name,
                p.position,
                t.name as team_name
            FROM player_games pg
            JOIN players p ON pg.player_id = p.id
            JOIN teams t ON pg.team_id = t.id
            WHERE pg.game_id = ?
            ORDER BY pg.team_id, pg.pts DESC""",
            (game_id,),
        ).fetchall()

        home_stats = []
        away_stats = []
        for row in players:
            d = dict(row)
            stat = {
                "player_id": d["player_id"],
                "player_name": d["player_name"],
                "position": d["position"],
                "minutes": d["minutes"],
                "pts": d["pts"],
                "reb": d["reb"],
                "ast": d["ast"],
                "stl": d["stl"],
                "blk": d["blk"],
                "tov": d["tov"],
                "pf": d["pf"],
                "fgm": d["fgm"],
                "fga": d["fga"],
                "tpm": d["tpm"],
                "tpa": d["tpa"],
                "ftm": d["ftm"],
                "fta": d["fta"],
            }
            if d["team_id"] == result["home_team_id"]:
                home_stats.append(stat)
            else:
                away_stats.append(stat)

        # Inject per-game +/- from lineup_stints
        game_stints = get_lineup_stints(game_id)
        if game_stints:
            pm: dict[str, int] = {}
            for s in game_stints:
                diff = ((s["end_score_for"] or 0) - (s["start_score_for"] or 0)) - (
                    (s["end_score_against"] or 0) - (s["start_score_against"] or 0)
                )
                for col in [
                    "player1_id",
                    "player2_id",
                    "player3_id",
                    "player4_id",
                    "player5_id",
                ]:
                    pid = s[col]
                    if pid:
                        pm[pid] = pm.get(pid, 0) + diff
            for stat in home_stats:
                stat["plus_minus"] = pm.get(stat["player_id"], 0)
            for stat in away_stats:
                stat["plus_minus"] = pm.get(stat["player_id"], 0)

        result["home_team_stats"] = home_stats
        result["away_team_stats"] = away_stats

        # Get team game stats if available
        team_stats = conn.execute(
            "SELECT * FROM team_games WHERE game_id = ?", (game_id,)
        ).fetchall()
        for row in team_stats:
            d = dict(row)
            key = "home_team_totals" if d["is_home"] else "away_team_totals"
            result[key] = {
                "fast_break_pts": d["fast_break_pts"],
                "paint_pts": d["paint_pts"],
                "two_pts": d["two_pts"],
                "three_pts": d["three_pts"],
            }

        return result


def get_seasons() -> list[dict]:
    """Get all seasons."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, label, start_date, end_date FROM seasons ORDER BY id DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_standings(season_id: str) -> list[dict]:
    """Get team standings for a season."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT ts.*, t.name as team_name, t.short_name
               FROM team_standings ts
               JOIN teams t ON ts.team_id = t.id
               WHERE ts.season_id = ?
               ORDER BY ts.rank""",
            (season_id,),
        ).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            result.append(
                {
                    "rank": d["rank"],
                    "team_id": d["team_id"],
                    "team_name": d["team_name"],
                    "short_name": d["short_name"],
                    "wins": d["wins"],
                    "losses": d["losses"],
                    "win_pct": d["win_pct"],
                    "games_behind": d["games_behind"],
                    "home_record": f"{d['home_wins']}-{d['home_losses']}",
                    "away_record": f"{d['away_wins']}-{d['away_losses']}",
                    "streak": d["streak"],
                    "last5": d["last5"],
                }
            )
        return result


def _get_leaders_query(category: str) -> tuple[str, int]:
    """Return hardcoded SQL query and min_games for a category.

    All queries are fully hardcoded to avoid SQL injection concerns.
    Returns (query_string, min_games_threshold).
    """
    base = (
        "SELECT p.id as player_id, p.name as player_name, "
        "t.name as team_name, t.id as team_id, COUNT(*) as gp, "
    )
    joins = (
        " FROM player_games pg "
        "JOIN games g ON pg.game_id = g.id "
        "JOIN players p ON pg.player_id = p.id "
        "JOIN teams t ON pg.team_id = t.id "
        "WHERE g.season_id = ? "
        "GROUP BY pg.player_id "
        "HAVING COUNT(*) >= ? "
        "ORDER BY value DESC LIMIT ?"
    )

    queries = {
        "pts": (base + "AVG(pg.pts) as value" + joins, 1),
        "reb": (base + "AVG(pg.reb) as value" + joins, 1),
        "ast": (base + "AVG(pg.ast) as value" + joins, 1),
        "stl": (base + "AVG(pg.stl) as value" + joins, 1),
        "blk": (base + "AVG(pg.blk) as value" + joins, 1),
        "min": (base + "AVG(pg.minutes) as value" + joins, 1),
        "fgp": (
            base
            + "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.fgm) * 1.0 / SUM(pg.fga) ELSE 0 END as value"
            + joins,
            10,
        ),
        "tpp": (
            base
            + "CASE WHEN SUM(pg.tpa) > 0 THEN SUM(pg.tpm) * 1.0 / SUM(pg.tpa) ELSE 0 END as value"
            + joins,
            10,
        ),
        "ftp": (
            base
            + "CASE WHEN SUM(pg.fta) > 0 THEN SUM(pg.ftm) * 1.0 / SUM(pg.fta) ELSE 0 END as value"
            + joins,
            10,
        ),
        "game_score": (
            base
            + "AVG(pg.pts + 0.4*pg.fgm - 0.7*pg.fga - 0.4*(pg.fta-pg.ftm)"
            + " + 0.7*pg.off_reb + 0.3*pg.def_reb + pg.stl + 0.7*pg.ast"
            + " + 0.7*pg.blk - 0.4*pg.pf - pg.tov) as value"
            + joins,
            1,
        ),
        "ts_pct": (
            base
            + "CASE WHEN SUM(pg.fga + 0.44*pg.fta) > 0"
            + " THEN SUM(pg.pts)*0.5/(SUM(pg.fga)+0.44*SUM(pg.fta)) ELSE 0 END as value"
            + joins,
            10,
        ),
        "pir": (
            base
            + "AVG(pg.pts+pg.reb+pg.ast+pg.stl+pg.blk-pg.tov"
            + "-(pg.fga-pg.fgm)-(pg.fta-pg.ftm)) as value"
            + joins,
            1,
        ),
    }

    return queries.get(category, queries["pts"])


def _get_per_leaders(season_id: str, limit: int = 10) -> list[dict]:
    """Get PER leaders by computing advanced stats for all players."""
    players = get_players(season_id, active_only=True)
    valid = [p for p in players if p.get("per") is not None and p.get("gp", 0) >= 1]
    sorted_players = sorted(valid, key=lambda p: p.get("per") or 0, reverse=True)
    return [
        {
            "rank": i,
            "player_id": p["id"],
            "player_name": p["name"],
            "team_name": p.get("team", ""),
            "team_id": p.get("team_id", ""),
            "gp": p.get("gp", 0),
            "value": round(p.get("per") or 0, 1),
        }
        for i, p in enumerate(sorted_players[:limit], 1)
    ]


def get_leaders(season_id: str, category: str = "pts", limit: int = 10) -> list[dict]:
    """Get statistical leaders for a category."""
    valid_categories = {
        "pts",
        "reb",
        "ast",
        "stl",
        "blk",
        "min",
        "fgp",
        "tpp",
        "ftp",
        "game_score",
        "ts_pct",
        "pir",
        "per",
    }

    if category not in valid_categories:
        category = "pts"

    if category == "per":
        return _get_per_leaders(season_id, limit)

    query, min_games = _get_leaders_query(category)

    with get_connection() as conn:
        rows = conn.execute(query, (season_id, min_games, limit)).fetchall()
        result = []
        for i, row in enumerate(rows, 1):
            d = dict(row)
            result.append(
                {
                    "rank": i,
                    "player_id": d["player_id"],
                    "player_name": d["player_name"],
                    "team_name": d["team_name"],
                    "team_id": d["team_id"],
                    "gp": d["gp"],
                    "value": round(d["value"], 3)
                    if category in ["fgp", "tpp", "ftp", "ts_pct"]
                    else round(d["value"], 1),
                }
            )
        return result


# =============================================================================
# FastAPI Application
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    logger.info("API server started")
    yield
    logger.info("API server stopped")


app = FastAPI(
    title="WKBL Stats API",
    description="REST API for Korean Women's Basketball League statistics",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# API Endpoints
# =============================================================================


@app.get("/players")
def api_get_players(
    season: str = Query(
        default=None, description="Season code (e.g., 046) or 'all' for all seasons"
    ),
    team: str = Query(default=None, description="Team ID filter"),
    active_only: bool = Query(default=True, description="Only active players"),
    include_no_games: bool = Query(
        default=True,
        description="Include active players with no games for selected season",
    ),
):
    """Get all players with their season statistics."""
    season_id, season_label = resolve_season(season)
    players = get_players(
        season_id,
        team_id=team,
        active_only=active_only,
        include_no_games=include_no_games,
    )
    return {
        "season": season_id or "all",
        "season_label": season_label,
        "count": len(players),
        "players": players,
    }


@app.get("/players/compare")
def api_compare_players(
    ids: str = Query(
        ..., description="Comma-separated player IDs (e.g., 095533,095104)"
    ),
    season: str = Query(default=None, description="Season code"),
):
    """Compare multiple players' stats."""
    season_id, season_label = resolve_season(season)
    if season_id is None:
        raise HTTPException(
            status_code=400, detail="Comparison does not support season=all"
        )
    player_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]

    if len(player_ids) < 2:
        raise HTTPException(status_code=400, detail="At least 2 player IDs required")
    if len(player_ids) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 players allowed")

    players = get_player_comparison(player_ids, season_id)
    return {
        "season": season_id,
        "season_label": season_label,
        "players": players,
    }


@app.get("/players/{player_id}")
def api_get_player(player_id: str):
    """Get detailed player information with career stats."""
    player = get_player_detail(player_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return player


@app.get("/players/{player_id}/gamelog")
def api_get_player_gamelog(
    player_id: str,
    season: str = Query(default=None, description="Season code filter"),
):
    """Get player's full game log."""
    games = get_player_game_log(player_id, season_id=season)
    if not games:
        raise HTTPException(status_code=404, detail="No games found")
    return {"player_id": player_id, "count": len(games), "games": games}


@app.get("/teams")
def api_get_teams():
    """Get all teams."""
    teams = get_teams()
    return {"count": len(teams), "teams": teams}


@app.get("/teams/{team_id}")
def api_get_team(
    team_id: str,
    season: str = Query(default=None, description="Season code"),
):
    """Get team details with roster and standings."""
    season_id, _ = resolve_season(season)
    if season_id is None:
        raise HTTPException(
            status_code=400, detail="Team detail does not support season=all"
        )
    team = get_team_detail(team_id, season_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"season": season_id, **team}


@app.get("/games")
def api_get_games(
    season: str = Query(default=None, description="Season code"),
    team: str = Query(default=None, description="Team ID filter"),
    game_type: str = Query(default=None, description="regular, playoff, or allstar"),
    limit: int = Query(default=50, le=100, description="Max results"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
):
    """Get games list with optional filters."""
    season_id, _ = resolve_season(season)
    if season_id is None:
        raise HTTPException(
            status_code=400, detail="Games list does not support season=all"
        )
    games = get_games(
        season_id, team_id=team, game_type=game_type, limit=limit, offset=offset
    )
    return {
        "season": season_id,
        "count": len(games),
        "games": games,
    }


@app.get("/games/{game_id}")
def api_get_game(game_id: str):
    """Get full game boxscore."""
    boxscore = get_game_boxscore(game_id)
    if not boxscore:
        raise HTTPException(status_code=404, detail="Game not found")
    return boxscore


@app.get("/games/{game_id}/position-matchups")
def api_get_game_position_matchups(
    game_id: str,
    scope: Optional[str] = Query(default=None, pattern="^(vs|whole)$"),
):
    """Get position matchup analysis rows for a game."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM games WHERE id = ?", (game_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Game not found")

    rows = get_position_matchups(game_id, scope=scope)
    return {"game_id": game_id, "scope": scope, "count": len(rows), "rows": rows}


@app.get("/seasons")
def api_get_seasons():
    """Get all seasons."""
    seasons = get_seasons()
    return {
        "current": CURRENT_SEASON,
        "count": len(seasons),
        "seasons": seasons,
    }


@app.get("/seasons/{season_id}/standings")
def api_get_standings(season_id: str):
    """Get team standings for a season."""
    standings = get_standings(season_id)
    if not standings:
        raise HTTPException(status_code=404, detail="Standings not found")
    return {
        "season": season_id,
        "season_label": SEASON_CODES.get(season_id, season_id),
        "standings": standings,
    }


@app.get("/leaders")
def api_get_leaders(
    season: str = Query(default=None, description="Season code"),
    category: str = Query(
        default="pts",
        description="Category: pts, reb, ast, stl, blk, min, fgp, tpp, ftp",
    ),
    limit: int = Query(default=10, le=50, description="Number of leaders"),
):
    """Get statistical leaders for a category."""
    season_id, _ = resolve_season(season)
    if season_id is None:
        raise HTTPException(
            status_code=400, detail="Leaders does not support season=all"
        )
    leaders = get_leaders(season_id, category=category, limit=limit)
    return {
        "season": season_id,
        "category": category,
        "leaders": leaders,
    }


@app.get("/leaders/all")
def api_get_all_leaders(
    season: str = Query(default=None, description="Season code"),
    limit: int = Query(default=5, le=20, description="Leaders per category"),
):
    """Get leaders for all major categories."""
    season_id, season_label = resolve_season(season)
    if season_id is None:
        raise HTTPException(
            status_code=400, detail="Leaders does not support season=all"
        )
    categories = [
        "pts",
        "reb",
        "ast",
        "stl",
        "blk",
        "game_score",
        "ts_pct",
        "pir",
        "per",
    ]

    categories_data: dict[str, list[dict]] = {}
    for cat in categories:
        categories_data[cat] = get_leaders(season_id, category=cat, limit=limit)

    return {
        "season": season_id,
        "season_label": season_label,
        "categories": categories_data,
    }


# =============================================================================
# Player Comparison
# =============================================================================


def _get_comparison_query(player_count: int) -> str:
    """Return hardcoded comparison query for 2-4 players."""
    base = """
        SELECT
            p.id, p.name, p.position, p.height,
            t.id as team_id, t.name as team,
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
            SUM(pg.ast) as total_ast,
            SUM(pg.stl) as total_stl,
            SUM(pg.blk) as total_blk,
            SUM(pg.tov) as total_tov,
            SUM(pg.off_reb) as total_off_reb,
            SUM(pg.def_reb) as total_def_reb,
            SUM(pg.pf) as total_pf,
            AVG(pg.off_reb) as off_reb,
            AVG(pg.def_reb) as def_reb,
            AVG(pg.pf) as pf
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        JOIN players p ON pg.player_id = p.id
        JOIN teams t ON pg.team_id = t.id
        WHERE pg.player_id IN ({placeholders}) AND g.season_id = ?
        GROUP BY pg.player_id
    """
    # Return query with hardcoded placeholder count (safe from injection)
    if player_count == 2:
        return base.format(placeholders="?,?")
    elif player_count == 3:
        return base.format(placeholders="?,?,?")
    elif player_count == 4:
        return base.format(placeholders="?,?,?,?")
    raise ValueError("Player count must be 2-4")


def get_player_comparison(player_ids: list[str], season_id: str) -> list[dict]:
    """Get stats for multiple players for comparison."""
    if not player_ids or len(player_ids) < 2 or len(player_ids) > 4:
        return []

    query = _get_comparison_query(len(player_ids))

    # Pre-fetch team context
    team_totals = get_team_season_totals(season_id)
    opp_totals = get_opponent_season_totals(season_id)
    league_ctx = _build_league_stats(season_id, team_totals)

    with get_connection() as conn:
        rows = conn.execute(query, (*player_ids, season_id)).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            for key in [
                "min",
                "pts",
                "reb",
                "ast",
                "stl",
                "blk",
                "tov",
                "off_reb",
                "def_reb",
                "pf",
            ]:
                d[key] = round(d[key], 1) if d[key] else 0
            ts = _build_team_stats(d.get("team_id", ""), team_totals, opp_totals)
            d = compute_advanced_stats(d, team_stats=ts, league_stats=league_ctx)

            # Clean up internal fields
            for key in [
                "total_fgm",
                "total_fga",
                "total_tpm",
                "total_tpa",
                "total_ftm",
                "total_fta",
            ]:
                del d[key]

            result.append(d)
        return result


# =============================================================================
# Player Highlights
# =============================================================================


def get_player_highlights(player_id: str) -> dict:
    """Get career and season highlights for a player."""
    with get_connection() as conn:
        # Career highs (single game)
        career_highs = conn.execute(
            """SELECT
                MAX(pts) as pts, MAX(reb) as reb, MAX(ast) as ast,
                MAX(stl) as stl, MAX(blk) as blk, MAX(minutes) as min
            FROM player_games WHERE player_id = ?""",
            (player_id,),
        ).fetchone()

        # Season averages
        seasons = conn.execute(
            """SELECT
                g.season_id, s.label as season_label,
                AVG(pg.pts) as pts, AVG(pg.reb) as reb, AVG(pg.ast) as ast
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN seasons s ON g.season_id = s.id
            WHERE pg.player_id = ?
            GROUP BY g.season_id
            ORDER BY g.season_id""",
            (player_id,),
        ).fetchall()

        # Best season (by points)
        best_season = max(seasons, key=lambda x: x["pts"]) if seasons else None

        return {
            "career_highs": dict(career_highs) if career_highs else {},
            "seasons": [dict(s) for s in seasons],
            "best_season": dict(best_season) if best_season else None,
        }


@app.get("/players/{player_id}/highlights")
def api_get_player_highlights(player_id: str):
    """Get player's career and season highlights."""
    highlights = get_player_highlights(player_id)
    if not highlights["seasons"]:
        raise HTTPException(status_code=404, detail="Player not found")
    return {"player_id": player_id, **highlights}


# =============================================================================
# Search
# =============================================================================


@app.get("/search")
def api_search(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(default=10, le=20, description="Max results per category"),
):
    """Search players and teams."""
    query = f"%{q}%"

    with get_connection() as conn:
        # Search players
        players = conn.execute(
            """SELECT id, name, position, team_id,
                      (SELECT name FROM teams WHERE id = players.team_id) as team
               FROM players WHERE name LIKE ? LIMIT ?""",
            (query, limit),
        ).fetchall()

        # Search teams
        teams = conn.execute(
            "SELECT id, name, short_name FROM teams WHERE name LIKE ? OR short_name LIKE ? LIMIT ?",
            (query, query, limit),
        ).fetchall()

    return {
        "query": q,
        "players": [dict(p) for p in players],
        "teams": [dict(t) for t in teams],
    }


# =============================================================================
# Health Check
# =============================================================================


@app.get("/health")
def health_check():
    """Health check endpoint."""
    with get_connection() as conn:
        row = conn.execute("SELECT COUNT(*) as count FROM games").fetchone()
        games_count = row["count"] if row else 0

    return {
        "status": "healthy",
        "games_in_db": games_count,
        "current_season": CURRENT_SEASON,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)  # nosec B104
