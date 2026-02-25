"""Tests for tools/e2e_coverage_report.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import e2e_coverage_report as report


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _matrix_yaml() -> str:
    return """
version: 1
scenarios:
  - id: E2E-NAV-001
    title: nav players
    tier: required
    area: nav
    owner: frontend
    risk: high
    preconditions: app loaded
    expected: players visible
    testRefs:
      - spec: e2e/required/core.spec.js
        title: "[E2E-NAV-001]"
        tag: "@required"
    enabled: true
    since: "2026-02-25"
    notes: ""
  - id: E2E-ROUTE-001
    title: route fallback
    tier: required
    area: route
    owner: frontend
    risk: high
    preconditions: invalid route
    expected: main visible
    testRefs:
      - spec: e2e/required/core.spec.js
        title: "[E2E-ROUTE-001]"
        tag: "@required"
    enabled: true
    since: "2026-02-25"
    notes: ""
  - id: E2E-PLAYERS-001
    title: players search
    tier: recommended
    area: players
    owner: frontend
    risk: medium
    preconditions: players route
    expected: input works
    testRefs:
      - spec: e2e/recommended/interaction.spec.js
        title: "[E2E-PLAYERS-001]"
        tag: "@recommended"
    enabled: true
    since: "2026-02-25"
    notes: ""
  - id: E2E-MOBILE-001
    title: mobile nav open
    tier: optional
    area: mobile
    owner: frontend
    risk: low
    preconditions: mobile viewport
    expected: nav opens
    testRefs:
      - spec: e2e/optional/resilience.spec.js
        title: "[E2E-MOBILE-001]"
        tag: "@optional"
    enabled: true
    since: "2026-02-25"
    notes: ""
"""


def _write_specs(root: Path) -> None:
    _write(
        root / "e2e/required/core.spec.js",
        """
test("[E2E-NAV-001] @required nav players", async () => {});
test("[E2E-ROUTE-001] @required route fallback", async () => {});
""",
    )
    _write(
        root / "e2e/recommended/interaction.spec.js",
        """
test("[E2E-PLAYERS-001] @recommended players search", async () => {});
""",
    )
    _write(
        root / "e2e/optional/resilience.spec.js",
        """
test("[E2E-MOBILE-001] @optional mobile nav open", async () => {});
""",
    )


def _playwright_json(*, suites: list[dict], errors: list[dict] | None = None) -> str:
    return json.dumps({"suites": suites, "errors": errors or [], "stats": {}})


def _suite_with_tests() -> list[dict]:
    return [
        {
            "title": "root",
            "specs": [
                {
                    "title": "[E2E-NAV-001] @required nav players",
                    "tests": [{"results": [{"status": "passed"}]}],
                },
                {
                    "title": "[E2E-ROUTE-001] @required fallback",
                    "tests": [{"results": [{"status": "failed"}]}],
                },
                {
                    "title": "[E2E-PLAYERS-001] @recommended search",
                    "tests": [{"results": [{"status": "passed"}]}],
                },
                {
                    "title": "[E2E-MOBILE-001] @optional mobile",
                    "tests": [{"results": [{"status": "skipped"}]}],
                },
                {
                    "title": "[E2E-UNKNOWN-999] @required unknown in matrix",
                    "tests": [{"results": [{"status": "passed"}]}],
                },
            ],
            "suites": [
                {
                    "title": "child",
                    "specs": [
                        {
                            "title": "[E2E-NAV-001] duplicated pass",
                            "tests": [{"results": [{"status": "passed"}]}],
                        }
                    ],
                }
            ],
        }
    ]


def test_load_matrix_valid_and_missing_file(tmp_path: Path) -> None:
    matrix = tmp_path / "e2e/scenarios/scenario-matrix.yaml"
    _write(matrix, _matrix_yaml())
    rows = report.load_matrix(matrix)
    assert len(rows) == 4
    with pytest.raises(FileNotFoundError):
        report.load_matrix(tmp_path / "missing.yaml")


def test_load_matrix_validation_errors(tmp_path: Path) -> None:
    bad_fields = tmp_path / "bad_fields.yaml"
    _write(
        bad_fields,
        """
scenarios:
  - id: E2E-FOO-001
    tier: required
""",
    )
    with pytest.raises(ValueError, match="missing fields"):
        report.load_matrix(bad_fields)

    bad_tier = tmp_path / "bad_tier.yaml"
    _write(
        bad_tier,
        """
scenarios:
  - id: E2E-FOO-001
    title: foo
    tier: invalid
    area: nav
    owner: x
    risk: low
    preconditions: x
    expected: x
    testRefs: []
    enabled: true
    since: "2026-02-25"
    notes: ""
""",
    )
    with pytest.raises(ValueError, match="invalid tier"):
        report.load_matrix(bad_tier)


def test_extract_ids_from_test_files(tmp_path: Path) -> None:
    _write_specs(tmp_path)
    found = report.extract_ids_from_test_files(tmp_path)
    assert found == {
        "E2E-NAV-001",
        "E2E-ROUTE-001",
        "E2E-PLAYERS-001",
        "E2E-MOBILE-001",
    }


def test_iter_suite_tests_and_status_summary() -> None:
    suite = _suite_with_tests()[0]
    items = report.iter_suite_tests(suite, [])
    assert len(items) == 6

    assert report.summarize_test_status({"results": []}) == "unknown"
    assert report.summarize_test_status({"results": [{"status": "passed"}]}) == "passed"
    assert (
        report.summarize_test_status({"results": [{"status": "skipped"}]}) == "skipped"
    )
    assert (
        report.summarize_test_status(
            {"results": [{"status": "passed"}, {"status": "failed"}]}
        )
        == "failed"
    )
    assert (
        report.summarize_test_status({"results": [{"status": "timedOut"}]})
        == "timedOut"
    )
    assert (
        report.summarize_test_status({"results": [{"status": "interrupted"}]})
        == "interrupted"
    )


def test_collect_playwright_statuses_with_errors(tmp_path: Path) -> None:
    bad_json = tmp_path / "bad.json"
    _write(bad_json, "{invalid json")

    good_json = tmp_path / "good.json"
    _write(good_json, _playwright_json(suites=_suite_with_tests()))

    statuses, errors = report.collect_playwright_statuses(
        [tmp_path / "missing.json", bad_json, good_json]
    )
    assert "E2E-NAV-001" in statuses
    assert "passed" in statuses["E2E-NAV-001"]
    assert any("result file not found" in e for e in errors)
    assert any("invalid json result file" in e for e in errors)


def test_metric_for_tier_counts_and_mapping_errors(tmp_path: Path) -> None:
    matrix = tmp_path / "e2e/scenarios/scenario-matrix.yaml"
    _write(matrix, _matrix_yaml())
    scenarios = report.load_matrix(matrix)
    _write_specs(tmp_path)

    source_ids = report.extract_ids_from_test_files(tmp_path)
    status_map = {
        "E2E-NAV-001": ["passed"],
        "E2E-ROUTE-001": ["failed"],
        "E2E-PLAYERS-001": ["passed"],
        "E2E-MOBILE-001": ["skipped"],
    }

    metrics, errors = report.metric_for_tier(
        scenarios, "required", source_ids, status_map
    )
    assert metrics.registered == 2
    assert metrics.automated == 2
    assert metrics.executed == 2
    assert metrics.passed == 1
    assert metrics.coverage_pct == 50.0
    assert not any("spec not found" in e for e in errors)


def test_build_markdown_includes_threshold_and_errors() -> None:
    md = report.build_markdown(
        [
            ("required", report.ScenarioMetrics(10, 10, 10, 9)),
            ("all", report.ScenarioMetrics(10, 10, 10, 9)),
        ],
        ["E2E-FOO-001: missing testRefs"],
        90.0,
        True,
    )
    assert "| required | 10 | 10 | 10 | 9 | 90.0% |" in md
    assert "Threshold Result: PASS" in md
    assert "Mapping Errors" in md


def test_main_end_to_end_and_failure_modes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    _write(tmp_path / "e2e/scenarios/scenario-matrix.yaml", _matrix_yaml())
    _write_specs(tmp_path)

    # successful required run with threshold
    _write(
        tmp_path / "reports/playwright-required.json",
        _playwright_json(
            suites=[
                {
                    "title": "req",
                    "specs": [
                        {
                            "title": "[E2E-NAV-001] pass",
                            "tests": [{"results": [{"status": "passed"}]}],
                        },
                        {
                            "title": "[E2E-ROUTE-001] pass",
                            "tests": [{"results": [{"status": "passed"}]}],
                        },
                    ],
                }
            ]
        ),
    )
    monkeypatch.setattr(
        "sys.argv",
        [
            "prog",
            "--tier",
            "required",
            "--results",
            "reports/playwright-required.json",
            "--json-out",
            "reports/out-required.json",
            "--md-out",
            "reports/out-required.md",
            "--min-coverage",
            "90",
            "--strict-mapping",
        ],
    )
    assert report.main() == 0
    payload = json.loads(
        (tmp_path / "reports/out-required.json").read_text(encoding="utf-8")
    )
    assert payload["threshold_passed"] is True
    assert payload["tiers"]["required"]["coverage_pct"] == 100.0

    # strict mapping failure due to unknown id in results
    _write(
        tmp_path / "reports/playwright-bad.json",
        _playwright_json(
            suites=[
                {
                    "title": "bad",
                    "specs": [
                        {
                            "title": "[E2E-UNKNOWN-999] pass",
                            "tests": [{"results": [{"status": "passed"}]}],
                        }
                    ],
                }
            ]
        ),
    )
    monkeypatch.setattr(
        "sys.argv",
        [
            "prog",
            "--tier",
            "required",
            "--results",
            "reports/playwright-bad.json",
            "--json-out",
            "reports/out-bad.json",
            "--md-out",
            "reports/out-bad.md",
            "--strict-mapping",
        ],
    )
    assert report.main() == 1

    # all-tier report path executes and writes aggregate section
    _write(
        tmp_path / "reports/playwright-recommended.json", _playwright_json(suites=[])
    )
    _write(tmp_path / "reports/playwright-optional.json", _playwright_json(suites=[]))
    monkeypatch.setattr(
        "sys.argv",
        [
            "prog",
            "--tier",
            "all",
            "--results",
            "reports/playwright-required.json",
            "reports/playwright-recommended.json",
            "reports/playwright-optional.json",
            "--json-out",
            "reports/out-all.json",
            "--md-out",
            "reports/out-all.md",
        ],
    )
    assert report.main() == 0
    all_payload = json.loads(
        (tmp_path / "reports/out-all.json").read_text(encoding="utf-8")
    )
    assert "all" in all_payload["tiers"]
