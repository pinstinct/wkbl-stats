"""Static checks for frontend player stats UI."""

from pathlib import Path

ROOT = Path(__file__).parent.parent


def test_player_card_no_meta_court_margin():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "playerCourtMargin" not in html


def test_player_table_has_court_margin_header():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert 'data-key="court_margin"' in html


def test_advanced_stats_includes_court_margin():
    app_js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
    assert '{ key: "court_margin"' in app_js


def test_advanced_stats_use_tooltips():
    app_js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
    assert 'stat-card--advanced" data-tooltip=' in app_js


def test_schedule_game_prediction_totals_markup():
    app_js = (ROOT / "src" / "app.js").read_text(encoding="utf-8")
    assert "pred-total-stats" in app_js
