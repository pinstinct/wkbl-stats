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
from database import get_connection, init_db

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


def get_players(
    season_id: str, team_id: Optional[str] = None, active_only: bool = True
) -> list[dict]:
    """Get all players with their season stats."""
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
            SUM(pg.fta) as total_fta
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        JOIN players p ON pg.player_id = p.id
        JOIN teams t ON pg.team_id = t.id
        WHERE g.season_id = ?
    """
    params: list[Any] = [season_id]

    if active_only:
        query += " AND p.is_active = 1"

    if team_id:
        query += " AND pg.team_id = ?"
        params.append(team_id)

    query += " GROUP BY pg.player_id ORDER BY AVG(pg.pts) DESC"

    with get_connection() as conn:
        rows = conn.execute(query, params).fetchall()

        result = []
        for row in rows:
            d = dict(row)
            # Calculate percentages
            d["fgp"] = (
                round(d["total_fgm"] / d["total_fga"], 3) if d["total_fga"] else 0.0
            )
            d["tpp"] = (
                round(d["total_tpm"] / d["total_tpa"], 3) if d["total_tpa"] else 0.0
            )
            d["ftp"] = (
                round(d["total_ftm"] / d["total_fta"], 3) if d["total_fta"] else 0.0
            )
            # Round averages
            for key in ["min", "pts", "reb", "ast", "stl", "blk", "tov"]:
                d[key] = round(d[key], 1) if d[key] else 0.0
            result.append(d)

        return result


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
            JOIN seasons s ON g.season_id = s.id
            JOIN teams t ON pg.team_id = t.id
            WHERE pg.player_id = ?
            GROUP BY g.season_id
            ORDER BY g.season_id DESC""",
            (player_id,),
        ).fetchall()

        result["seasons"] = {}
        for row in seasons:
            d = dict(row)
            d["fgp"] = (
                round(d["total_fgm"] / d["total_fga"], 3) if d["total_fga"] else 0.0
            )
            d["tpp"] = (
                round(d["total_tpm"] / d["total_tpa"], 3) if d["total_tpa"] else 0.0
            )
            d["ftp"] = (
                round(d["total_ftm"] / d["total_fta"], 3) if d["total_fta"] else 0.0
            )
            for key in ["min", "pts", "reb", "ast", "stl", "blk", "tov"]:
                d[key] = round(d[key], 1) if d[key] else 0.0
            result["seasons"][d["season_id"]] = d

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

        # Current roster (players who played for this team this season)
        roster = conn.execute(
            """SELECT DISTINCT
                p.id, p.name, p.position, p.height, p.is_active
            FROM player_games pg
            JOIN players p ON pg.player_id = p.id
            JOIN games g ON pg.game_id = g.id
            WHERE pg.team_id = ? AND g.season_id = ?
            ORDER BY p.name""",
            (team_id, season_id),
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
                "last5": s["last10"],  # Note: DB has last10 but WKBL provides last5
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
                    "last5": d["last10"],
                }
            )
        return result


def get_leaders(season_id: str, category: str = "pts", limit: int = 10) -> list[dict]:
    """Get statistical leaders for a category."""
    valid_categories = {
        "pts": "AVG(pg.pts)",
        "reb": "AVG(pg.reb)",
        "ast": "AVG(pg.ast)",
        "stl": "AVG(pg.stl)",
        "blk": "AVG(pg.blk)",
        "min": "AVG(pg.minutes)",
        "fgp": "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.fgm) * 1.0 / SUM(pg.fga) ELSE 0 END",
        "tpp": "CASE WHEN SUM(pg.tpa) > 0 THEN SUM(pg.tpm) * 1.0 / SUM(pg.tpa) ELSE 0 END",
        "ftp": "CASE WHEN SUM(pg.fta) > 0 THEN SUM(pg.ftm) * 1.0 / SUM(pg.fta) ELSE 0 END",
    }

    if category not in valid_categories:
        category = "pts"

    # Minimum games for percentage categories
    min_games = 10 if category in ["fgp", "tpp", "ftp"] else 1

    # Build query with whitelisted aggregate function
    agg_func = valid_categories[category]
    query = (  # nosec B608
        "SELECT p.id as player_id, p.name as player_name, "
        "t.name as team_name, t.id as team_id, COUNT(*) as gp, "
        + agg_func
        + " as value "
        "FROM player_games pg "
        "JOIN games g ON pg.game_id = g.id "
        "JOIN players p ON pg.player_id = p.id "
        "JOIN teams t ON pg.team_id = t.id "
        "WHERE g.season_id = ? "
        "GROUP BY pg.player_id "
        "HAVING COUNT(*) >= ? "
        "ORDER BY value DESC LIMIT ?"
    )

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
                    if category in ["fgp", "tpp", "ftp"]
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
    season: str = Query(default=None, description="Season code (e.g., 046)"),
    team: str = Query(default=None, description="Team ID filter"),
    active_only: bool = Query(default=True, description="Only active players"),
):
    """Get all players with their season statistics."""
    season_id = season or max(SEASON_CODES.keys())
    players = get_players(season_id, team_id=team, active_only=active_only)
    return {
        "season": season_id,
        "season_label": SEASON_CODES.get(season_id, season_id),
        "count": len(players),
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
    season_id = season or max(SEASON_CODES.keys())
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
    season_id = season or max(SEASON_CODES.keys())
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
    season_id = season or max(SEASON_CODES.keys())
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
    season_id = season or max(SEASON_CODES.keys())
    categories = ["pts", "reb", "ast", "stl", "blk"]

    categories_data: dict[str, list[dict]] = {}
    for cat in categories:
        categories_data[cat] = get_leaders(season_id, category=cat, limit=limit)

    return {
        "season": season_id,
        "season_label": SEASON_CODES.get(season_id, season_id),
        "categories": categories_data,
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
