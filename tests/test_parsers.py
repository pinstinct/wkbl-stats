"""
Tests for parser functions in ingest_wkbl.py.
"""

import sys
from pathlib import Path

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
