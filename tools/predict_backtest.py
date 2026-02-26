#!/usr/bin/env python3
"""Prediction backtest report for WKBL team win probabilities.

Evaluates pregame-only win-probability quality on completed games.
Outputs hit rate, Brier score, log loss, and ECE with bin summaries.
"""

from __future__ import annotations

import argparse
import math
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional


@dataclass
class PredRow:
    game_id: str
    game_date: str
    home_win_prob: float
    home_score: int
    away_score: int


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    for r in rows:
        name = r["name"] if isinstance(r, sqlite3.Row) else r[1]
        if name == column:
            return True
    return False


def _load_pregame_rows(
    conn: sqlite3.Connection, season_id: Optional[str]
) -> List[PredRow]:
    params: list = []

    if _table_exists(conn, "game_team_prediction_runs"):
        if season_id:
            sql = """
            WITH pregame AS (
              SELECT
                g.id AS game_id,
                g.game_date,
                g.home_score,
                g.away_score,
                (
                  SELECT r.home_win_prob
                  FROM game_team_prediction_runs r
                  WHERE r.game_id = g.id
                    AND r.prediction_kind = 'pregame'
                    AND date(r.generated_at) <= date(g.game_date)
                  ORDER BY r.generated_at DESC
                  LIMIT 1
                ) AS home_win_prob
              FROM games g
              WHERE g.home_score IS NOT NULL
                AND g.away_score IS NOT NULL
                AND g.season_id = ?
            )
            SELECT game_id, game_date, home_win_prob, home_score, away_score
            FROM pregame
            WHERE home_win_prob IS NOT NULL
            ORDER BY game_date, game_id
            """
            params.append(season_id)
        else:
            sql = """
            WITH pregame AS (
              SELECT
                g.id AS game_id,
                g.game_date,
                g.home_score,
                g.away_score,
                (
                  SELECT r.home_win_prob
                  FROM game_team_prediction_runs r
                  WHERE r.game_id = g.id
                    AND r.prediction_kind = 'pregame'
                    AND date(r.generated_at) <= date(g.game_date)
                  ORDER BY r.generated_at DESC
                  LIMIT 1
                ) AS home_win_prob
              FROM games g
              WHERE g.home_score IS NOT NULL
                AND g.away_score IS NOT NULL
            )
            SELECT game_id, game_date, home_win_prob, home_score, away_score
            FROM pregame
            WHERE home_win_prob IS NOT NULL
            ORDER BY game_date, game_id
            """
        rows = conn.execute(sql, params).fetchall()
    else:
        if not _table_exists(conn, "game_team_predictions"):
            return []

        pregame_col = _column_exists(
            conn, "game_team_predictions", "pregame_generated_at"
        )
        created_col = _column_exists(conn, "game_team_predictions", "created_at")

        if pregame_col and season_id:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
              AND tp.pregame_generated_at IS NOT NULL
              AND date(tp.pregame_generated_at) <= date(g.game_date)
              AND g.season_id = ?
            ORDER BY g.game_date, g.id
            """
            params.append(season_id)
        elif pregame_col:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
              AND tp.pregame_generated_at IS NOT NULL
              AND date(tp.pregame_generated_at) <= date(g.game_date)
            ORDER BY g.game_date, g.id
            """
        elif created_col and season_id:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
              AND date(tp.created_at) <= date(g.game_date)
              AND g.season_id = ?
            ORDER BY g.game_date, g.id
            """
            params.append(season_id)
        elif created_col:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
              AND date(tp.created_at) <= date(g.game_date)
            ORDER BY g.game_date, g.id
            """
        elif season_id:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
              AND g.season_id = ?
            ORDER BY g.game_date, g.id
            """
            params.append(season_id)
        else:
            sql = """
            SELECT
              g.id AS game_id,
              g.game_date,
              tp.home_win_prob,
              g.home_score,
              g.away_score
            FROM games g
            JOIN game_team_predictions tp ON tp.game_id = g.id
            WHERE g.home_score IS NOT NULL
              AND g.away_score IS NOT NULL
            ORDER BY g.game_date, g.id
            """
        rows = conn.execute(sql, params).fetchall()

    result = []
    for row in rows:
        result.append(
            PredRow(
                game_id=row["game_id"],
                game_date=row["game_date"],
                home_win_prob=float(row["home_win_prob"]),
                home_score=int(row["home_score"]),
                away_score=int(row["away_score"]),
            )
        )
    return result


def _compute_metrics(rows: List[PredRow]):
    if not rows:
        return None

    y_true = [1.0 if r.home_score > r.away_score else 0.0 for r in rows]
    p = [max(1e-6, min(1 - 1e-6, r.home_win_prob / 100.0)) for r in rows]

    hit = sum(1 for yy, pp in zip(y_true, p) if (pp > 0.5) == (yy == 1.0)) / len(rows)
    brier = sum((yy - pp) ** 2 for yy, pp in zip(y_true, p)) / len(rows)
    log_loss = -sum(
        yy * math.log(pp) + (1 - yy) * math.log(1 - pp) for yy, pp in zip(y_true, p)
    ) / len(rows)

    bins = []
    ece = 0.0
    for i in range(10):
        lo = i / 10
        hi = (i + 1) / 10
        idxs = [j for j, pp in enumerate(p) if lo <= pp < hi or (i == 9 and pp == 1.0)]
        if not idxs:
            continue
        avg_pred = sum(p[j] for j in idxs) / len(idxs)
        avg_actual = sum(y_true[j] for j in idxs) / len(idxs)
        weight = len(idxs) / len(rows)
        ece += weight * abs(avg_pred - avg_actual)
        bins.append(
            {
                "range": f"{int(lo * 100)}-{int(hi * 100)}%",
                "n": len(idxs),
                "avg_pred": avg_pred * 100,
                "avg_actual": avg_actual * 100,
            }
        )

    return {
        "n": len(rows),
        "hit_rate": hit,
        "brier": brier,
        "log_loss": log_loss,
        "ece": ece,
        "bins": bins,
    }


def _render_markdown(metrics, season_id: Optional[str]) -> str:
    title_season = season_id or "all"
    lines = [
        f"# Prediction Backtest ({title_season})",
        "",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## Summary",
        "",
        f"- Samples: {metrics['n']}",
        f"- Hit rate: {metrics['hit_rate'] * 100:.1f}%",
        f"- Brier score: {metrics['brier']:.4f}",
        f"- Log loss: {metrics['log_loss']:.4f}",
        f"- ECE: {metrics['ece']:.4f}",
        "",
        "## Calibration Bins",
        "",
        "| Bin | N | Avg Pred (Home%) | Actual Home Win% |",
        "| --- | ---: | ---: | ---: |",
    ]
    for b in metrics["bins"]:
        lines.append(
            f"| {b['range']} | {b['n']} | {b['avg_pred']:.1f} | {b['avg_actual']:.1f} |"
        )
    lines.append("")
    return "\n".join(lines)


def run_backtest(db_path: str, season_id: Optional[str], out_dir: str) -> Path:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = _load_pregame_rows(conn, season_id)
    finally:
        conn.close()

    if not rows:
        raise RuntimeError("No pregame prediction rows found for backtest.")

    metrics = _compute_metrics(rows)
    if metrics is None:
        raise RuntimeError("Failed to compute metrics.")

    report_md = _render_markdown(metrics, season_id)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d")
    report_path = out / f"backtest-{stamp}.md"
    report_path.write_text(report_md, encoding="utf-8")
    return report_path


def main():
    parser = argparse.ArgumentParser(description="WKBL prediction backtest")
    parser.add_argument("--db-path", default="data/wkbl.db")
    parser.add_argument("--season", default=None)
    parser.add_argument("--out-dir", default="reports/prediction")
    args = parser.parse_args()

    report = run_backtest(args.db_path, args.season, args.out_dir)
    print(f"Backtest report written: {report}")


if __name__ == "__main__":
    main()
