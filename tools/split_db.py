"""Split wkbl.db into core (fast-loading) and detail (lazy-loaded) databases.

Core DB contains tables needed for most pages (players, teams, games, standings, etc.).
Detail DB contains large per-event tables (play-by-play, shot charts, lineups) that
are only needed on game detail pages.
"""

import argparse
import os
import shutil
import sqlite3

# Tables that go into the detail database (large, per-event data)
DETAIL_TABLES = ["play_by_play", "shot_charts", "lineup_stints", "position_matchups"]


def split_database(src_path: str, core_path: str, detail_path: str) -> dict:
    """Split source database into core and detail databases.

    Args:
        src_path: Path to the source wkbl.db
        core_path: Output path for core database
        detail_path: Output path for detail database

    Returns:
        dict with keys 'core_tables', 'detail_tables', 'core_size', 'detail_size'
    """
    if not os.path.exists(src_path):
        raise FileNotFoundError(f"Source database not found: {src_path}")

    # Get all user table names from source
    src_conn = sqlite3.connect(src_path)
    cursor = src_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    all_tables = [row[0] for row in cursor.fetchall()]
    src_conn.close()

    core_tables = [t for t in all_tables if t not in DETAIL_TABLES]
    detail_tables = [t for t in all_tables if t in DETAIL_TABLES]

    # Build core database
    _copy_tables(src_path, core_path, core_tables)

    # Build detail database
    _copy_tables(src_path, detail_path, detail_tables)

    return {
        "core_tables": core_tables,
        "detail_tables": detail_tables,
        "core_size": os.path.getsize(core_path),
        "detail_size": os.path.getsize(detail_path),
    }


def _copy_tables(src_path: str, dst_path: str, tables: list[str]) -> None:
    """Copy selected tables from source to a new database, then VACUUM."""
    if os.path.exists(dst_path):
        os.remove(dst_path)

    shutil.copy2(src_path, dst_path)

    conn = sqlite3.connect(dst_path)
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    all_tables = [row[0] for row in cursor.fetchall()]

    tables_to_drop = [t for t in all_tables if t not in tables]
    for table in tables_to_drop:
        conn.execute(f"DROP TABLE IF EXISTS [{table}]")  # noqa: S608

    conn.execute("VACUUM")
    conn.commit()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description="Split wkbl.db into core and detail")
    parser.add_argument("--src", default="data/wkbl.db", help="Source database path")
    parser.add_argument(
        "--core", default="data/wkbl-core.db", help="Core database output path"
    )
    parser.add_argument(
        "--detail", default="data/wkbl-detail.db", help="Detail database output path"
    )
    args = parser.parse_args()

    result = split_database(args.src, args.core, args.detail)

    core_mb = result["core_size"] / (1024 * 1024)
    detail_mb = result["detail_size"] / (1024 * 1024)

    print(f"Core DB: {core_mb:.1f} MB ({len(result['core_tables'])} tables)")
    print(f"  Tables: {', '.join(result['core_tables'])}")
    print(f"Detail DB: {detail_mb:.1f} MB ({len(result['detail_tables'])} tables)")
    print(f"  Tables: {', '.join(result['detail_tables'])}")


if __name__ == "__main__":
    main()
