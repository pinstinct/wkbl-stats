"""
Tests for parser functions in ingest_wkbl.py.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


class TestParsePlayByPlay:
    """Tests for parse_play_by_play()."""

    def test_basic_events(self):
        """Test parsing basic PBP events from li tags."""
        from ingest_wkbl import parse_play_by_play

        html = """
        <div class="event-list q1">
        <ul>
        <li class="item item-left first keb" data-quarter="Q1">
            <dl>
                <dt class="event-info">
                    <strong>09:44</strong>
                    <strong>하나은행</strong>
                    <strong>0-0</strong>
                </dt>
                <dd class="player-info">
                    <span></span>
                    <a class="keb"> 고서연  2점슛시도 </a>
                </dd>
            </dl>
        </li>
        </ul>
        <ul>
        <li class="item item-right sub woori" data-quarter="Q1">
            <dl>
                <dt class="event-info">
                    <strong>09:35</strong>
                    <strong>우리은행</strong>
                    <strong>2-0</strong>
                </dt>
                <dd class="player-info">
                    <span></span>
                    <a class="woori"> 세키 나나미  파울 </a>
                </dd>
            </dl>
        </li>
        </ul>
        </div>
        """
        events = parse_play_by_play(html)
        assert len(events) == 2

        # First event
        assert events[0]["quarter"] == "Q1"
        assert events[0]["game_clock"] == "09:44"
        assert events[0]["team_id"] == "hana"
        assert events[0]["event_type"] == "2pt_miss"
        assert events[0]["home_score"] == 0
        assert events[0]["away_score"] == 0
        assert "고서연" in events[0]["description"]

        # Second event
        assert events[1]["quarter"] == "Q1"
        assert events[1]["game_clock"] == "09:35"
        assert events[1]["team_id"] == "woori"
        assert events[1]["event_type"] == "foul"
        assert events[1]["home_score"] == 2
        assert events[1]["away_score"] == 0

    def test_scoring_event(self):
        """Test parsing a scoring event with updated score."""
        from ingest_wkbl import parse_play_by_play

        html = """
        <ul>
        <li class="item item-left first samsung" data-quarter="Q2">
            <dl>
                <dt class="event-info">
                    <strong>05:30</strong>
                    <strong>삼성생명</strong>
                    <strong>25-20</strong>
                </dt>
                <dd class="player-info">
                    <span></span>
                    <a class="samsung"> 박혜진  3점슛성공 </a>
                </dd>
            </dl>
        </li>
        </ul>
        """
        events = parse_play_by_play(html)
        assert len(events) == 1
        assert events[0]["event_type"] == "3pt_made"
        assert events[0]["quarter"] == "Q2"
        assert events[0]["home_score"] == 25
        assert events[0]["away_score"] == 20
        assert events[0]["team_id"] == "samsung"

    def test_team_event(self):
        """Test parsing team events like team turnover."""
        from ingest_wkbl import parse_play_by_play

        html = """
        <ul>
        <li class="item item-left first kb" data-quarter="Q3">
            <dl>
                <dt class="event-info">
                    <strong>03:15</strong>
                    <strong>KB스타즈</strong>
                    <strong>40-38</strong>
                </dt>
                <dd class="player-info">
                    <span></span>
                    <a class="kb"> 팀턴오버 </a>
                </dd>
            </dl>
        </li>
        </ul>
        """
        events = parse_play_by_play(html)
        assert len(events) == 1
        assert events[0]["event_type"] == "team_turnover"
        assert events[0]["player_name"] == ""

    def test_empty_html(self):
        """Test parsing empty HTML returns no events."""
        from ingest_wkbl import parse_play_by_play

        assert parse_play_by_play("") == []
        assert parse_play_by_play("<div></div>") == []

    def test_overtime_quarter(self):
        """Test parsing OT events."""
        from ingest_wkbl import parse_play_by_play

        html = """
        <ul>
        <li class="item item-right sub bnk" data-quarter="OT">
            <dl>
                <dt class="event-info">
                    <strong>04:00</strong>
                    <strong>BNK</strong>
                    <strong>70-70</strong>
                </dt>
                <dd class="player-info">
                    <span></span>
                    <a class="bnk"> 김한별  자유투성공 </a>
                </dd>
            </dl>
        </li>
        </ul>
        """
        events = parse_play_by_play(html)
        assert len(events) == 1
        assert events[0]["quarter"] == "OT"
        assert events[0]["event_type"] == "ft_made"


class TestParseHeadToHead:
    """Tests for parse_head_to_head()."""

    def test_basic_h2h(self):
        """Test parsing paired H2H rows with quarter scores."""
        from ingest_wkbl import parse_head_to_head

        html = """
        <tr>
            <td rowspan="2">2025.11.19</td>
            <td rowspan="2">3</td>
            <td rowspan="2" data-kr="삼성생명">삼성생명</td>
            <td rowspan="2" data-kr="KB스타즈">KB스타즈</td>
            <td rowspan="2" data-kr="용인실내체육관">용인실내체육관</td>
            <td data-kr="삼성생명">삼성생명</td>
            <td>20</td><td>6</td><td>20</td><td>15</td><td>0</td>
            <td rowspan="2">61:82</td>
            <td rowspan="2" data-kr="KB스타즈">KB스타즈</td>
        </tr>
        <tr>
            <td data-kr="KB스타즈">KB스타즈</td>
            <td>24</td><td>25</td><td>18</td><td>15</td><td>0</td>
        </tr>
        """
        records = parse_head_to_head(html, "samsung", "kb")
        assert len(records) == 1

        r = records[0]
        assert r["game_date"] == "2025-11-19"
        assert r["game_number"] == "3"
        assert r["venue"] == "용인실내체육관"
        assert r["team1_scores"] == "20-6-20-15-0"
        assert r["team2_scores"] == "24-25-18-15-0"
        assert r["total_score"] == "61-82"
        assert r["winner_id"] == "kb"

    def test_multiple_games(self):
        """Test parsing multiple H2H games."""
        from ingest_wkbl import parse_head_to_head

        html = """
        <tr>
            <td rowspan="2">2025.11.19</td>
            <td rowspan="2">3</td>
            <td rowspan="2">삼성생명</td>
            <td rowspan="2">KB스타즈</td>
            <td rowspan="2">용인실내체육관</td>
            <td>삼성생명</td>
            <td>20</td><td>6</td><td>20</td><td>15</td><td>0</td>
            <td rowspan="2">61:82</td>
            <td rowspan="2">KB스타즈</td>
        </tr>
        <tr>
            <td>KB스타즈</td>
            <td>24</td><td>25</td><td>18</td><td>15</td><td>0</td>
        </tr>
        <tr>
            <td rowspan="2">2025.12.15</td>
            <td rowspan="2">26</td>
            <td rowspan="2">KB스타즈</td>
            <td rowspan="2">삼성생명</td>
            <td rowspan="2">청주체육관</td>
            <td>KB스타즈</td>
            <td>19</td><td>15</td><td>19</td><td>13</td><td>0</td>
            <td rowspan="2">66:55</td>
            <td rowspan="2">KB스타즈</td>
        </tr>
        <tr>
            <td>삼성생명</td>
            <td>13</td><td>14</td><td>13</td><td>15</td><td>0</td>
        </tr>
        """
        records = parse_head_to_head(html, "samsung", "kb")
        assert len(records) == 2
        assert records[0]["game_date"] == "2025-11-19"
        assert records[1]["game_date"] == "2025-12-15"
        assert records[1]["team1_scores"] == "19-15-19-13-0"
        assert records[1]["team2_scores"] == "13-14-13-15-0"

    def test_empty_html(self):
        """Test parsing empty HTML returns no records."""
        from ingest_wkbl import parse_head_to_head

        assert parse_head_to_head("", "samsung", "kb") == []


class TestParseShotChart:
    """Tests for parse_shot_chart()."""

    def test_basic_shots(self):
        """Test parsing shot chart with home/away players."""
        from ingest_wkbl import parse_shot_chart

        html = """
        <input class="player-input home" type="checkbox" id="095830" name="homePlayer">
        <input class="player-input away" type="checkbox" id="096030" name="awayPlayer">

        <a class="shot-icon shot-suc has-video" data-player="095830"
           data-minute="2" data-second="32" data-quarter="Q1"
           style="left: 160.0px; top: 49.0px;"></a>
        <a class="shot-icon shot-fail" data-player="096030"
           data-minute="3" data-second="10" data-quarter="Q1"
           style="left: 74.0px; top: 116.0px;"></a>
        """
        shots = parse_shot_chart(html)
        assert len(shots) == 2

        # First shot (home player, made)
        assert shots[0]["player_id"] == "095830"
        assert shots[0]["made"] == 1
        assert shots[0]["quarter"] == "Q1"
        assert shots[0]["x"] == 160.0
        assert shots[0]["y"] == 49.0
        assert shots[0]["_is_home"] is True
        assert shots[0]["shot_zone"] is not None  # Should be classified

        # Second shot (away player, missed)
        assert shots[1]["player_id"] == "096030"
        assert shots[1]["made"] == 0
        assert shots[1]["_is_home"] is False

    def test_shot_zone_classification(self):
        """Test shot zone classification from coordinates."""
        from config import get_shot_zone

        # Paint (close to basket at ~150,10)
        assert get_shot_zone(150, 30) == "paint"
        assert get_shot_zone(170, 20) == "paint"

        # Mid-range
        assert get_shot_zone(100, 80) == "mid_range"

        # Three-point (far from basket)
        assert get_shot_zone(10, 100) == "three_pt"
        assert get_shot_zone(290, 170) == "three_pt"

    def test_empty_html(self):
        """Test parsing empty HTML returns no shots."""
        from ingest_wkbl import parse_shot_chart

        assert parse_shot_chart("") == []


class TestParsePlayerProfile:
    """Tests for parse_player_profile()."""

    def test_basic_profile(self):
        """Test extracting position, height, birth_date."""
        from ingest_wkbl import parse_player_profile

        html = """
        <span>포지션</span> - G
        <span>신장</span> - 175 cm
        <span>생년월일</span> - 1994.10.27
        """
        pos, height, birth_date = parse_player_profile(html)
        assert pos == "G"
        assert height == "175 cm"
        assert birth_date == "1994-10-27"

    def test_forward_center(self):
        """Test multi-position parsing."""
        from ingest_wkbl import parse_player_profile

        html = """
        <span>포지션</span> - F/C
        <span>신장</span> - 183 cm
        <span>생년월일</span> - 2000.03.15
        """
        pos, height, birth_date = parse_player_profile(html)
        assert pos == "F/C"
        assert height == "183 cm"
        assert birth_date == "2000-03-15"

    def test_missing_fields(self):
        """Test handling missing profile fields."""
        from ingest_wkbl import parse_player_profile

        pos, height, birth_date = parse_player_profile("<div>no data</div>")
        assert pos is None
        assert height is None
        assert birth_date is None


class TestResolveAmbiguousPlayers:
    """Tests for resolve_ambiguous_players()."""

    def test_resolves_transfer_by_season_adjacency(self):
        """Player transferred: orphan seasons 041-042, candidate starts 043."""
        from ingest_wkbl import resolve_ambiguous_players

        player_id_map = {
            "고아라|금호생명": "095027",
            "고아라|우리은행": "095068",
            "고아라|하나은행": "고아라_하나은행",  # orphan
        }
        player_id_by_name = {"고아라": ["095027", "095068"]}
        game_records = [
            # 095068 on woori in seasons 043-044
            {"name": "고아라", "team": "우리은행", "_game_id": "04301001"},
            {"name": "고아라", "team": "우리은행", "_game_id": "04401001"},
            # orphan on hana in seasons 041-042
            {"name": "고아라", "team": "하나은행", "_game_id": "04101001"},
            {"name": "고아라", "team": "하나은행", "_game_id": "04201001"},
            # 095027 on 금호생명 - no game records
        ]
        resolved = resolve_ambiguous_players(
            player_id_map, player_id_by_name, game_records
        )
        assert resolved == 1
        assert player_id_map["고아라|하나은행"] == "095068"

    def test_resolves_with_overlapping_candidate_excluded(self):
        """One candidate overlaps orphan seasons, other doesn't."""
        from ingest_wkbl import resolve_ambiguous_players

        player_id_map = {
            "김단비|삼성생명": "095226",
            "김단비|우리은행": "095104",
            "김단비|신한은행": "김단비_신한은행",  # orphan
        }
        player_id_by_name = {"김단비": ["095226", "095104"]}
        game_records = [
            # 095226 samsung: overlaps with orphan seasons 041-042
            {"name": "김단비", "team": "삼성생명", "_game_id": "04101001"},
            {"name": "김단비", "team": "삼성생명", "_game_id": "04201001"},
            # 095104 woori: starts after orphan ends (043+)
            {"name": "김단비", "team": "우리은행", "_game_id": "04301001"},
            {"name": "김단비", "team": "우리은행", "_game_id": "04401001"},
            # orphan on shinhan: 041-042
            {"name": "김단비", "team": "신한은행", "_game_id": "04101002"},
            {"name": "김단비", "team": "신한은행", "_game_id": "04201002"},
        ]
        resolved = resolve_ambiguous_players(
            player_id_map, player_id_by_name, game_records
        )
        assert resolved == 1
        assert player_id_map["김단비|신한은행"] == "095104"

    def test_tiebreak_by_minutes_similarity(self):
        """Two candidates with same gap resolved by avg minutes similarity."""
        from ingest_wkbl import resolve_ambiguous_players

        player_id_map = {
            "김정은|하나은행": "095041",
            "김정은|BNK썸": "095899",
            "김정은|우리은행": "김정은_우리은행",  # orphan
        }
        player_id_by_name = {"김정은": ["095041", "095899"]}
        game_records = [
            # 095041 (hana): ~29 min → similar to orphan
            {"name": "김정은", "team": "하나은행", "_game_id": "04401001", "min": 29},
            {"name": "김정은", "team": "하나은행", "_game_id": "04401002", "min": 29},
            # 095899 (BNK): ~16 min → rookie, different level
            {"name": "김정은", "team": "BNK썸", "_game_id": "04401003", "min": 16},
            {"name": "김정은", "team": "BNK썸", "_game_id": "04401004", "min": 16},
            # orphan: ~30 min → veteran
            {"name": "김정은", "team": "우리은행", "_game_id": "04301001", "min": 30},
            {"name": "김정은", "team": "우리은행", "_game_id": "04301002", "min": 30},
        ]
        resolved = resolve_ambiguous_players(
            player_id_map, player_id_by_name, game_records
        )
        assert resolved == 1
        assert player_id_map["김정은|우리은행"] == "095041"

    def test_no_resolution_identical_minutes(self):
        """Two candidates with same gap AND same minutes - can't resolve."""
        from ingest_wkbl import resolve_ambiguous_players

        player_id_map = {
            "선수A|팀X": "001",
            "선수A|팀Y": "002",
            "선수A|팀Z": "선수A_팀Z",
        }
        player_id_by_name = {"선수A": ["001", "002"]}
        game_records = [
            {"name": "선수A", "team": "팀X", "_game_id": "04401001", "min": 20},
            {"name": "선수A", "team": "팀Y", "_game_id": "04401002", "min": 20},
            {"name": "선수A", "team": "팀Z", "_game_id": "04301001", "min": 20},
        ]
        resolved = resolve_ambiguous_players(
            player_id_map, player_id_by_name, game_records
        )
        assert resolved == 0
        assert player_id_map["선수A|팀Z"] == "선수A_팀Z"

    def test_no_orphans_returns_zero(self):
        """No orphan players to resolve."""
        from ingest_wkbl import resolve_ambiguous_players

        player_id_map = {"선수A|팀1": "095001"}
        player_id_by_name = {"선수A": ["095001"]}
        resolved = resolve_ambiguous_players(player_id_map, player_id_by_name, [])
        assert resolved == 0


class TestEventTypeMap:
    """Tests for EVENT_TYPE_MAP configuration."""

    def test_all_event_types_have_categories(self):
        """Verify every event type code has a category."""
        from config import EVENT_TYPE_CATEGORIES, EVENT_TYPE_MAP

        for kr_name, code in EVENT_TYPE_MAP.items():
            assert code in EVENT_TYPE_CATEGORIES, (
                f"Missing category for {code} ({kr_name})"
            )

    def test_event_types_populated_in_db(self, test_db):
        """Test that event_types table is populated on init."""
        import database
        from config import EVENT_TYPE_MAP

        with database.get_connection() as conn:
            rows = conn.execute("SELECT * FROM event_types").fetchall()

        assert len(rows) == len(EVENT_TYPE_MAP)
        codes = {row["code"] for row in rows}
        for code in EVENT_TYPE_MAP.values():
            assert code in codes


# =========================================================================
# Helper function tests
# =========================================================================


class TestStripTags:
    """Tests for strip_tags()."""

    def test_basic(self):
        from ingest_wkbl import strip_tags

        assert strip_tags("<b>hello</b>") == "hello"

    def test_nested(self):
        from ingest_wkbl import strip_tags

        assert strip_tags("<div><span>text</span></div>") == "text"

    def test_entities(self):
        from ingest_wkbl import strip_tags

        assert strip_tags("A &amp; B") == "A & B"

    def test_empty(self):
        from ingest_wkbl import strip_tags

        assert strip_tags("") == ""


class TestParseMinutes:
    """Tests for parse_minutes()."""

    def test_basic(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes("35:20") == 35 + 20 / 60.0

    def test_zero(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes("00:00") == 0.0

    def test_none(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes(None) == 0.0

    def test_empty(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes("") == 0.0

    def test_no_colon(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes("35") == 0.0

    def test_bad_values(self):
        from ingest_wkbl import parse_minutes

        assert parse_minutes("ab:cd") == 0.0


class TestParseMadeAttempt:
    """Tests for parse_made_attempt()."""

    def test_basic(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt("8-15") == (8, 15)

    def test_zero(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt("0-0") == (0, 0)

    def test_none(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt(None) == (0, 0)

    def test_empty(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt("") == (0, 0)

    def test_no_dash(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt("15") == (0, 0)

    def test_bad_values(self):
        from ingest_wkbl import parse_made_attempt

        assert parse_made_attempt("a-b") == (0, 0)


class TestParseGameIds:
    """Tests for parse_game_ids()."""

    def test_basic(self):
        from ingest_wkbl import parse_game_ids

        from tests.fixtures.html_samples import GAME_IDS_BASIC

        ids = parse_game_ids(GAME_IDS_BASIC)
        assert ids == ["04601010", "04601011", "04601012"]

    def test_dedup(self):
        from ingest_wkbl import parse_game_ids

        from tests.fixtures.html_samples import GAME_IDS_DUPLICATES

        ids = parse_game_ids(GAME_IDS_DUPLICATES)
        assert ids == ["04601010", "04601011"]

    def test_empty(self):
        from ingest_wkbl import parse_game_ids

        from tests.fixtures.html_samples import GAME_IDS_EMPTY

        assert parse_game_ids(GAME_IDS_EMPTY) == []


class TestParseIframeSrc:
    """Tests for parse_iframe_src() and parse_team_iframe_src()."""

    def test_player_iframe(self):
        from ingest_wkbl import parse_iframe_src

        from tests.fixtures.html_samples import IFRAME_PLAYER

        url = parse_iframe_src(IFRAME_PLAYER)
        assert url is not None
        assert "record_player.asp" in url
        assert "gameId=04601010" in url

    def test_team_iframe(self):
        from ingest_wkbl import parse_team_iframe_src

        from tests.fixtures.html_samples import IFRAME_TEAM

        url = parse_team_iframe_src(IFRAME_TEAM)
        assert url is not None
        assert "record_team.asp" in url

    def test_no_iframe(self):
        from ingest_wkbl import parse_iframe_src, parse_team_iframe_src

        from tests.fixtures.html_samples import IFRAME_NONE

        assert parse_iframe_src(IFRAME_NONE) is None
        assert parse_team_iframe_src(IFRAME_NONE) is None


class TestParseGameType:
    """Tests for parse_game_type()."""

    def test_regular(self):
        from ingest_wkbl import parse_game_type

        assert parse_game_type("04601055") == "regular"

    def test_playoff(self):
        from ingest_wkbl import parse_game_type

        assert parse_game_type("04604010") == "playoff"

    def test_allstar(self):
        from ingest_wkbl import parse_game_type

        assert parse_game_type("04601001") == "allstar"

    def test_short_id(self):
        from ingest_wkbl import parse_game_type

        assert parse_game_type("046") == "regular"


class TestNormalizeTeam:
    """Tests for normalize_team()."""

    def test_basic(self):
        from ingest_wkbl import normalize_team

        assert normalize_team("  KB스타즈  ") == "KB스타즈"

    def test_double_spaces(self):
        from ingest_wkbl import normalize_team

        assert normalize_team("우리은행  위비") == "우리은행 위비"


class TestGetTeamId:
    """Tests for get_team_id()."""

    def test_known_teams(self):
        from ingest_wkbl import get_team_id

        assert get_team_id("KB스타즈") == "kb"
        assert get_team_id("삼성생명") == "samsung"
        assert get_team_id("우리은행") == "woori"
        assert get_team_id("하나은행") == "hana"
        assert get_team_id("BNK썸") == "bnk"
        assert get_team_id("신한은행") == "shinhan"

    def test_alias(self):
        from ingest_wkbl import get_team_id

        assert get_team_id("삼성") == "samsung"
        assert get_team_id("KB") == "kb"

    def test_unknown(self):
        from ingest_wkbl import get_team_id

        result = get_team_id("Unknown Team")
        assert isinstance(result, str)


# =========================================================================
# Parser function tests (with HTML fixtures)
# =========================================================================


class TestParseTeamRecord:
    """Tests for parse_team_record()."""

    def test_basic(self):
        from ingest_wkbl import parse_team_record

        from tests.fixtures.html_samples import TEAM_RECORD_BASIC

        results = parse_team_record(TEAM_RECORD_BASIC)
        assert len(results) == 2

        team1 = results[0]
        assert team1["team"] == "KB스타즈"
        assert team1["fast_break"] == 12
        assert team1["paint_pts"] == 28
        assert team1["two_pts"] == 18
        assert team1["three_pts"] == 15
        assert team1["reb"] == 35
        assert team1["ast"] == 20
        assert team1["stl"] == 5
        assert team1["blk"] == 3
        assert team1["pf"] == 15
        assert team1["tov"] == 10

        team2 = results[1]
        assert team2["team"] == "우리은행 위비"
        assert team2["reb"] == 30

    def test_empty(self):
        from ingest_wkbl import parse_team_record

        from tests.fixtures.html_samples import TEAM_RECORD_EMPTY

        assert parse_team_record(TEAM_RECORD_EMPTY) == []

    def test_bad_values(self):
        """Non-numeric stat values are skipped, but valid ones pass through."""
        from ingest_wkbl import parse_team_record

        from tests.fixtures.html_samples import TEAM_RECORD_BAD_VALUES

        results = parse_team_record(TEAM_RECORD_BAD_VALUES)
        assert len(results) == 2
        # reb was skipped (ValueError), but ast was parsed
        assert results[0].get("ast") == 10
        assert "reb" not in results[0]

    def test_no_stats_returns_empty(self):
        """Only 굿디펜스 (no reb/ast/fast_break) → empty output."""
        from ingest_wkbl import parse_team_record

        from tests.fixtures.html_samples import TEAM_RECORD_NO_STATS

        results = parse_team_record(TEAM_RECORD_NO_STATS)
        assert results == []


class TestParsePlayerTables:
    """Tests for parse_player_tables()."""

    def test_basic(self):
        from ingest_wkbl import parse_player_tables

        from tests.fixtures.html_samples import PLAYER_TABLES_BASIC

        results = parse_player_tables(PLAYER_TABLES_BASIC)
        assert len(results) == 1  # 합계 row is excluded
        p = results[0]
        assert p["team"] == "KB스타즈"
        assert p["name"] == "박지수"
        assert p["pos"] == "C"
        assert p["min"] > 35
        assert p["pts"] == "20"

    def test_two_teams(self):
        from ingest_wkbl import parse_player_tables

        from tests.fixtures.html_samples import PLAYER_TABLES_TWO_TEAMS

        results = parse_player_tables(PLAYER_TABLES_TWO_TEAMS)
        assert len(results) == 2
        teams = {r["team"] for r in results}
        assert "삼성생명" in teams
        assert "우리은행" in teams

    def test_empty_tbody(self):
        from ingest_wkbl import parse_player_tables

        from tests.fixtures.html_samples import PLAYER_TABLES_EMPTY

        results = parse_player_tables(PLAYER_TABLES_EMPTY)
        assert results == []

    def test_no_header(self):
        from ingest_wkbl import parse_player_tables

        from tests.fixtures.html_samples import PLAYER_TABLES_NO_HEADER

        results = parse_player_tables(PLAYER_TABLES_NO_HEADER)
        assert results == []

    def test_short_row_skipped(self):
        from ingest_wkbl import parse_player_tables

        from tests.fixtures.html_samples import PLAYER_TABLES_SHORT_ROW

        results = parse_player_tables(PLAYER_TABLES_SHORT_ROW)
        assert results == []


class TestParseActivePlayerLinks:
    """Tests for parse_active_player_links()."""

    def test_basic(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_BASIC

        players = parse_active_player_links(ACTIVE_LINKS_BASIC)
        assert len(players) == 2
        assert players[0]["name"] == "박지수"
        assert players[0]["pno"] == "095830"
        assert players[0]["team"] == "KB스타즈"

    def test_bracket_team(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_BRACKET_TEAM

        players = parse_active_player_links(ACTIVE_LINKS_BRACKET_TEAM)
        assert len(players) == 1
        assert players[0]["name"] == "고아라"
        assert players[0]["team"] == "우리은행"

    def test_dedup(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_DEDUP

        players = parse_active_player_links(ACTIVE_LINKS_DEDUP)
        assert len(players) == 1

    def test_no_team_skipped(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_NO_TEAM

        players = parse_active_player_links(ACTIVE_LINKS_NO_TEAM)
        assert len(players) == 0

    def test_absolute_url(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_ABSOLUTE_URL

        players = parse_active_player_links(ACTIVE_LINKS_ABSOLUTE_URL)
        assert len(players) == 1
        assert players[0]["url"].startswith("https://")

    def test_slash_url(self):
        from ingest_wkbl import parse_active_player_links

        from tests.fixtures.html_samples import ACTIVE_LINKS_SLASH_URL

        players = parse_active_player_links(ACTIVE_LINKS_SLASH_URL)
        assert len(players) == 1
        assert "wkbl.or.kr" in players[0]["url"]


class TestParseTeamCategoryStats:
    """Tests for parse_team_category_stats()."""

    def test_basic(self):
        from ingest_wkbl import parse_team_category_stats

        from tests.fixtures.html_samples import CATEGORY_STATS_BASIC

        stats = parse_team_category_stats(CATEGORY_STATS_BASIC, "pts")
        assert len(stats) == 3
        assert stats[0]["rank"] == 1
        assert stats[0]["team_id"] == "kb"
        assert stats[0]["value"] == 78.5
        assert stats[0]["games_played"] == 30
        assert stats[1]["rank"] == 2

    def test_tied_ranks(self):
        from ingest_wkbl import parse_team_category_stats

        from tests.fixtures.html_samples import CATEGORY_STATS_TIED

        stats = parse_team_category_stats(CATEGORY_STATS_TIED, "reb")
        assert len(stats) == 2
        # Both share rank 1
        assert stats[0]["rank"] == 1
        assert stats[1]["rank"] == 1

    def test_no_on_class(self):
        """Falls back to cell[3] when no class='on' cell found."""
        from ingest_wkbl import parse_team_category_stats

        from tests.fixtures.html_samples import CATEGORY_STATS_NO_ON_CLASS

        stats = parse_team_category_stats(CATEGORY_STATS_NO_ON_CLASS, "ast")
        assert len(stats) == 1
        assert stats[0]["value"] == 15.2

    def test_empty(self):
        from ingest_wkbl import parse_team_category_stats

        from tests.fixtures.html_samples import CATEGORY_STATS_EMPTY

        assert parse_team_category_stats(CATEGORY_STATS_EMPTY, "pts") == []


class TestParseGameMvp:
    """Tests for parse_game_mvp()."""

    def test_basic(self):
        from ingest_wkbl import parse_game_mvp

        from tests.fixtures.html_samples import GAME_MVP_BASIC

        records = parse_game_mvp(GAME_MVP_BASIC)
        assert len(records) == 2

        r1 = records[0]
        assert r1["player_id"] == "095830"
        assert r1["player_name"] == "박지수"
        assert r1["team_id"] == "kb"
        assert r1["game_date"] == "2025-11-19"
        assert r1["pts"] == 20
        assert r1["reb"] == 12
        assert r1["ast"] == 3
        assert r1["evaluation_score"] == 28.5
        assert r1["minutes"] > 35

        r2 = records[1]
        assert r2["player_id"] == "096030"
        assert r2["team_id"] == "samsung"
        assert r2["game_date"] == "2025-12-01"

    def test_too_few_tables(self):
        from ingest_wkbl import parse_game_mvp

        from tests.fixtures.html_samples import GAME_MVP_TOO_FEW_TABLES

        assert parse_game_mvp(GAME_MVP_TOO_FEW_TABLES) == []

    def test_no_pno(self):
        """Player without pno link uses fallback name extraction."""
        from ingest_wkbl import parse_game_mvp

        from tests.fixtures.html_samples import GAME_MVP_NO_PNO

        records = parse_game_mvp(GAME_MVP_NO_PNO)
        assert len(records) == 1
        assert records[0]["player_id"] is None
        assert records[0]["team_id"] == "bnk"

    def test_short_row_skipped(self):
        from ingest_wkbl import parse_game_mvp

        from tests.fixtures.html_samples import GAME_MVP_SHORT_ROW

        assert parse_game_mvp(GAME_MVP_SHORT_ROW) == []


class TestParseTeamAnalysisJson:
    """Tests for parse_team_analysis_json()."""

    def test_basic(self):
        from ingest_wkbl import parse_team_analysis_json

        from tests.fixtures.html_samples import TEAM_ANALYSIS_BASIC

        result = parse_team_analysis_json(TEAM_ANALYSIS_BASIC)
        assert "matchRecordList" in result
        assert len(result["matchRecordList"]) == 1
        assert result["matchRecordList"][0]["courtName"] == "청주체육관"

    def test_with_versus(self):
        from ingest_wkbl import parse_team_analysis_json

        from tests.fixtures.html_samples import TEAM_ANALYSIS_WITH_VERSUS

        result = parse_team_analysis_json(TEAM_ANALYSIS_WITH_VERSUS)
        assert "matchRecordList" in result
        assert "versusList" in result

    def test_invalid_json(self):
        from ingest_wkbl import parse_team_analysis_json

        from tests.fixtures.html_samples import TEAM_ANALYSIS_INVALID_JSON

        result = parse_team_analysis_json(TEAM_ANALYSIS_INVALID_JSON)
        assert result == {}

    def test_empty(self):
        from ingest_wkbl import parse_team_analysis_json

        from tests.fixtures.html_samples import TEAM_ANALYSIS_EMPTY

        result = parse_team_analysis_json(TEAM_ANALYSIS_EMPTY)
        assert result == {}


class TestWkblTeamCodeToId:
    """Tests for _wkbl_team_code_to_id()."""

    def test_known_codes(self):
        from ingest_wkbl import _wkbl_team_code_to_id

        assert _wkbl_team_code_to_id("01") == "kb"
        assert _wkbl_team_code_to_id("03") == "samsung"
        assert _wkbl_team_code_to_id("05") == "woori"

    def test_unknown_code(self):
        from ingest_wkbl import _wkbl_team_code_to_id

        assert _wkbl_team_code_to_id("99") is None


class TestNormalizeSeasonLabel:
    """Tests for normalize_season_label()."""

    def test_short_format(self):
        from ingest_wkbl import normalize_season_label

        assert normalize_season_label("2025-26") == "2025-2026"

    def test_already_full(self):
        from ingest_wkbl import normalize_season_label

        assert normalize_season_label("2025-2026") == "2025-2026"

    def test_no_match(self):
        from ingest_wkbl import normalize_season_label

        assert normalize_season_label("invalid") == "invalid"


# ===========================================================================
# _parse_record tests
# ===========================================================================


class TestParseRecord:
    """Tests for _parse_record() helper."""

    def test_dash_format(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("6-3") == (6, 3)

    def test_korean_format(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("13승 5패") == (13, 5)

    def test_korean_no_space(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("13승5패") == (13, 5)

    def test_invalid(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("abc") == (0, 0)

    def test_empty(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("") == (0, 0)

    def test_dash_non_numeric(self):
        from ingest_wkbl import _parse_record

        assert _parse_record("abc-xyz") == (0, 0)


# ===========================================================================
# parse_standings_html tests
# ===========================================================================


class TestParseStandingsHtml:
    """Tests for parse_standings_html()."""

    def test_basic(self):
        from ingest_wkbl import parse_standings_html

        html = """
        <table>
        <tr><th>순위</th><th>팀</th><th>경기수</th><th>전적</th><th>승률</th>
            <th>차이</th><th>홈</th><th>원정</th><th>중립</th><th>최근5</th><th>연속</th></tr>
        <tr>
            <td>1</td><td>KB스타즈</td><td>30</td><td>22승 8패</td><td>73.3</td>
            <td>-</td><td>12-3</td><td>10-5</td><td>0-0</td><td>4-1</td><td>연3승</td>
        </tr>
        <tr>
            <td>2</td><td>우리은행</td><td>30</td><td>20승 10패</td><td>66.7</td>
            <td>2</td><td>11-4</td><td>9-6</td><td>0-0</td><td>3-2</td><td>연1패</td>
        </tr>
        </table>
        """
        result = parse_standings_html(html, "046")
        assert len(result) == 2
        assert result[0]["rank"] == 1
        assert result[0]["team_name"] == "KB스타즈"
        assert result[0]["wins"] == 22
        assert result[0]["losses"] == 8
        assert result[0]["win_pct"] == 0.733
        assert result[0]["home_wins"] == 12
        assert result[0]["home_losses"] == 3
        assert result[0]["away_wins"] == 10
        assert result[0]["away_losses"] == 5
        assert result[0]["last5"] == "4-1"
        assert result[0]["streak"] == "연3승"
        assert result[1]["rank"] == 2
        assert result[1]["games_behind"] == 2.0

    def test_header_rows_skipped(self):
        from ingest_wkbl import parse_standings_html

        html = """
        <tr><th>순위</th><th>팀</th><th>경기수</th><th>전적</th><th>승률</th>
            <th>차이</th><th>홈</th><th>원정</th><th>중립</th><th>최근5</th><th>연속</th></tr>
        """
        result = parse_standings_html(html, "046")
        assert result == []

    def test_short_rows_skipped(self):
        from ingest_wkbl import parse_standings_html

        html = "<tr><td>1</td><td>KB</td><td>10</td></tr>"
        result = parse_standings_html(html, "046")
        assert result == []

    def test_non_numeric_rank_skipped(self):
        from ingest_wkbl import parse_standings_html

        html = """
        <tr><td>-</td><td>합계</td><td>30</td><td>22승 8패</td><td>73.3</td>
            <td>-</td><td>12-3</td><td>10-5</td><td>0-0</td><td>4-1</td><td>연3승</td></tr>
        """
        result = parse_standings_html(html, "046")
        assert result == []

    def test_games_behind_dash(self):
        """Games behind '-' (leader) parsed as 0.0."""
        from ingest_wkbl import parse_standings_html

        html = """
        <tr><td>1</td><td>KB스타즈</td><td>30</td><td>22승 8패</td><td>73.3</td>
            <td>-</td><td>12-3</td><td>10-5</td><td>0-0</td><td>4-1</td><td>연3승</td></tr>
        """
        result = parse_standings_html(html, "046")
        assert result[0]["games_behind"] == 0.0

    def test_win_pct_fallback(self):
        """Non-numeric win_pct falls back to wins/games_played."""
        from ingest_wkbl import parse_standings_html

        html = """
        <tr><td>1</td><td>KB스타즈</td><td>30</td><td>22승 8패</td><td>abc</td>
            <td>-</td><td>12-3</td><td>10-5</td><td>0-0</td><td>4-1</td><td>연3승</td></tr>
        """
        result = parse_standings_html(html, "046")
        assert result[0]["win_pct"] == pytest.approx(22 / 30, abs=0.001)


# ===========================================================================
# parse_game_list_items tests
# ===========================================================================


class TestParseGameListItems:
    """Tests for parse_game_list_items()."""

    def test_basic(self):
        from ingest_wkbl import parse_game_list_items

        html = """
        <li class="game-item" data-id="04601010">
            <span class="game-date">11.05</span>
        </li>
        <li class="game-item" data-id="04601011">
            <span class="game-date">11.06</span>
        </li>
        """
        result = parse_game_list_items(html, "20251027")
        assert len(result) == 2
        assert result[0] == ("04601010", "20251105")
        assert result[1] == ("04601011", "20251106")

    def test_cross_year(self):
        """Months before season start month get next year."""
        from ingest_wkbl import parse_game_list_items

        html = """
        <li class="game-item" data-id="04601050">
            <span class="game-date">1.15</span>
        </li>
        """
        result = parse_game_list_items(html, "20251027")
        assert result[0] == ("04601050", "20260115")

    def test_no_date(self):
        """Items without game-date class are skipped."""
        from ingest_wkbl import parse_game_list_items

        html = '<li class="game-item" data-id="04601010"><span>no date</span></li>'
        result = parse_game_list_items(html, "20251027")
        assert result == []

    def test_empty(self):
        from ingest_wkbl import parse_game_list_items

        assert parse_game_list_items("<div>empty</div>", "20251027") == []


# ===========================================================================
# parse_available_months tests
# ===========================================================================


class TestParseAvailableMonths:
    """Tests for parse_available_months()."""

    def test_basic(self):
        from ingest_wkbl import parse_available_months

        html = """
        <a onclick="selectSeasonOrMonth('20251101', '04601002', '20251101')">11월</a>
        <a onclick="selectSeasonOrMonth('20251201', '04601020', '20251201')">12월</a>
        <a onclick="selectSeasonOrMonth('20260101', '04601040', '20260101')">1월</a>
        """
        result = parse_available_months(html, "20251027")
        assert len(result) == 3
        assert result[0][0] == "20251101"
        assert result[2][0] == "20260101"

    def test_filters_old_months(self):
        """Months before season start are excluded."""
        from ingest_wkbl import parse_available_months

        html = """
        <a onclick="selectSeasonOrMonth('20250301', '04501080', '20250301')">3월</a>
        <a onclick="selectSeasonOrMonth('20251101', '04601002', '20251101')">11월</a>
        """
        result = parse_available_months(html, "20251027")
        assert len(result) == 1
        assert result[0][0] == "20251101"

    def test_deduplicates(self):
        from ingest_wkbl import parse_available_months

        html = """
        <a onclick="selectSeasonOrMonth('20251101', '04601002', '20251101')">11월</a>
        <a onclick="selectSeasonOrMonth('20251101', '04601003', '20251105')">11월</a>
        """
        result = parse_available_months(html, "20251027")
        assert len(result) == 1

    def test_sorted(self):
        from ingest_wkbl import parse_available_months

        html = """
        <a onclick="selectSeasonOrMonth('20260101', '04601040', '20260101')">1월</a>
        <a onclick="selectSeasonOrMonth('20251101', '04601002', '20251101')">11월</a>
        """
        result = parse_available_months(html, "20251027")
        assert result[0][0] == "20251101"
        assert result[1][0] == "20260101"

    def test_empty(self):
        from ingest_wkbl import parse_available_months

        assert parse_available_months("<div>no months</div>", "20251027") == []


# ===========================================================================
# get_season_meta_by_code tests
# ===========================================================================


class TestGetSeasonMetaByCode:
    """Tests for get_season_meta_by_code()."""

    def test_valid_code(self):
        from ingest_wkbl import get_season_meta_by_code

        result = get_season_meta_by_code("046")
        assert result["label"] == "2025-26"
        assert result["firstGameDate"] == "20251027"
        assert result["selectedId"] == "04601001"

    def test_older_season(self):
        from ingest_wkbl import get_season_meta_by_code

        result = get_season_meta_by_code("044")
        assert result["label"] == "2023-24"
        assert result["firstGameDate"] == "20231027"

    def test_unknown_code_raises(self):
        from ingest_wkbl import get_season_meta_by_code

        with pytest.raises(ValueError, match="Unknown season code"):
            get_season_meta_by_code("999")
