#!/usr/bin/env python3
import datetime
import json
import os
import subprocess  # nosec B404
import sys
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools"))

from config import CURRENT_SEASON, HOST, OUTPUT_PATH, PORT, STATUS_PATH, setup_logging

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
        "--active-only",
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
        return True

    except subprocess.TimeoutExpired:
        logger.error(f"Ingest timed out after {INGEST_TIMEOUT}s")
        return False
    except subprocess.SubprocessError as e:
        logger.error(f"Subprocess error during ingest: {e}")
        return False


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    try:
        run_ingest_if_needed()
    except Exception as exc:
        logger.warning(f"Ingest failed, serving existing data: {exc}")

    handler = SimpleHTTPRequestHandler

    with TCPServer((HOST, PORT), handler) as httpd:
        logger.info(f"Serving on http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logger.info("Server stopped")


if __name__ == "__main__":
    main()
