"""Tests for the predict module (player stats, win probability, lineup selection)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

from predict import (
    calculate_player_prediction,
    calculate_win_probability,
    parse_last5,
    select_optimal_lineup,
)


def _make_game(
    pts=10,
    reb=5,
    ast=3,
    stl=1,
    blk=0,
    tov=2,
    minutes=30,
    fgm=4,
    fga=10,
    tpm=1,
    tpa=3,
    ftm=1,
    fta=2,
    off_reb=1,
    def_reb=4,
    pf=2,
):
    """Helper to create a game dict with all needed fields."""
    return {
        "game_id": "04601001",
        "game_date": "2025-11-01",
        "pts": pts,
        "reb": reb,
        "ast": ast,
        "stl": stl,
        "blk": blk,
        "tov": tov,
        "minutes": minutes,
        "fgm": fgm,
        "fga": fga,
        "tpm": tpm,
        "tpa": tpa,
        "ftm": ftm,
        "fta": fta,
        "off_reb": off_reb,
        "def_reb": def_reb,
        "pf": pf,
        "home_team_id": "samsung",
        "away_team_id": "kb",
        "team_id": "samsung",
    }


def _make_player_stats(pts=10.0, reb=5.0, ast=3.0, stl=1.0, blk=0.5):
    return {"pts": pts, "reb": reb, "ast": ast, "stl": stl, "blk": blk}


# ===========================================================================
# Player Prediction Tests
# ===========================================================================


class TestPlayerPrediction:
    def test_basic_prediction(self):
        """Basic PTS/REB/AST prediction generation."""
        games = [_make_game(pts=10, reb=5, ast=3) for _ in range(10)]
        player_stats = _make_player_stats(pts=10, reb=5, ast=3)
        result = calculate_player_prediction(
            recent_games=games,
            player_stats=player_stats,
            is_home=True,
        )
        assert "pts" in result
        assert "reb" in result
        assert "ast" in result
        for stat in ["pts", "reb", "ast"]:
            assert "pred" in result[stat]
            assert "low" in result[stat]
            assert "high" in result[stat]
            assert result[stat]["pred"] > 0
            assert result[stat]["low"] <= result[stat]["pred"]
            assert result[stat]["high"] >= result[stat]["pred"]

    def test_stl_blk_prediction(self):
        """STL/BLK predictions are included."""
        games = [_make_game(stl=2, blk=1) for _ in range(10)]
        player_stats = _make_player_stats(stl=2, blk=1)
        result = calculate_player_prediction(
            recent_games=games,
            player_stats=player_stats,
            is_home=True,
        )
        assert "stl" in result
        assert "blk" in result
        assert result["stl"]["pred"] > 0
        assert result["blk"]["pred"] > 0

    def test_game_score_weighting(self):
        """Game Score weighted average differs from simple average."""
        # Game 1: great game (high game score)
        great_game = _make_game(
            pts=25,
            reb=10,
            ast=6,
            stl=3,
            blk=2,
            tov=1,
            fgm=10,
            fga=15,
            ftm=3,
            fta=3,
            off_reb=3,
            def_reb=7,
            pf=1,
            minutes=35,
        )
        # Game 2: poor game (low game score)
        poor_game = _make_game(
            pts=5,
            reb=2,
            ast=1,
            stl=0,
            blk=0,
            tov=5,
            fgm=2,
            fga=12,
            ftm=1,
            fta=4,
            off_reb=0,
            def_reb=2,
            pf=4,
            minutes=20,
        )
        # Mix: 3 great, 2 poor
        games = [great_game] * 3 + [poor_game] * 2

        # Simple average PTS = (25*3 + 5*2) / 5 = 17.0
        simple_avg = (25 * 3 + 5 * 2) / 5

        result = calculate_player_prediction(
            recent_games=games,
            player_stats=_make_player_stats(pts=17),
            is_home=False,
        )
        # Game Score weighted should pull toward great games more than simple avg
        # But with home/away and other adjustments, just check it's not exactly 17
        # The weighted avg should be > simple avg since great games have higher weight
        # After away adjustment (*0.97), it could still be > simple_avg * 0.97
        pred_pts = result["pts"]["pred"]
        assert pred_pts != pytest.approx(simple_avg * 0.97, abs=0.5)

    def test_opponent_adjustment(self):
        """Opponent defensive factor adjusts predictions."""
        games = [_make_game(pts=15) for _ in range(10)]
        player_stats = _make_player_stats(pts=15)

        # Weak defense: allows more pts than league avg
        opp_context_weak = {"pts_factor": 1.1}  # 10% worse defense
        result_weak = calculate_player_prediction(
            recent_games=games,
            player_stats=player_stats,
            is_home=True,
            opp_context=opp_context_weak,
        )

        # Strong defense: allows fewer pts
        opp_context_strong = {"pts_factor": 0.9}
        result_strong = calculate_player_prediction(
            recent_games=games,
            player_stats=player_stats,
            is_home=True,
            opp_context=opp_context_strong,
        )

        # Against weak defense, prediction should be higher
        assert result_weak["pts"]["pred"] > result_strong["pts"]["pred"]

    def test_minutes_stability(self):
        """Unstable minutes widen confidence interval."""
        # Stable minutes: all 30
        stable_games = [_make_game(pts=15, minutes=30) for _ in range(10)]

        # Unstable minutes: 10-40 alternating
        unstable_games = []
        for i in range(10):
            m = 10 if i % 2 == 0 else 40
            unstable_games.append(_make_game(pts=15, minutes=m))

        result_stable = calculate_player_prediction(
            recent_games=stable_games,
            player_stats=_make_player_stats(pts=15),
            is_home=True,
        )
        result_unstable = calculate_player_prediction(
            recent_games=unstable_games,
            player_stats=_make_player_stats(pts=15),
            is_home=True,
        )

        # Unstable should have wider confidence interval
        stable_range = result_stable["pts"]["high"] - result_stable["pts"]["low"]
        unstable_range = result_unstable["pts"]["high"] - result_unstable["pts"]["low"]
        assert unstable_range > stable_range

    def test_no_recent_games_fallback(self):
        """No recent games falls back to season averages."""
        player_stats = _make_player_stats(pts=12, reb=6, ast=4, stl=1.5, blk=0.8)
        result = calculate_player_prediction(
            recent_games=[],
            player_stats=player_stats,
            is_home=True,
        )
        assert result["pts"]["pred"] == pytest.approx(12.0, abs=0.1)
        assert result["stl"]["pred"] == pytest.approx(1.5, abs=0.1)
        assert result["blk"]["pred"] == pytest.approx(0.8, abs=0.1)


# ===========================================================================
# Win Probability Tests
# ===========================================================================


class TestWinProbability:
    def _make_preds(self, pts=12, reb=5, ast=3):
        return [
            {
                "predicted_pts": pts,
                "predicted_reb": reb,
                "predicted_ast": ast,
            }
            for _ in range(5)
        ]

    def test_basic_sum_100(self):
        """Home + away probabilities sum to 100%."""
        home_prob, away_prob = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
        )
        assert home_prob + away_prob == pytest.approx(100.0, abs=0.1)

    def test_net_rating_dominant(self):
        """Team with better net rating gets > 50% probability."""
        context = {
            "home_net_rtg": 8.0,  # Very good
            "away_net_rtg": -5.0,  # Bad
        }
        home_prob, away_prob = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
            context=context,
        )
        assert home_prob > 50

    def test_h2h_factor(self):
        """H2H record affects probability."""
        # Home team dominates H2H
        ctx_home_dom = {"h2h_factor": 0.8}  # home won 80% of H2H
        home_prob_dom, _ = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
            context=ctx_home_dom,
        )

        # Away team dominates H2H
        ctx_away_dom = {"h2h_factor": 0.2}
        home_prob_under, _ = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
            context=ctx_away_dom,
        )

        assert home_prob_dom > home_prob_under

    def test_momentum(self):
        """Last5 momentum affects probability."""
        ctx_hot = {
            "home_last5": "5-0",
            "away_last5": "0-5",
        }
        home_hot, _ = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
            context=ctx_hot,
        )

        ctx_cold = {
            "home_last5": "0-5",
            "away_last5": "5-0",
        }
        home_cold, _ = calculate_win_probability(
            home_preds=self._make_preds(),
            away_preds=self._make_preds(),
            context=ctx_cold,
        )

        assert home_hot > home_cold

    def test_no_standings_graceful(self):
        """Works without standings data (graceful degradation)."""
        home_prob, away_prob = calculate_win_probability(
            home_preds=self._make_preds(pts=15),
            away_preds=self._make_preds(pts=10),
        )
        assert home_prob + away_prob == pytest.approx(100.0, abs=0.1)
        # Stronger predicted stats should still win
        assert home_prob > 50


# ===========================================================================
# parse_last5 Tests
# ===========================================================================


class TestParseLast5:
    def test_normal(self):
        assert parse_last5("3-2") == pytest.approx(0.6)

    def test_perfect(self):
        assert parse_last5("5-0") == pytest.approx(1.0)

    def test_none(self):
        assert parse_last5(None) == pytest.approx(0.5)

    def test_empty(self):
        assert parse_last5("") == pytest.approx(0.5)


# ===========================================================================
# Lineup Selection Tests
# ===========================================================================


class TestLineupSelection:
    def _make_players(self, n=10):
        """Create n players with varying game_score and position."""
        positions = ["G", "G", "F", "F", "C", "G", "F", "C", "G", "F"]
        players = []
        for i in range(n):
            players.append(
                {
                    "id": f"09500{i}",
                    "name": f"Player {i}",
                    "pos": positions[i % len(positions)],
                    "game_score": 20.0 - i * 1.5,
                    "pir": 15.0 - i,
                }
            )
        return players

    def test_game_score_priority(self):
        """Lineup sorted by Game Score (not PIR)."""
        players = self._make_players()
        # Swap game_score and pir ranking for player 0
        players[0]["game_score"] = 5.0  # low game score
        players[0]["pir"] = 30.0  # but high PIR
        players[1]["game_score"] = 25.0  # high game score
        players[1]["pir"] = 5.0  # but low PIR

        lineup = select_optimal_lineup(players)
        lineup_ids = [p["id"] for p in lineup]
        # Player 1 (high game_score) should be selected over Player 0 (high PIR)
        assert "095001" in lineup_ids

    def test_minutes_filter(self):
        """Players with < 15 min average are excluded."""
        players = self._make_players(8)
        # Simulate recent games
        recent_games_map = {}
        for p in players:
            if p["id"] in ("095000", "095001"):
                # These players average 10 min (below threshold)
                recent_games_map[p["id"]] = [{"minutes": 10} for _ in range(5)]
            else:
                recent_games_map[p["id"]] = [{"minutes": 30} for _ in range(5)]

        lineup = select_optimal_lineup(players, recent_games_map=recent_games_map)
        lineup_ids = [p["id"] for p in lineup]
        # Low-minutes players should be excluded
        assert "095000" not in lineup_ids
        assert "095001" not in lineup_ids
        assert len(lineup) == 5

    def test_position_diversity(self):
        """Position limits maintained (G≤2, F≤2, C≤1)."""
        players = self._make_players()
        lineup = select_optimal_lineup(players)
        positions = [p["pos"][0] for p in lineup]
        assert positions.count("G") <= 2
        assert positions.count("F") <= 2
        assert positions.count("C") <= 1
        assert len(lineup) == 5
