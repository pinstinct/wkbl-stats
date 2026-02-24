"""Tests for fetch_*() functions in ingest_wkbl."""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


# =========================================================================
# fetch_play_by_play tests
# =========================================================================


class TestFetchPlayByPlay:
    """Tests for fetch_play_by_play()."""

    @patch("ingest_wkbl.parse_play_by_play")
    @patch("ingest_wkbl.fetch")
    def test_basic(self, mock_fetch, mock_parse):
        """Basic PBP fetch parses events and resolves player_ids."""
        from ingest_wkbl import fetch_play_by_play

        mock_fetch.return_value = "<html>pbp</html>"
        mock_parse.return_value = [
            {"player_name": "박지수", "event_type": "score"},
            {"player_name": "김선영", "event_type": "rebound"},
        ]

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            {"name": "박지수", "player_id": "095830"},
            {"name": "김선영", "player_id": "096030"},
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            events = fetch_play_by_play("04601010", "/tmp", delay=0)

        assert len(events) == 2
        assert events[0]["player_id"] == "095830"
        assert events[1]["player_id"] == "096030"
        assert "player_name" not in events[0]

    @patch("ingest_wkbl.parse_play_by_play")
    @patch("ingest_wkbl.fetch")
    def test_db_error(self, mock_fetch, mock_parse):
        """DB connection error → empty name_to_id, events still returned."""
        from ingest_wkbl import fetch_play_by_play

        mock_fetch.return_value = "<html>pbp</html>"
        mock_parse.return_value = [
            {"player_name": "박지수", "event_type": "score"},
        ]

        with patch("sqlite3.connect", side_effect=Exception("db error")):
            events = fetch_play_by_play("04601010", "/tmp", delay=0)

        assert len(events) == 1
        assert events[0].get("player_id") is None

    @patch("ingest_wkbl.parse_play_by_play")
    @patch("ingest_wkbl.fetch")
    def test_no_player_name(self, mock_fetch, mock_parse):
        """Events without player_name still work."""
        from ingest_wkbl import fetch_play_by_play

        mock_fetch.return_value = "<html>pbp</html>"
        mock_parse.return_value = [
            {"event_type": "quarter_start"},
        ]

        with patch("sqlite3.connect", side_effect=Exception("db error")):
            events = fetch_play_by_play("04601010", "/tmp", delay=0)

        assert len(events) == 1
        assert "player_id" not in events[0]


# =========================================================================
# fetch_shot_chart tests
# =========================================================================


class TestFetchShotChart:
    """Tests for fetch_shot_chart()."""

    @patch("ingest_wkbl.parse_shot_chart")
    @patch("ingest_wkbl.fetch")
    def test_basic(self, mock_fetch, mock_parse):
        """Basic shot chart fetch resolves team_id."""
        from ingest_wkbl import fetch_shot_chart

        mock_fetch.return_value = "<html>shots</html>"
        mock_parse.return_value = [
            {"x": 10, "y": 20, "_is_home": True},
            {"x": 30, "y": 40, "_is_home": False},
        ]

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = {
            "home_team_id": "kb",
            "away_team_id": "samsung",
        }

        with patch("sqlite3.connect", return_value=mock_conn):
            shots = fetch_shot_chart("04601010", "/tmp", delay=0)

        assert shots[0]["team_id"] == "kb"
        assert shots[1]["team_id"] == "samsung"
        assert "_is_home" not in shots[0]

    @patch("ingest_wkbl.parse_shot_chart")
    @patch("ingest_wkbl.fetch")
    def test_no_game_in_db(self, mock_fetch, mock_parse):
        """No game in DB → no team_id assigned."""
        from ingest_wkbl import fetch_shot_chart

        mock_fetch.return_value = "<html>shots</html>"
        mock_parse.return_value = [{"x": 10, "y": 20, "_is_home": True}]

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None

        with patch("sqlite3.connect", return_value=mock_conn):
            shots = fetch_shot_chart("04601010", "/tmp", delay=0)

        assert "team_id" not in shots[0]


# =========================================================================
# fetch_team_category_stats tests
# =========================================================================


class TestFetchTeamCategoryStats:
    """Tests for fetch_team_category_stats()."""

    @patch("ingest_wkbl.parse_team_category_stats")
    @patch("ingest_wkbl.fetch_post")
    def test_basic(self, mock_fetch, mock_parse):
        """Fetches all categories and returns dict."""
        from ingest_wkbl import fetch_team_category_stats

        mock_fetch.return_value = "<html>stats</html>"
        mock_parse.return_value = [{"team": "KB", "value": 80}]

        result = fetch_team_category_stats("046", "/tmp", delay=0)

        assert len(result) > 0
        # Each category should have team stats
        for cat, stats in result.items():
            assert len(stats) == 1

    @patch("ingest_wkbl.fetch_post", side_effect=Exception("network"))
    def test_exception_handling(self, mock_fetch):
        """Category fetch failure → continues with others."""
        from ingest_wkbl import fetch_team_category_stats

        result = fetch_team_category_stats("046", "/tmp", delay=0)

        assert result == {}


# =========================================================================
# fetch_all_head_to_head tests
# =========================================================================


class TestFetchAllHeadToHead:
    """Tests for fetch_all_head_to_head()."""

    @patch("ingest_wkbl.parse_head_to_head")
    @patch("ingest_wkbl.fetch_post")
    def test_basic(self, mock_fetch, mock_parse):
        """Fetches all 15 team pairs."""
        from ingest_wkbl import fetch_all_head_to_head

        mock_fetch.return_value = "<html>h2h</html>"
        mock_parse.return_value = [{"game": "04601010"}]

        result = fetch_all_head_to_head("046", "/tmp", delay=0)

        assert len(result) == 15  # 6C2 pairs, 1 record each
        assert mock_fetch.call_count == 15

    @patch("ingest_wkbl.fetch_post", side_effect=Exception("network"))
    def test_exception_handling(self, mock_fetch):
        """One pair fails → others still fetched."""
        from ingest_wkbl import fetch_all_head_to_head

        result = fetch_all_head_to_head("046", "/tmp", delay=0)

        assert result == []
        assert mock_fetch.call_count == 15


# =========================================================================
# fetch_game_mvp tests
# =========================================================================


class TestFetchGameMvp:
    """Tests for fetch_game_mvp()."""

    @patch("ingest_wkbl.parse_game_mvp")
    @patch("ingest_wkbl.fetch")
    def test_basic(self, mock_fetch, mock_parse):
        """Basic MVP fetch."""
        from ingest_wkbl import fetch_game_mvp

        mock_fetch.return_value = "<html>mvp</html>"
        mock_parse.return_value = [{"player_id": "095830", "pts": 20}]

        result = fetch_game_mvp("046", "/tmp", delay=0)

        assert len(result) == 1
        mock_fetch.assert_called_once()


# =========================================================================
# fetch_quarter_scores tests
# =========================================================================


class TestFetchQuarterScores:
    """Tests for fetch_quarter_scores()."""

    @patch("ingest_wkbl.parse_team_analysis_json")
    @patch("ingest_wkbl.fetch")
    def test_basic(self, mock_fetch, mock_parse):
        """Basic quarter scores fetch."""
        from ingest_wkbl import fetch_quarter_scores

        mock_parse.return_value = {
            "matchRecordList": [
                {
                    "gameID": "04601010",
                    "homeTeamCode": "01",
                    "awayTeamCode": "03",
                    "homeTeamScoreQ1": "20",
                    "homeTeamScoreQ2": "18",
                    "homeTeamScoreQ3": "22",
                    "homeTeamScoreQ4": "15",
                    "homeTeamScoreEQ": None,
                    "awayTeamScoreQ1": "15",
                    "awayTeamScoreQ2": "22",
                    "awayTeamScoreQ3": "18",
                    "awayTeamScoreQ4": "20",
                    "awayTeamScoreEQ": None,
                    "courtName": "청주",
                },
            ]
        }
        mock_fetch.return_value = "<html>analysis</html>"

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            {"id": "04601010", "home_team_id": "kb", "away_team_id": "samsung"},
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            result = fetch_quarter_scores("046", "/tmp", delay=0)

        assert len(result) == 1
        assert result[0]["game_id"] == "04601010"
        assert result[0]["home_q1"] == "20"
        assert result[0]["venue"] == "청주"

    @patch("ingest_wkbl.parse_team_analysis_json")
    @patch("ingest_wkbl.fetch")
    def test_deduplication(self, mock_fetch, mock_parse):
        """Same gameID from different pairs → only once."""
        from ingest_wkbl import fetch_quarter_scores

        # Return same gameID from two different calls
        mock_parse.return_value = {
            "matchRecordList": [
                {"gameID": "04601010", "homeTeamCode": "01", "awayTeamCode": "03"},
            ]
        }
        mock_fetch.return_value = "<html>analysis</html>"

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            {"id": "04601010", "home_team_id": "kb", "away_team_id": "samsung"},
            {"id": "04601011", "home_team_id": "woori", "away_team_id": "bnk"},
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            result = fetch_quarter_scores("046", "/tmp", delay=0)

        # Same gameID should appear only once
        game_ids = [r["game_id"] for r in result]
        assert len(game_ids) == len(set(game_ids))

    def test_no_completed_games(self):
        """No completed games → empty result."""
        from ingest_wkbl import fetch_quarter_scores

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = []

        with patch("sqlite3.connect", return_value=mock_conn):
            result = fetch_quarter_scores("046", "/tmp", delay=0)

        assert result == []

    @patch("ingest_wkbl.parse_team_analysis_json")
    @patch("ingest_wkbl.fetch")
    def test_filters_season(self, mock_fetch, mock_parse):
        """Games from other seasons filtered out."""
        from ingest_wkbl import fetch_quarter_scores

        mock_parse.return_value = {
            "matchRecordList": [
                {"gameID": "04501010", "homeTeamCode": "01", "awayTeamCode": "03"},
                {"gameID": "04601020", "homeTeamCode": "01", "awayTeamCode": "03"},
            ]
        }
        mock_fetch.return_value = "<html>analysis</html>"

        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchall.return_value = [
            {"id": "04601020", "home_team_id": "kb", "away_team_id": "samsung"},
        ]

        with patch("sqlite3.connect", return_value=mock_conn):
            result = fetch_quarter_scores("046", "/tmp", delay=0)

        game_ids = [r["game_id"] for r in result]
        assert "04501010" not in game_ids  # Wrong season


# =========================================================================
# fetch_team_standings tests
# =========================================================================


class TestFetchTeamStandings:
    """Tests for fetch_team_standings()."""

    @patch("ingest_wkbl.parse_standings_html")
    @patch("ingest_wkbl.fetch_post")
    def test_basic(self, mock_fetch, mock_parse):
        """Basic standings fetch."""
        from ingest_wkbl import fetch_team_standings

        mock_fetch.return_value = "<html>standings</html>"
        mock_parse.return_value = [{"rank": 1, "team_id": "kb"}]

        result = fetch_team_standings("/tmp", "046", delay=0)

        assert len(result) == 1
        mock_fetch.assert_called_once()

    @patch("ingest_wkbl.parse_standings_html")
    @patch("ingest_wkbl.fetch_post")
    def test_post_data(self, mock_fetch, mock_parse):
        """POST data includes season_gu and gun."""
        from ingest_wkbl import fetch_team_standings

        mock_fetch.return_value = "<html>standings</html>"
        mock_parse.return_value = []

        fetch_team_standings("/tmp", "046", gun="4", delay=0)

        post_data = mock_fetch.call_args[0][1]
        assert post_data["season_gu"] == "046"
        assert post_data["gun"] == "4"


# =========================================================================
# get_season_meta_by_code tests
# =========================================================================


class TestGetSeasonMetaByCode:
    """Tests for get_season_meta_by_code()."""

    def test_valid_code(self):
        from ingest_wkbl import get_season_meta_by_code

        result = get_season_meta_by_code("046")

        assert result["label"] == "2025-26"
        assert result["firstGameDate"].startswith("2025")
        assert result["selectedId"].startswith("046")

    def test_invalid_code(self):
        from ingest_wkbl import get_season_meta_by_code

        with pytest.raises(ValueError, match="Unknown season code"):
            get_season_meta_by_code("999")
