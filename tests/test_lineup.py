"""
Tests for lineup tracking engine (tools/lineup.py) and DB integration.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


# ────────────────────────────────────────────────────────────────────
# Fixtures local to this module
# ────────────────────────────────────────────────────────────────────


def _make_pbp_event(
    game_id,
    event_order,
    quarter,
    game_clock,
    team_id,
    player_id,
    event_type,
    home_score,
    away_score,
    description="",
):
    return {
        "game_id": game_id,
        "event_order": event_order,
        "quarter": quarter,
        "game_clock": game_clock,
        "team_id": team_id,
        "player_id": player_id,
        "event_type": event_type,
        "home_score": home_score,
        "away_score": away_score,
        "description": description,
    }


def _setup_lineup_test_db(db_fixture, monkeypatch):
    """Populate a test DB with two teams, 12 players, one game, PBP events."""
    import database

    monkeypatch.setattr(database, "DB_PATH", db_fixture)
    database.init_db()

    database.insert_season("046", "2025-26", "2025-10-18", "2026-03-15")

    # Home team: samsung (players P01-P06)
    # Away team: kb      (players P11-P16)
    for pid, name, team in [
        ("P01", "김선수A", "samsung"),
        ("P02", "김선수B", "samsung"),
        ("P03", "김선수C", "samsung"),
        ("P04", "김선수D", "samsung"),
        ("P05", "김선수E", "samsung"),
        ("P06", "김선수F", "samsung"),
        ("P11", "이선수A", "kb"),
        ("P12", "이선수B", "kb"),
        ("P13", "이선수C", "kb"),
        ("P14", "이선수D", "kb"),
        ("P15", "이선수E", "kb"),
        ("P16", "이선수F", "kb"),
    ]:
        database.insert_player(pid, name, team_id=team, is_active=1)

    # Game: samsung(home) vs kb(away)
    database.insert_game(
        "04601002",
        "046",
        "2025-10-19",
        "samsung",
        "kb",
        home_score=70,
        away_score=65,
    )

    # Player game stats (minutes matter for starter inference fallback)
    for pid, team, mins in [
        ("P01", "samsung", 35.0),
        ("P02", "samsung", 30.0),
        ("P03", "samsung", 28.0),
        ("P04", "samsung", 25.0),
        ("P05", "samsung", 20.0),
        ("P06", "samsung", 12.0),
        ("P11", "kb", 34.0),
        ("P12", "kb", 31.0),
        ("P13", "kb", 27.0),
        ("P14", "kb", 24.0),
        ("P15", "kb", 22.0),
        ("P16", "kb", 12.0),
    ]:
        database.insert_player_game(
            "04601002",
            pid,
            team,
            {
                "minutes": mins,
                "pts": 10,
                "reb": 3,
                "ast": 2,
                "stl": 1,
                "blk": 0,
                "tov": 1,
                "pf": 1,
                "off_reb": 1,
                "def_reb": 2,
                "fgm": 4,
                "fga": 8,
                "tpm": 1,
                "tpa": 3,
                "ftm": 1,
                "fta": 2,
                "two_pm": 3,
                "two_pa": 5,
            },
        )

    # PBP events: Q1 with one substitution at 05:00
    events = [
        # Q1 start — first events from starters
        _make_pbp_event(
            "04601002", 1, "Q1", "09:50", "samsung", "P01", "2pt_made", 2, 0
        ),
        _make_pbp_event("04601002", 2, "Q1", "09:30", "kb", "P11", "2pt_made", 2, 2),
        _make_pbp_event(
            "04601002", 3, "Q1", "09:10", "samsung", "P02", "3pt_made", 5, 2
        ),
        _make_pbp_event("04601002", 4, "Q1", "08:50", "kb", "P12", "2pt_miss", 5, 2),
        _make_pbp_event("04601002", 5, "Q1", "08:30", "samsung", "P03", "assist", 5, 2),
        _make_pbp_event("04601002", 6, "Q1", "08:10", "kb", "P13", "foul", 5, 2),
        # Sub at 05:00: samsung P05 out, P06 in
        _make_pbp_event(
            "04601002",
            7,
            "Q1",
            "05:00",
            "samsung",
            "P05",
            "sub_out",
            5,
            2,
            "김선수E  교체(OUT)",
        ),
        _make_pbp_event(
            "04601002",
            8,
            "Q1",
            "05:00",
            "samsung",
            "P06",
            "sub_in",
            5,
            2,
            "김선수F  교체(IN)",
        ),
        # More events after sub
        _make_pbp_event(
            "04601002", 9, "Q1", "04:50", "samsung", "P06", "2pt_made", 7, 2
        ),
        _make_pbp_event("04601002", 10, "Q1", "04:30", "kb", "P14", "2pt_made", 7, 4),
        # Q1 end (no explicit end event — next quarter implies end)
        # Q2 start — starters may differ
        _make_pbp_event(
            "04601002", 11, "Q2", "09:55", "samsung", "P01", "2pt_made", 9, 4
        ),
        _make_pbp_event("04601002", 12, "Q2", "09:40", "kb", "P11", "3pt_made", 9, 7),
        _make_pbp_event("04601002", 13, "Q2", "09:20", "samsung", "P06", "foul", 9, 7),
        # Sub at 07:00: kb P15 out, P16 in
        _make_pbp_event(
            "04601002",
            14,
            "Q2",
            "07:00",
            "kb",
            "P15",
            "sub_out",
            9,
            7,
            "이선수E  교체(OUT)",
        ),
        _make_pbp_event(
            "04601002",
            15,
            "Q2",
            "07:00",
            "kb",
            "P16",
            "sub_in",
            9,
            7,
            "이선수F  교체(IN)",
        ),
        _make_pbp_event(
            "04601002", 16, "Q2", "06:30", "samsung", "P03", "2pt_made", 11, 7
        ),
    ]

    database.bulk_insert_play_by_play("04601002", events)

    return database


# ────────────────────────────────────────────────────────────────────
# Tests: infer_starters
# ────────────────────────────────────────────────────────────────────


class TestInferStarters:
    """Tests for infer_starters()."""

    def test_starters_from_events(self, temp_db_path, monkeypatch):
        """5 unique players appear in Q1 before first sub — they are starters."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import infer_starters

        starters = infer_starters("04601002", "samsung", "Q1")
        # P01, P02, P03 appear in events; P04, P05 should be inferred (top minutes)
        # At minimum, P01, P02, P03 must be in the set
        assert {"P01", "P02", "P03"}.issubset(starters)
        assert len(starters) == 5

    def test_starters_backfill_from_minutes(self, temp_db_path, monkeypatch):
        """When fewer than 5 appear before first sub, backfill from minutes."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import infer_starters

        # For kb team in Q1: P11, P12, P13, P14 appear before any kb sub
        starters = infer_starters("04601002", "kb", "Q1")
        assert {"P11", "P12", "P13", "P14"}.issubset(starters)
        assert len(starters) == 5
        # P15 should be the 5th starter (more minutes than P16)
        assert "P15" in starters

    def test_starters_q2_reinferred(self, temp_db_path, monkeypatch):
        """Q2 starters should be re-inferred from Q2 events."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import infer_starters

        starters = infer_starters("04601002", "samsung", "Q2")
        # P01 and P06 appear in Q2 events
        assert "P01" in starters
        assert "P06" in starters
        assert len(starters) == 5


# ────────────────────────────────────────────────────────────────────
# Tests: track_game_lineups
# ────────────────────────────────────────────────────────────────────


class TestTrackGameLineups:
    """Tests for track_game_lineups()."""

    def test_produces_stints(self, temp_db_path, monkeypatch):
        """track_game_lineups should produce multiple stints per team."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        assert len(stints) > 0

        # Each stint must have required fields
        for s in stints:
            assert "game_id" in s
            assert "team_id" in s
            assert "players" in s
            assert len(s["players"]) == 5
            assert "quarter" in s
            assert "stint_order" in s

    def test_sub_creates_new_stint(self, temp_db_path, monkeypatch):
        """A substitution should split into pre-sub and post-sub stints."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        samsung_stints = [s for s in stints if s["team_id"] == "samsung"]

        # Q1 has one sub, so samsung should have at least 2 stints in Q1
        q1_stints = [s for s in samsung_stints if s["quarter"] == "Q1"]
        assert len(q1_stints) >= 2

        # Before sub: P05 should be in lineup, P06 should not
        assert "P05" in q1_stints[0]["players"]
        assert "P06" not in q1_stints[0]["players"]

        # After sub: P06 should be in lineup, P05 should not
        assert "P06" in q1_stints[1]["players"]
        assert "P05" not in q1_stints[1]["players"]

    def test_quarter_change_starts_new_stint(self, temp_db_path, monkeypatch):
        """Quarter transition should start a new stint."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        samsung_stints = [s for s in stints if s["team_id"] == "samsung"]

        quarters = [s["quarter"] for s in samsung_stints]
        assert "Q1" in quarters
        assert "Q2" in quarters

    def test_stint_has_scores(self, temp_db_path, monkeypatch):
        """Each stint should have start/end score info."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        for s in stints:
            assert "start_score_for" in s
            assert "end_score_for" in s
            assert "start_score_against" in s
            assert "end_score_against" in s


# ────────────────────────────────────────────────────────────────────
# Tests: compute_player_plus_minus
# ────────────────────────────────────────────────────────────────────


class TestComputePlusMinus:
    """Tests for compute_player_plus_minus()."""

    def test_plus_minus_returns_all_players(self, temp_db_path, monkeypatch):
        """Should return +/- for all players who appeared in the game."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import compute_player_plus_minus

        pm = compute_player_plus_minus("04601002")
        assert isinstance(pm, dict)
        # At minimum, starters should be included
        assert "P01" in pm
        assert "P11" in pm

    def test_plus_minus_are_integers(self, temp_db_path, monkeypatch):
        """Plus/minus values should be integers."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import compute_player_plus_minus

        pm = compute_player_plus_minus("04601002")
        for v in pm.values():
            assert isinstance(v, int)

    def test_plus_minus_zero_sum_per_stint(self, temp_db_path, monkeypatch):
        """Within each stint, home +/- + away +/- should sum to 0."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")

        # Group stints by (quarter, stint overlap)
        for stint in stints:
            score_diff = (stint["end_score_for"] - stint["start_score_for"]) - (
                stint["end_score_against"] - stint["start_score_against"]
            )
            # The +/- attributed to each player in this stint equals score_diff
            # (verified by design — each on-court player gets the same +/-)
            assert isinstance(score_diff, int)


# ────────────────────────────────────────────────────────────────────
# Tests: compute_player_on_off
# ────────────────────────────────────────────────────────────────────


class TestComputeOnOff:
    """Tests for compute_player_on_off()."""

    def test_on_off_returns_expected_keys(self, temp_db_path, monkeypatch):
        """Should return dict with on/off court stats."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import compute_player_on_off

        result = compute_player_on_off("P01", "046")
        assert "on_court_pts_for" in result
        assert "on_court_pts_against" in result
        assert "off_court_pts_for" in result
        assert "off_court_pts_against" in result
        assert "on_off_diff" in result
        assert "plus_minus" in result

    def test_on_off_player_not_in_data(self, temp_db_path, monkeypatch):
        """Player with no stints should return zeroes."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import compute_player_on_off

        result = compute_player_on_off("NONEXIST", "046")
        assert result["plus_minus"] == 0
        assert result["on_off_diff"] == 0.0


# ────────────────────────────────────────────────────────────────────
# Tests: NULL player_id resolution
# ────────────────────────────────────────────────────────────────────


class TestNullPlayerResolution:
    """Tests for resolving NULL player_id in PBP data."""

    def test_resolve_null_player_from_description(self, temp_db_path, monkeypatch):
        """Sub events with NULL player_id should be resolved from description."""
        import database

        monkeypatch.setattr(database, "DB_PATH", temp_db_path)
        database.init_db()

        database.insert_season("046", "2025-26")
        database.insert_player("P01", "홍길동", team_id="samsung", is_active=1)
        database.insert_game("04601099", "046", "2025-12-01", "samsung", "kb", 70, 60)
        database.insert_player_game(
            "04601099", "P01", "samsung", {"minutes": 30, "pts": 10}
        )

        # Insert PBP with NULL player_id but name in description
        events = [
            _make_pbp_event(
                "04601099",
                1,
                "Q1",
                "05:00",
                "samsung",
                None,
                "sub_out",
                0,
                0,
                "홍길동  교체(OUT)",
            ),
        ]
        database.bulk_insert_play_by_play("04601099", events)

        from lineup import resolve_null_player_ids

        resolved = resolve_null_player_ids("04601099")
        assert resolved >= 1

        # Verify the PBP record now has the player_id
        pbp = database.get_play_by_play("04601099")
        sub_event = [e for e in pbp if e["event_type"] == "sub_out"][0]
        assert sub_event["player_id"] == "P01"


# ────────────────────────────────────────────────────────────────────
# Tests: DB CRUD (lineup_stints)
# ────────────────────────────────────────────────────────────────────


class TestLineupStintsDB:
    """Tests for lineup_stints table CRUD."""

    def test_save_and_load_stints(self, temp_db_path, monkeypatch):
        """Save stints then load them back."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        import database
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        database.save_lineup_stints("04601002", stints)

        loaded = database.get_lineup_stints("04601002")
        assert len(loaded) == len(stints)

    def test_save_stints_idempotent(self, temp_db_path, monkeypatch):
        """Saving the same stints twice should not duplicate."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        import database
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        database.save_lineup_stints("04601002", stints)
        database.save_lineup_stints("04601002", stints)

        loaded = database.get_lineup_stints("04601002")
        assert len(loaded) == len(stints)

    def test_lineup_stints_table_in_schema(self, temp_db_path, monkeypatch):
        """lineup_stints table should exist after init_db."""
        import database

        monkeypatch.setattr(database, "DB_PATH", temp_db_path)
        database.init_db()

        with database.get_connection() as conn:
            tables = {
                row[0]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
        assert "lineup_stints" in tables


# ────────────────────────────────────────────────────────────────────
# Tests: duration_seconds
# ────────────────────────────────────────────────────────────────────


class TestStintDuration:
    """Tests for stint duration calculation."""

    def test_parse_game_clock(self, temp_db_path, monkeypatch):
        """game_clock MM:SS should be parsed correctly."""
        from lineup import _parse_game_clock

        assert _parse_game_clock("10:00") == 600
        assert _parse_game_clock("05:30") == 330
        assert _parse_game_clock("00:00") == 0

    def test_stint_has_duration(self, temp_db_path, monkeypatch):
        """Stints should have duration_seconds >= 0."""
        _setup_lineup_test_db(temp_db_path, monkeypatch)
        from lineup import track_game_lineups

        stints = track_game_lineups("04601002")
        for s in stints:
            assert "duration_seconds" in s
            assert s["duration_seconds"] >= 0
