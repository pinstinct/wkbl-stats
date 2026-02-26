"""Tests for ingest_wkbl.py helper and aggregation functions."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


# ===========================================================================
# fetch() tests
# ===========================================================================


class TestFetch:
    """Tests for the fetch() function with caching and retry logic."""

    def test_cache_hit(self, tmp_path):
        """Cached file is returned without network request."""
        from ingest_wkbl import fetch

        cache_dir = str(tmp_path)
        url = "http://example.com/test.html"

        # Pre-populate cache
        import hashlib
        import os

        key = hashlib.sha1(url.encode("utf-8"), usedforsecurity=False).hexdigest()
        cache_file = os.path.join(cache_dir, key + ".html")
        with open(cache_file, "w") as f:
            f.write("<html>cached</html>")

        result = fetch(url, cache_dir, use_cache=True, delay=0)
        assert result == "<html>cached</html>"

    def test_cache_miss_fetches(self, tmp_path):
        """Missing cache triggers network fetch and saves result."""
        from ingest_wkbl import fetch

        cache_dir = str(tmp_path)
        url = "http://example.com/page.html"

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"<html>fresh</html>"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("ingest_wkbl.urlopen", return_value=mock_resp):
            result = fetch(url, cache_dir, use_cache=True, delay=0)

        assert result == "<html>fresh</html>"
        # Verify cache file was written
        import os

        files = os.listdir(cache_dir)
        assert any(f.endswith(".html") for f in files)

    def test_no_cache_dir(self):
        """fetch with cache_dir=None still works (no caching)."""
        from ingest_wkbl import fetch

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"response"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("ingest_wkbl.urlopen", return_value=mock_resp):
            result = fetch("http://example.com", None, use_cache=False, delay=0)

        assert result == "response"

    def test_retry_on_http_error(self, tmp_path):
        """HTTPError triggers retry with eventual success."""
        from urllib.error import HTTPError

        from ingest_wkbl import fetch

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"ok"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise HTTPError("http://example.com", 500, "Server Error", {}, None)
            return mock_resp

        with (
            patch("ingest_wkbl.urlopen", side_effect=side_effect),
            patch("ingest_wkbl.time.sleep"),
        ):
            result = fetch("http://example.com", str(tmp_path), delay=0)

        assert result == "ok"
        assert call_count == 2

    def test_all_retries_fail(self, tmp_path):
        """All retries exhausted raises the last error."""
        from urllib.error import URLError

        from ingest_wkbl import fetch

        with (
            patch(
                "ingest_wkbl.urlopen",
                side_effect=URLError("connection refused"),
            ),
            patch("ingest_wkbl.time.sleep"),
            pytest.raises(URLError),
        ):
            fetch("http://example.com", str(tmp_path), delay=0)

    def test_json_extension(self, tmp_path):
        """URLs ending in .json get .json cache extension."""
        from ingest_wkbl import fetch

        cache_dir = str(tmp_path)
        url = "http://example.com/data.json"

        mock_resp = MagicMock()
        mock_resp.read.return_value = b'{"key": "value"}'
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("ingest_wkbl.urlopen", return_value=mock_resp):
            fetch(url, cache_dir, delay=0)

        import os

        files = os.listdir(cache_dir)
        assert any(f.endswith(".json") for f in files)


# ===========================================================================
# _create_empty_player_entry / _accumulate_game_stats tests
# ===========================================================================


class TestCreateEmptyPlayerEntry:
    """Tests for _create_empty_player_entry()."""

    def test_basic(self):
        from ingest_wkbl import _create_empty_player_entry

        entry = _create_empty_player_entry(
            "095001", "김선수", "KB스타즈", "G", "170cm", "2025-26"
        )
        assert entry["id"] == "095001"
        assert entry["name"] == "김선수"
        assert entry["team"] == "KB스타즈"
        assert entry["gp"] == 0
        assert entry["min_total"] == 0.0
        assert entry["fgm"] == 0

    def test_normalizes_team(self):
        from ingest_wkbl import _create_empty_player_entry

        entry = _create_empty_player_entry(
            "id", "n", "우리은행  위비", "F", "-", "2025-26"
        )
        assert entry["team"] == "우리은행 위비"


class TestAccumulateGameStats:
    """Tests for _accumulate_game_stats()."""

    def test_single_game(self):
        from ingest_wkbl import _accumulate_game_stats, _create_empty_player_entry

        entry = _create_empty_player_entry("1", "A", "T", "G", "-", "s")
        record = {
            "min": 30.0,
            "pts": "20",
            "reb": "8",
            "ast": "5",
            "stl": "2",
            "blk": "1",
            "to": "3",
            "two_pm_a": "6-12",
            "three_pm_a": "2-5",
            "ftm_a": "4-6",
        }
        _accumulate_game_stats(entry, record)
        assert entry["gp"] == 1
        assert entry["pts_total"] == 20.0
        assert entry["reb_total"] == 8.0
        assert entry["fgm"] == 8  # 6+2
        assert entry["fga"] == 17  # 12+5
        assert entry["tpm"] == 2
        assert entry["tpa"] == 5
        assert entry["ftm"] == 4
        assert entry["fta"] == 6

    def test_multiple_games(self):
        from ingest_wkbl import _accumulate_game_stats, _create_empty_player_entry

        entry = _create_empty_player_entry("1", "A", "T", "G", "-", "s")
        record = {
            "min": 25.0,
            "pts": "10",
            "reb": "5",
            "ast": "3",
            "stl": "1",
            "blk": "0",
            "to": "2",
            "two_pm_a": "3-8",
            "three_pm_a": "1-3",
            "ftm_a": "1-2",
        }
        _accumulate_game_stats(entry, record)
        _accumulate_game_stats(entry, record)
        assert entry["gp"] == 2
        assert entry["pts_total"] == 20.0
        assert entry["min_total"] == 50.0


# ===========================================================================
# _compute_averages tests
# ===========================================================================


class TestComputeAverages:
    """Tests for _compute_averages()."""

    def _make_entry(self, gp=10, pts=150, reb=50, ast=30, **kwargs):
        entry = {
            "id": "test",
            "name": "Test",
            "team": "Team",
            "pos": "G",
            "height": "170cm",
            "season": "2025-26",
            "gp": gp,
            "min_total": kwargs.get("min_total", 300.0),
            "pts_total": float(pts),
            "reb_total": float(reb),
            "ast_total": float(ast),
            "stl_total": float(kwargs.get("stl", 15)),
            "blk_total": float(kwargs.get("blk", 5)),
            "to_total": float(kwargs.get("to", 20)),
            "fgm": kwargs.get("fgm", 50),
            "fga": kwargs.get("fga", 120),
            "tpm": kwargs.get("tpm", 15),
            "tpa": kwargs.get("tpa", 40),
            "ftm": kwargs.get("ftm", 35),
            "fta": kwargs.get("fta", 40),
        }
        return entry

    def test_basic_averages(self):
        from ingest_wkbl import _compute_averages

        entry = self._make_entry(gp=10, pts=150, reb=50, ast=30)
        result = _compute_averages(entry, None)
        assert result["pts"] == 15.0
        assert result["reb"] == 5.0
        assert result["ast"] == 3.0
        assert result["gp"] == 10

    def test_shooting_percentages(self):
        from ingest_wkbl import _compute_averages

        entry = self._make_entry(fgm=50, fga=100, tpm=10, tpa=30, ftm=20, fta=25)
        result = _compute_averages(entry, None)
        assert result["fgp"] == 0.5  # 50/100
        assert result["tpp"] == pytest.approx(0.333, abs=0.001)  # 10/30
        assert result["ftp"] == 0.8  # 20/25

    def test_zero_attempts(self):
        from ingest_wkbl import _compute_averages

        entry = self._make_entry(fgm=0, fga=0, tpm=0, tpa=0, ftm=0, fta=0)
        result = _compute_averages(entry, None)
        assert result["fgp"] == 0
        assert result["tpp"] == 0
        assert result["ftp"] == 0
        assert result["ts_pct"] == 0
        assert result["efg_pct"] == 0

    def test_per36(self):
        from ingest_wkbl import _compute_averages

        # 10 games, 300 total minutes → 30 min/game, factor = 36/30 = 1.2
        entry = self._make_entry(gp=10, pts=150, reb=50, ast=30, min_total=300.0)
        result = _compute_averages(entry, None)
        assert result["pts36"] == 18.0  # 15 * 1.2
        assert result["reb36"] == 6.0  # 5 * 1.2
        assert result["ast36"] == 3.6  # 3 * 1.2

    def test_zero_minutes(self):
        from ingest_wkbl import _compute_averages

        entry = self._make_entry(min_total=0.0)
        result = _compute_averages(entry, None)
        assert result["pts36"] == 0
        assert result["reb36"] == 0
        assert result["ast36"] == 0

    def test_active_info_override(self):
        from ingest_wkbl import _compute_averages

        entry = self._make_entry()
        active_info = {"pos": "F", "height": "180cm", "pno": "099999"}
        result = _compute_averages(entry, active_info)
        assert result["pos"] == "F"
        assert result["height"] == "180cm"
        assert result["id"] == "099999"

    def test_pir_calculation(self):
        from ingest_wkbl import _compute_averages

        # PIR = (pts + reb + ast + stl + blk + fgm + ftm) - (fga-fgm) - (fta-ftm) - to
        entry = self._make_entry(
            gp=1,
            pts=20,
            reb=10,
            ast=5,
            stl=2,
            blk=1,
            to=3,
            fgm=8,
            fga=15,
            ftm=4,
            fta=5,
            min_total=35.0,
        )
        result = _compute_averages(entry, None)
        # PIR = (20+10+5+2+1+8+4) - (15-8) - (5-4) - 3 = 50 - 7 - 1 - 3 = 39.0
        assert result["pir"] == 39.0

    def test_double_double_cats(self):
        from ingest_wkbl import _compute_averages

        # 1 game with 20 pts, 12 reb, 3 ast → dd_cats = 2
        entry = self._make_entry(gp=1, pts=20, reb=12, ast=3, min_total=35.0)
        result = _compute_averages(entry, None)
        assert result["dd_cats"] == 2


# ===========================================================================
# aggregate_players tests
# ===========================================================================


class TestAggregatePlayers:
    """Tests for aggregate_players()."""

    def _make_record(self, name="김선수", team="KB스타즈", pos="G", pts="15", **kw):
        return {
            "name": name,
            "team": team,
            "pos": pos,
            "min": kw.get("min", 30.0),
            "pts": pts,
            "reb": kw.get("reb", "5"),
            "ast": kw.get("ast", "3"),
            "stl": kw.get("stl", "1"),
            "blk": kw.get("blk", "0"),
            "to": kw.get("to", "2"),
            "two_pm_a": kw.get("two_pm_a", "4-10"),
            "three_pm_a": kw.get("three_pm_a", "2-5"),
            "ftm_a": kw.get("ftm_a", "1-2"),
        }

    def test_single_player_single_game(self):
        from ingest_wkbl import aggregate_players

        records = [self._make_record()]
        players = aggregate_players(records, "2025-26")
        assert len(players) == 1
        assert players[0]["name"] == "김선수"
        assert players[0]["gp"] == 1
        assert players[0]["pts"] == 15.0

    def test_multiple_games(self):
        from ingest_wkbl import aggregate_players

        records = [self._make_record(pts="10"), self._make_record(pts="20")]
        players = aggregate_players(records, "2025-26")
        assert len(players) == 1
        assert players[0]["gp"] == 2
        assert players[0]["pts"] == 15.0  # avg of 10 and 20

    def test_with_active_players(self):
        from ingest_wkbl import aggregate_players

        records = [self._make_record()]
        active = [
            {
                "name": "김선수",
                "team": "KB스타즈",
                "pno": "095001",
                "pos": "G",
                "height": "170cm",
            }
        ]
        players = aggregate_players(records, "2025-26", active_players=active)
        assert len(players) == 1
        assert players[0]["id"] == "095001"

    def test_active_player_no_games(self):
        """Active player with no game records gets zero-stat entry."""
        from ingest_wkbl import aggregate_players

        active = [
            {
                "name": "신인선수",
                "team": "삼성생명",
                "pno": "099001",
                "pos": "F",
                "height": "175cm",
            }
        ]
        players = aggregate_players(
            [], "2025-26", active_players=active, include_zero=True
        )
        assert len(players) == 1
        assert players[0]["gp"] == 0
        assert players[0]["pts"] == 0

    def test_active_player_no_games_exclude_zero(self):
        """include_zero=False excludes active players with no games."""
        from ingest_wkbl import aggregate_players

        active = [
            {
                "name": "신인선수",
                "team": "삼성생명",
                "pno": "099001",
                "pos": "F",
                "height": "175cm",
            }
        ]
        players = aggregate_players(
            [], "2025-26", active_players=active, include_zero=False
        )
        assert len(players) == 0

    def test_multiple_players(self):
        from ingest_wkbl import aggregate_players

        records = [
            self._make_record(name="A", team="KB스타즈"),
            self._make_record(name="B", team="삼성생명"),
        ]
        players = aggregate_players(records, "2025-26")
        assert len(players) == 2
        names = {p["name"] for p in players}
        assert names == {"A", "B"}


# ===========================================================================
# fetch_post tests
# ===========================================================================


class TestFetchPost:
    """Tests for the fetch_post() function with POST data."""

    def test_cache_hit(self, tmp_path):
        """Cached POST response is returned without network request."""
        from ingest_wkbl import fetch_post

        cache_dir = str(tmp_path)
        url = "http://example.com/api"
        data = {"key": "value", "action": "get"}

        # Pre-populate cache with correct key
        import hashlib
        import os

        cache_data = url + "|" + "&".join(f"{k}={v}" for k, v in sorted(data.items()))
        key = hashlib.sha1(
            cache_data.encode("utf-8"), usedforsecurity=False
        ).hexdigest()
        cache_file = os.path.join(cache_dir, key + ".html")
        with open(cache_file, "w") as f:
            f.write("<html>cached post</html>")

        result = fetch_post(url, data, cache_dir, use_cache=True, delay=0)
        assert result == "<html>cached post</html>"

    def test_cache_miss_fetches(self, tmp_path):
        """Missing cache triggers POST fetch and caches result."""
        from ingest_wkbl import fetch_post

        cache_dir = str(tmp_path)

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"<html>post response</html>"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("ingest_wkbl.urlopen", return_value=mock_resp):
            result = fetch_post(
                "http://example.com/api", {"x": "1"}, cache_dir, delay=0
            )

        assert result == "<html>post response</html>"
        import os

        files = os.listdir(cache_dir)
        assert any(f.endswith(".html") for f in files)

    def test_no_cache_dir(self):
        """fetch_post with cache_dir=None still works."""
        from ingest_wkbl import fetch_post

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"ok"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("ingest_wkbl.urlopen", return_value=mock_resp):
            result = fetch_post("http://example.com/api", {"a": "b"}, None, delay=0)

        assert result == "ok"

    def test_retry_on_http_error(self, tmp_path):
        """HTTPError triggers retry with eventual success."""
        from urllib.error import HTTPError

        from ingest_wkbl import fetch_post

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"recovered"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise HTTPError("http://example.com", 500, "Server Error", {}, None)
            return mock_resp

        with (
            patch("ingest_wkbl.urlopen", side_effect=side_effect),
            patch("ingest_wkbl.time.sleep"),
        ):
            result = fetch_post(
                "http://example.com", {"k": "v"}, str(tmp_path), delay=0
            )

        assert result == "recovered"
        assert call_count == 2

    def test_all_retries_fail(self, tmp_path):
        """All retries exhausted raises the last error."""
        from urllib.error import URLError

        from ingest_wkbl import fetch_post

        with (
            patch(
                "ingest_wkbl.urlopen",
                side_effect=URLError("connection refused"),
            ),
            patch("ingest_wkbl.time.sleep"),
            pytest.raises(URLError),
        ):
            fetch_post("http://example.com", {"k": "v"}, str(tmp_path), delay=0)

    def test_timeout_retry(self, tmp_path):
        """socket.timeout triggers retry."""
        import socket

        from ingest_wkbl import fetch_post

        mock_resp = MagicMock()
        mock_resp.read.return_value = b"ok"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)

        call_count = 0

        def side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise socket.timeout("timed out")
            return mock_resp

        with (
            patch("ingest_wkbl.urlopen", side_effect=side_effect),
            patch("ingest_wkbl.time.sleep"),
        ):
            result = fetch_post(
                "http://example.com", {"k": "v"}, str(tmp_path), delay=0
            )

        assert result == "ok"


# ===========================================================================
# _resolve_season_params tests
# ===========================================================================


class TestResolveSeasonParams:
    """Tests for _resolve_season_params()."""

    def test_manual_params(self):
        from ingest_wkbl import _resolve_season_params

        args = MagicMock()
        args.auto = False
        args.first_game_date = "20251027"
        args.selected_id = "04601002"
        args.selected_game_date = "20251027"
        args.end_date = "20260228"

        result = _resolve_season_params(args)
        assert result == "20260228"

    def test_end_date_default_today(self):
        import datetime

        from ingest_wkbl import _resolve_season_params

        args = MagicMock()
        args.auto = False
        args.first_game_date = "20251027"
        args.selected_id = "04601002"
        args.selected_game_date = "20251027"
        args.end_date = None

        result = _resolve_season_params(args)
        assert result == datetime.date.today().strftime("%Y%m%d")

    def test_missing_params_raises(self):
        from ingest_wkbl import _resolve_season_params

        args = MagicMock()
        args.auto = False
        args.first_game_date = None
        args.selected_id = None
        args.selected_game_date = None

        with pytest.raises(SystemExit):
            _resolve_season_params(args)

    def test_auto_mode(self):
        from ingest_wkbl import _resolve_season_params

        args = MagicMock()
        args.auto = True
        args.season_label = "2025-26"
        args.cache_dir = "/tmp/cache"
        args.no_cache = False
        args.delay = 0
        args.end_date = "20260115"

        mock_meta = {
            "firstGameDate": "20251027",
            "selectedId": "04601002",
            "selectedGameDate": "20251027",
        }
        with patch("ingest_wkbl.get_season_meta", return_value=mock_meta):
            result = _resolve_season_params(args)

        assert result == "20260115"
        assert args.first_game_date == "20251027"
        assert args.selected_id == "04601002"


# ===========================================================================
# load_active_players tests
# ===========================================================================


class TestLoadActivePlayers:
    """Tests for load_active_players()."""

    def test_basic(self, tmp_path):
        from ingest_wkbl import load_active_players

        player_html = """
        <a href="./detail.asp?pno=095830" class="player-link">
            <span data-kr="박지수"></span>
            <span data-kr="KB스타즈"></span>
        </a>
        """
        profile_html = """
        <div>포지션</span> - C</div>
        <div>신장</span> - 196 cm</div>
        """

        call_count = 0

        def mock_fetch(url, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return player_html
            return profile_html

        with patch("ingest_wkbl.fetch", side_effect=mock_fetch):
            result = load_active_players(str(tmp_path), delay=0)

        assert len(result) == 1
        assert result[0]["name"] == "박지수"
        assert result[0]["pno"] == "095830"

    def test_no_url_skips_profile(self, tmp_path):
        """Players without URL don't trigger profile fetch."""
        from ingest_wkbl import load_active_players

        # Return HTML with no valid player links
        with patch("ingest_wkbl.fetch", return_value="<div>empty</div>"):
            result = load_active_players(str(tmp_path), delay=0)
        assert result == []


# ===========================================================================
# load_all_players tests
# ===========================================================================


class TestLoadAllPlayers:
    """Tests for load_all_players()."""

    def test_loads_all_groups(self, tmp_path):
        from ingest_wkbl import load_all_players

        active_html = """
        <a href="./detail.asp?pno=095001" class="player-link">
            <span data-kr="선수A"></span><span data-kr="KB스타즈"></span>
        </a>
        """
        retired_html = """
        <a href="./detail.asp?pno=095002" class="player-link">
            <span data-kr="선수B"></span><span data-kr="삼성생명"></span>
        </a>
        """
        foreign_html = """
        <a href="./detail.asp?pno=095003" class="player-link">
            <span data-kr="선수C"></span><span data-kr="우리은행"></span>
        </a>
        """

        call_count = 0

        def mock_fetch(url, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return active_html
            elif call_count == 2:
                return retired_html
            return foreign_html

        with patch("ingest_wkbl.fetch", side_effect=mock_fetch):
            result = load_all_players(str(tmp_path), delay=0)

        assert len(result) == 3
        assert result["095001"]["is_active"] == 1
        assert result["095001"]["player_group"] == "active"
        assert result["095002"]["is_active"] == 0
        assert result["095002"]["player_group"] == "retired"
        assert result["095003"]["player_group"] == "foreign"

    def test_deduplicates_across_groups(self, tmp_path):
        """Same pno in multiple groups: active takes priority."""
        from ingest_wkbl import load_all_players

        same_html = """
        <a href="./detail.asp?pno=095001" class="player-link">
            <span data-kr="선수A"></span><span data-kr="KB스타즈"></span>
        </a>
        """

        with patch("ingest_wkbl.fetch", return_value=same_html):
            result = load_all_players(str(tmp_path), delay=0)

        # Only one entry: active takes priority
        assert len(result) == 1
        assert result["095001"]["is_active"] == 1

    def test_with_profiles(self, tmp_path):
        """fetch_profiles=True fetches individual profiles."""
        from ingest_wkbl import load_all_players

        active_html = """
        <a href="./detail.asp?pno=095001" class="player-link">
            <span data-kr="선수A"></span><span data-kr="KB스타즈"></span>
        </a>
        """
        # parse_player_profile expects "포지션 - G" format
        profile_html = """
        <div>포지션</span> - G</div>
        <div>신장</span> - 170 cm</div>
        """

        call_count = 0

        def mock_fetch(url, *args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count <= 3:
                # Active, retired, foreign pages
                if call_count == 1:
                    return active_html
                return "<div>empty</div>"
            return profile_html

        with patch("ingest_wkbl.fetch", side_effect=mock_fetch):
            result = load_all_players(str(tmp_path), delay=0, fetch_profiles=True)

        assert result["095001"].get("pos") == "G"
        assert result["095001"].get("height") == "170 cm"


# ===========================================================================
# _convert_db_stats_to_players tests
# ===========================================================================


class TestConvertDbStatsToPlayers:
    """Tests for _convert_db_stats_to_players()."""

    def test_basic(self):
        from ingest_wkbl import _convert_db_stats_to_players

        db_stats = [
            {
                "id": "095001",
                "name": "김선수",
                "team": "KB스타즈",
                "pos": "G",
                "height": "170cm",
                "gp": 10,
                "min": 30.0,
                "pts": 15.0,
                "reb": 5.0,
                "ast": 3.0,
                "stl": 1.5,
                "blk": 0.5,
                "tov": 2.0,
                "total_fgm": 50,
                "total_fga": 120,
                "total_tpm": 15,
                "total_tpa": 40,
                "total_ftm": 35,
                "total_fta": 40,
                "total_pts": 150,
                "total_min": 300,
            }
        ]
        result = _convert_db_stats_to_players(db_stats, "2025-26", [])
        assert len(result) == 1
        p = result[0]
        assert p["id"] == "095001"
        assert p["pts"] == 15.0
        assert p["fgp"] == pytest.approx(50 / 120, abs=0.001)
        assert p["tpp"] == pytest.approx(15 / 40, abs=0.001)
        assert p["ftp"] == pytest.approx(35 / 40, abs=0.001)
        assert p["gp"] == 10
        assert p["season"] == "2025-26"

    def test_zero_attempts(self):
        from ingest_wkbl import _convert_db_stats_to_players

        db_stats = [
            {
                "id": "099",
                "name": "zero",
                "team": "T",
                "pos": "C",
                "height": "-",
                "gp": 1,
                "min": 5.0,
                "pts": 0.0,
                "reb": 1.0,
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
                "total_pts": 0,
                "total_min": 5,
            }
        ]
        result = _convert_db_stats_to_players(db_stats, "2025-26", [])
        p = result[0]
        assert p["fgp"] == 0
        assert p["tpp"] == 0
        assert p["ftp"] == 0
        assert p["ts_pct"] == 0
        assert p["efg_pct"] == 0

    def test_active_player_enrichment(self):
        from ingest_wkbl import _convert_db_stats_to_players

        db_stats = [
            {
                "name": "김선수",
                "team": "KB스타즈",
                "gp": 5,
                "min": 25.0,
                "pts": 10.0,
                "reb": 4.0,
                "ast": 2.0,
                "stl": 1.0,
                "blk": 0.0,
                "tov": 1.5,
                "total_fgm": 20,
                "total_fga": 50,
                "total_tpm": 5,
                "total_tpa": 15,
                "total_ftm": 10,
                "total_fta": 12,
                "total_pts": 50,
                "total_min": 125,
            }
        ]
        active = [
            {
                "name": "김선수",
                "team": "KB스타즈",
                "pno": "095001",
                "pos": "F",
                "height": "180cm",
            }
        ]
        result = _convert_db_stats_to_players(db_stats, "2025-26", active)
        p = result[0]
        assert p["id"] == "095001"
        assert p["pos"] == "F"
        assert p["height"] == "180cm"

    def test_per36(self):
        from ingest_wkbl import _convert_db_stats_to_players

        db_stats = [
            {
                "id": "1",
                "name": "n",
                "team": "t",
                "gp": 1,
                "min": 30.0,
                "pts": 15.0,
                "reb": 5.0,
                "ast": 3.0,
                "stl": 0.0,
                "blk": 0.0,
                "tov": 0.0,
                "total_fgm": 5,
                "total_fga": 10,
                "total_tpm": 0,
                "total_tpa": 0,
                "total_ftm": 5,
                "total_fta": 5,
                "total_pts": 15,
                "total_min": 30,
            }
        ]
        result = _convert_db_stats_to_players(db_stats, "s", [])
        p = result[0]
        # factor = 36/30 = 1.2
        assert p["pts36"] == 18.0
        assert p["reb36"] == 6.0
        assert p["ast36"] == 3.6


# ===========================================================================
# _write_output tests
# ===========================================================================


class TestWriteOutput:
    """Tests for _write_output()."""

    def test_writes_json(self, tmp_path):
        import json

        from ingest_wkbl import _write_output

        output_path = str(tmp_path / "output.json")
        args = MagicMock()
        args.season_label = "2025-26"
        args.output = output_path

        players = [
            {"name": "B", "pts": 10},
            {"name": "A", "pts": 20},
        ]
        _write_output(args, players)

        with open(output_path) as f:
            data = json.load(f)

        assert data["defaultSeason"] == "2025-26"
        # Sorted by pts desc
        assert data["players"][0]["pts"] == 20
        assert data["players"][1]["pts"] == 10

    def test_creates_directory(self, tmp_path):
        import json

        from ingest_wkbl import _write_output

        output_path = str(tmp_path / "subdir" / "output.json")
        args = MagicMock()
        args.season_label = "2025-26"
        args.output = output_path

        _write_output(args, [{"name": "A", "pts": 5}])

        with open(output_path) as f:
            data = json.load(f)
        assert len(data["players"]) == 1


# ===========================================================================
# _build_opp_context tests
# ===========================================================================


class TestBuildOppContext:
    """Tests for _build_opp_context()."""

    def test_basic(self):
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {
                "min": 6000,
                "pts": 2400,
                "reb": 1200,
                "ast": 600,
                "stl": 300,
                "blk": 100,
            },
        }
        # League totals: across all teams
        league_totals = {
            "min": 36000,
            "pts": 14400,
            "reb": 7200,
            "ast": 3600,
            "stl": 1800,
            "blk": 600,
        }

        result = _build_opp_context("kb", opp_totals, league_totals, num_teams=6)
        assert result is not None
        # opp_gp = 6000/200 = 30, lg_gp = 36000/200 = 180, games_per_team = 180/6 = 30
        # opp_per_game = 2400/30 = 80, lg_per_game = 14400/180 = 80
        assert result["pts_factor"] == pytest.approx(1.0, abs=0.01)

    def test_weak_defense(self):
        """Higher opp_per_game than league avg → factor > 1."""
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {
                "min": 6000,
                "pts": 3000,
                "reb": 1200,
                "ast": 600,
                "stl": 300,
                "blk": 100,
            },
        }
        league_totals = {
            "min": 36000,
            "pts": 14400,
            "reb": 7200,
            "ast": 3600,
            "stl": 1800,
            "blk": 600,
        }

        result = _build_opp_context("kb", opp_totals, league_totals, num_teams=6)
        assert result["pts_factor"] > 1.0

    def test_strong_defense(self):
        """Lower opp_per_game than league avg → factor < 1."""
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {
                "min": 6000,
                "pts": 1800,
                "reb": 1200,
                "ast": 600,
                "stl": 300,
                "blk": 100,
            },
        }
        league_totals = {
            "min": 36000,
            "pts": 14400,
            "reb": 7200,
            "ast": 3600,
            "stl": 1800,
            "blk": 600,
        }

        result = _build_opp_context("kb", opp_totals, league_totals, num_teams=6)
        assert result["pts_factor"] < 1.0

    def test_missing_opp(self):
        from ingest_wkbl import _build_opp_context

        result = _build_opp_context("unknown", {}, {"min": 1000, "pts": 500})
        assert result is None

    def test_missing_league(self):
        from ingest_wkbl import _build_opp_context

        result = _build_opp_context("kb", {"kb": {"min": 100}}, None)
        assert result is None

    def test_works_without_min_field(self):
        """opp_totals without 'min' should still compute factors."""
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {
                "pts": 2500,
                "reb": 1100,
                "ast": 580,
                "stl": 260,
                "blk": 120,
            },
            "samsung": {
                "pts": 2300,
                "reb": 1050,
                "ast": 540,
                "stl": 240,
                "blk": 110,
            },
        }
        league_totals = {
            "pts": 14400,
            "reb": 7200,
            "ast": 3600,
            "stl": 1800,
            "blk": 600,
        }

        result = _build_opp_context("kb", opp_totals, league_totals, num_teams=6)
        assert result is not None
        assert set(result.keys()) == {
            "pts_factor",
            "reb_factor",
            "ast_factor",
            "stl_factor",
            "blk_factor",
        }
        assert result["pts_factor"] > 1.0

    def test_zero_minutes(self):
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {"min": 0, "pts": 0, "reb": 0, "ast": 0, "stl": 0, "blk": 0}
        }
        league_totals = {"min": 1000, "pts": 500}

        result = _build_opp_context("kb", opp_totals, league_totals)
        assert result is None

    def test_all_stats_covered(self):
        from ingest_wkbl import _build_opp_context

        opp_totals = {
            "kb": {
                "min": 6000,
                "pts": 2400,
                "reb": 1200,
                "ast": 600,
                "stl": 300,
                "blk": 100,
            },
        }
        league_totals = {
            "min": 36000,
            "pts": 14400,
            "reb": 7200,
            "ast": 3600,
            "stl": 1800,
            "blk": 600,
        }

        result = _build_opp_context("kb", opp_totals, league_totals, num_teams=6)
        for stat in ["pts", "reb", "ast", "stl", "blk"]:
            assert f"{stat}_factor" in result


# ===========================================================================
# _build_win_context tests
# ===========================================================================


class TestBuildWinContext:
    """Tests for _build_win_context()."""

    def test_basic_with_ratings(self):
        from ingest_wkbl import _build_win_context

        team_totals = {
            "kb": {"fga": 1000, "fta": 300, "tov": 200, "oreb": 100, "pts": 2400},
            "samsung": {"fga": 950, "fta": 280, "tov": 210, "oreb": 90, "pts": 2200},
        }
        opp_totals = {
            "kb": {"fga": 900, "fta": 250, "tov": 180, "oreb": 80, "pts": 2100},
            "samsung": {"fga": 1000, "fta": 300, "tov": 190, "oreb": 95, "pts": 2500},
        }

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.get_head_to_head.return_value = [
                {"winner_id": "kb"},
                {"winner_id": "samsung"},
                {"winner_id": "kb"},
            ]
            result = _build_win_context(
                "046",
                "kb",
                "samsung",
                {"last5": "4-1"},
                {"last5": "2-3"},
                team_totals,
                opp_totals,
            )

        assert "home_net_rtg" in result
        assert "away_net_rtg" in result
        assert result["h2h_factor"] == pytest.approx(2 / 3, abs=0.01)
        assert result["home_last5"] == "4-1"
        assert result["away_last5"] == "2-3"

    def test_no_h2h(self):
        from ingest_wkbl import _build_win_context

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.get_head_to_head.return_value = []
            result = _build_win_context(
                "046",
                "kb",
                "samsung",
                None,
                None,
                {},
                {},
            )

        assert "h2h_factor" not in result

    def test_no_standings(self):
        from ingest_wkbl import _build_win_context

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.get_head_to_head.return_value = []
            result = _build_win_context(
                "046",
                "kb",
                "samsung",
                None,
                None,
                {},
                {},
            )

        assert "home_last5" not in result
        assert "away_last5" not in result

    def test_missing_team_totals(self):
        """Missing team totals: no net_rtg computed."""
        from ingest_wkbl import _build_win_context

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.get_head_to_head.return_value = []
            result = _build_win_context(
                "046",
                "kb",
                "samsung",
                None,
                None,
                {"kb": {"fga": 100, "fta": 30, "tov": 10, "oreb": 5, "pts": 200}},
                {},  # No opponent totals
            )

        # Home has totals but no opp, away has neither
        assert "home_net_rtg" not in result
        assert "away_net_rtg" not in result


# ===========================================================================
# _generate_predictions_for_game tests
# ===========================================================================


class TestGeneratePredictionsForGame:
    """Tests for _generate_predictions_for_game()."""

    def test_skips_if_existing(self):
        """Already-predicted games are skipped."""
        from ingest_wkbl import _generate_predictions_for_game

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.has_game_predictions.return_value = True
            _generate_predictions_for_game(
                "04601010",
                "kb",
                "samsung",
                "046",
                [],
                {},
                {},
                {},
            )
            mock_db.save_game_predictions.assert_not_called()

    def test_no_players(self):
        """No players on team → no predictions saved."""
        from ingest_wkbl import _generate_predictions_for_game

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.has_game_predictions.return_value = False
            mock_db.get_team_players.return_value = []
            _generate_predictions_for_game(
                "04601010",
                "kb",
                "samsung",
                "046",
                [],
                {},
                {},
                {},
            )
            mock_db.save_game_predictions.assert_not_called()

    def test_generates_predictions(self):
        """Full prediction pipeline with mock players."""
        from ingest_wkbl import _generate_predictions_for_game

        mock_player = {
            "id": "095001",
            "name": "김선수",
            "pos": "G",
            "pts": 15.0,
            "reb": 5.0,
            "ast": 3.0,
            "stl": 1.5,
            "blk": 0.5,
            "tov": 2.0,
            "min": 30.0,
            "game_score": 12.0,
            "pir": 10.0,
        }
        mock_recent = [
            {
                "pts": 15,
                "reb": 5,
                "ast": 3,
                "stl": 1,
                "blk": 0,
                "tov": 2,
                "min": 30,
                "fgm": 5,
                "fga": 10,
                "tpm": 1,
                "tpa": 3,
                "ftm": 4,
                "fta": 5,
            },
        ]

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.has_game_predictions.return_value = False
            mock_db.get_team_players.return_value = [mock_player]
            mock_db.get_player_recent_games.return_value = mock_recent
            mock_db.get_head_to_head.return_value = []

            _generate_predictions_for_game(
                "04601010",
                "kb",
                "samsung",
                "046",
                [],  # standings
                {},  # team_totals
                {},  # opp_totals
                {},  # league_totals
            )

            mock_db.save_game_predictions.assert_called_once()
            call_args = mock_db.save_game_predictions.call_args
            game_id = call_args[0][0]
            predictions = call_args[0][1]
            team_pred = call_args[0][2]

            assert game_id == "04601010"
            assert len(predictions) >= 1
            assert "home_win_prob" in team_pred
            assert "away_win_prob" in team_pred

    def test_force_refresh_ignores_existing_prediction_check(self):
        """force_refresh=True should regenerate even when predictions exist."""
        from ingest_wkbl import _generate_predictions_for_game

        mock_player = {
            "id": "095001",
            "name": "김선수",
            "pos": "G",
            "pts": 15.0,
            "reb": 5.0,
            "ast": 3.0,
            "stl": 1.5,
            "blk": 0.5,
            "tov": 2.0,
            "min": 30.0,
            "game_score": 12.0,
            "pir": 10.0,
        }
        mock_recent = [
            {
                "pts": 15,
                "reb": 5,
                "ast": 3,
                "stl": 1,
                "blk": 0,
                "tov": 2,
                "min": 30,
                "fgm": 5,
                "fga": 10,
                "tpm": 1,
                "tpa": 3,
                "ftm": 4,
                "fta": 5,
            },
        ]

        with patch("ingest_wkbl.database") as mock_db:
            mock_db.has_game_predictions.return_value = True
            mock_db.get_team_players.return_value = [mock_player]
            mock_db.get_player_recent_games.return_value = mock_recent
            mock_db.get_head_to_head.return_value = []

            _generate_predictions_for_game(
                "04601010",
                "kb",
                "samsung",
                "046",
                [],
                {},
                {},
                {},
                force_refresh=True,
            )

            mock_db.save_game_predictions.assert_called_once()


# ===========================================================================
# _generate_predictions_for_games tests
# ===========================================================================


class TestGeneratePredictionsForGames:
    """Tests for _generate_predictions_for_games()."""

    def test_empty_list(self):
        """Empty game list → no-op."""
        from ingest_wkbl import _generate_predictions_for_games

        # Should not raise
        _generate_predictions_for_games([], "046")

    def test_calls_per_game(self):
        """Each game triggers _generate_predictions_for_game."""
        from ingest_wkbl import _generate_predictions_for_games

        games = [
            (
                "04601010",
                {"home_team": "KB스타즈", "away_team": "삼성생명", "date": "20251105"},
            ),
            (
                "04601011",
                {"home_team": "우리은행", "away_team": "BNK썸", "date": "20251106"},
            ),
        ]

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_game") as mock_gen,
        ):
            mock_db.get_team_standings.return_value = []
            mock_db.get_team_season_totals.return_value = {}
            mock_db.get_opponent_season_totals.return_value = {}
            mock_db.get_league_season_totals.return_value = {}

            _generate_predictions_for_games(games, "046")

        assert mock_gen.call_count == 2


# ===========================================================================
# _save_future_games tests
# ===========================================================================


class TestSaveFutureGames:
    """Tests for _save_future_games()."""

    def test_saves_future_games(self):
        from ingest_wkbl import _save_future_games

        schedule_info = {
            "04601060": {
                "date": "20260315",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            },
            "04601061": {
                "date": "20260316",
                "home_team": "우리은행",
                "away_team": "BNK썸",
            },
        }

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_games"),
        ):
            _save_future_games(schedule_info, "20260301", "046")

        assert mock_db.insert_game.call_count == 2
        # Check that scores are NULL (future games)
        for call in mock_db.insert_game.call_args_list:
            assert (
                call.kwargs.get("home_score") is None
                or call[1].get("home_score") is None
            )

    def test_no_future_games(self):
        """All games before end_date → no-op."""
        from ingest_wkbl import _save_future_games

        schedule_info = {
            "04601010": {
                "date": "20260101",
                "home_team": "KB스타즈",
                "away_team": "삼성생명",
            },
        }

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_games"),
        ):
            _save_future_games(schedule_info, "20260201", "046")

        mock_db.insert_game.assert_not_called()

    def test_skips_games_without_teams(self):
        """Games without home/away teams are skipped."""
        from ingest_wkbl import _save_future_games

        schedule_info = {
            "04601060": {
                "date": "20260315",
                "home_team": "",
                "away_team": "",
            },
        }

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_games"),
        ):
            _save_future_games(schedule_info, "20260301", "046")

        mock_db.insert_game.assert_not_called()


# ===========================================================================
# _get_games_to_process tests
# ===========================================================================


class TestGetGamesToProcess:
    """Tests for _get_games_to_process()."""

    def test_filters_by_end_date(self):
        from ingest_wkbl import _get_games_to_process

        args = MagicMock()
        args.selected_id = "04601002"
        args.cache_dir = "/tmp/cache"
        args.no_cache = True
        args.delay = 0

        mock_schedule = {
            "04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"},
            "04601020": {"date": "20251201", "home_team": "우리", "away_team": "BNK"},
            "04601030": {"date": "20260115", "home_team": "하나", "away_team": "신한"},
        }

        with patch("ingest_wkbl._fetch_schedule_from_wkbl", return_value=mock_schedule):
            items, sched = _get_games_to_process(args, "20251201")

        # Only games up to 20251201
        game_ids = [g[0] for g in items]
        assert "04601010" in game_ids
        assert "04601020" in game_ids
        assert "04601030" not in game_ids

    def test_skips_existing(self):
        from ingest_wkbl import _get_games_to_process

        args = MagicMock()
        args.selected_id = "04601002"
        args.cache_dir = "/tmp"
        args.no_cache = True
        args.delay = 0

        mock_schedule = {
            "04601010": {"date": "20251105", "home_team": "KB", "away_team": "삼성"},
            "04601020": {"date": "20251201", "home_team": "우리", "away_team": "BNK"},
        }

        with patch("ingest_wkbl._fetch_schedule_from_wkbl", return_value=mock_schedule):
            items, _ = _get_games_to_process(
                args, "20260101", existing_game_ids={"04601010"}
            )

        game_ids = [g[0] for g in items]
        assert "04601010" not in game_ids
        assert "04601020" in game_ids

    def test_empty_schedule(self):
        from ingest_wkbl import _get_games_to_process

        args = MagicMock()
        args.selected_id = "04601002"
        args.cache_dir = "/tmp"
        args.no_cache = True
        args.delay = 0

        with patch("ingest_wkbl._fetch_schedule_from_wkbl", return_value={}):
            items, sched = _get_games_to_process(args, "20260101")

        assert items == []
        assert sched == {}


# ===========================================================================
# _generate_predictions_for_game_ids tests
# ===========================================================================


class TestGeneratePredictionsForGameIds:
    """Tests for _generate_predictions_for_game_ids()."""

    def test_empty_list(self):
        from ingest_wkbl import _generate_predictions_for_game_ids

        # Should not raise
        _generate_predictions_for_game_ids([])

    def test_processes_game_ids(self):
        from ingest_wkbl import _generate_predictions_for_game_ids

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_game") as mock_gen,
        ):
            mock_db.get_game_boxscore.return_value = {
                "game": {
                    "id": "04601010",
                    "season_id": "046",
                    "home_team_id": "kb",
                    "away_team_id": "samsung",
                },
            }
            mock_db.has_game_predictions.return_value = False
            mock_db.get_team_standings.return_value = []
            mock_db.get_team_season_totals.return_value = {}
            mock_db.get_opponent_season_totals.return_value = {}
            mock_db.get_league_season_totals.return_value = {}

            _generate_predictions_for_game_ids(["04601010"])

        mock_gen.assert_called_once()

    def test_skips_missing_game(self):
        from ingest_wkbl import _generate_predictions_for_game_ids

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_game") as mock_gen,
        ):
            mock_db.get_game_boxscore.return_value = None
            _generate_predictions_for_game_ids(["99999999"])

        mock_gen.assert_not_called()

    def test_skips_existing_predictions(self):
        from ingest_wkbl import _generate_predictions_for_game_ids

        with (
            patch("ingest_wkbl.database") as mock_db,
            patch("ingest_wkbl._generate_predictions_for_game") as mock_gen,
        ):
            mock_db.get_game_boxscore.return_value = {
                "game": {
                    "id": "04601010",
                    "season_id": "046",
                    "home_team_id": "kb",
                    "away_team_id": "samsung",
                },
            }
            mock_db.has_game_predictions.return_value = True
            _generate_predictions_for_game_ids(["04601010"])

        mock_gen.assert_not_called()
