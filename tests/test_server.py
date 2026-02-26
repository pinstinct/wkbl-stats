"""Tests for server.py."""

from __future__ import annotations

import importlib
import json
import subprocess
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

from fastapi.testclient import TestClient


def _load_server():
    if "server" in sys.modules:
        return importlib.reload(sys.modules["server"])
    return importlib.import_module("server")


def _freeze_today(monkeypatch, server_module, y: int, m: int, d: int) -> None:
    frozen = type("FrozenDate", (), {"today": staticmethod(lambda: date(y, m, d))})
    monkeypatch.setattr(server_module.datetime, "date", frozen)


def test_load_status_missing_file_returns_empty(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    status_path = tmp_path / "status.json"
    monkeypatch.setattr(server, "STATUS_PATH", str(status_path))
    assert server.load_status() == {}


def test_load_status_invalid_json_returns_empty(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    status_path = tmp_path / "status.json"
    status_path.write_text("{bad json", encoding="utf-8")
    monkeypatch.setattr(server, "STATUS_PATH", str(status_path))
    assert server.load_status() == {}


def test_save_status_writes_json_file(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    status_path = tmp_path / "nested" / "status.json"
    monkeypatch.setattr(server, "STATUS_PATH", str(status_path))
    server.save_status({"date": "20260226"})
    payload = json.loads(status_path.read_text(encoding="utf-8"))
    assert payload == {"date": "20260226"}


def test_run_ingest_if_needed_skips_when_data_is_fresh(
    tmp_path: Path, monkeypatch
) -> None:
    server = _load_server()
    output_path = tmp_path / "wkbl-active.json"
    output_path.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(server, "OUTPUT_PATH", str(output_path))
    monkeypatch.setattr(server, "load_status", lambda: {"date": "20260226"})
    _freeze_today(monkeypatch, server, 2026, 2, 26)
    assert server.run_ingest_if_needed() is False


def test_run_ingest_if_needed_handles_nonzero_exit(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    status_path = tmp_path / "status.json"
    monkeypatch.setattr(server, "STATUS_PATH", str(status_path))
    monkeypatch.setattr(server, "OUTPUT_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setattr(server, "load_status", lambda: {})
    _freeze_today(monkeypatch, server, 2026, 2, 26)

    def _fail_run(*_args, **_kwargs):
        return subprocess.CompletedProcess(args=["x"], returncode=1, stderr="boom")

    monkeypatch.setattr(server.subprocess, "run", _fail_run)
    assert server.run_ingest_if_needed() is False


def test_run_ingest_if_needed_handles_success_and_split(tmp_path: Path, monkeypatch):
    server = _load_server()
    status_path = tmp_path / "status.json"
    monkeypatch.setattr(server, "STATUS_PATH", str(status_path))
    monkeypatch.setattr(server, "OUTPUT_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setattr(server, "load_status", lambda: {})
    _freeze_today(monkeypatch, server, 2026, 2, 26)
    monkeypatch.setattr(
        server.subprocess,
        "run",
        lambda *_a, **_k: subprocess.CompletedProcess(args=["x"], returncode=0),
    )
    split_stub = SimpleNamespace(
        split_database=lambda *_a, **_k: {
            "core_size": 10 * 1024 * 1024,
            "detail_size": 20 * 1024 * 1024,
        }
    )
    monkeypatch.setitem(sys.modules, "tools.split_db", split_stub)

    assert server.run_ingest_if_needed() is True
    assert json.loads(status_path.read_text(encoding="utf-8"))["date"] == "20260226"


def test_run_ingest_if_needed_handles_split_and_subprocess_errors(
    tmp_path: Path, monkeypatch
) -> None:
    server = _load_server()
    monkeypatch.setattr(server, "STATUS_PATH", str(tmp_path / "status.json"))
    monkeypatch.setattr(server, "OUTPUT_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setattr(server, "load_status", lambda: {})
    _freeze_today(monkeypatch, server, 2026, 2, 26)

    monkeypatch.setattr(
        server.subprocess,
        "run",
        lambda *_a, **_k: subprocess.CompletedProcess(args=["x"], returncode=0),
    )
    split_stub = SimpleNamespace(
        split_database=lambda *_a, **_k: (_ for _ in ()).throw(Exception("split fail"))
    )
    monkeypatch.setitem(sys.modules, "tools.split_db", split_stub)
    assert server.run_ingest_if_needed() is True

    def _subprocess_error(*_args, **_kwargs):
        raise subprocess.SubprocessError("subprocess boom")

    monkeypatch.setattr(server.subprocess, "run", _subprocess_error)
    assert server.run_ingest_if_needed() is False


def test_run_ingest_if_needed_handles_timeout(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    monkeypatch.setattr(server, "STATUS_PATH", str(tmp_path / "status.json"))
    monkeypatch.setattr(server, "OUTPUT_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setattr(server, "load_status", lambda: {})
    _freeze_today(monkeypatch, server, 2026, 2, 26)

    def _timeout(*_args, **_kwargs):
        raise subprocess.TimeoutExpired(cmd="ingest", timeout=1)

    monkeypatch.setattr(server.subprocess, "run", _timeout)
    assert server.run_ingest_if_needed() is False


def test_root_and_favicon_routes_with_fallback(tmp_path: Path, monkeypatch) -> None:
    server = _load_server()
    monkeypatch.setattr(server, "BASE_DIR", str(tmp_path))
    (tmp_path / "index.html").write_text("<html>ok</html>", encoding="utf-8")

    client = TestClient(server.app)
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    assert "text/html" in root_resp.headers.get("content-type", "")

    # No favicon file -> fallback 404 response serving index
    favicon_resp = client.get("/favicon.ico")
    assert favicon_resp.status_code == 404


def test_main_runs_uvicorn_and_respects_skip_ingest(monkeypatch) -> None:
    server = _load_server()
    uvicorn_calls: list[dict] = []
    monkeypatch.setitem(
        sys.modules,
        "uvicorn",
        SimpleNamespace(run=lambda *args, **kwargs: uvicorn_calls.append(kwargs)),
    )
    monkeypatch.setattr(server, "run_ingest_if_needed", lambda: True)
    monkeypatch.setenv("SKIP_INGEST", "1")

    server.main()

    assert uvicorn_calls
    assert uvicorn_calls[0]["port"] == server.PORT
    assert uvicorn_calls[0]["log_level"] == "info"
