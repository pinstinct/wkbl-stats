"""CLI behavior tests for tools/split_db.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))


def test_main_prints_summary_with_custom_args(monkeypatch, capsys):
    import split_db

    calls = []

    def fake_split(src, core, detail):
        calls.append((src, core, detail))
        return {
            "core_tables": ["seasons", "teams"],
            "detail_tables": ["shot_charts"],
            "core_size": 2 * 1024 * 1024,
            "detail_size": 512 * 1024,
        }

    monkeypatch.setattr(split_db, "split_database", fake_split)
    monkeypatch.setattr(
        sys,
        "argv",
        ["split_db.py", "--src", "a.db", "--core", "b.db", "--detail", "c.db"],
    )

    split_db.main()
    out = capsys.readouterr().out

    assert calls == [("a.db", "b.db", "c.db")]
    assert "Core DB: 2.0 MB" in out
    assert "Detail DB: 0.5 MB" in out


def test_main_uses_default_paths(monkeypatch):
    import split_db

    calls = []

    def fake_split(src, core, detail):
        calls.append((src, core, detail))
        return {
            "core_tables": [],
            "detail_tables": [],
            "core_size": 1,
            "detail_size": 1,
        }

    monkeypatch.setattr(split_db, "split_database", fake_split)
    monkeypatch.setattr(sys, "argv", ["split_db.py"])

    split_db.main()
    assert calls == [("data/wkbl.db", "data/wkbl-core.db", "data/wkbl-detail.db")]
