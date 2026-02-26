"""Tests for orchestration functions in ingest_wkbl."""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def _make_args(**overrides):
    """Build a minimal args namespace."""
    defaults = {
        "selected_id": "04601055",
        "first_game_date": "20251027",
        "selected_game_date": "20251027",
        "season_label": "2025-26",
        "cache_dir": "/tmp/cache",
        "no_cache": True,
        "delay": 0,
        "save_db": False,
        "force_refresh": False,
        "fetch_team_stats": False,
        "fetch_standings": False,
        "fetch_team_category_stats": False,
        "fetch_head_to_head": False,
        "fetch_game_mvp": False,
        "fetch_quarter_scores": False,
        "fetch_play_by_play": False,
        "fetch_shot_charts": False,
        "include_future": False,
        "end_date": None,
        "game_type": "regular",
        "output": "/tmp/output.json",
        "active_only": False,
        "auto": False,
        "load_all_players": False,
        "fetch_profiles": False,
        "compute_lineups": False,
        "all_seasons": False,
        "seasons": None,
        "backfill_games": None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# =========================================================================
# _ingest_single_season tests
# =========================================================================


class TestIngestSingleSeason:
    """Tests for _ingest_single_season()."""

    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_basic_flow(self, mock_meta, mock_fetch):
        """Basic flow: fetch records and return them."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = (
            [{"name": "A"}],  # records
            [],  # team_records
            [("04601010", "20251105")],  # game_items
            {},  # schedule_info
        )

        args = _make_args()
        records, team_recs, items = _ingest_single_season(
            args, "046", "2025-26", [], ["01"]
        )

        assert len(records) == 1
        assert len(items) == 1

    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_past_end_date(self, mock_meta, mock_fetch):
        """Past season uses fixed end date (April 30)."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20241027",
            "selectedId": "04501001",
            "selectedGameDate": "20241027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args()
        _ingest_single_season(args, "045", "2024-25", [], ["01"])

        # end_date passed to _fetch_game_records should be 20250430
        call_args = mock_fetch.call_args
        assert call_args[0][1] == "20250430"

    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_current_uses_today(self, mock_meta, mock_fetch):
        """Current season uses today's date as end_date."""
        import datetime

        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(end_date=None)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        call_args = mock_fetch.call_args
        today = datetime.date.today().strftime("%Y%m%d")
        assert call_args[0][1] == today

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_incremental(self, mock_meta, mock_fetch, mock_db):
        """force_refresh=False → passes existing IDs to fetch."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_db.get_existing_game_ids.return_value = {"04601001", "04601002"}
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(save_db=True, force_refresh=False)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        call_kwargs = mock_fetch.call_args
        assert call_kwargs[1]["existing_game_ids"] == {"04601001", "04601002"}

    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_force_refresh(self, mock_meta, mock_fetch, mock_db):
        """force_refresh=True → no existing IDs filter."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(save_db=True, force_refresh=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        call_kwargs = mock_fetch.call_args
        assert call_kwargs[1]["existing_game_ids"] is None

    @patch("ingest_wkbl._save_future_games")
    @patch("ingest_wkbl._save_to_db")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_future_games(
        self, mock_meta, mock_fetch, mock_db, mock_save, mock_future
    ):
        """include_future → _save_future_games called."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        schedule = {
            "04601060": {"date": "20260315", "home_team": "KB", "away_team": "삼성"}
        }
        mock_fetch.return_value = ([], [], [("04601010", "20251105")], schedule)

        args = _make_args(save_db=True, include_future=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_future.assert_called_once()

    @patch("ingest_wkbl.fetch_team_standings")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_standings(
        self, mock_meta, mock_fetch, mock_db, mock_standings
    ):
        """fetch_standings → standings fetched and saved."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_standings.return_value = [{"rank": 1, "team_name": "KB"}]

        args = _make_args(save_db=True, fetch_standings=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_standings.assert_called_once()
        mock_db.bulk_insert_team_standings.assert_called_once()

    @patch("ingest_wkbl.fetch_team_standings", side_effect=Exception("network error"))
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_standings_exception(
        self, mock_meta, mock_fetch, mock_db, mock_standings
    ):
        """Standings fetch failure → continues without error."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(save_db=True, fetch_standings=True)
        # Should not raise
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

    @patch("ingest_wkbl.fetch_team_category_stats")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_category_stats(
        self, mock_meta, mock_fetch, mock_db, mock_cat
    ):
        """fetch_team_category_stats → saved to DB."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_cat.return_value = {"pts": [{"team": "KB", "value": 80}]}

        args = _make_args(save_db=True, fetch_team_category_stats=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_db.bulk_insert_team_category_stats.assert_called_once()

    @patch(
        "ingest_wkbl.fetch_team_category_stats",
        side_effect=Exception("cat stats error"),
    )
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_category_stats_exception(
        self, mock_meta, mock_fetch, mock_db, mock_cat
    ):
        """Category stats fetch failure should not abort season ingest."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(save_db=True, fetch_team_category_stats=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_cat.assert_called_once()
        mock_db.bulk_insert_team_category_stats.assert_not_called()

    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_no_save_db(self, mock_meta, mock_fetch):
        """save_db=False → no DB operations."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = (
            [{"name": "A"}],
            [],
            [("04601010", "20251105")],
            {},
        )

        args = _make_args(save_db=False)
        with patch("ingest_wkbl._save_to_db") as mock_save:
            records, _, _ = _ingest_single_season(args, "046", "2025-26", [], ["01"])
            mock_save.assert_not_called()

    @patch("ingest_wkbl.fetch_all_head_to_head")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_h2h(self, mock_meta, mock_fetch, mock_db, mock_h2h):
        """fetch_head_to_head → H2H records saved."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_h2h.return_value = [{"team_a": "KB", "team_b": "삼성"}]

        args = _make_args(save_db=True, fetch_head_to_head=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_h2h.assert_called_once()
        mock_db.bulk_insert_head_to_head.assert_called_once()
        mock_db.populate_quarter_scores_from_h2h.assert_called_once()

    @patch("ingest_wkbl.fetch_game_mvp")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_mvp(self, mock_meta, mock_fetch, mock_db, mock_mvp):
        """fetch_game_mvp → MVP records saved."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_mvp.return_value = [{"player": "A", "rank": 1}]

        args = _make_args(save_db=True, fetch_game_mvp=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_mvp.assert_called_once()
        mock_db.bulk_insert_game_mvp.assert_called_once()

    @patch("ingest_wkbl.fetch_game_mvp", side_effect=Exception("mvp error"))
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_mvp_exception(
        self, mock_meta, mock_fetch, mock_db, mock_mvp
    ):
        """MVP fetch failure should not abort season ingest."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})

        args = _make_args(save_db=True, fetch_game_mvp=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_mvp.assert_called_once()
        mock_db.bulk_insert_game_mvp.assert_not_called()

    @patch("ingest_wkbl.fetch_quarter_scores")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_quarter_scores(
        self, mock_meta, mock_fetch, mock_db, mock_qs
    ):
        """fetch_quarter_scores → quarter scores updated."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_qs.return_value = [{"game_id": "04601010", "q1_home": 20}]

        args = _make_args(save_db=True, fetch_quarter_scores=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_qs.assert_called_once()
        mock_db.bulk_update_quarter_scores.assert_called_once()

    @patch("ingest_wkbl.fetch_play_by_play")
    @patch("ingest_wkbl.fetch_shot_chart")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_per_game_data(
        self, mock_meta, mock_fetch, mock_db, mock_shots, mock_pbp
    ):
        """fetch_play_by_play + fetch_shot_charts → per-game data fetched."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_db.get_existing_game_ids.return_value = {"04601010"}
        mock_pbp.return_value = [{"event": "score"}]
        mock_shots.return_value = [{"x": 10, "y": 20}]

        args = _make_args(save_db=True, fetch_play_by_play=True, fetch_shot_charts=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_pbp.assert_called_once()
        mock_shots.assert_called_once()
        mock_db.bulk_insert_play_by_play.assert_called_once()
        mock_db.bulk_insert_shot_charts.assert_called_once()

    @patch("ingest_wkbl.fetch_play_by_play", side_effect=Exception("pbp error"))
    @patch("ingest_wkbl.fetch_shot_chart", side_effect=Exception("shot error"))
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.get_season_meta_by_code")
    def test_single_season_per_game_data_exceptions(
        self, mock_meta, mock_fetch, mock_db, mock_shots, mock_pbp
    ):
        """Per-game fetch failures should be logged and skipped."""
        from ingest_wkbl import _ingest_single_season

        mock_meta.return_value = {
            "firstGameDate": "20251027",
            "selectedId": "04601001",
            "selectedGameDate": "20251027",
        }
        mock_fetch.return_value = ([], [], [], {})
        mock_db.get_existing_game_ids.return_value = {"04601010"}

        args = _make_args(save_db=True, fetch_play_by_play=True, fetch_shot_charts=True)
        _ingest_single_season(args, "046", "2025-26", [], ["01"])

        mock_pbp.assert_called_once()
        mock_shots.assert_called_once()
        mock_db.bulk_insert_play_by_play.assert_not_called()
        mock_db.bulk_insert_shot_charts.assert_not_called()


# =========================================================================
# _ingest_multiple_seasons tests
# =========================================================================


class TestIngestMultipleSeasons:
    """Tests for _ingest_multiple_seasons()."""

    @patch("ingest_wkbl._ingest_single_season")
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl.database")
    def test_multi_all_seasons(self, mock_db, mock_load, mock_ingest):
        """all_seasons → processes all known seasons."""
        from ingest_wkbl import SEASON_CODES, _ingest_multiple_seasons

        mock_ingest.return_value = ([], [], [])

        args = _make_args(all_seasons=True, save_db=True)
        _ingest_multiple_seasons(args)

        assert mock_ingest.call_count == len(SEASON_CODES)

    @patch("ingest_wkbl._ingest_single_season")
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl.database")
    def test_multi_specific_seasons(self, mock_db, mock_load, mock_ingest):
        """Specific season codes processed."""
        from ingest_wkbl import _ingest_multiple_seasons

        mock_ingest.return_value = ([], [], [])

        args = _make_args(all_seasons=False, seasons=["045", "046"], save_db=True)
        _ingest_multiple_seasons(args)

        assert mock_ingest.call_count == 2

    @patch("ingest_wkbl.load_active_players", return_value=[])
    def test_multi_invalid_code(self, mock_load):
        """Invalid season code → SystemExit."""
        from ingest_wkbl import _ingest_multiple_seasons

        args = _make_args(all_seasons=False, seasons=["999"], save_db=False)

        with pytest.raises(SystemExit):
            _ingest_multiple_seasons(args)

    @patch("ingest_wkbl._ingest_single_season")
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl.database")
    def test_multi_exception_per_season(self, mock_db, mock_load, mock_ingest):
        """One season fails → others still processed."""
        from ingest_wkbl import _ingest_multiple_seasons

        call_count = 0

        def side_effect(*a, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("season error")
            return ([], [], [])

        mock_ingest.side_effect = side_effect

        args = _make_args(all_seasons=False, seasons=["045", "046"], save_db=True)
        _ingest_multiple_seasons(args)

        assert mock_ingest.call_count == 2

    @patch("ingest_wkbl._ingest_single_season", return_value=([], [], []))
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl.database")
    def test_multi_resolves_orphans(self, mock_db, mock_load, mock_ingest):
        """save_db → resolve_orphan_players called."""
        from ingest_wkbl import _ingest_multiple_seasons

        args = _make_args(all_seasons=False, seasons=["046"], save_db=True)
        _ingest_multiple_seasons(args)

        mock_db.resolve_orphan_players.assert_called_once()

    @patch("ingest_wkbl._ingest_single_season", return_value=([], [], []))
    @patch("ingest_wkbl.load_all_players")
    @patch("ingest_wkbl.database")
    def test_multi_load_all_players(self, mock_db, mock_load_all, mock_ingest):
        """--load-all-players → load_all_players called."""
        from ingest_wkbl import _ingest_multiple_seasons

        mock_load_all.return_value = {
            "001": {"name": "A", "team": "KB", "pos": "G", "height": "170cm"},
        }

        args = _make_args(
            all_seasons=False, seasons=["046"], save_db=True, load_all_players=True
        )
        _ingest_multiple_seasons(args)

        mock_load_all.assert_called_once()


# =========================================================================
# main() tests
# =========================================================================


class TestMain:
    """Tests for main() function."""

    @patch("ingest_wkbl._generate_predictions_for_game_ids")
    def test_main_backfill_mode(self, mock_gen):
        """--backfill-games → calls prediction backfill and returns."""
        from ingest_wkbl import main

        with patch("sys.argv", ["ingest", "--backfill-games", "04601010", "04601011"]):
            main()

        mock_gen.assert_called_once_with(["04601010", "04601011"])

    @patch("ingest_wkbl._ingest_multiple_seasons")
    def test_main_multi_season_mode(self, mock_multi):
        """--all-seasons → calls _ingest_multiple_seasons."""
        from ingest_wkbl import main

        with patch(
            "sys.argv", ["ingest", "--all-seasons", "--save-db", "--compute-lineups"]
        ):
            main()

        mock_multi.assert_called_once()

    @patch("ingest_wkbl.logger.warning")
    @patch("ingest_wkbl.aggregate_players", return_value=[])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records", return_value=([], [], [], {}))
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    @patch("ingest_wkbl._write_output")
    def test_main_warns_when_save_db_without_lineup_sources(
        self,
        mock_write,
        mock_db,
        mock_resolve,
        mock_fetch,
        mock_load,
        mock_agg,
        mock_warn,
    ):
        """--save-db without pbp/lineups should warn about +/- completeness."""
        from ingest_wkbl import main

        with patch("sys.argv", ["ingest", "--season-label", "2025-26", "--save-db"]):
            main()

        mock_warn.assert_called_once()

    def test_main_requires_season_label_in_single_season_mode(self):
        """Single-season mode without --season-label should fail parser validation."""
        from ingest_wkbl import main

        with patch("sys.argv", ["ingest"]):
            with pytest.raises(SystemExit):
                main()

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl.aggregate_players", return_value=[])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_single_season_basic(
        self, mock_db, mock_resolve, mock_fetch, mock_load, mock_agg, mock_write
    ):
        """Single season basic flow."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})

        with patch("sys.argv", ["ingest", "--season-label", "2025-26"]):
            main()

        mock_resolve.assert_called_once()
        mock_fetch.assert_called_once()

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl.aggregate_players")
    @patch("ingest_wkbl.load_active_players")
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_active_only_filter(
        self, mock_db, mock_resolve, mock_fetch, mock_load, mock_agg, mock_write
    ):
        """--active-only filters output to active players."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})
        mock_load.return_value = [
            {
                "name": "A",
                "team": "KB스타즈",
                "pno": "1",
                "pos": "G",
                "height": "170cm",
            },
        ]
        mock_agg.return_value = [
            {"name": "A", "team": "KB스타즈", "pts": 10},
            {"name": "B", "team": "삼성생명", "pts": 8},
        ]

        with patch(
            "sys.argv", ["ingest", "--season-label", "2025-26", "--active-only"]
        ):
            main()

        # _write_output should be called with filtered list
        write_args = mock_write.call_args[0]
        players = write_args[1]
        assert len(players) == 1
        assert players[0]["name"] == "A"

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl._compute_lineups_for_season")
    @patch("ingest_wkbl._convert_db_stats_to_players")
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_db_aggregation(
        self,
        mock_db,
        mock_resolve,
        mock_fetch,
        mock_load,
        mock_convert,
        mock_lineups,
        mock_write,
    ):
        """save_db + existing games → DB aggregation used."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})
        mock_db.get_existing_game_ids.return_value = {"04601001"}
        mock_db.get_all_season_stats.return_value = [{"name": "X", "pts": 10}]
        mock_convert.return_value = [{"name": "X", "pts": 10}]

        def set_selected_id(args):
            args.selected_id = "04601002"
            return "20260224"

        mock_resolve.side_effect = set_selected_id

        with patch(
            "sys.argv",
            ["ingest", "--season-label", "2025-26", "--save-db", "--compute-lineups"],
        ):
            main()

        mock_db.get_all_season_stats.assert_called_once()
        mock_convert.assert_called_once()

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl._compute_lineups_for_season")
    @patch("ingest_wkbl.aggregate_players", return_value=[{"name": "fallback"}])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_db_aggregation_fallback(
        self,
        mock_db,
        mock_resolve,
        mock_fetch,
        mock_load,
        mock_agg,
        mock_lineups,
        mock_write,
    ):
        """DB stats empty → falls back to aggregate_players."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})
        mock_db.get_existing_game_ids.return_value = {"04601001"}
        mock_db.get_all_season_stats.return_value = []  # Empty

        with patch(
            "sys.argv",
            ["ingest", "--season-label", "2025-26", "--save-db", "--compute-lineups"],
        ):
            main()

        mock_agg.assert_called_once()

    @patch("ingest_wkbl._compute_lineups_for_season")
    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl.aggregate_players", return_value=[])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_compute_lineups(
        self,
        mock_db,
        mock_resolve,
        mock_fetch,
        mock_load,
        mock_agg,
        mock_write,
        mock_lineups,
    ):
        """--compute-lineups → _compute_lineups_for_season called."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})

        with patch(
            "sys.argv",
            ["ingest", "--season-label", "2025-26", "--save-db", "--compute-lineups"],
        ):
            main()

        mock_lineups.assert_called_once()

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl.aggregate_players", return_value=[])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    def test_main_no_save_db(
        self, mock_resolve, mock_fetch, mock_load, mock_agg, mock_write
    ):
        """No --save-db → aggregate_players used directly."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([{"name": "A"}], [], [], {})
        mock_agg.return_value = [{"name": "A", "pts": 10}]

        with patch("sys.argv", ["ingest", "--season-label", "2025-26"]):
            main()

        mock_agg.assert_called_once()

    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl.load_all_players")
    @patch("ingest_wkbl.aggregate_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl._resolve_season_params", return_value="20260224")
    @patch("ingest_wkbl.database")
    def test_main_load_all_players(
        self, mock_db, mock_resolve, mock_fetch, mock_agg, mock_load_all, mock_write
    ):
        """--load-all-players → load_all_players called."""
        from ingest_wkbl import main

        mock_fetch.return_value = ([], [], [], {})
        mock_load_all.return_value = {
            "001": {"name": "A", "team": "KB", "pos": "G", "height": "170cm"},
        }

        with patch(
            "sys.argv",
            ["ingest", "--season-label", "2025-26", "--load-all-players"],
        ):
            main()

        mock_load_all.assert_called_once()

    @patch("ingest_wkbl._compute_lineups_for_season")
    @patch("ingest_wkbl.fetch_team_standings")
    @patch("ingest_wkbl.fetch_team_category_stats")
    @patch("ingest_wkbl.fetch_all_head_to_head")
    @patch("ingest_wkbl.fetch_game_mvp")
    @patch("ingest_wkbl.fetch_quarter_scores")
    @patch("ingest_wkbl.fetch_play_by_play")
    @patch("ingest_wkbl.fetch_shot_chart")
    @patch("ingest_wkbl._save_to_db")
    @patch("ingest_wkbl._write_output")
    @patch("ingest_wkbl._convert_db_stats_to_players", return_value=[])
    @patch("ingest_wkbl.load_active_players", return_value=[])
    @patch("ingest_wkbl._fetch_game_records")
    @patch("ingest_wkbl.database")
    def test_main_all_fetch_flags(
        self,
        mock_db,
        mock_fetch_records,
        mock_load,
        mock_convert,
        mock_write,
        mock_save_to_db,
        mock_shot_chart,
        mock_pbp,
        mock_qs,
        mock_mvp,
        mock_h2h,
        mock_cat_stats,
        mock_standings,
        mock_lineups,
    ):
        """main() with all fetch flags → all fetch paths exercised."""
        from ingest_wkbl import main

        mock_fetch_records.return_value = (
            [{"name": "A"}],
            [],
            [("04601010", "20251105")],
            {"04601060": {"date": "20260315", "home_team": "KB", "away_team": "삼성"}},
        )
        mock_db.get_existing_game_ids.return_value = {"04601010"}
        mock_db.get_all_season_stats.return_value = [{"name": "A"}]
        mock_standings.return_value = [
            {"rank": 1, "team_name": "KB", "wins": 10, "losses": 2, "win_pct": 0.833}
        ]
        mock_cat_stats.return_value = {"pts": [{"team": "KB", "value": 80}]}
        mock_h2h.return_value = [{"team_a": "KB"}]
        mock_mvp.return_value = [{"player": "A"}]
        mock_qs.return_value = [{"game_id": "04601010"}]
        mock_pbp.return_value = [{"event": "test"}]
        mock_shot_chart.return_value = [{"x": 10}]

        def set_selected_id(args):
            args.selected_id = "04601002"
            return "20260224"

        with (
            patch("ingest_wkbl._resolve_season_params", side_effect=set_selected_id),
            patch(
                "sys.argv",
                [
                    "ingest",
                    "--season-label",
                    "2025-26",
                    "--save-db",
                    "--fetch-play-by-play",
                    "--fetch-shot-charts",
                    "--fetch-standings",
                    "--fetch-team-category-stats",
                    "--fetch-head-to-head",
                    "--fetch-game-mvp",
                    "--fetch-quarter-scores",
                    "--include-future",
                    "--compute-lineups",
                ],
            ),
        ):
            main()

        mock_standings.assert_called_once()
        mock_db.bulk_insert_team_standings.assert_called_once()
        mock_cat_stats.assert_called_once()
        mock_h2h.assert_called_once()
        mock_db.bulk_insert_head_to_head.assert_called_once()
        mock_mvp.assert_called_once()
        mock_db.bulk_insert_game_mvp.assert_called_once()
        mock_qs.assert_called_once()
        mock_db.bulk_update_quarter_scores.assert_called_once()
        mock_pbp.assert_called_once()
        mock_shot_chart.assert_called_once()
        mock_lineups.assert_called_once()


# =========================================================================
# _compute_lineups_for_season tests
# =========================================================================


class TestComputeLineupsForSeason:
    """Tests for _compute_lineups_for_season()."""

    @patch("ingest_wkbl.database")
    def test_compute_lineups_basic(self, mock_db):
        """Basic lineup computation flow."""
        from ingest_wkbl import _compute_lineups_for_season

        mock_db.get_existing_game_ids.return_value = {"04601010"}
        mock_db.get_play_by_play.return_value = [{"event": "test"}]

        mock_stints = [{"lineup": ["P1", "P2", "P3", "P4", "P5"]}]

        with (
            patch("lineup.resolve_null_player_ids") as mock_resolve,
            patch("lineup.track_game_lineups", return_value=mock_stints) as mock_track,
        ):
            _compute_lineups_for_season("046")

        mock_resolve.assert_called_once_with("04601010")
        mock_track.assert_called_once_with("04601010")
        mock_db.save_lineup_stints.assert_called_once()

    @patch("ingest_wkbl.database")
    def test_compute_lineups_no_pbp(self, mock_db):
        """No PBP data for game → skip."""
        from ingest_wkbl import _compute_lineups_for_season

        mock_db.get_existing_game_ids.return_value = {"04601010"}
        mock_db.get_play_by_play.return_value = []

        _compute_lineups_for_season("046")

        mock_db.save_lineup_stints.assert_not_called()
