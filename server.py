#!/usr/bin/env python3
"""
WKBL Stats Server

Combined server providing:
- REST API endpoints (/api/*)
- Static file serving for the frontend
- Automatic daily data ingest
"""

import datetime
import json
import os
import subprocess  # nosec B404
import sys

# Add tools directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import CURRENT_SEASON, HOST, OUTPUT_PATH, PORT, STATUS_PATH, setup_logging
from api import app as api_app

logger = setup_logging("server")

INGEST_TIMEOUT = 300  # 5 minutes


def load_status():
    """Load ingest status from cache file."""
    if not os.path.exists(STATUS_PATH):
        return {}
    try:
        with open(STATUS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load status file: {e}")
        return {}


def save_status(status):
    """Save ingest status to cache file."""
    os.makedirs(os.path.dirname(STATUS_PATH), exist_ok=True)
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)


def run_ingest_if_needed():
    """Run ingest script if data is stale or missing."""
    today = datetime.date.today().strftime("%Y%m%d")
    status = load_status()

    if status.get("date") == today and os.path.exists(OUTPUT_PATH):
        logger.info("Data is up to date, skipping ingest")
        return False

    logger.info(f"Starting daily ingest for {today}")

    cmd = [
        sys.executable,
        "tools/ingest_wkbl.py",
        "--season-label",
        CURRENT_SEASON,
        "--auto",
        "--end-date",
        today,
        "--save-db",
        "--fetch-play-by-play",
        "--fetch-shot-charts",
        "--compute-lineups",
        "--load-all-players",
        "--active-only",
        "--no-cache",
        "--output",
        OUTPUT_PATH,
    ]

    try:
        result = subprocess.run(  # nosec B603
            cmd,
            timeout=INGEST_TIMEOUT,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            logger.error(f"Ingest failed with code {result.returncode}")
            if result.stderr:
                logger.error(f"stderr: {result.stderr}")
            return False

        save_status({"date": today})
        logger.info("Ingest completed successfully")

        # Split database into core/detail for faster frontend loading
        try:
            from tools.split_db import split_database

            split_result = split_database(
                "data/wkbl.db", "data/wkbl-core.db", "data/wkbl-detail.db"
            )
            core_mb = split_result["core_size"] / (1024 * 1024)
            detail_mb = split_result["detail_size"] / (1024 * 1024)
            logger.info(
                f"Database split: core={core_mb:.1f}MB, detail={detail_mb:.1f}MB"
            )
        except Exception as e:
            logger.warning(f"Database split failed (non-critical): {e}")

        return True

    except subprocess.TimeoutExpired:
        logger.error(f"Ingest timed out after {INGEST_TIMEOUT}s")
        return False
    except subprocess.SubprocessError as e:
        logger.error(f"Subprocess error during ingest: {e}")
        return False


# Create main app that includes API routes
app = FastAPI(
    title="WKBL Stats",
    description="Korean Women's Basketball League Statistics",
    version="1.0.0",
)

# Mount API routes
app.mount("/api", api_app)

# Get the base directory for static files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
async def serve_index():
    """Serve the main index.html file."""
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/favicon.ico")
async def serve_favicon():
    """Serve favicon if exists."""
    favicon_path = os.path.join(BASE_DIR, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    return FileResponse(os.path.join(BASE_DIR, "index.html"), status_code=404)


# Mount static directories (only if they exist)
for static_dir in ["src", "data", "styles"]:
    dir_path = os.path.join(BASE_DIR, static_dir)
    if os.path.isdir(dir_path):
        app.mount(f"/{static_dir}", StaticFiles(directory=dir_path), name=static_dir)


def main():
    """Main entry point."""
    import uvicorn

    os.chdir(BASE_DIR)

    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    os.makedirs("data/cache", exist_ok=True)

    # Run ingest if needed before starting server (skip if SKIP_INGEST is set)
    if not os.getenv("SKIP_INGEST"):
        try:
            run_ingest_if_needed()
        except Exception as exc:
            logger.warning(f"Ingest failed, serving existing data: {exc}")

    # Start the server
    logger.info(f"Starting server on http://localhost:{PORT}")
    logger.info("API docs available at http://localhost:{PORT}/api/docs")

    uvicorn.run(
        app,
        host=HOST or "0.0.0.0",  # nosec B104 - intentional for dev server
        port=PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
