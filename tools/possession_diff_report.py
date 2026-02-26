#!/usr/bin/env python3
"""Compare simple vs bbr_standard possession strategies and WS constants.

Measures impact on advanced stats (Pace, ORtg, DRtg, USG%, PER, OWS, DWS, WS)
across all players in a season.  Also compares WS under current vs BBR constants.

Usage:
    python3 tools/possession_diff_report.py --season 046
    python3 tools/possession_diff_report.py --season 046 --db-path data/wkbl.db
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure tools/ is importable
sys.path.insert(0, str(Path(__file__).parent))

import database  # noqa: E402
from stats import (  # noqa: E402
    _r,
    _safe_div,
    compute_advanced_stats,
    estimate_possessions,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _build_team_stats(
    team_id: str,
    team_totals: Dict[str, Dict],
    opp_totals: Dict[str, Dict],
    standings: Optional[Dict[str, Dict[str, int]]] = None,
    *,
    poss_strategy: str = "simple",
) -> Optional[Dict]:
    """Build team_stats dict with selectable poss_strategy."""
    tt = team_totals.get(team_id)
    ot = opp_totals.get(team_id)
    if not tt or not ot:
        return None
    result: Dict[str, Any] = {
        "team_fga": tt["fga"],
        "team_fta": tt["fta"],
        "team_tov": tt["tov"],
        "team_oreb": tt["oreb"],
        "team_dreb": tt["dreb"],
        "team_fgm": tt["fgm"],
        "team_ast": tt["ast"],
        "team_pts": tt["pts"],
        "team_min": tt["min"],
        "team_gp": tt["gp"],
        "team_stl": tt["stl"],
        "team_blk": tt["blk"],
        "team_pf": tt["pf"],
        "team_ftm": tt["ftm"],
        "team_tpm": tt["tpm"],
        "team_tpa": tt["tpa"],
        "team_reb": tt["reb"],
        "opp_fga": ot["fga"],
        "opp_fta": ot["fta"],
        "opp_ftm": ot["ftm"],
        "opp_tov": ot["tov"],
        "opp_oreb": ot["oreb"],
        "opp_dreb": ot["dreb"],
        "opp_pts": ot["pts"],
        "opp_tpa": ot["tpa"],
        "opp_tpm": ot["tpm"],
        "opp_fgm": ot["fgm"],
        "opp_ast": ot["ast"],
        "opp_stl": ot["stl"],
        "opp_blk": ot["blk"],
        "opp_pf": ot["pf"],
        "opp_reb": ot["reb"],
        "poss_strategy": poss_strategy,
    }
    team_record = (standings or {}).get(team_id)
    if team_record is not None:
        result["team_wins"] = team_record.get("wins", 0)
        result["team_losses"] = team_record.get("losses", 0)
    return result


def _build_league_stats(
    season_id: str,
    team_totals: Dict[str, Dict],
    opp_totals: Dict[str, Dict],
    *,
    poss_strategy: str = "simple",
) -> Optional[Dict]:
    """Build league_stats dict with selectable poss_strategy."""
    lg = database.get_league_season_totals(season_id)
    if not lg or not lg.get("pts"):
        return None

    total_poss = 0.0
    total_team_min_5 = 0.0
    for tid, tt in team_totals.items():
        ot = opp_totals.get(tid, {})
        poss = estimate_possessions(
            tt["fga"],
            tt["fta"],
            tt["tov"],
            tt["oreb"],
            strategy=poss_strategy,
            fgm=tt.get("fgm"),
            opp_fga=ot.get("fga"),
            opp_fta=ot.get("fta"),
            opp_tov=ot.get("tov"),
            opp_oreb=ot.get("oreb"),
            opp_fgm=ot.get("fgm"),
            opp_dreb=ot.get("dreb"),
            team_dreb=tt.get("dreb"),
        )
        total_poss += poss
        total_team_min_5 += tt["min"] / 5

    lg_pace = 40 * total_poss / total_team_min_5 if total_team_min_5 > 0 else 0

    return {
        "lg_pts": lg["pts"],
        "lg_fga": lg["fga"],
        "lg_fta": lg["fta"],
        "lg_ftm": lg["ftm"],
        "lg_oreb": lg["oreb"],
        "lg_reb": lg["reb"],
        "lg_ast": lg["ast"],
        "lg_fgm": lg["fgm"],
        "lg_tov": lg["tov"],
        "lg_pf": lg["pf"],
        "lg_min": lg["min"],
        "lg_pace": lg_pace,
        "lg_poss": total_poss,
    }


# ── Data loading ─────────────────────────────────────────────────────────────


def _load_players(season_id: str) -> List[Dict[str, Any]]:
    """Load all players with season stats from database."""
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT
                p.id, p.name, p.position as pos, t.name as team, t.id as team_id,
                COUNT(*) as gp,
                AVG(pg.minutes) as min,
                AVG(pg.pts) as pts, AVG(pg.reb) as reb,
                AVG(pg.ast) as ast, AVG(pg.stl) as stl,
                AVG(pg.blk) as blk, AVG(pg.tov) as tov,
                SUM(pg.fgm) as total_fgm, SUM(pg.fga) as total_fga,
                SUM(pg.tpm) as total_tpm, SUM(pg.tpa) as total_tpa,
                SUM(pg.ftm) as total_ftm, SUM(pg.fta) as total_fta,
                SUM(pg.ast) as total_ast, SUM(pg.stl) as total_stl,
                SUM(pg.blk) as total_blk, SUM(pg.tov) as total_tov,
                SUM(pg.off_reb) as total_off_reb, SUM(pg.def_reb) as total_def_reb,
                SUM(pg.pf) as total_pf,
                AVG(pg.off_reb) as off_reb, AVG(pg.def_reb) as def_reb,
                AVG(pg.pf) as pf
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            JOIN players p ON pg.player_id = p.id
            JOIN teams t ON pg.team_id = t.id
            WHERE g.season_id = ?
            GROUP BY pg.player_id, pg.team_id
            HAVING COUNT(*) >= 5
            ORDER BY AVG(pg.pts) DESC""",
            (season_id,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Comparison engine ────────────────────────────────────────────────────────

COMPARE_KEYS = [
    "pace",
    "off_rtg",
    "def_rtg",
    "usg_pct",
    "stl_pct",
    "per",
    "ows",
    "dws",
    "ws",
]


@dataclass
class PlayerDiff:
    name: str
    team: str
    gp: int
    diffs: Dict[str, float] = field(default_factory=dict)


def _compute_for_strategy(
    players: List[Dict],
    season_id: str,
    team_totals: Dict[str, Dict],
    opp_totals: Dict[str, Dict],
    standings: Dict[str, Dict[str, int]],
    strategy: str,
) -> Dict[str, Dict[str, Any]]:
    """Compute advanced stats for all players using a specific strategy."""
    results: Dict[str, Dict[str, Any]] = {}
    for p in players:
        row = dict(p)
        ts = _build_team_stats(
            row["team_id"], team_totals, opp_totals, standings, poss_strategy=strategy
        )
        ls = _build_league_stats(
            season_id, team_totals, opp_totals, poss_strategy=strategy
        )
        if not ts or not ls:
            continue
        computed = compute_advanced_stats(row, team_stats=ts, league_stats=ls)
        results[row["id"]] = computed
    return results


def _compute_ws_variants(
    players: List[Dict],
    season_id: str,
    team_totals: Dict[str, Dict],
    opp_totals: Dict[str, Dict],
    standings: Dict[str, Dict[str, int]],
) -> List[Dict[str, Any]]:
    """Compare WS under current constants vs BBR constants.

    BBR differences:
    - marginal_ppw: no pace adjustment (2 * lg_ppg, without team_pace/lg_pace)
    - replacement_def: 0.14 * lg_ppg (vs current 0.08 * lg_ppg)
    """
    results = []
    for p in players:
        row = dict(p)
        ts = _build_team_stats(row["team_id"], team_totals, opp_totals, standings)
        ls = _build_league_stats(season_id, team_totals, opp_totals)
        if not ts or not ls:
            continue

        computed = compute_advanced_stats(row, team_stats=ts, league_stats=ls)
        if computed.get("ws") is None:
            continue

        # Now compute BBR-style WS manually
        gp = row["gp"]
        min_avg = row["min"]
        total_min = min_avg * gp
        if total_min <= 0:
            continue

        team_min_5 = _safe_div(ts["team_min"], 5)
        team_poss = estimate_possessions(
            ts["team_fga"], ts["team_fta"], ts["team_tov"], ts["team_oreb"]
        )
        opp_poss = estimate_possessions(
            ts["opp_fga"], ts["opp_fta"], ts["opp_tov"], ts["opp_oreb"]
        )

        # Reuse individual ORtg/DRtg from computed
        ortg = computed.get("off_rtg")
        drtg = computed.get("def_rtg")
        if ortg is None or drtg is None:
            continue

        pprod = ortg / 100 * (total_min / (team_min_5 or 1)) * team_poss
        tot_poss = (total_min / (team_min_5 or 1)) * team_poss

        lg_pts = ls["lg_pts"] or 1
        lg_poss = ls["lg_poss"] or 1
        lg_pace = ls["lg_pace"] or 1
        lg_min = ls["lg_min"] or 1

        lg_gp = _safe_div(lg_min, 400)
        lg_ppg = _safe_div(lg_pts, lg_gp)
        if lg_ppg <= 0:
            continue

        team_pace = _safe_div(40 * team_poss, team_min_5)
        lg_pts_per_poss = _safe_div(lg_pts, lg_poss)

        # Current formula
        marginal_ppw_current = 2 * lg_ppg * _safe_div(team_pace, lg_pace)
        replacement_def_current = 0.08 * lg_ppg * _safe_div(total_min, team_min_5)

        # BBR formula
        marginal_ppw_bbr = 2 * lg_ppg  # no pace adjustment
        replacement_def_bbr = 0.14 * lg_ppg * _safe_div(total_min, team_min_5)

        # Compute OWS with each
        marginal_offense = pprod - 0.92 * lg_pts_per_poss * tot_poss

        ows_current = (
            max(0.0, marginal_offense / marginal_ppw_current)
            if marginal_ppw_current > 0
            else 0
        )
        ows_bbr = (
            max(0.0, marginal_offense / marginal_ppw_bbr) if marginal_ppw_bbr > 0 else 0
        )

        # DWS
        lg_drtg = 100 * lg_pts_per_poss
        player_def_poss = opp_poss * _safe_div(total_min, team_min_5)
        player_def_pts_saved = _safe_div(lg_drtg - drtg, 100) * player_def_poss

        dws_current = (
            (player_def_pts_saved + replacement_def_current) / marginal_ppw_current
            if marginal_ppw_current > 0
            else 0
        )
        dws_bbr = (
            (player_def_pts_saved + replacement_def_bbr) / marginal_ppw_bbr
            if marginal_ppw_bbr > 0
            else 0
        )

        results.append(
            {
                "name": row["name"],
                "team": row["team"],
                "gp": gp,
                "current_ows": _r(ows_current, 2),
                "bbr_ows": _r(ows_bbr, 2),
                "current_dws": _r(dws_current, 2),
                "bbr_dws": _r(dws_bbr, 2),
                "current_ws": _r(ows_current + dws_current, 2),
                "bbr_ws": _r(ows_bbr + dws_bbr, 2),
                "ws_diff": _r(
                    abs((ows_bbr + dws_bbr) - (ows_current + dws_current)), 2
                ),
            }
        )

    results.sort(key=lambda x: x["ws_diff"], reverse=True)
    return results


# ── Ranking ──────────────────────────────────────────────────────────────────


def _rank_by_key(results: Dict[str, Dict], key: str) -> Dict[str, int]:
    """Return {player_id: rank} sorted by key descending."""
    items = [(pid, d.get(key, 0) or 0) for pid, d in results.items()]
    items.sort(key=lambda x: x[1], reverse=True)
    return {pid: rank + 1 for rank, (pid, _) in enumerate(items)}


# ── Report ───────────────────────────────────────────────────────────────────


def generate_report(season_id: str) -> str:
    """Generate possession strategy diff report."""
    lines: List[str] = []
    lines.append(f"=== Possession Strategy Diff Report (Season {season_id}) ===\n")

    # Load data
    team_totals = database.get_team_season_totals(season_id)
    opp_totals = database.get_opponent_season_totals(season_id)
    standings = database.get_team_wins_by_season(season_id)
    players = _load_players(season_id)

    if not players:
        lines.append("No players found for this season.")
        return "\n".join(lines)

    lines.append(f"Players analyzed: {len(players)} (>= 5 GP)\n")

    # ── Section 1: Strategy comparison ────────────────────────────────────
    lines.append("─" * 70)
    lines.append("SECTION 1: simple vs bbr_standard Possessions Impact")
    lines.append("─" * 70)

    simple_results = _compute_for_strategy(
        players, season_id, team_totals, opp_totals, standings, "simple"
    )
    bbr_results = _compute_for_strategy(
        players, season_id, team_totals, opp_totals, standings, "bbr_standard"
    )

    common_ids = set(simple_results.keys()) & set(bbr_results.keys())
    if not common_ids:
        lines.append("No comparable players found.")
        return "\n".join(lines)

    # Compute diffs
    diffs_by_key: Dict[str, List[float]] = {k: [] for k in COMPARE_KEYS}
    rank_changes: Dict[str, List[int]] = {k: [] for k in COMPARE_KEYS}

    for key in COMPARE_KEYS:
        simple_ranks = _rank_by_key(simple_results, key)
        bbr_ranks = _rank_by_key(bbr_results, key)
        for pid in common_ids:
            sv = simple_results[pid].get(key)
            bv = bbr_results[pid].get(key)
            if sv is not None and bv is not None:
                diffs_by_key[key].append(abs(bv - sv))
            sr = simple_ranks.get(pid, 0)
            br = bbr_ranks.get(pid, 0)
            if sr > 0 and br > 0:
                rank_changes[key].append(abs(br - sr))

    lines.append(
        f"\n{'Metric':<12} {'Mean Δ':>8} {'Median Δ':>10} {'Max Δ':>8} {'Mean Rank Δ':>12} {'Max Rank Δ':>12}"
    )
    lines.append("-" * 66)

    for key in COMPARE_KEYS:
        vals = diffs_by_key[key]
        rvals = rank_changes[key]
        if not vals:
            continue
        vals_sorted = sorted(vals)
        mean_d = sum(vals) / len(vals)
        median_d = vals_sorted[len(vals_sorted) // 2]
        max_d = max(vals)
        mean_r = sum(rvals) / len(rvals) if rvals else 0
        max_r = max(rvals) if rvals else 0
        lines.append(
            f"{key:<12} {mean_d:>8.2f} {median_d:>10.2f} {max_d:>8.2f} {mean_r:>12.1f} {max_r:>12}"
        )

    # ── Section 2: WS constants comparison ────────────────────────────────
    lines.append("")
    lines.append("─" * 70)
    lines.append("SECTION 2: Win Shares Constants — Current vs BBR")
    lines.append(
        "  Current: marginal_ppw = 2*lg_ppg*(team_pace/lg_pace), repl_def = 0.08*lg_ppg"
    )
    lines.append(
        "  BBR:     marginal_ppw = 2*lg_ppg (no pace adj), repl_def = 0.14*lg_ppg"
    )
    lines.append("─" * 70)

    ws_variants = _compute_ws_variants(
        players, season_id, team_totals, opp_totals, standings
    )

    if ws_variants:
        ws_diffs = [r["ws_diff"] for r in ws_variants]
        mean_ws_diff = sum(ws_diffs) / len(ws_diffs)
        max_ws_diff = max(ws_diffs)
        lines.append(f"\nPlayers compared: {len(ws_variants)}")
        lines.append(f"Mean |WS diff|: {mean_ws_diff:.3f}")
        lines.append(f"Max  |WS diff|: {max_ws_diff:.3f}")

        lines.append(
            f"\n{'Name':<14} {'Team':<8} {'GP':>3} {'Cur OWS':>8} {'BBR OWS':>8} {'Cur DWS':>8} {'BBR DWS':>8} {'Cur WS':>7} {'BBR WS':>7} {'|Δ|':>5}"
        )
        lines.append("-" * 92)
        for r in ws_variants[:20]:
            lines.append(
                f"{r['name']:<14} {r['team']:<8} {r['gp']:>3} "
                f"{r['current_ows']:>8.2f} {r['bbr_ows']:>8.2f} "
                f"{r['current_dws']:>8.2f} {r['bbr_dws']:>8.2f} "
                f"{r['current_ws']:>7.2f} {r['bbr_ws']:>7.2f} "
                f"{r['ws_diff']:>5.2f}"
            )

        # Rank comparison for WS
        current_ws_rank = {
            r["name"]: i + 1
            for i, r in enumerate(
                sorted(ws_variants, key=lambda x: x["current_ws"], reverse=True)
            )
        }
        bbr_ws_rank = {
            r["name"]: i + 1
            for i, r in enumerate(
                sorted(ws_variants, key=lambda x: x["bbr_ws"], reverse=True)
            )
        }
        ws_rank_changes = [
            abs(bbr_ws_rank[n] - current_ws_rank[n]) for n in current_ws_rank
        ]
        lines.append(
            f"\nWS rank changes: mean={sum(ws_rank_changes) / len(ws_rank_changes):.1f}, max={max(ws_rank_changes)}"
        )
    else:
        lines.append("No WS data available (standings may be missing).")

    # ── Section 3: Summary ────────────────────────────────────────────────
    lines.append("")
    lines.append("─" * 70)
    lines.append("SECTION 3: Summary & Recommendation")
    lines.append("─" * 70)
    lines.append("")

    # Auto-detect significance
    per_rank_max = max(rank_changes.get("per", [0]))
    ws_rank_max = max(rank_changes.get("ws", [0]))

    if per_rank_max <= 2 and ws_rank_max <= 2:
        lines.append(
            "VERDICT: Strategy differences do NOT significantly affect rankings."
        )
        lines.append("→ Recommend keeping 'simple' strategy as default.")
        lines.append(f"  (PER max rank Δ={per_rank_max}, WS max rank Δ={ws_rank_max})")
    else:
        lines.append("VERDICT: Strategy differences MAY affect rankings.")
        lines.append("→ Consider switching to 'bbr_standard' or investigating further.")
        lines.append(f"  (PER max rank Δ={per_rank_max}, WS max rank Δ={ws_rank_max})")

    if ws_variants:
        ws_const_diffs = [r["ws_diff"] for r in ws_variants]
        ws_const_max = max(ws_const_diffs)
        ws_const_rank_max = max(ws_rank_changes) if ws_rank_changes else 0
        lines.append("")
        if ws_const_rank_max <= 2:
            lines.append(
                "WS CONSTANTS: Differences are minor; current constants are acceptable."
            )
            lines.append(
                f"  (Max |WS Δ|={ws_const_max:.2f}, max rank Δ={ws_const_rank_max})"
            )
        else:
            lines.append(
                "WS CONSTANTS: Differences are significant; consider adopting BBR values."
            )
            lines.append(
                f"  (Max |WS Δ|={ws_const_max:.2f}, max rank Δ={ws_const_rank_max})"
            )

    return "\n".join(lines)


# ── CLI ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Possession strategy diff report")
    parser.add_argument("--season", default="046", help="Season code (default: 046)")
    parser.add_argument(
        "--db-path", default=None, help="Database path (default: data/wkbl.db)"
    )
    args = parser.parse_args()

    if args.db_path:
        database.DB_PATH = args.db_path
    else:
        # Default: data/wkbl.db relative to project root
        project_root = Path(__file__).parent.parent
        default_db = project_root / "data" / "wkbl.db"
        if default_db.exists():
            database.DB_PATH = str(default_db)

    report = generate_report(args.season)
    print(report)


if __name__ == "__main__":
    main()
