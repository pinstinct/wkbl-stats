"""Shared stat calculation utilities for API/database layers."""

from __future__ import annotations

from typing import Any, Dict


def _r(value: float, digits: int) -> float:
    return round(value, digits)


def compute_advanced_stats(row: Dict[str, Any]) -> Dict[str, Any]:
    """Compute percentage and advanced stats for an aggregated player row.

    Required keys:
    gp, min, pts, reb, ast, stl, blk, tov,
    total_fgm, total_fga, total_tpm, total_tpa, total_ftm, total_fta
    """
    d = dict(row)

    gp = d.get("gp") or 0
    min_avg = d.get("min") or 0
    pts_avg = d.get("pts") or 0
    reb_avg = d.get("reb") or 0
    ast_avg = d.get("ast") or 0
    stl_avg = d.get("stl") or 0
    blk_avg = d.get("blk") or 0
    tov_avg = d.get("tov") or 0

    total_fgm = d.get("total_fgm") or 0
    total_fga = d.get("total_fga") or 0
    total_tpm = d.get("total_tpm") or 0
    total_tpa = d.get("total_tpa") or 0
    total_ftm = d.get("total_ftm") or 0
    total_fta = d.get("total_fta") or 0

    d["fgp"] = _r(total_fgm / total_fga, 3) if total_fga > 0 else 0.0
    d["tpp"] = _r(total_tpm / total_tpa, 3) if total_tpa > 0 else 0.0
    d["ftp"] = _r(total_ftm / total_fta, 3) if total_fta > 0 else 0.0

    total_pts = pts_avg * gp
    total_reb = reb_avg * gp
    total_ast = ast_avg * gp
    total_stl = stl_avg * gp
    total_blk = blk_avg * gp
    total_tov = tov_avg * gp

    tsa = 2 * (total_fga + 0.44 * total_fta)
    d["ts_pct"] = _r(total_pts / tsa, 3) if tsa > 0 else 0.0
    d["efg_pct"] = (
        _r((total_fgm + 0.5 * total_tpm) / total_fga, 3) if total_fga > 0 else 0.0
    )

    pir_total = (
        total_pts
        + total_reb
        + total_ast
        + total_stl
        + total_blk
        - total_tov
        - (total_fga - total_fgm)
        - (total_fta - total_ftm)
    )
    d["pir"] = _r(pir_total / gp, 1) if gp > 0 else 0.0
    d["ast_to"] = _r(ast_avg / tov_avg, 2) if tov_avg > 0 else 0.0

    safe_min = min_avg if min_avg > 0 else 1
    d["pts36"] = _r(pts_avg * 36 / safe_min, 1)
    d["reb36"] = _r(reb_avg * 36 / safe_min, 1)
    d["ast36"] = _r(ast_avg * 36 / safe_min, 1)

    return d
