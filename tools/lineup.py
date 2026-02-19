"""Lineup tracking engine for WKBL play-by-play data.

Tracks on-court lineups (5-man units) through substitution events,
computes per-stint scoring, and derives player +/- and On/Off ratings.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

import database
from config import setup_logging

logger = setup_logging(__name__)


def _parse_game_clock(clock: str) -> int:
    """Parse MM:SS game clock to total seconds."""
    if not clock:
        return 0
    parts = clock.split(":")
    if len(parts) != 2:
        return 0
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, TypeError):
        return 0


def _extract_name_from_description(description: str) -> Optional[str]:
    """Extract player name from PBP description like '홍길동  교체(IN)'."""
    if not description:
        return None
    # Pattern: name followed by spaces and 교체(IN) or 교체(OUT)
    m = re.match(r"(.+?)\s+교체\((IN|OUT)\)", description.strip())
    if m:
        return m.group(1).strip()
    return None


def resolve_null_player_ids(game_id: str) -> int:
    """Resolve NULL player_id in PBP sub events using description names.

    Matches names from descriptions like '홍길동  교체(OUT)' to player_games
    records for the same game and team.

    Returns:
        Number of records resolved.
    """
    with database.get_connection() as conn:
        # Find sub events with NULL player_id
        null_events = conn.execute(
            """SELECT id, team_id, description FROM play_by_play
               WHERE game_id = ? AND player_id IS NULL
               AND event_type IN ('sub_in', 'sub_out')""",
            (game_id,),
        ).fetchall()

        if not null_events:
            return 0

        # Build name -> player_id mapping from player_games for this game
        pg_rows = conn.execute(
            """SELECT pg.player_id, pg.team_id, p.name
               FROM player_games pg
               JOIN players p ON pg.player_id = p.id
               WHERE pg.game_id = ?""",
            (game_id,),
        ).fetchall()

        # Map (name, team_id) -> player_id
        name_map: Dict[tuple, str] = {}
        for row in pg_rows:
            key = (row["name"], row["team_id"])
            name_map[key] = row["player_id"]

        resolved = 0
        for event in null_events:
            name = _extract_name_from_description(event["description"])
            if not name:
                continue
            pid = name_map.get((name, event["team_id"]))
            if pid:
                conn.execute(
                    "UPDATE play_by_play SET player_id = ? WHERE id = ?",
                    (pid, event["id"]),
                )
                resolved += 1

        conn.commit()
        if resolved:
            logger.info(
                f"Resolved {resolved}/{len(null_events)} NULL player_ids "
                f"in game {game_id}"
            )
        return resolved


def infer_starters(game_id: str, team_id: str, quarter: str) -> Set[str]:
    """Infer the starting 5 players for a team in a given quarter.

    Strategy:
    1. Collect player_ids from events before the first sub_in/sub_out
       for this team in this quarter.
    2. If fewer than 5, backfill from player_games sorted by minutes DESC.
    """
    with database.get_connection() as conn:
        events = conn.execute(
            """SELECT player_id, event_type FROM play_by_play
               WHERE game_id = ? AND quarter = ?
               ORDER BY event_order""",
            (game_id, quarter),
        ).fetchall()

    # Collect players appearing before first sub for this team
    seen: Set[str] = set()
    for ev in events:
        if ev["event_type"] in ("sub_in", "sub_out") and ev["player_id"]:
            # Check if this sub is for our team by looking at the player
            # We need team info — get it from the event itself
            break
        if ev["player_id"]:
            seen.add(ev["player_id"])

    # More precise: scan events for this team only, stop at first sub for this team
    with database.get_connection() as conn:
        team_events = conn.execute(
            """SELECT player_id, event_type FROM play_by_play
               WHERE game_id = ? AND quarter = ? AND team_id = ?
               ORDER BY event_order""",
            (game_id, quarter, team_id),
        ).fetchall()

    starters: Set[str] = set()
    for ev in team_events:
        if ev["event_type"] in ("sub_in", "sub_out"):
            # sub_out player was on court (starter), sub_in was not
            if ev["event_type"] == "sub_out" and ev["player_id"]:
                starters.add(ev["player_id"])
            break
        if ev["player_id"] and ev["player_id"] not in starters:
            starters.add(ev["player_id"])

    # If we found a sub_out before 5 players, also add all players seen before it
    # Re-scan more carefully: collect all unique players before first sub event
    starters_v2: Set[str] = set()
    for ev in team_events:
        if ev["event_type"] in ("sub_in", "sub_out"):
            if ev["event_type"] == "sub_out" and ev["player_id"]:
                starters_v2.add(ev["player_id"])
            break
        if ev["player_id"]:
            starters_v2.add(ev["player_id"])

    starters = starters_v2

    # Backfill from player_games if fewer than 5
    if len(starters) < 5:
        with database.get_connection() as conn:
            top_min = conn.execute(
                """SELECT player_id FROM player_games
                   WHERE game_id = ? AND team_id = ?
                   ORDER BY minutes DESC""",
                (game_id, team_id),
            ).fetchall()

        for row in top_min:
            if len(starters) >= 5:
                break
            if row["player_id"] not in starters:
                starters.add(row["player_id"])

    return starters


def track_game_lineups(game_id: str) -> List[Dict[str, Any]]:
    """Track lineup stints for an entire game.

    Returns list of stint dicts, each containing:
    - game_id, stint_order, quarter, team_id
    - players: list of 5 player_ids on court
    - start/end event orders
    - start/end scores (for/against from team perspective)
    - duration_seconds
    """
    # Get game info for home/away
    with database.get_connection() as conn:
        game = conn.execute(
            "SELECT home_team_id, away_team_id FROM games WHERE id = ?",
            (game_id,),
        ).fetchone()
        if not game:
            return []

        all_events = conn.execute(
            """SELECT event_order, quarter, game_clock, team_id, player_id,
                      event_type, home_score, away_score
               FROM play_by_play
               WHERE game_id = ?
               ORDER BY event_order""",
            (game_id,),
        ).fetchall()

    if not all_events:
        return []

    home_team = game["home_team_id"]
    away_team = game["away_team_id"]

    # Identify unique quarters in order
    quarters: List[str] = []
    for ev in all_events:
        if ev["quarter"] and ev["quarter"] not in quarters:
            quarters.append(ev["quarter"])

    all_stints: List[Dict[str, Any]] = []
    stint_counter = 0

    for team_id in [home_team, away_team]:
        is_home = team_id == home_team

        for quarter in quarters:
            q_events = [e for e in all_events if e["quarter"] == quarter]
            if not q_events:
                continue

            # Infer starters for this quarter
            current_lineup = infer_starters(game_id, team_id, quarter)
            if len(current_lineup) < 5:
                continue  # Can't track without 5 players

            current_lineup = set(list(current_lineup)[:5])  # Ensure exactly 5

            # Start a stint
            first_ev = q_events[0]
            stint_start_order = first_ev["event_order"]
            stint_start_clock = first_ev["game_clock"]
            if is_home:
                stint_start_for = first_ev["home_score"] or 0
                stint_start_against = first_ev["away_score"] or 0
            else:
                stint_start_for = first_ev["away_score"] or 0
                stint_start_against = first_ev["home_score"] or 0

            # Track through events
            last_ev = first_ev
            for ev in q_events:
                last_ev = ev

                # Check for substitution events for this team
                if ev["event_type"] in ("sub_in", "sub_out") and ev["player_id"]:
                    # Determine if this sub belongs to our team
                    sub_player = ev["player_id"]
                    is_our_sub = False

                    if ev["event_type"] == "sub_out" and sub_player in current_lineup:
                        is_our_sub = True
                    elif (
                        ev["event_type"] == "sub_in"
                        and sub_player not in current_lineup
                    ):
                        # Check team_id from event
                        if ev["team_id"] == team_id:
                            is_our_sub = True

                    if not is_our_sub:
                        continue

                    if ev["event_type"] == "sub_out":
                        # Close current stint
                        if is_home:
                            end_for = ev["home_score"] or 0
                            end_against = ev["away_score"] or 0
                        else:
                            end_for = ev["away_score"] or 0
                            end_against = ev["home_score"] or 0

                        start_secs = _parse_game_clock(stint_start_clock)
                        end_secs = _parse_game_clock(ev["game_clock"])
                        duration = max(start_secs - end_secs, 0)

                        players_sorted = sorted(current_lineup)
                        stint_counter += 1
                        all_stints.append(
                            {
                                "game_id": game_id,
                                "stint_order": stint_counter,
                                "quarter": quarter,
                                "team_id": team_id,
                                "players": players_sorted,
                                "start_event_order": stint_start_order,
                                "end_event_order": ev["event_order"],
                                "start_score_for": stint_start_for,
                                "start_score_against": stint_start_against,
                                "end_score_for": end_for,
                                "end_score_against": end_against,
                                "duration_seconds": duration,
                            }
                        )

                        # Apply sub: remove outgoing player
                        current_lineup.discard(sub_player)

                        # Start new stint
                        stint_start_order = ev["event_order"]
                        stint_start_clock = ev["game_clock"]
                        stint_start_for = end_for
                        stint_start_against = end_against

                    elif ev["event_type"] == "sub_in":
                        # Add incoming player to lineup
                        current_lineup.add(sub_player)
                        # Trim to 5 if somehow over
                        if len(current_lineup) > 5:
                            current_lineup = set(sorted(current_lineup)[:5])

            # Close the final stint for this quarter
            if is_home:
                end_for = last_ev["home_score"] or 0
                end_against = last_ev["away_score"] or 0
            else:
                end_for = last_ev["away_score"] or 0
                end_against = last_ev["home_score"] or 0

            start_secs = _parse_game_clock(stint_start_clock)
            end_secs = _parse_game_clock(last_ev["game_clock"])
            duration = max(start_secs - end_secs, 0)

            players_sorted = sorted(current_lineup)
            if len(players_sorted) == 5:
                stint_counter += 1
                all_stints.append(
                    {
                        "game_id": game_id,
                        "stint_order": stint_counter,
                        "quarter": quarter,
                        "team_id": team_id,
                        "players": players_sorted,
                        "start_event_order": stint_start_order,
                        "end_event_order": last_ev["event_order"],
                        "start_score_for": stint_start_for,
                        "start_score_against": stint_start_against,
                        "end_score_for": end_for,
                        "end_score_against": end_against,
                        "duration_seconds": duration,
                    }
                )

    return all_stints


def compute_player_plus_minus(game_id: str) -> Dict[str, int]:
    """Compute per-game +/- for all players.

    Each player's +/- is the sum of (score_for_diff - score_against_diff)
    across all stints they were on court.
    """
    stints = track_game_lineups(game_id)
    pm: Dict[str, int] = {}

    for s in stints:
        diff = (s["end_score_for"] - s["start_score_for"]) - (
            s["end_score_against"] - s["start_score_against"]
        )
        for pid in s["players"]:
            pm[pid] = pm.get(pid, 0) + diff

    return pm


def compute_player_on_off(player_id: str, season_id: str) -> Dict[str, Any]:
    """Compute On/Off court rating for a player over a season.

    Uses lineup_stints from the database.
    """
    result = {
        "on_court_pts_for": 0,
        "on_court_pts_against": 0,
        "off_court_pts_for": 0,
        "off_court_pts_against": 0,
        "on_off_diff": 0.0,
        "plus_minus": 0,
    }

    with database.get_connection() as conn:
        # Get all games for this player's team in the season
        player_team = conn.execute(
            """SELECT DISTINCT pg.team_id FROM player_games pg
               JOIN games g ON pg.game_id = g.id
               WHERE pg.player_id = ? AND g.season_id = ?""",
            (player_id, season_id),
        ).fetchone()

        if not player_team:
            return result

        team_id = player_team["team_id"]

        # Get all stints for this team in the season
        stints = conn.execute(
            """SELECT ls.* FROM lineup_stints ls
               JOIN games g ON ls.game_id = g.id
               WHERE ls.team_id = ? AND g.season_id = ?""",
            (team_id, season_id),
        ).fetchall()

    if not stints:
        return result

    on_pts_for = 0
    on_pts_against = 0
    off_pts_for = 0
    off_pts_against = 0
    plus_minus = 0

    for s in stints:
        pts_for = (s["end_score_for"] or 0) - (s["start_score_for"] or 0)
        pts_against = (s["end_score_against"] or 0) - (s["start_score_against"] or 0)

        # Check if player is in this stint's lineup
        stint_players = [
            s["player1_id"],
            s["player2_id"],
            s["player3_id"],
            s["player4_id"],
            s["player5_id"],
        ]

        if player_id in stint_players:
            on_pts_for += pts_for
            on_pts_against += pts_against
            plus_minus += pts_for - pts_against
        else:
            off_pts_for += pts_for
            off_pts_against += pts_against

    # On/Off differential (per-stint average difference)
    on_diff = on_pts_for - on_pts_against
    off_diff = off_pts_for - off_pts_against

    # Count stints for averaging
    on_stints = sum(
        1
        for s in stints
        if player_id
        in [
            s["player1_id"],
            s["player2_id"],
            s["player3_id"],
            s["player4_id"],
            s["player5_id"],
        ]
    )
    off_stints = len(stints) - on_stints

    on_avg = on_diff / on_stints if on_stints > 0 else 0.0
    off_avg = off_diff / off_stints if off_stints > 0 else 0.0
    on_off_diff = round(on_avg - off_avg, 1)

    result = {
        "on_court_pts_for": on_pts_for,
        "on_court_pts_against": on_pts_against,
        "off_court_pts_for": off_pts_for,
        "off_court_pts_against": off_pts_against,
        "on_off_diff": on_off_diff,
        "plus_minus": plus_minus,
    }

    return result
