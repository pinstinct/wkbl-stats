"""Contract tests for frontend shared configuration."""

from pathlib import Path


def test_index_loads_shared_seasons_before_db():
    index_html = Path("index.html").read_text(encoding="utf-8")
    seasons_pos = index_html.find("./src/seasons.js")
    db_pos = index_html.find("./src/db.js")
    assert seasons_pos != -1, "index.html must include src/seasons.js"
    assert db_pos != -1, "index.html must include src/db.js"
    assert seasons_pos < db_pos, "src/seasons.js must be loaded before src/db.js"


def test_app_uses_shared_seasons_config():
    app_js = Path("src/app.js").read_text(encoding="utf-8")
    assert "const SEASONS = {" not in app_js
    assert 'defaultSeason: "046"' not in app_js
    assert "window.WKBLShared" in app_js


def test_db_uses_shared_season_codes():
    db_js = Path("src/db.js").read_text(encoding="utf-8")
    assert "const SEASON_CODES = {" not in db_js
    assert "window.WKBLShared" in db_js


def test_app_imports_teams_view_module():
    app_js = Path("src/app.js").read_text(encoding="utf-8")
    teams_view_js = Path("src/views/teams.js").read_text(encoding="utf-8")

    assert "./views/teams.js" in app_js
    assert "renderStandingsTable" in teams_view_js
    assert "renderTeamRoster" in teams_view_js
    assert "renderTeamRecentGames" in teams_view_js
