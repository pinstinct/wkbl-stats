"""Tests for ingest_wkbl._save_to_db() function."""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def _make_args(**overrides):
    """Build a minimal args namespace for _save_to_db."""
    defaults = {
        "selected_id": "04601055",
        "first_game_date": "20251027",
        "season_label": "2025-26",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _make_record(
    name="김선수", team="KB스타즈", pos="G", pts="15", game_id="04601010", **kw
):
    return {
        "name": name,
        "team": team,
        "pos": pos,
        "min": kw.get("min", 30.0),
        "pts": pts,
        "reb": kw.get("reb", "5"),
        "off": kw.get("off", "2"),
        "def": kw.get("def", "4"),
        "ast": kw.get("ast", "3"),
        "stl": kw.get("stl", "1"),
        "blk": kw.get("blk", "0"),
        "to": kw.get("to", "2"),
        "pf": kw.get("pf", "1"),
        "two_pm_a": kw.get("two_pm_a", "4-10"),
        "three_pm_a": kw.get("three_pm_a", "2-5"),
        "ftm_a": kw.get("ftm_a", "1-2"),
        "_game_id": game_id,
    }


def _make_player(name="김선수", team="KB스타즈", pno="095001", is_active=1):
    return {
        "name": name,
        "team": team,
        "pno": pno,
        "pos": "G",
        "height": "170cm",
        "is_active": is_active,
    }


class TestSaveToDb:
    """Tests for _save_to_db orchestration function."""

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_inserts_season_and_teams(self, mock_resolve, mock_db):
        """init_db, insert_season called with correct args."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        _save_to_db(args, [], [], [], [])

        mock_db.init_db.assert_called_once()
        mock_db.insert_season.assert_called_once_with(
            season_id="046",
            label="2025-26",
            start_date="2025-10-27",
        )

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_builds_player_id_map(self, mock_resolve, mock_db):
        """active_players pno used as player_id."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        active = [_make_player(pno="095001")]
        records = [_make_record()]

        _save_to_db(args, records, [], active, [("04601010", "20251105")])

        # insert_player should be called with player_id from pno
        insert_calls = mock_db.insert_player.call_args_list
        pids = [
            c.kwargs.get("player_id")
            or c[1].get("player_id", c[0][0] if c[0] else None)
            for c in insert_calls
        ]
        assert "095001" in pids

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_unique_name_fallback(self, mock_resolve, mock_db):
        """Player in game_records only, unique name → gets matched pno."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        # Active player is on different team but same name → unique name match
        active = [_make_player(name="박선수", team="삼성생명", pno="095002")]
        records = [_make_record(name="박선수", team="우리은행")]

        _save_to_db(args, records, [], active, [("04601010", "20251105")])

        insert_calls = mock_db.insert_player.call_args_list
        # Should have resolved to 095002 via name-only match (1 match)
        pids = [str(c) for c in insert_calls]
        assert any("095002" in s for s in pids)

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_placeholder_id(self, mock_resolve, mock_db):
        """Multiple name matches → placeholder ID assigned."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        # Two players with same name on different teams
        active = [
            _make_player(name="이선수", team="KB스타즈", pno="095010"),
            _make_player(name="이선수", team="삼성생명", pno="095011"),
        ]
        # Record with yet another team (not matching either)
        records = [_make_record(name="이선수", team="우리은행")]

        _save_to_db(args, records, [], active, [("04601010", "20251105")])

        insert_calls = mock_db.insert_player.call_args_list
        # Third player should get placeholder (name_team format)
        pids_str = str(insert_calls)
        assert "이선수_우리은행" in pids_str

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=3)
    def test_resolves_ambiguous(self, mock_resolve, mock_db):
        """resolve_ambiguous_players is called and result logged."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        records = [_make_record()]
        active = [_make_player()]

        _save_to_db(args, records, [], active, [("04601010", "20251105")])

        mock_resolve.assert_called_once()

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_inserts_games_with_schedule(self, mock_resolve, mock_db):
        """schedule_info → correct home/away team assignment."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        schedule_info = {
            "04601010": {
                "date": "20251105",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            }
        }
        records = [
            _make_record(name="A", team="KB스타즈", game_id="04601010"),
            _make_record(name="B", team="삼성생명", game_id="04601010"),
        ]

        _save_to_db(args, records, [], [], [("04601010", "20251105")], schedule_info)

        mock_db.insert_game.assert_called_once()
        call_kwargs = mock_db.insert_game.call_args
        assert call_kwargs.kwargs["home_team_id"] == "kb"
        assert call_kwargs.kwargs["away_team_id"] == "samsung"

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_inserts_games_no_schedule(self, mock_resolve, mock_db):
        """No schedule → teams inferred from records."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        records = [
            _make_record(name="A", team="KB스타즈", game_id="04601010"),
            _make_record(name="B", team="삼성생명", game_id="04601010"),
        ]

        _save_to_db(args, records, [], [], [("04601010", "20251105")])

        mock_db.insert_game.assert_called_once()

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_single_team_records(self, mock_resolve, mock_db):
        """Only 1 team in records → home=away."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        records = [
            _make_record(name="A", team="KB스타즈", game_id="04601010"),
            _make_record(name="B", team="KB스타즈", game_id="04601010"),
        ]

        _save_to_db(args, records, [], [], [("04601010", "20251105")])

        call_kwargs = mock_db.insert_game.call_args
        assert call_kwargs.kwargs["home_team_id"] == call_kwargs.kwargs["away_team_id"]

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_calculates_scores(self, mock_resolve, mock_db):
        """Home/away scores computed from pts sum."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        schedule_info = {
            "04601010": {
                "date": "20251105",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            }
        }
        records = [
            _make_record(name="A", team="KB스타즈", pts="20", game_id="04601010"),
            _make_record(name="B", team="KB스타즈", pts="15", game_id="04601010"),
            _make_record(name="C", team="삼성생명", pts="18", game_id="04601010"),
        ]

        _save_to_db(args, records, [], [], [("04601010", "20251105")], schedule_info)

        call_kwargs = mock_db.insert_game.call_args
        assert call_kwargs.kwargs["home_score"] == 35  # 20+15
        assert call_kwargs.kwargs["away_score"] == 18

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_creates_player_game_records(self, mock_resolve, mock_db):
        """bulk_insert_player_games called with correct data."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        records = [_make_record(game_id="04601010")]

        _save_to_db(args, records, [], [_make_player()], [("04601010", "20251105")])

        mock_db.bulk_insert_player_games.assert_called_once()
        db_records = mock_db.bulk_insert_player_games.call_args[0][0]
        assert len(db_records) == 1
        assert db_records[0]["game_id"] == "04601010"
        assert db_records[0]["pts"] == 15
        assert db_records[0]["reb"] == 5

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_saves_team_records(self, mock_resolve, mock_db):
        """team_records + schedule → insert_team_game called."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        schedule_info = {
            "04601010": {
                "date": "20251105",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            }
        }
        team_records = [
            {"_game_id": "04601010", "team": "삼성생명", "fast_break": 10},
            {"_game_id": "04601010", "team": "KB스타즈", "fast_break": 12},
        ]

        _save_to_db(args, [], team_records, [], [], schedule_info)

        assert mock_db.insert_team_game.call_count == 2

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_skips_team_without_schedule(self, mock_resolve, mock_db):
        """team_records without schedule_info → skip."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        team_records = [
            {"_game_id": "04601010", "team": "KB스타즈"},
            {"_game_id": "04601010", "team": "삼성생명"},
        ]

        _save_to_db(args, [], team_records, [], [])

        mock_db.insert_team_game.assert_not_called()

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_auto_detects_game_type(self, mock_resolve, mock_db):
        """parse_game_type used for game type detection."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        schedule_info = {
            "04604010": {
                "date": "20260315",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            }
        }
        records = [
            _make_record(team="KB스타즈", game_id="04604010"),
            _make_record(name="B", team="삼성생명", game_id="04604010"),
        ]

        _save_to_db(args, records, [], [], [("04604010", "20260315")], schedule_info)

        call_kwargs = mock_db.insert_game.call_args
        assert call_kwargs.kwargs["game_type"] == "playoff"

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_handles_empty_records(self, mock_resolve, mock_db):
        """Empty records → no games or player_games inserted."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        _save_to_db(args, [], [], [], [])

        mock_db.insert_game.assert_not_called()
        mock_db.bulk_insert_player_games.assert_not_called()

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl.resolve_ambiguous_players", return_value=0)
    def test_active_keys(self, mock_resolve, mock_db):
        """is_active=1 players have is_active=1 in insert_player."""
        from ingest_wkbl import _save_to_db

        args = _make_args()
        active = [
            _make_player(name="A", team="KB스타즈", pno="095001", is_active=1),
            _make_player(name="B", team="삼성생명", pno="095002", is_active=0),
        ]

        _save_to_db(args, [], [], active, [])

        insert_calls = mock_db.insert_player.call_args_list
        # Find the call with player A (is_active=1)
        a_calls = [c for c in insert_calls if c.kwargs.get("name") == "A"]
        b_calls = [c for c in insert_calls if c.kwargs.get("name") == "B"]
        if a_calls:
            assert a_calls[0].kwargs.get("is_active") == 1
        if b_calls:
            assert b_calls[0].kwargs.get("is_active") == 0
