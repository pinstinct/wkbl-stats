#!/usr/bin/env python3
import argparse
import datetime
import hashlib
import json
import os
import re
import socket
import time
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from config import (
    BASE_URL,
    PLAYER_RECORD_WRAPPER,
    GAME_LIST_MONTH,
    PLAYER_LIST,
    USER_AGENT,
    TIMEOUT,
    DELAY,
    MAX_RETRIES,
    RETRY_BACKOFF,
    setup_logging,
)

logger = setup_logging("ingest_wkbl")


def fetch(url, cache_dir, use_cache=True, delay=0.0):
    """Fetch URL with caching, retry logic, and exponential backoff."""
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        key = hashlib.sha1(url.encode("utf-8")).hexdigest()
        ext = ".json" if url.endswith(".json") or "search" in url else ".html"
        path = os.path.join(cache_dir, key + ext)
        if use_cache and os.path.exists(path):
            logger.debug(f"Cache hit: {url}")
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    if delay:
        time.sleep(delay)

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=TIMEOUT) as resp:
                content = resp.read()
                text = content.decode("utf-8", errors="ignore")
            if cache_dir:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
            logger.debug(f"Fetched: {url}")
            return text
        except HTTPError as e:
            last_error = e
            logger.warning(f"HTTP error {e.code} on attempt {attempt}/{MAX_RETRIES}: {url}")
        except URLError as e:
            last_error = e
            logger.warning(f"URL error on attempt {attempt}/{MAX_RETRIES}: {url} - {e.reason}")
        except socket.timeout as e:
            last_error = e
            logger.warning(f"Timeout on attempt {attempt}/{MAX_RETRIES}: {url}")

        if attempt < MAX_RETRIES:
            backoff = RETRY_BACKOFF ** attempt
            logger.info(f"Retrying in {backoff:.1f}s...")
            time.sleep(backoff)

    logger.error(f"Failed to fetch after {MAX_RETRIES} attempts: {url}")
    raise last_error


def parse_game_ids(html):
    return sorted(set(re.findall(r"data-id=\"(\d+)\"", html)))


def parse_iframe_src(html):
    m = re.search(r"<iframe[^>]+src=\"([^\"]+record_player\.asp[^\"]+)\"", html)
    return unescape(m.group(1)) if m else None


def strip_tags(text):
    text = re.sub(r"<[^>]+>", "", text)
    return unescape(text).strip()


def parse_minutes(value):
    if not value or ":" not in value:
        return 0.0
    mm, ss = value.split(":", 1)
    try:
        return int(mm) + int(ss) / 60.0
    except ValueError:
        return 0.0


def parse_made_attempt(value):
    if not value or "-" not in value:
        return 0, 0
    made, att = value.split("-", 1)
    try:
        return int(made), int(att)
    except ValueError:
        return 0, 0


def parse_player_tables(html):
    blocks = re.findall(r"<div class=\"tbl_player__container\">(.*?)</div>\s*</div>", html, re.S)
    results = []
    for block in blocks:
        team_m = re.search(r"<h4 class=\"tit_area\">(.*?)</h4>", block)
        team = strip_tags(team_m.group(1)) if team_m else ""
        table_m = re.search(r"<table>(.*?)</table>", block, re.S)
        if not table_m:
            continue
        table_html = table_m.group(1)
        tbody_m = re.search(r"<tbody>(.*?)</tbody>", table_html, re.S)
        if not tbody_m:
            continue
        rows_html = re.findall(r"<tr>(.*?)</tr>", tbody_m.group(1), re.S)
        for row in rows_html:
            cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
            cells = [strip_tags(c) for c in cells]
            if len(cells) < 15:
                continue
            name = cells[0]
            if not name or name in ("합계", "TOTAL"):
                continue
            results.append({
                "team": team,
                "name": name,
                "pos": cells[1],
                "min": parse_minutes(cells[2]),
                "two_pm_a": cells[3],
                "three_pm_a": cells[4],
                "ftm_a": cells[5],
                "off": cells[6],
                "def": cells[7],
                "reb": cells[8],
                "ast": cells[9],
                "pf": cells[10],
                "stl": cells[11],
                "to": cells[12],
                "blk": cells[13],
                "pts": cells[14],
            })
    return results


def normalize_team(team):
    return re.sub(r"\s+", " ", team).strip()


def normalize_season_label(label):
    label = label.strip()
    m = re.match(r"^(\d{4})-(\d{2})$", label)
    if m:
        start = int(m.group(1))
        end_short = int(m.group(2))
        end = 2000 + end_short if end_short < 100 else end_short
        return f"{start}-{end}"
    return label


def get_season_meta(cache_dir, season_label, use_cache=True, delay=0.0):
    html = fetch(BASE_URL + "/", cache_dir, use_cache=use_cache, delay=delay)
    label = normalize_season_label(season_label)
    pattern = (
        r"selectSeasonOrMonth\('(\d+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'\)\">"
        + re.escape(label)
        + r"</a>"
    )
    m = re.search(pattern, html)
    if not m:
        raise SystemExit(f"Season label not found on Data Lab home: {label}")
    return {
        "firstGameDate": m.group(1),
        "selectedId": m.group(2),
        "selectedGameDate": m.group(3),
    }


def parse_game_list_items(html, season_start_date):
    start_year = int(season_start_date[:4])
    start_month = int(season_start_date[4:6])
    items = re.findall(r"<li class=\"game-item[^\"]*\"[^>]*data-id=\"(\d+)\"[^>]*>(.*?)</li>", html, re.S)
    results = []
    for game_id, block in items:
        m = re.search(r"class=\"game-date\">\s*([0-9]{1,2})\.([0-9]{1,2})", block)
        if not m:
            continue
        month = int(m.group(1))
        day = int(m.group(2))
        year = start_year if month >= start_month else start_year + 1
        date = f"{year:04d}{month:02d}{day:02d}"
        results.append((game_id, date))
    return results


def parse_active_player_links(html):
    # Match both ./detail.asp and player/detail.asp patterns
    links = re.findall(
        r"<a[^>]+href=\"([^\"]*detail\.asp[^\"]+)\"[^>]*>(.*?)</a>",
        html, re.S
    )
    players = []
    for href, content in links:
        # Extract name from txt_name span or plain text
        name_m = re.search(r"data-kr=\"([^\"]+)\"", content)
        if name_m:
            name = name_m.group(1).strip()
        else:
            name = strip_tags(content).split("[")[0].strip()
            if not name:
                continue

        # Extract team - look for second data-kr or bracket pattern
        team_spans = re.findall(r"data-kr=\"([^\"]+)\"", content)
        if len(team_spans) >= 2:
            team = normalize_team(team_spans[1])
        else:
            team_m = re.search(r"\[\s*([^\]]+)\s*\]", strip_tags(content))
            team = normalize_team(team_m.group(1)) if team_m else ""

        if not team:
            continue

        pno_m = re.search(r"pno=(\d+)", href)
        pno = pno_m.group(1) if pno_m else None

        # Build full URL
        if href.startswith("http"):
            url = href
        elif href.startswith("./"):
            url = "https://www.wkbl.or.kr/player/" + href[2:]
        elif href.startswith("/"):
            url = "https://www.wkbl.or.kr" + href
        else:
            url = "https://www.wkbl.or.kr/player/" + href

        players.append({
            "name": name,
            "team": team,
            "pno": pno,
            "url": url,
        })

    uniq = {}
    for p in players:
        key = (p["name"], p["team"], p["pno"])
        if key not in uniq:
            uniq[key] = p
    return list(uniq.values())


def parse_player_profile(html):
    pos = None
    height = None
    # Match "포지션</span> - F" or "포지션 - F"
    pos_m = re.search(r"포지션(?:</span>)?\s*-\s*([A-Z/]+)", html)
    if pos_m:
        pos = pos_m.group(1).strip()
    # Match "신장</span> - 179 cm" or "신장 - 179 cm"
    height_m = re.search(r"신장(?:</span>)?\s*-\s*([0-9]+\s*cm)", html)
    if height_m:
        height = height_m.group(1).strip()
    return pos, height


def load_active_players(cache_dir, use_cache=True, delay=0.0):
    logger.info("Loading active players from WKBL roster")
    html = fetch(PLAYER_LIST, cache_dir, use_cache=use_cache, delay=delay)
    players = parse_active_player_links(html)
    logger.info(f"Found {len(players)} active players")
    for player in players:
        if not player.get("url"):
            continue
        detail_html = fetch(player["url"], cache_dir, use_cache=use_cache, delay=delay)
        pos, height = parse_player_profile(detail_html)
        if pos:
            player["pos"] = pos
        if height:
            player["height"] = height
    return players


def _create_empty_player_entry(player_id, name, team, pos, height, season_label):
    """Create a new empty player entry structure."""
    return {
        "id": player_id,
        "name": name,
        "team": normalize_team(team),
        "pos": pos,
        "height": height,
        "season": season_label,
        "gp": 0,
        "min_total": 0.0,
        "pts_total": 0.0,
        "reb_total": 0.0,
        "ast_total": 0.0,
        "stl_total": 0.0,
        "blk_total": 0.0,
        "fgm": 0,
        "fga": 0,
        "tpm": 0,
        "tpa": 0,
        "ftm": 0,
        "fta": 0,
    }


def _accumulate_game_stats(entry, record):
    """Accumulate stats from a single game record into entry."""
    entry["gp"] += 1
    entry["min_total"] += record["min"]
    entry["pts_total"] += float(record["pts"] or 0)
    entry["reb_total"] += float(record["reb"] or 0)
    entry["ast_total"] += float(record["ast"] or 0)
    entry["stl_total"] += float(record["stl"] or 0)
    entry["blk_total"] += float(record["blk"] or 0)

    two_m, two_a = parse_made_attempt(record["two_pm_a"])
    three_m, three_a = parse_made_attempt(record["three_pm_a"])
    ft_m, ft_a = parse_made_attempt(record["ftm_a"])
    entry["fgm"] += two_m + three_m
    entry["fga"] += two_a + three_a
    entry["tpm"] += three_m
    entry["tpa"] += three_a
    entry["ftm"] += ft_m
    entry["fta"] += ft_a


def _compute_averages(entry, active_info):
    """Convert accumulated totals to per-game averages."""
    gp = entry["gp"] or 1
    fga = entry["fga"]
    tpa = entry["tpa"]
    fta = entry["fta"]

    pos = active_info.get("pos") or entry["pos"] if active_info else entry["pos"]
    height = active_info.get("height") or entry["height"] if active_info else entry["height"]
    player_id = active_info.get("pno") or entry["id"] if active_info else entry["id"]

    return {
        "id": player_id,
        "name": entry["name"],
        "team": entry["team"],
        "pos": pos,
        "height": height,
        "season": entry["season"],
        "gp": entry["gp"],
        "min": round(entry["min_total"] / gp, 1),
        "pts": round(entry["pts_total"] / gp, 1),
        "reb": round(entry["reb_total"] / gp, 1),
        "ast": round(entry["ast_total"] / gp, 1),
        "stl": round(entry["stl_total"] / gp, 1),
        "blk": round(entry["blk_total"] / gp, 1),
        "fgp": round(entry["fgm"] / fga, 3) if fga else 0,
        "tpp": round(entry["tpm"] / tpa, 3) if tpa else 0,
        "ftp": round(entry["ftm"] / fta, 3) if fta else 0,
    }


def aggregate_players(records, season_label, active_players=None, include_zero=True):
    """Aggregate per-game records into season averages."""
    agg = {}

    for r in records:
        key = f"{r['name']}|{normalize_team(r['team'])}"
        if key not in agg:
            agg[key] = _create_empty_player_entry(
                key, r["name"], r["team"], r["pos"], "-", season_label
            )
        _accumulate_game_stats(agg[key], r)

    active_map = {}
    if active_players:
        for p in active_players:
            key = f"{p['name']}|{normalize_team(p['team'])}"
            active_map[key] = p
            if key not in agg and include_zero:
                agg[key] = _create_empty_player_entry(
                    p.get("pno") or key,
                    p["name"],
                    p["team"],
                    p.get("pos") or "-",
                    p.get("height") or "-",
                    season_label,
                )

    players = []
    for key, entry in agg.items():
        active_info = active_map.get(key)
        players.append(_compute_averages(entry, active_info))

    return players


def _resolve_season_params(args):
    """Resolve season parameters from args or auto-discover."""
    if args.auto:
        logger.info(f"Auto-discovering season parameters for {args.season_label}")
        meta = get_season_meta(
            args.cache_dir, args.season_label,
            use_cache=not args.no_cache, delay=args.delay
        )
        args.first_game_date = meta["firstGameDate"]
        args.selected_id = meta["selectedId"]
        args.selected_game_date = meta["selectedGameDate"]
        logger.info(f"Season params: first={args.first_game_date}, id={args.selected_id}")

    if not (args.first_game_date and args.selected_id and args.selected_game_date):
        raise SystemExit(
            "Missing game list parameters. "
            "Provide --first-game-date/--selected-id/--selected-game-date or use --auto."
        )

    return args.end_date or datetime.date.today().strftime("%Y%m%d")


def _fetch_game_records(args, end_date):
    """Fetch and parse game records up to end_date."""
    list_url = (
        f"{GAME_LIST_MONTH}?firstGameDate={args.first_game_date}"
        f"&selectedId={args.selected_id}&selectedGameDate={args.selected_game_date}"
    )

    html = fetch(list_url, args.cache_dir, use_cache=not args.no_cache, delay=args.delay)
    items = parse_game_list_items(html, args.first_game_date)
    game_ids = [game_id for game_id, date in items if date <= end_date]
    if not game_ids:
        game_ids = parse_game_ids(html)
    if not game_ids:
        raise SystemExit("No game IDs found. Check parameters.")

    logger.info(f"Processing {len(game_ids)} games up to {end_date}")

    records = []
    for i, game_id in enumerate(game_ids, 1):
        wrapper_url = f"{PLAYER_RECORD_WRAPPER}?menu=playerRecord&selectedId={game_id}"
        wrapper = fetch(wrapper_url, args.cache_dir, use_cache=not args.no_cache, delay=args.delay)
        iframe_src = parse_iframe_src(wrapper)
        if not iframe_src:
            logger.warning(f"No iframe source found for game {game_id}")
            continue
        if iframe_src.startswith("/"):
            iframe_src = BASE_URL + iframe_src
        record_html = fetch(iframe_src, args.cache_dir, use_cache=not args.no_cache, delay=args.delay)
        game_records = parse_player_tables(record_html)
        records.extend(game_records)
        if i % 10 == 0:
            logger.info(f"Processed {i}/{len(game_ids)} games...")

    logger.info(f"Collected {len(records)} player-game records")
    return records


def _write_output(args, players):
    """Write player data to output JSON file."""
    payload = {
        "defaultSeason": args.season_label,
        "players": sorted(players, key=lambda p: (-p["pts"], p["name"]))
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    logger.info(f"Wrote {len(players)} players to {args.output}")


def main():
    parser = argparse.ArgumentParser(description="WKBL Data Lab ingest")
    parser.add_argument("--first-game-date", help="e.g. 20241027")
    parser.add_argument("--selected-id", help="e.g. 04601055")
    parser.add_argument("--selected-game-date", help="e.g. 20260126")
    parser.add_argument("--season-label", required=True, help="e.g. 2024-25")
    parser.add_argument("--cache-dir", default="data/cache", help="cache dir")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--delay", type=float, default=DELAY)
    parser.add_argument("--output", default="data/season-output.json")
    parser.add_argument("--active-only", action="store_true", help="include only current active players")
    parser.add_argument("--auto", action="store_true", help="derive season params from Data Lab home")
    parser.add_argument("--end-date", help="YYYYMMDD (default: today)")

    args = parser.parse_args()
    logger.info(f"Starting ingest for season {args.season_label}")

    end_date = _resolve_season_params(args)
    records = _fetch_game_records(args, end_date)

    active_players = load_active_players(
        args.cache_dir, use_cache=not args.no_cache, delay=args.delay
    )

    players = aggregate_players(
        records, args.season_label, active_players=active_players, include_zero=True
    )

    if args.active_only:
        active_keys = {f"{p['name']}|{normalize_team(p['team'])}" for p in active_players}
        players = [p for p in players if f"{p['name']}|{normalize_team(p['team'])}" in active_keys]
        logger.info(f"Filtered to {len(players)} active players")

    _write_output(args, players)
    logger.info("Ingest complete")


if __name__ == "__main__":
    main()
