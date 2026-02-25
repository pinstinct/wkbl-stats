#!/usr/bin/env python3
"""Generate tiered E2E scenario coverage reports from Playwright JSON output."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

SCENARIO_ID_RE = re.compile(r"\[(E2E-[A-Z0-9]+-\d{3})\]")
VALID_TIERS = ("required", "recommended", "optional")
REQUIRED_SCENARIO_FIELDS = {
    "id",
    "title",
    "tier",
    "area",
    "owner",
    "risk",
    "preconditions",
    "expected",
    "testRefs",
    "enabled",
    "since",
    "notes",
}


@dataclass
class ScenarioMetrics:
    registered: int = 0
    automated: int = 0
    executed: int = 0
    passed: int = 0

    @property
    def coverage_pct(self) -> float:
        if self.registered == 0:
            return 0.0
        return (self.passed / self.registered) * 100.0

    @property
    def automated_pct(self) -> float:
        if self.registered == 0:
            return 0.0
        return (self.automated / self.registered) * 100.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--matrix",
        default="e2e/scenarios/scenario-matrix.yaml",
        help="Path to scenario matrix yaml",
    )
    parser.add_argument(
        "--results",
        nargs="+",
        required=True,
        help="Playwright JSON result file path(s)",
    )
    parser.add_argument(
        "--tier",
        default="all",
        choices=(*VALID_TIERS, "all"),
        help="Target tier to report",
    )
    parser.add_argument(
        "--json-out",
        default="reports/e2e-coverage.json",
        help="Output JSON report path",
    )
    parser.add_argument(
        "--md-out",
        default="reports/e2e-coverage.md",
        help="Output Markdown report path",
    )
    parser.add_argument(
        "--min-coverage",
        type=float,
        default=None,
        help="Coverage threshold percent for target tier",
    )
    parser.add_argument(
        "--strict-mapping",
        action="store_true",
        help="Fail when mapping errors are found",
    )
    return parser.parse_args()


def load_matrix(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"matrix not found: {path}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    scenarios = raw.get("scenarios")
    if not isinstance(scenarios, list):
        raise ValueError("matrix must contain 'scenarios' list")
    for row in scenarios:
        missing = REQUIRED_SCENARIO_FIELDS - set(row.keys())
        if missing:
            raise ValueError(
                f"scenario {row.get('id')} missing fields: {sorted(missing)}"
            )
        if row["tier"] not in VALID_TIERS:
            raise ValueError(f"scenario {row['id']} has invalid tier: {row['tier']}")
    return scenarios


def extract_ids_from_test_files(root: Path) -> set[str]:
    found: set[str] = set()
    for file_path in root.glob("e2e/**/*.spec.js"):
        text = file_path.read_text(encoding="utf-8")
        found.update(match.group(1) for match in SCENARIO_ID_RE.finditer(text))
    return found


def iter_suite_tests(
    suite: dict[str, Any], parent_titles: list[str]
) -> list[tuple[str, dict[str, Any]]]:
    tests: list[tuple[str, dict[str, Any]]] = []
    title = suite.get("title")
    next_titles = parent_titles + ([title] if title else [])

    for spec in suite.get("specs", []):
        spec_title = spec.get("title")
        base_titles = next_titles + ([spec_title] if spec_title else [])
        for test in spec.get("tests", []):
            test_title = test.get("title")
            full_title = " ".join(base_titles + ([test_title] if test_title else []))
            tests.append((full_title.strip(), test))

    for child in suite.get("suites", []):
        tests.extend(iter_suite_tests(child, next_titles))
    return tests


def summarize_test_status(test: dict[str, Any]) -> str:
    results = test.get("results", [])
    statuses = [
        str(r.get("status"))
        for r in results
        if isinstance(r, dict) and r.get("status") is not None
    ]
    if not statuses:
        return "unknown"
    for status in ("failed", "timedOut", "interrupted"):
        if status in statuses:
            return status
    if "passed" in statuses:
        return "passed"
    if "skipped" in statuses:
        return "skipped"
    return statuses[-1]


def collect_playwright_statuses(
    result_files: list[Path],
) -> tuple[dict[str, list[str]], list[str]]:
    scenario_statuses: dict[str, list[str]] = {}
    errors: list[str] = []

    for result_file in result_files:
        if not result_file.exists():
            errors.append(f"result file not found: {result_file}")
            continue
        try:
            data = json.loads(result_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"invalid json result file: {result_file} ({exc})")
            continue

        suites = data.get("suites", [])
        for suite in suites:
            for full_title, test in iter_suite_tests(suite, []):
                scenario_ids = SCENARIO_ID_RE.findall(full_title)
                if not scenario_ids:
                    continue
                status = summarize_test_status(test)
                for scenario_id in scenario_ids:
                    scenario_statuses.setdefault(scenario_id, []).append(status)
    return scenario_statuses, errors


def metric_for_tier(
    scenarios: list[dict[str, Any]],
    tier: str,
    source_ids: set[str],
    status_map: dict[str, list[str]],
) -> tuple[ScenarioMetrics, list[str]]:
    errors: list[str] = []
    metrics = ScenarioMetrics()

    enabled = [s for s in scenarios if s["enabled"] and s["tier"] == tier]
    metrics.registered = len(enabled)

    for row in enabled:
        sid = row["id"]
        refs = row.get("testRefs", [])
        if not isinstance(refs, list) or len(refs) == 0:
            errors.append(f"{sid}: missing testRefs")
            continue

        valid_ref = True
        for ref in refs:
            spec = (ref or {}).get("spec")
            title = (ref or {}).get("title")
            if not spec or not title:
                errors.append(f"{sid}: invalid testRefs entry")
                valid_ref = False
                continue
            if not Path(spec).exists():
                errors.append(f"{sid}: spec not found ({spec})")
                valid_ref = False
        if valid_ref:
            metrics.automated += 1

        if sid not in source_ids:
            errors.append(f"{sid}: scenario id not tagged in e2e specs")

        statuses = status_map.get(sid, [])
        if statuses:
            metrics.executed += 1
        if any(status == "passed" for status in statuses):
            metrics.passed += 1

    return metrics, errors


def build_markdown(
    tier_rows: list[tuple[str, ScenarioMetrics]],
    mapping_errors: list[str],
    threshold: float | None,
    threshold_passed: bool,
) -> str:
    lines = [
        "# E2E Scenario Coverage Report",
        "",
        "| Tier | Registered | Automated | Executed | Passed | Coverage |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for tier, metric in tier_rows:
        lines.append(
            f"| {tier} | {metric.registered} | {metric.automated} | {metric.executed} | "
            f"{metric.passed} | {metric.coverage_pct:.1f}% |"
        )

    if threshold is not None:
        status = "PASS" if threshold_passed else "FAIL"
        lines.extend(
            [
                "",
                f"- Threshold: {threshold:.1f}%",
                f"- Threshold Result: {status}",
            ]
        )

    if mapping_errors:
        lines.extend(["", "## Mapping Errors", ""])
        for err in mapping_errors:
            lines.append(f"- {err}")
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()

    scenarios = load_matrix(Path(args.matrix))
    source_ids = extract_ids_from_test_files(Path("."))
    status_map, parse_errors = collect_playwright_statuses(
        [Path(p) for p in args.results]
    )

    matrix_ids = {s["id"] for s in scenarios}
    unknown_ids = sorted(sid for sid in status_map.keys() if sid not in matrix_ids)
    mapping_errors = parse_errors + [
        f"{sid}: present in test results but missing from matrix" for sid in unknown_ids
    ]

    tier_targets = list(VALID_TIERS) if args.tier == "all" else [args.tier]
    tier_rows: list[tuple[str, ScenarioMetrics]] = []

    for tier in tier_targets:
        metrics, tier_errors = metric_for_tier(scenarios, tier, source_ids, status_map)
        tier_rows.append((tier, metrics))
        mapping_errors.extend(tier_errors)

    if len(tier_targets) > 1:
        total = ScenarioMetrics()
        for _, metric in tier_rows:
            total.registered += metric.registered
            total.automated += metric.automated
            total.executed += metric.executed
            total.passed += metric.passed
        tier_rows.append(("all", total))

    threshold_passed = True
    if args.min_coverage is not None:
        target_metric = tier_rows[-1][1] if args.tier == "all" else tier_rows[0][1]
        threshold_passed = target_metric.coverage_pct >= args.min_coverage

    report = {
        "tier": args.tier,
        "threshold": args.min_coverage,
        "threshold_passed": threshold_passed,
        "tiers": {
            tier: {
                "registered": metric.registered,
                "automated": metric.automated,
                "executed": metric.executed,
                "passed": metric.passed,
                "coverage_pct": round(metric.coverage_pct, 2),
                "automated_pct": round(metric.automated_pct, 2),
            }
            for tier, metric in tier_rows
        },
        "mapping_errors": mapping_errors,
    }

    json_path = Path(args.json_out)
    md_path = Path(args.md_out)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    md_path.write_text(
        build_markdown(tier_rows, mapping_errors, args.min_coverage, threshold_passed),
        encoding="utf-8",
    )

    print("Tier            Registered  Automated  Executed  Passed  Coverage")
    for tier, metric in tier_rows:
        print(
            f"{tier:<14}{metric.registered:>11}{metric.automated:>11}"
            f"{metric.executed:>10}{metric.passed:>8}{metric.coverage_pct:>9.1f}%"
        )

    if args.min_coverage is not None:
        print(
            f"Threshold {args.min_coverage:.1f}%: {'PASS' if threshold_passed else 'FAIL'}"
        )

    if mapping_errors:
        print(f"Mapping errors: {len(mapping_errors)}")
        for err in mapping_errors:
            print(f" - {err}")

    if args.strict_mapping and mapping_errors:
        return 1
    if args.min_coverage is not None and not threshold_passed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
