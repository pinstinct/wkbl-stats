"""Regression tests for DB initialization flow in ingest_wkbl."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def test_main_initializes_db_even_when_no_new_games(monkeypatch):
    import ingest_wkbl

    init_calls = []
    lineup_calls = []

    monkeypatch.setattr(
        sys,
        "argv",
        [
            "ingest_wkbl.py",
            "--season-label",
            "2025-26",
            "--save-db",
            "--fetch-play-by-play",
            "--output",
            "data/test-output.json",
        ],
    )

    monkeypatch.setattr(ingest_wkbl, "_resolve_season_params", lambda args: "20260220")
    monkeypatch.setattr(
        ingest_wkbl,
        "_fetch_game_records",
        lambda *args, **kwargs: ([], [], [], {}),
    )
    monkeypatch.setattr(ingest_wkbl, "load_active_players", lambda *args, **kwargs: [])
    monkeypatch.setattr(ingest_wkbl, "aggregate_players", lambda *args, **kwargs: [])
    monkeypatch.setattr(ingest_wkbl, "_write_output", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        ingest_wkbl,
        "_compute_lineups_for_season",
        lambda season_code: lineup_calls.append(season_code),
    )
    monkeypatch.setattr(
        ingest_wkbl,
        "_save_to_db",
        lambda *args, **kwargs: (_ for _ in ()).throw(
            AssertionError("_save_to_db should not be called when no game_items")
        ),
    )
    monkeypatch.setattr(
        ingest_wkbl.database, "init_db", lambda: init_calls.append("init")
    )
    monkeypatch.setattr(
        ingest_wkbl.database, "get_existing_game_ids", lambda season_id=None: set()
    )

    ingest_wkbl.main()

    assert init_calls == ["init"]
    assert lineup_calls == ["046"]
