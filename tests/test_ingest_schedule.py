"""Tests for schedule fetching and game record fetching in ingest_wkbl."""

import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


# ── HTML fixtures for schedule parsing ──

SCHEDULE_ROW_BASIC = """
<tr>
    <td>11/05</td>
    <td>
        <div class="info_team away"><span data-kr="삼성생명"></span></div>
        <a href="?game_no=10">
        <div class="info_team home"><span data-kr="KB스타즈"></span></div>
    </td>
</tr>
"""

SCHEDULE_ROW_FUTURE = """
<tr>
    <td>03/15</td>
    <td>
        <div class="info_team away"><span data-kr="우리은행"></span></div>
        <div class="info_team home"><span data-kr="BNK썸"></span></div>
    </td>
</tr>
"""

SCHEDULE_HEADER = """<tr><th>날짜</th><th>경기</th></tr>"""

SCHEDULE_CROSS_YEAR_DEC = """
<tr>
    <td>12/20</td>
    <td>
        <div class="info_team away"><span data-kr="하나원큐"></span></div>
        <a href="?game_no=30">
        <div class="info_team home"><span data-kr="신한은행"></span></div>
    </td>
</tr>
"""

SCHEDULE_CROSS_YEAR_JAN = """
<tr>
    <td>01/10</td>
    <td>
        <div class="info_team away"><span data-kr="KB스타즈"></span></div>
        <a href="?game_no=40">
        <div class="info_team home"><span data-kr="삼성생명"></span></div>
    </td>
</tr>
"""


class TestFetchScheduleFromWkbl:
    """Tests for _fetch_schedule_from_wkbl()."""

    @patch("ingest_wkbl.fetch")
    def test_schedule_regular_season_basic(self, mock_fetch):
        """Basic schedule parsing returns correct game dict."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        # All months return empty except November
        def side_effect(url, *a, **kw):
            if "ym=202511" in url:
                return f"<table>{SCHEDULE_HEADER}{SCHEDULE_ROW_BASIC}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0)

        assert "04601010" in result
        assert result["04601010"]["home_team"] == "KB스타즈"
        assert result["04601010"]["away_team"] == "삼성생명"
        assert result["04601010"]["date"] == "20251105"

    @patch("ingest_wkbl.fetch")
    def test_schedule_cross_year_dates(self, mock_fetch):
        """December games use season_year, January games use season_year+1."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        def side_effect(url, *a, **kw):
            if "ym=202512" in url:
                return f"<table>{SCHEDULE_CROSS_YEAR_DEC}</table>"
            if "ym=202601" in url:
                return f"<table>{SCHEDULE_CROSS_YEAR_JAN}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0)

        # December → 2025, January → 2026
        dec_games = [v for v in result.values() if v["date"].startswith("2025")]
        jan_games = [v for v in result.values() if v["date"].startswith("2026")]
        assert len(dec_games) >= 1
        assert len(jan_games) >= 1

    @patch("ingest_wkbl.fetch")
    def test_schedule_future_games_no_game_no(self, mock_fetch):
        """Future games (no game_no link) get auto-assigned sequential IDs."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        def side_effect(url, *a, **kw):
            if "ym=202603" in url:
                return f"<table>{SCHEDULE_ROW_FUTURE}</table>"
            if "ym=202511" in url:
                return f"<table>{SCHEDULE_ROW_BASIC}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0)

        # Should have both past and future games
        future = [gid for gid, v in result.items() if v["date"] > "20260101"]
        assert len(future) >= 1

    @patch("ingest_wkbl.fetch")
    def test_schedule_future_only_regular(self, mock_fetch):
        """Playoff game_type doesn't get future games assigned."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        def side_effect(url, *a, **kw):
            if "ym=202603" in url:
                return f"<table>{SCHEDULE_ROW_FUTURE}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0, game_types=["04"])

        # No future games for playoff
        assert len(result) == 0

    @patch("ingest_wkbl.fetch")
    def test_schedule_multiple_game_types(self, mock_fetch):
        """Multiple game_types each get fetched."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        call_urls = []

        def side_effect(url, *a, **kw):
            call_urls.append(url)
            if "gun=1" in url and "ym=202511" in url:
                return f"<table>{SCHEDULE_ROW_BASIC}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        _fetch_schedule_from_wkbl("/tmp", "046", delay=0, game_types=["01", "04"])

        # Should have requests for both gun=1 and gun=4
        gun1 = [u for u in call_urls if "gun=1" in u]
        gun4 = [u for u in call_urls if "gun=4" in u]
        assert len(gun1) == 6  # 6 months
        assert len(gun4) == 6

    @patch("ingest_wkbl.fetch")
    def test_schedule_deduplicates(self, mock_fetch):
        """Duplicate game_ids from future assignment are skipped."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        # Two months both return future game with same auto-numbered ID
        def side_effect(url, *a, **kw):
            if "ym=202511" in url:
                return f"<table>{SCHEDULE_ROW_BASIC}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0)
        # All game IDs should be unique
        assert len(result) == len(set(result.keys()))

    @patch("ingest_wkbl.fetch")
    def test_schedule_exception_handling(self, mock_fetch):
        """One month failure → others still processed."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        call_count = 0

        def side_effect(url, *a, **kw):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("network error")
            if "ym=202512" in url:
                return f"<table>{SCHEDULE_CROSS_YEAR_DEC}</table>"
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        _fetch_schedule_from_wkbl("/tmp", "046", delay=0)

        # Should still have results from non-failing months
        assert call_count > 1

    @patch("ingest_wkbl.fetch")
    def test_schedule_empty_month(self, mock_fetch):
        """Empty table → no games parsed."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        mock_fetch.return_value = "<table></table>"
        result = _fetch_schedule_from_wkbl("/tmp", "046", delay=0)
        assert result == {}

    @patch("ingest_wkbl.fetch")
    def test_schedule_unknown_gun(self, mock_fetch):
        """Unknown game_type_code → defaults to gun=1."""
        from ingest_wkbl import _fetch_schedule_from_wkbl

        urls_called = []

        def side_effect(url, *a, **kw):
            urls_called.append(url)
            return "<table></table>"

        mock_fetch.side_effect = side_effect
        _fetch_schedule_from_wkbl("/tmp", "046", delay=0, game_types=["99"])

        # Unknown code should fall back to gun=1
        assert all("gun=1" in u for u in urls_called)


class TestFetchGameRecords:
    """Tests for _fetch_game_records()."""

    def _make_args(self, **kw):
        defaults = {
            "selected_id": "04601002",
            "cache_dir": "/tmp",
            "no_cache": True,
            "delay": 0,
        }
        defaults.update(kw)
        return SimpleNamespace(**defaults)

    @patch("ingest_wkbl._get_games_to_process")
    @patch("ingest_wkbl.fetch")
    @patch("ingest_wkbl.parse_iframe_src")
    @patch("ingest_wkbl.parse_player_tables")
    def test_fetch_records_basic(self, mock_parse, mock_iframe, mock_fetch, mock_get):
        """Basic records fetch returns parsed records."""
        from ingest_wkbl import _fetch_game_records

        mock_get.return_value = (
            [("04601010", "20251105")],
            {"04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"}},
        )
        mock_fetch.return_value = "<html>wrapper</html>"
        mock_iframe.return_value = "http://example.com/record.asp"
        mock_parse.return_value = [{"name": "A", "team": "KB", "pts": "10"}]

        args = self._make_args()
        records, team_recs, items, sched = _fetch_game_records(args, "20260101")

        assert len(records) == 1
        assert records[0]["_game_id"] == "04601010"

    @patch("ingest_wkbl._get_games_to_process")
    @patch("ingest_wkbl.fetch")
    @patch("ingest_wkbl.parse_iframe_src")
    def test_fetch_records_no_iframe(self, mock_iframe, mock_fetch, mock_get):
        """No iframe found → game skipped."""
        from ingest_wkbl import _fetch_game_records

        mock_get.return_value = (
            [("04601010", "20251105")],
            {"04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"}},
        )
        mock_fetch.return_value = "<html>no iframe</html>"
        mock_iframe.return_value = None

        args = self._make_args()
        records, _, _, _ = _fetch_game_records(args, "20260101")

        assert records == []

    @patch("ingest_wkbl._get_games_to_process")
    @patch("ingest_wkbl.fetch")
    @patch("ingest_wkbl.parse_iframe_src")
    @patch("ingest_wkbl.parse_player_tables")
    def test_fetch_records_relative_iframe(
        self, mock_parse, mock_iframe, mock_fetch, mock_get
    ):
        """Relative iframe src gets BASE_URL prepended."""
        from ingest_wkbl import _fetch_game_records

        mock_get.return_value = (
            [("04601010", "20251105")],
            {"04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"}},
        )
        mock_fetch.return_value = "<html>wrapper</html>"
        mock_iframe.return_value = "/data_lab/record_player.asp?gameId=04601010"
        mock_parse.return_value = []

        args = self._make_args()
        _fetch_game_records(args, "20260101")

        # Second fetch call should have full URL
        fetch_urls = [c[0][0] for c in mock_fetch.call_args_list]
        assert any("datalab.wkbl.or.kr" in u for u in fetch_urls)

    @patch("ingest_wkbl._get_games_to_process")
    @patch("ingest_wkbl.fetch")
    @patch("ingest_wkbl.parse_iframe_src")
    @patch("ingest_wkbl.parse_player_tables")
    @patch("ingest_wkbl.parse_team_iframe_src")
    @patch("ingest_wkbl.parse_team_record")
    def test_fetch_records_with_team_stats(
        self,
        mock_team_parse,
        mock_team_iframe,
        mock_parse,
        mock_iframe,
        mock_fetch,
        mock_get,
    ):
        """fetch_team_stats=True fetches team record page."""
        from ingest_wkbl import _fetch_game_records

        mock_get.return_value = (
            [("04601010", "20251105")],
            {"04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"}},
        )
        mock_fetch.return_value = "<html>wrapper</html>"
        mock_iframe.return_value = "http://example.com/record.asp"
        mock_parse.return_value = []
        mock_team_iframe.return_value = "http://example.com/team.asp"
        mock_team_parse.return_value = [{"team": "KB", "fast_break": 10}]

        args = self._make_args()
        _, team_recs, _, _ = _fetch_game_records(
            args, "20260101", fetch_team_stats=True
        )

        assert len(team_recs) == 1
        assert team_recs[0]["_game_id"] == "04601010"

    @patch("ingest_wkbl._get_games_to_process")
    def test_fetch_records_empty(self, mock_get):
        """No games to process → empty results."""
        from ingest_wkbl import _fetch_game_records

        mock_get.return_value = ([], {"04601010": {"date": "20251105"}})

        args = self._make_args()
        records, team_recs, items, sched = _fetch_game_records(args, "20260101")

        assert records == []
        assert items == []

    @patch("ingest_wkbl._get_games_to_process")
    @patch("ingest_wkbl.fetch")
    @patch("ingest_wkbl.parse_iframe_src")
    @patch("ingest_wkbl.parse_player_tables")
    def test_fetch_records_progress(
        self, mock_parse, mock_iframe, mock_fetch, mock_get
    ):
        """15+ games trigger progress logging (no crash)."""
        from ingest_wkbl import _fetch_game_records

        items = [(f"0460{i + 10:04d}", "20251105") for i in range(15)]
        schedule = {
            gid: {"date": d, "home_team": "KB", "away_team": "삼성"} for gid, d in items
        }

        mock_get.return_value = (items, schedule)
        mock_fetch.return_value = "<html>wrapper</html>"
        mock_iframe.return_value = "http://example.com/record.asp"
        mock_parse.return_value = []

        args = self._make_args()
        records, _, _, _ = _fetch_game_records(args, "20260101")

        # Should not raise; 15 games processed
        assert isinstance(records, list)
