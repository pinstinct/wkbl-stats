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

import database
from config import (
    BASE_URL,
    DELAY,
    MAX_RETRIES,
    PLAYER_LIST,
    PLAYER_LIST_FOREIGN,
    PLAYER_LIST_RETIRED,
    PLAYER_RECORD_WRAPPER,
    RETRY_BACKOFF,
    SEASON_CODES,
    TEAM_STANDINGS_URL,
    TIMEOUT,
    USER_AGENT,
    setup_logging,
)

logger = setup_logging("ingest_wkbl")


def fetch(url, cache_dir, use_cache=True, delay=0.0):
    """Fetch URL with caching, retry logic, and exponential backoff."""
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        key = hashlib.sha1(url.encode("utf-8"), usedforsecurity=False).hexdigest()  # nosec B324
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
            with urlopen(req, timeout=TIMEOUT) as resp:  # nosec B310
                content = resp.read()
                text = content.decode("utf-8", errors="ignore")
            if cache_dir:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
            logger.debug(f"Fetched: {url}")
            return text
        except HTTPError as e:
            last_error = e
            logger.warning(
                f"HTTP error {e.code} on attempt {attempt}/{MAX_RETRIES}: {url}"
            )
        except URLError as e:
            last_error = e
            logger.warning(
                f"URL error on attempt {attempt}/{MAX_RETRIES}: {url} - {e.reason}"
            )
        except socket.timeout as e:
            last_error = e
            logger.warning(f"Timeout on attempt {attempt}/{MAX_RETRIES}: {url}")

        if attempt < MAX_RETRIES:
            backoff = RETRY_BACKOFF**attempt
            logger.info(f"Retrying in {backoff:.1f}s...")
            time.sleep(backoff)

    logger.error(f"Failed to fetch after {MAX_RETRIES} attempts: {url}")
    raise last_error


def parse_game_ids(html):
    return sorted(set(re.findall(r"data-id=\"(\d+)\"", html)))


def parse_iframe_src(html):
    m = re.search(r"<iframe[^>]+src=\"([^\"]+record_player\.asp[^\"]+)\"", html)
    return unescape(m.group(1)) if m else None


def parse_team_iframe_src(html):
    """Extract team record iframe URL from wrapper page."""
    m = re.search(r"<iframe[^>]+src=\"([^\"]+record_team\.asp[^\"]+)\"", html)
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


def parse_team_record(html):
    """Parse team statistics from record_team.asp HTML.

    HTML structure:
    - First row: team names (e.g., 'KB스타즈', '구분', '우리은행 위비')
    - Following rows: stat name in middle, team values on sides
    """
    results = []

    # Find all table rows
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
    if len(rows) < 2:
        return results

    # Parse first row to get team names
    first_row_cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", rows[0], re.S)
    first_row_cells = [strip_tags(c) for c in first_row_cells]

    if len(first_row_cells) < 3:
        return results

    team1_name = first_row_cells[0]
    team2_name = first_row_cells[2]

    # Initialize team stats
    team1_stats = {"team": team1_name}
    team2_stats = {"team": team2_name}

    # Stat name mapping
    stat_map = {
        "속공": "fast_break",
        "페인트존 점수": "paint_pts",
        "페인트존": "paint_pts",
        "2점슛 득점": "two_pts",
        "3점슛 득점": "three_pts",
        "리바운드": "reb",
        "어시스트": "ast",
        "스틸": "stl",
        "블록슛": "blk",
        "블록": "blk",
        "파울": "pf",
        "턴오버": "tov",
        "굿디펜스": "good_def",
    }

    # Parse stat rows
    for row in rows[1:]:
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row, re.S)
        cells = [strip_tags(c) for c in cells]

        if len(cells) < 3:
            continue

        stat_name = cells[1].strip()
        stat_key = stat_map.get(stat_name)

        if stat_key:
            try:
                team1_stats[stat_key] = int(cells[0])
                team2_stats[stat_key] = int(cells[2])
            except ValueError:
                pass

    if (
        team1_stats.get("reb")
        or team1_stats.get("ast")
        or team1_stats.get("fast_break")
    ):
        results.append(team1_stats)
        results.append(team2_stats)

    return results


def parse_player_tables(html):
    """Parse player boxscore tables from game record HTML.

    Finds team headers (h4.tit_area) and their following tables.
    """
    results = []

    # Find all team headers with their positions
    headers = list(re.finditer(r"<h4 class=\"tit_area\">(.*?)</h4>", html))

    # Find all tables with their positions
    tables = list(re.finditer(r"<table>(.*?)</table>", html, re.S))

    # Match each header to its following table
    for header in headers:
        team = strip_tags(header.group(1))
        header_pos = header.end()

        # Find the first table after this header
        table_html = None
        for table in tables:
            if table.start() > header_pos:
                table_html = table.group(1)
                break

        if not table_html:
            continue

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
            results.append(
                {
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
                }
            )

    return results


def normalize_team(team):
    return re.sub(r"\s+", " ", team).strip()


# Game type mapping based on game_id structure
# Game ID format: SSSTTGGG where SSS=season, TT=type, GGG=game number
# Examples: 04601055 = season 046, type 01 (regular), game 055
#           04604010 = season 046, type 04 (playoff), game 010
#           04601001 = season 046, type 01, game 001 (all-star)
GAME_TYPE_MAP = {
    "01": "regular",
    "04": "playoff",
}

# All-Star game numbers (game 001 in regular season slot is typically all-star)
ALLSTAR_GAME_NUMBERS = {"001"}


def parse_game_type(game_id):
    """Extract game type from game_id.

    Args:
        game_id: WKBL game ID (e.g., '04601055', '04604010', '04601001')

    Returns:
        Game type string: 'regular', 'playoff', 'allstar', or 'regular' (default)
    """
    if len(game_id) < 8:
        return "regular"

    game_type_code = game_id[3:5]
    game_number = game_id[5:8]

    # Check for all-star game (game 001 is typically all-star regardless of type code)
    if game_number in ALLSTAR_GAME_NUMBERS:
        return "allstar"

    return GAME_TYPE_MAP.get(game_type_code, "regular")


# Team name to DB ID mapping
TEAM_ID_MAP = {
    # 삼성생명
    "삼성생명": "samsung",
    "삼성": "samsung",
    "삼성생명 블루밍스": "samsung",
    # 신한은행
    "신한은행": "shinhan",
    "신한": "shinhan",
    "신한은행 에스버드": "shinhan",
    # KB스타즈
    "KB스타즈": "kb",
    "KB": "kb",
    "청주 KB스타즈": "kb",
    # 우리은행
    "우리은행": "woori",
    "우리": "woori",
    "우리은행 우리WON": "woori",
    "우리은행 위비": "woori",
    "아산 우리은행": "woori",
    # 하나원큐
    "하나원큐": "hana",
    "하나": "hana",
    "하나은행": "hana",
    "부천 하나원큐": "hana",
    # BNK썸
    "BNK썸": "bnk",
    "BNK": "bnk",
    "BNK 썸": "bnk",
    "부산 BNK썸": "bnk",
}


def get_team_id(team_name):
    """Convert team name to DB team ID."""
    normalized = normalize_team(team_name)
    return TEAM_ID_MAP.get(normalized, normalized.lower().replace(" ", "_"))


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


def get_season_meta_by_code(season_code):
    """Get season metadata from season code without network request.

    Args:
        season_code: WKBL season code (e.g., '046')

    Returns:
        Dict with season metadata: firstGameDate, selectedId, label
    """
    label = SEASON_CODES.get(season_code)
    if not label:
        raise ValueError(f"Unknown season code: {season_code}")

    # Calculate season start year from code
    # Season codes: 046 = 2025-26, 045 = 2024-25, etc.
    code_num = int(season_code)
    season_year = 2025 - (46 - code_num)

    # Season typically starts in late October/November
    first_game_date = f"{season_year}1027"  # Approximate start date

    # Generate a representative selected_id (first game of season)
    selected_id = f"{season_code}01001"

    return {
        "firstGameDate": first_game_date,
        "selectedId": selected_id,
        "selectedGameDate": first_game_date,
        "label": label,
    }


def parse_game_list_items(html, season_start_date):
    start_year = int(season_start_date[:4])
    start_month = int(season_start_date[4:6])
    items = re.findall(
        r"<li class=\"game-item[^\"]*\"[^>]*data-id=\"(\d+)\"[^>]*>(.*?)</li>",
        html,
        re.S,
    )
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


def parse_available_months(html, season_start_date):
    """Parse available months from game list dropdown for current season only.

    Args:
        html: HTML content from game list page
        season_start_date: Season start date (YYYYMMDD) to filter months

    Returns:
        List of (firstGameDate, selectedId, selectedGameDate) tuples for each month.
    """
    pattern = r"selectSeasonOrMonth\('(\d+)'\s*,\s*'(\d+)'\s*,\s*'(\d+)'\)"
    matches = re.findall(pattern, html)

    # Filter to only include months >= season start date
    start_ym = season_start_date[:6]  # YYYYMM

    seen = set()
    results = []
    for first_date, selected_id, selected_game_date in matches:
        month_ym = first_date[:6]
        # Only include months from this season (>= start month)
        if first_date not in seen and month_ym >= start_ym:
            seen.add(first_date)
            results.append((first_date, selected_id, selected_game_date))

    # Sort by date
    results.sort(key=lambda x: x[0])
    return results


def parse_active_player_links(html):
    # Match detail.asp, detail2.asp, and various path patterns
    links = re.findall(
        r"<a[^>]+href=\"([^\"]*detail2?\.asp[^\"]+)\"[^>]*>(.*?)</a>", html, re.S
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

        players.append(
            {
                "name": name,
                "team": team,
                "pno": pno,
                "url": url,
            }
        )

    uniq = {}
    for p in players:
        key = (p["name"], p["team"], p["pno"])
        if key not in uniq:
            uniq[key] = p
    return list(uniq.values())


def parse_player_profile(html):
    pos = None
    height = None
    birth_date = None
    # Match "포지션</span> - F" or "포지션 - F"
    pos_m = re.search(r"포지션(?:</span>)?\s*-\s*([A-Z/]+)", html)
    if pos_m:
        pos = pos_m.group(1).strip()
    # Match "신장</span> - 179 cm" or "신장 - 179 cm"
    height_m = re.search(r"신장(?:</span>)?\s*-\s*([0-9]+\s*cm)", html)
    if height_m:
        height = height_m.group(1).strip()
    # Match "생년월일</span> - 1994.10.27" or "생년월일 - 1994.10.27"
    birth_m = re.search(r"생년월일(?:</span>)?\s*-\s*(\d{4}\.\d{1,2}\.\d{1,2})", html)
    if birth_m:
        # Convert from YYYY.MM.DD to YYYY-MM-DD
        birth_date = birth_m.group(1).replace(".", "-")
    return pos, height, birth_date


def load_active_players(cache_dir, use_cache=True, delay=0.0):
    logger.info("Loading active players from WKBL roster")
    html = fetch(PLAYER_LIST, cache_dir, use_cache=use_cache, delay=delay)
    players = parse_active_player_links(html)
    logger.info(f"Found {len(players)} active players")
    for player in players:
        if not player.get("url"):
            continue
        detail_html = fetch(player["url"], cache_dir, use_cache=use_cache, delay=delay)
        pos, height, birth_date = parse_player_profile(detail_html)
        if pos:
            player["pos"] = pos
        if height:
            player["height"] = height
        if birth_date:
            player["birth_date"] = birth_date
    return players


def load_all_players(cache_dir, use_cache=True, delay=0.0, fetch_profiles=False):
    """Load all players (active + retired + foreign) from WKBL roster.

    Args:
        cache_dir: Cache directory for HTTP responses
        use_cache: Whether to use cached responses
        delay: Delay between requests
        fetch_profiles: Whether to fetch individual player profiles (slower)

    Returns:
        dict: {pno: player_info} for all players
    """
    all_players = {}

    # Load active players (player_group=12, default)
    logger.info("Loading active players...")
    html = fetch(PLAYER_LIST, cache_dir, use_cache=use_cache, delay=delay)
    active_players = parse_active_player_links(html)
    for p in active_players:
        if p.get("pno"):
            all_players[p["pno"]] = {**p, "is_active": 1, "player_group": "active"}
    logger.info(f"Found {len(active_players)} active players")

    # Load retired players (player_group=11)
    logger.info("Loading retired players...")
    html = fetch(PLAYER_LIST_RETIRED, cache_dir, use_cache=use_cache, delay=delay)
    retired_players = parse_active_player_links(html)
    for p in retired_players:
        if p.get("pno") and p["pno"] not in all_players:
            all_players[p["pno"]] = {**p, "is_active": 0, "player_group": "retired"}
    logger.info(f"Found {len(retired_players)} retired players")

    # Load foreign players (player_group=F11)
    logger.info("Loading foreign players...")
    html = fetch(PLAYER_LIST_FOREIGN, cache_dir, use_cache=use_cache, delay=delay)
    foreign_players = parse_active_player_links(html)
    for p in foreign_players:
        if p.get("pno") and p["pno"] not in all_players:
            all_players[p["pno"]] = {**p, "is_active": 0, "player_group": "foreign"}
    logger.info(f"Found {len(foreign_players)} foreign players")

    # Optionally fetch individual profiles for position/height
    if fetch_profiles:
        logger.info("Fetching player profiles...")
        for i, (pno, player) in enumerate(all_players.items()):
            if not player.get("url"):
                continue
            try:
                detail_html = fetch(
                    player["url"], cache_dir, use_cache=use_cache, delay=delay
                )
                pos, height, birth_date = parse_player_profile(detail_html)
                if pos:
                    player["pos"] = pos
                if height:
                    player["height"] = height
                if birth_date:
                    player["birth_date"] = birth_date
            except Exception as e:
                logger.warning(f"Failed to fetch profile for {player['name']}: {e}")
            if (i + 1) % 50 == 0:
                logger.info(f"Fetched {i + 1}/{len(all_players)} profiles...")

    logger.info(f"Total players loaded: {len(all_players)}")
    return all_players


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
        "to_total": 0.0,
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
    entry["to_total"] += float(record["to"] or 0)

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
    """Convert accumulated totals to per-game averages and advanced stats."""
    gp = entry["gp"] or 1
    fgm = entry["fgm"]
    fga = entry["fga"]
    tpm = entry["tpm"]
    tpa = entry["tpa"]
    ftm = entry["ftm"]
    fta = entry["fta"]
    pts_total = entry["pts_total"]
    min_total = entry["min_total"]
    to_total = entry["to_total"]
    ast_total = entry["ast_total"]

    pos = active_info.get("pos") or entry["pos"] if active_info else entry["pos"]
    height = (
        active_info.get("height") or entry["height"] if active_info else entry["height"]
    )
    player_id = active_info.get("pno") or entry["id"] if active_info else entry["id"]

    # Primary stats (per game)
    pts = round(pts_total / gp, 1)
    reb = round(entry["reb_total"] / gp, 1)
    ast = round(ast_total / gp, 1)
    stl = round(entry["stl_total"] / gp, 1)
    blk = round(entry["blk_total"] / gp, 1)
    tov = round(to_total / gp, 1)
    minutes = round(min_total / gp, 1)

    # Shooting percentages
    fgp = round(fgm / fga, 3) if fga else 0
    tpp = round(tpm / tpa, 3) if tpa else 0
    ftp = round(ftm / fta, 3) if fta else 0

    # Advanced stats
    # TS% (True Shooting %) = PTS / (2 * (FGA + 0.44 * FTA))
    tsa = 2 * (fga + 0.44 * fta)  # True shooting attempts
    ts_pct = round(pts_total / tsa, 3) if tsa else 0

    # eFG% (Effective FG %) = (FGM + 0.5 * 3PM) / FGA
    efg_pct = round((fgm + 0.5 * tpm) / fga, 3) if fga else 0

    # AST/TO Ratio
    ast_to = round(ast_total / to_total, 2) if to_total else 0

    # PER36 (Per 36 minutes stats)
    if min_total > 0:
        per36_factor = 36 / (min_total / gp) if (min_total / gp) > 0 else 0
        pts36 = round(pts * per36_factor, 1)
        reb36 = round(reb * per36_factor, 1)
        ast36 = round(ast * per36_factor, 1)
    else:
        pts36 = reb36 = ast36 = 0

    # PIR (Performance Index Rating) - European efficiency metric
    # PIR = (PTS + REB + AST + STL + BLK + FGM + FTM) - (FGA-FGM) - (FTA-FTM) - TO
    pir_total = (
        (
            pts_total
            + entry["reb_total"]
            + ast_total
            + entry["stl_total"]
            + entry["blk_total"]
            + fgm
            + ftm
        )
        - (fga - fgm)
        - (fta - ftm)
        - to_total
    )
    pir = round(pir_total / gp, 1)

    # Double-double potential (average 10+ in two categories)
    dd_cats = sum(1 for v in [pts, reb, ast] if v >= 10)

    return {
        "id": player_id,
        "name": entry["name"],
        "team": entry["team"],
        "pos": pos,
        "height": height,
        "season": entry["season"],
        # Primary stats
        "gp": entry["gp"],
        "min": minutes,
        "pts": pts,
        "reb": reb,
        "ast": ast,
        "stl": stl,
        "blk": blk,
        "tov": tov,
        # Shooting percentages
        "fgp": fgp,
        "tpp": tpp,
        "ftp": ftp,
        # Advanced stats
        "ts_pct": ts_pct,
        "efg_pct": efg_pct,
        "ast_to": ast_to,
        "pts36": pts36,
        "reb36": reb36,
        "ast36": ast36,
        "pir": pir,
        "dd_cats": dd_cats,
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
            args.cache_dir,
            args.season_label,
            use_cache=not args.no_cache,
            delay=args.delay,
        )
        args.first_game_date = meta["firstGameDate"]
        args.selected_id = meta["selectedId"]
        args.selected_game_date = meta["selectedGameDate"]
        logger.info(
            f"Season params: first={args.first_game_date}, id={args.selected_id}"
        )

    if not (args.first_game_date and args.selected_id and args.selected_game_date):
        raise SystemExit(
            "Missing game list parameters. "
            "Provide --first-game-date/--selected-id/--selected-game-date or use --auto."
        )

    return args.end_date or datetime.date.today().strftime("%Y%m%d")


WKBL_SCHEDULE_URL = "https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp"


def fetch_post(url, data, cache_dir, use_cache=True, delay=0.0):
    """Fetch URL with POST data, caching, retry logic, and exponential backoff."""
    if cache_dir:
        os.makedirs(cache_dir, exist_ok=True)
        # Include POST data in cache key
        cache_data = url + "|" + "&".join(f"{k}={v}" for k, v in sorted(data.items()))
        key = hashlib.sha1(
            cache_data.encode("utf-8"), usedforsecurity=False
        ).hexdigest()  # nosec B324
        path = os.path.join(cache_dir, key + ".html")
        if use_cache and os.path.exists(path):
            logger.debug(f"Cache hit: {url}")
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()

    if delay:
        time.sleep(delay)

    last_error = None
    post_data = "&".join(f"{k}={v}" for k, v in data.items()).encode("utf-8")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = Request(
                url,
                data=post_data,
                headers={
                    "User-Agent": USER_AGENT,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            with urlopen(req, timeout=TIMEOUT) as resp:  # nosec B310
                content = resp.read()
                text = content.decode("utf-8", errors="ignore")
            if cache_dir:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(text)
            logger.debug(f"Fetched (POST): {url}")
            return text
        except HTTPError as e:
            last_error = e
            logger.warning(
                f"HTTP error {e.code} on attempt {attempt}/{MAX_RETRIES}: {url}"
            )
        except URLError as e:
            last_error = e
            logger.warning(
                f"URL error on attempt {attempt}/{MAX_RETRIES}: {url} - {e.reason}"
            )
        except socket.timeout as e:
            last_error = e
            logger.warning(f"Timeout on attempt {attempt}/{MAX_RETRIES}: {url}")

        if attempt < MAX_RETRIES:
            backoff = RETRY_BACKOFF**attempt
            logger.info(f"Retrying in {backoff:.1f}s...")
            time.sleep(backoff)

    logger.error(f"Failed to fetch after {MAX_RETRIES} attempts: {url}")
    raise last_error


def fetch_team_standings(cache_dir, season_code, gun="1", use_cache=True, delay=0.0):
    """Fetch team standings from WKBL AJAX endpoint.

    Args:
        cache_dir: Cache directory for HTTP responses
        season_code: Season code (e.g., '046')
        gun: Game type ('1' for regular season, '4' for playoff)
        use_cache: Whether to use cached responses
        delay: Delay between requests

    Returns:
        List of team standing dicts
    """
    data = {
        "season_gu": season_code,
        "gun": gun,
    }

    html = fetch_post(
        TEAM_STANDINGS_URL, data, cache_dir, use_cache=use_cache, delay=delay
    )
    return parse_standings_html(html, season_code)


def _parse_record(text):
    """Parse win-loss record like '6-3' or '13승 5패' into (wins, losses)."""
    text = text.strip()
    # Format: "6-3"
    if "-" in text and "승" not in text:
        parts = text.split("-")
        if len(parts) == 2:
            try:
                return int(parts[0]), int(parts[1])
            except ValueError:
                pass
    # Format: "13승 5패"
    m = re.match(r"(\d+)승\s*(\d+)패", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    return 0, 0


def parse_standings_html(html, season_code):
    """Parse team standings HTML from WKBL AJAX response.

    HTML structure (11 columns):
    0: rank, 1: team, 2: games_played, 3: "13승 5패", 4: win_pct,
    5: games_behind, 6: home (6-3), 7: away (7-2), 8: neutral (0-0),
    9: last5 (3-2), 10: streak (W3/L2)

    Args:
        html: HTML content from ajax_team_rank.asp
        season_code: Season code for team ID resolution

    Returns:
        List of team standing dicts with team_id, rank, wins, losses, etc.
    """
    standings = []

    # Find the table rows
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)

    for row in rows:
        # Skip header rows
        if "<th" in row:
            continue

        # Parse cells
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)
        if len(cells) < 11:
            continue

        # Extract rank (1st cell)
        rank_text = strip_tags(cells[0]).strip()
        if not rank_text.isdigit():
            continue
        rank = int(rank_text)

        # Extract team name (2nd cell)
        team_name = strip_tags(cells[1]).strip()
        if not team_name:
            continue
        team_id = get_team_id(team_name)

        # Extract games played (3rd cell)
        gp_text = strip_tags(cells[2]).strip()
        games_played = int(gp_text) if gp_text.isdigit() else 0

        # Extract wins/losses (4th cell) - format: "13승 5패"
        record_text = strip_tags(cells[3]).strip()
        wins, losses = _parse_record(record_text)

        # Extract win percentage (5th cell) - format: 72.2
        pct_text = strip_tags(cells[4]).strip()
        try:
            win_pct = float(pct_text) / 100.0  # Convert 72.2 to 0.722
        except ValueError:
            win_pct = wins / games_played if games_played > 0 else 0.0

        # Extract games behind (6th cell)
        gb_text = strip_tags(cells[5]).strip()
        try:
            games_behind = float(gb_text) if gb_text and gb_text != "-" else 0.0
        except ValueError:
            games_behind = 0.0

        # Extract home record (7th cell) - format: "6-3"
        home_text = strip_tags(cells[6]).strip()
        home_wins, home_losses = _parse_record(home_text)

        # Extract away record (8th cell) - format: "7-2"
        away_text = strip_tags(cells[7]).strip()
        away_wins, away_losses = _parse_record(away_text)

        # Skip neutral record (9th cell, cells[8])

        # Extract last5 (10th cell) - format: "3-2"
        last5_text = strip_tags(cells[9]).strip()
        last5 = last5_text if last5_text and last5_text != "-" else None

        # Extract streak (11th cell) - format: "연3승" or "연2패"
        streak_text = strip_tags(cells[10]).strip()
        streak = streak_text if streak_text and streak_text != "-" else None

        standings.append(
            {
                "team_id": team_id,
                "team_name": team_name,
                "rank": rank,
                "games_played": games_played,
                "wins": wins,
                "losses": losses,
                "win_pct": round(win_pct, 3),
                "games_behind": games_behind,
                "home_wins": home_wins,
                "home_losses": home_losses,
                "away_wins": away_wins,
                "away_losses": away_losses,
                "streak": streak,
                "last5": last5,
            }
        )

    return standings


def _fetch_schedule_from_wkbl(
    cache_dir, season_code, use_cache=True, delay=0.0, game_types=None
):
    """Fetch game schedule from WKBL official site.

    Args:
        cache_dir: Cache directory for HTTP responses
        season_code: Season code (e.g., '046')
        use_cache: Whether to use cached responses
        delay: Delay between requests
        game_types: List of game types to fetch (e.g., ['01', '04']).
                    '01' = regular season, '04' = playoff.
                    Default: ['01'] (regular season only)

    Returns:
        Dict mapping game_id to dict with 'date', 'home_team', 'away_team'
    """
    if game_types is None:
        game_types = ["01"]  # Default: regular season only

    # gun parameter mapping: 1 = regular season, 4 = playoff
    gun_map = {"01": "1", "04": "4"}

    # Season months to fetch (November to April)
    # Construct year-month list based on season
    # Season codes: 046 = 2025-26, 045 = 2024-25, 044 = 2023-24
    code_num = int(season_code)
    season_year = 2025 - (46 - code_num)  # 046 -> 2025, 045 -> 2024, etc.
    months = [
        f"{season_year}11",
        f"{season_year}12",
        f"{season_year + 1}01",
        f"{season_year + 1}02",
        f"{season_year + 1}03",
        f"{season_year + 1}04",
    ]

    games = {}

    for game_type_code in game_types:
        gun = gun_map.get(game_type_code, "1")

        for ym in months:
            url = f"{WKBL_SCHEDULE_URL}?season_gu={season_code}&ym={ym}&viewType=2&gun={gun}"
            try:
                html = fetch(url, cache_dir, use_cache=use_cache, delay=delay)

                # Find all table rows with game data
                rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)

                # Track future games without game_no
                future_games_in_month = []

                for row in rows:
                    # Skip header row
                    if "<th" in row:
                        continue

                    # Get date: format is MM/DD in <td>
                    date_match = re.search(r"<td[^>]*>(\d{1,2})/(\d{1,2})", row)

                    # Get game_no from link (only exists for past games)
                    game_match = re.search(r"game_no=(\d+)", row)

                    # Get teams - away and home from data-kr attributes
                    away_match = re.search(
                        r"info_team away.*?data-kr=\"([^\"]+)\"", row, re.S
                    )
                    home_match = re.search(
                        r"info_team home.*?data-kr=\"([^\"]+)\"", row, re.S
                    )

                    if date_match:
                        month = int(date_match.group(1))
                        day = int(date_match.group(2))

                        # Determine year based on month
                        if month >= 10:  # Oct-Dec
                            game_year = season_year
                        else:  # Jan-Apr
                            game_year = season_year + 1

                        date = f"{game_year}{month:02d}{day:02d}"
                        away_team = away_match.group(1) if away_match else ""
                        home_team = home_match.group(1) if home_match else ""

                        if game_match:
                            # Past game with game_no
                            game_no = int(game_match.group(1))
                            game_id = f"{season_code}{game_type_code}{game_no:03d}"
                            games[game_id] = {
                                "date": date,
                                "home_team": home_team,
                                "away_team": away_team,
                            }
                        elif away_team and home_team:
                            # Future game without game_no - collect for later
                            future_games_in_month.append(
                                {
                                    "date": date,
                                    "home_team": home_team,
                                    "away_team": away_team,
                                }
                            )

                # Assign game numbers to future games
                if future_games_in_month:
                    # Find max game_no for this game type
                    max_game_no = 0
                    for gid in games:
                        if gid.startswith(f"{season_code}{game_type_code}"):
                            gno = int(gid[-3:])
                            if gno > max_game_no:
                                max_game_no = gno

                    # Sort future games by date and assign sequential numbers
                    future_games_in_month.sort(key=lambda x: x["date"])
                    for fg in future_games_in_month:
                        max_game_no += 1
                        game_id = f"{season_code}{game_type_code}{max_game_no:03d}"
                        # Avoid duplicates (same date+teams might already exist)
                        if game_id not in games:
                            games[game_id] = fg

            except Exception as e:
                logger.warning(f"Failed to fetch schedule for {ym} (gun={gun}): {e}")

    return games


def _get_games_to_process(args, end_date, existing_game_ids=None, game_types=None):
    """Get list of games to process using WKBL schedule API.

    Args:
        args: Command line arguments
        end_date: End date for filtering games (YYYYMMDD)
        existing_game_ids: Set of game IDs already in DB (skip these)
        game_types: List of game type codes to fetch (e.g., ['01', '04'])

    Returns:
        Tuple of (filtered_items, schedule_info):
            - filtered_items: List of (game_id, date) tuples for games to process
            - schedule_info: Dict with full schedule data including home/away teams
    """
    # Extract season code from selected_id (e.g., '04601056' -> '046')
    season_code = args.selected_id[:3] if args.selected_id else "046"

    logger.info(f"Fetching schedule for season {season_code} from WKBL...")

    # Fetch schedule from WKBL official site
    schedule_info = _fetch_schedule_from_wkbl(
        args.cache_dir,
        season_code,
        use_cache=not args.no_cache,
        delay=args.delay,
        game_types=game_types,
    )

    logger.info(f"Found {len(schedule_info)} games in schedule")

    # Filter by end_date and existing games
    filtered_items = []
    for game_id, info in sorted(schedule_info.items()):
        date = info["date"]

        # Filter by end_date
        if date > end_date:
            continue

        # Skip if already in database
        if existing_game_ids and game_id in existing_game_ids:
            continue

        filtered_items.append((game_id, date))

    if existing_game_ids:
        future_games = sum(
            1 for info in schedule_info.values() if info["date"] > end_date
        )
        skipped = len(schedule_info) - len(filtered_items) - future_games
        if skipped > 0:
            logger.info(f"Skipping {skipped} games already in database")

    return filtered_items, schedule_info


def _fetch_game_records(
    args, end_date, fetch_team_stats=False, existing_game_ids=None, game_types=None
):
    """Fetch and parse game records up to end_date.

    Args:
        args: Command line arguments
        end_date: End date for filtering games (YYYYMMDD)
        fetch_team_stats: Whether to also fetch team statistics
        existing_game_ids: Set of game IDs already in DB (skip these)
        game_types: List of game type codes to fetch (e.g., ['01', '04'])

    Returns:
        tuple: (records, team_records, game_items, schedule_info)
            - records: list of player game records
            - team_records: list of team game records (if fetch_team_stats=True)
            - game_items: list of (game_id, date) tuples for NEW games only
            - schedule_info: dict with game schedule including home/away teams
    """
    # Get games from WKBL schedule API
    filtered_items, schedule_info = _get_games_to_process(
        args, end_date, existing_game_ids, game_types=game_types
    )

    if not filtered_items:
        logger.info("No new games to process")
        return [], [], [], schedule_info

    logger.info(f"Processing {len(filtered_items)} games up to {end_date}")

    records = []
    team_records = []
    for i, (game_id, date) in enumerate(filtered_items, 1):
        wrapper_url = f"{PLAYER_RECORD_WRAPPER}?menu=playerRecord&selectedId={game_id}"
        wrapper = fetch(
            wrapper_url, args.cache_dir, use_cache=not args.no_cache, delay=args.delay
        )

        # Fetch player records
        iframe_src = parse_iframe_src(wrapper)
        if not iframe_src:
            logger.warning(f"No player iframe source found for game {game_id}")
            continue
        if iframe_src.startswith("/"):
            iframe_src = BASE_URL + iframe_src
        record_html = fetch(
            iframe_src, args.cache_dir, use_cache=not args.no_cache, delay=args.delay
        )
        game_records = parse_player_tables(record_html)
        # Tag each record with game_id for DB storage
        for rec in game_records:
            rec["_game_id"] = game_id
        records.extend(game_records)

        # Fetch team records if requested (from separate teamRecord page)
        if fetch_team_stats:
            team_wrapper_url = (
                f"{BASE_URL}/teamRecord?menu=teamRecord&selectedId={game_id}"
            )
            team_wrapper = fetch(
                team_wrapper_url,
                args.cache_dir,
                use_cache=not args.no_cache,
                delay=args.delay,
            )
            team_iframe_src = parse_team_iframe_src(team_wrapper)
            if team_iframe_src:
                if team_iframe_src.startswith("/"):
                    team_iframe_src = BASE_URL + team_iframe_src
                team_html = fetch(
                    team_iframe_src,
                    args.cache_dir,
                    use_cache=not args.no_cache,
                    delay=args.delay,
                )
                game_team_records = parse_team_record(team_html)
                for rec in game_team_records:
                    rec["_game_id"] = game_id
                team_records.extend(game_team_records)

        if i % 10 == 0:
            logger.info(f"Processed {i}/{len(filtered_items)} games...")

    logger.info(f"Collected {len(records)} player-game records")
    if fetch_team_stats:
        logger.info(f"Collected {len(team_records)} team-game records")
    return records, team_records, filtered_items, schedule_info


def _convert_db_stats_to_players(db_stats, season_label, active_players):
    """Convert database stats to player output format with advanced metrics."""
    active_map = {}
    for p in active_players:
        key = f"{p['name']}|{normalize_team(p['team'])}"
        active_map[key] = p

    players = []
    for row in db_stats:
        gp = row.get("gp", 1) or 1
        total_fgm = row.get("total_fgm", 0) or 0
        total_fga = row.get("total_fga", 0) or 0
        total_tpm = row.get("total_tpm", 0) or 0
        total_tpa = row.get("total_tpa", 0) or 0
        total_ftm = row.get("total_ftm", 0) or 0
        total_fta = row.get("total_fta", 0) or 0
        total_pts = row.get("total_pts", 0) or 0
        total_min = row.get("total_min", 0) or 0

        # Shooting percentages
        fgp = round(total_fgm / total_fga, 3) if total_fga else 0
        tpp = round(total_tpm / total_tpa, 3) if total_tpa else 0
        ftp = round(total_ftm / total_fta, 3) if total_fta else 0

        # TS% (True Shooting %)
        tsa = 2 * (total_fga + 0.44 * total_fta)
        ts_pct = round(total_pts / tsa, 3) if tsa else 0

        # eFG% (Effective FG %)
        efg_pct = (
            round((total_fgm + 0.5 * total_tpm) / total_fga, 3) if total_fga else 0
        )

        # Per-game averages
        pts = round(row.get("pts", 0) or 0, 1)
        reb = round(row.get("reb", 0) or 0, 1)
        ast = round(row.get("ast", 0) or 0, 1)
        tov = round(row.get("tov", 0) or 0, 1)

        # AST/TO Ratio
        total_ast = ast * gp
        total_tov = tov * gp
        ast_to = round(total_ast / total_tov, 2) if total_tov else 0

        # Per 36 minutes
        min_per_game = total_min / gp if gp else 0
        per36_factor = 36 / min_per_game if min_per_game > 0 else 0
        pts36 = round(pts * per36_factor, 1)
        reb36 = round(reb * per36_factor, 1)
        ast36 = round(ast * per36_factor, 1)

        # PIR (Performance Index Rating)
        pir_per_game = (
            (
                pts
                + reb
                + ast
                + round(row.get("stl", 0) or 0, 1)
                + round(row.get("blk", 0) or 0, 1)
                + (total_fgm / gp)
                + (total_ftm / gp)
            )
            - ((total_fga - total_fgm) / gp)
            - ((total_fta - total_ftm) / gp)
            - tov
        )
        pir = round(pir_per_game, 1)

        # Double-double potential
        dd_cats = sum(1 for v in [pts, reb, ast] if v >= 10)

        # Get active player info for enrichment
        key = f"{row['name']}|{row['team']}"
        active_info = active_map.get(key, {})

        players.append(
            {
                "id": row.get("id") or active_info.get("pno") or key,
                "name": row["name"],
                "team": row["team"],
                "pos": row.get("pos") or active_info.get("pos") or "-",
                "height": row.get("height") or active_info.get("height") or "-",
                "season": season_label,
                "gp": gp,
                "min": round(row.get("min", 0) or 0, 1),
                "pts": pts,
                "reb": reb,
                "ast": ast,
                "stl": round(row.get("stl", 0) or 0, 1),
                "blk": round(row.get("blk", 0) or 0, 1),
                "tov": tov,
                "fgp": fgp,
                "tpp": tpp,
                "ftp": ftp,
                "ts_pct": ts_pct,
                "efg_pct": efg_pct,
                "ast_to": ast_to,
                "pts36": pts36,
                "reb36": reb36,
                "ast36": ast36,
                "pir": pir,
                "dd_cats": dd_cats,
            }
        )

    return players


def _write_output(args, players):
    """Write player data to output JSON file."""
    payload = {
        "defaultSeason": args.season_label,
        "players": sorted(players, key=lambda p: (-p["pts"], p["name"])),
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    logger.info(f"Wrote {len(players)} players to {args.output}")


def _save_to_db(
    args, game_records, team_records, active_players, game_items, schedule_info=None
):
    """Save game records to SQLite database."""
    logger.info("Initializing database...")
    database.init_db()

    # Extract season code from selected_id (e.g., '04601055' -> '046')
    season_code = args.selected_id[:3] if args.selected_id else "046"

    # Insert season
    start_date = None
    if args.first_game_date and len(args.first_game_date) == 8:
        start_date = f"{args.first_game_date[:4]}-{args.first_game_date[4:6]}-{args.first_game_date[6:8]}"
    database.insert_season(
        season_id=season_code,
        label=args.season_label,
        start_date=start_date,
    )
    logger.info(f"Saved season {args.season_label} (code: {season_code})")

    # Build player_id lookups from all loaded players
    player_id_map = {}  # name|team -> player_id
    player_id_by_name = {}  # name -> [player_ids] (for fallback matching)
    active_keys = set()
    for p in active_players:
        key = f"{p['name']}|{normalize_team(p['team'])}"
        player_id = p.get("pno") or key.replace("|", "_").replace(" ", "_")
        player_id_map[key] = player_id
        if p.get("is_active") == 1:
            active_keys.add(key)
        # Build name-only lookup for team transfer matching
        name = p["name"]
        if name not in player_id_by_name:
            player_id_by_name[name] = []
        if player_id not in player_id_by_name[name]:
            player_id_by_name[name].append(player_id)

    # Extract all players from game records (includes retired players)
    all_players = {}  # key -> {name, team, pos}
    for record in game_records:
        key = f"{record['name']}|{normalize_team(record['team'])}"
        if key not in all_players:
            all_players[key] = {
                "name": record["name"],
                "team": normalize_team(record["team"]),
                "pos": record.get("pos"),
            }

    # Insert all players (from game records + active players)
    players_inserted = 0
    for key, info in all_players.items():
        # Try to find pno: 1) exact name|team match, 2) name-only match if unique
        player_id = player_id_map.get(key)
        if not player_id:
            name = info["name"]
            name_matches = player_id_by_name.get(name, [])
            if len(name_matches) == 1:
                # Unique name match - use this pno (handles team transfers)
                player_id = name_matches[0]
            else:
                # No match or ambiguous - generate ID
                player_id = key.replace("|", "_").replace(" ", "_")
        player_id_map[key] = player_id
        team_id = get_team_id(info["team"])
        is_active = 1 if key in active_keys else 0

        # Get additional info from active_players if available
        active_info = next(
            (
                p
                for p in active_players
                if f"{p['name']}|{normalize_team(p['team'])}" == key
            ),
            None,
        )

        database.insert_player(
            player_id=player_id,
            name=info["name"],
            team_id=team_id,
            position=active_info.get("pos") if active_info else info.get("pos"),
            height=active_info.get("height") if active_info else None,
            birth_date=active_info.get("birth_date") if active_info else None,
            is_active=is_active,
        )
        players_inserted += 1

    logger.info(f"Saved {players_inserted} players ({len(active_keys)} active)")

    # Build game_id -> date mapping
    game_date_map = {game_id: date for game_id, date in game_items}

    # Group records by game_id (using _game_id tag added during fetch)
    records_by_game = {}
    for record in game_records:
        game_id = record.get("_game_id")
        if not game_id:
            continue
        if game_id not in records_by_game:
            records_by_game[game_id] = []
        records_by_game[game_id].append(record)

    # Insert games and player_games
    db_records = []
    games_inserted = 0
    for game_id, records in records_by_game.items():
        if not records:
            continue

        date = game_date_map.get(game_id, "")
        formatted_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}" if len(date) == 8 else ""

        # Get home/away teams from schedule_info (WKBL official data)
        if schedule_info and game_id in schedule_info:
            game_info = schedule_info[game_id]
            home_team_id = get_team_id(game_info["home_team"])
            away_team_id = get_team_id(game_info["away_team"])
        else:
            # Fallback: try to determine from records (less reliable)
            teams = list(set(normalize_team(r["team"]) for r in records))
            if len(teams) >= 2:
                home_team_id = get_team_id(teams[0])
                away_team_id = get_team_id(teams[1])
            elif len(teams) == 1:
                home_team_id = get_team_id(teams[0])
                away_team_id = home_team_id
            else:
                continue

        # Calculate scores
        home_score = sum(
            int(r["pts"] or 0)
            for r in records
            if get_team_id(r["team"]) == home_team_id
        )
        away_score = sum(
            int(r["pts"] or 0)
            for r in records
            if get_team_id(r["team"]) == away_team_id
        )

        # Auto-detect game type from game_id
        game_type = parse_game_type(game_id)

        database.insert_game(
            game_id=game_id,
            season_id=season_code,
            game_date=formatted_date,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            home_score=home_score,
            away_score=away_score,
            game_type=game_type,
        )
        games_inserted += 1

        for record in records:
            key = f"{record['name']}|{normalize_team(record['team'])}"
            # Try exact match first, then name-only match for team transfers
            player_id = player_id_map.get(key)
            if not player_id:
                name = record["name"]
                name_matches = player_id_by_name.get(name, [])
                if len(name_matches) == 1:
                    player_id = name_matches[0]
                else:
                    player_id = key.replace("|", "_").replace(" ", "_")
            team_id = get_team_id(record["team"])

            two_m, two_a = parse_made_attempt(record["two_pm_a"])
            three_m, three_a = parse_made_attempt(record["three_pm_a"])
            ft_m, ft_a = parse_made_attempt(record["ftm_a"])

            db_records.append(
                {
                    "game_id": game_id,
                    "player_id": player_id,
                    "team_id": team_id,
                    "minutes": record["min"],
                    "pts": int(record["pts"] or 0),
                    "off_reb": int(record.get("off") or 0),
                    "def_reb": int(record.get("def") or 0),
                    "reb": int(record["reb"] or 0),
                    "ast": int(record["ast"] or 0),
                    "stl": int(record["stl"] or 0),
                    "blk": int(record["blk"] or 0),
                    "tov": int(record["to"] or 0),
                    "pf": int(record["pf"] or 0),
                    "fgm": two_m + three_m,
                    "fga": two_a + three_a,
                    "tpm": three_m,
                    "tpa": three_a,
                    "ftm": ft_m,
                    "fta": ft_a,
                    "two_pm": two_m,
                    "two_pa": two_a,
                }
            )

    logger.info(f"Saved {games_inserted} games")
    if db_records:
        database.bulk_insert_player_games(db_records)
        logger.info(f"Saved {len(db_records)} player-game records to database")

    # Save team records if available
    # Note: The team record API returns wrong team names but correct stats
    # We use schedule_info to map the correct teams:
    # - API Position 1 (first record) = Away team
    # - API Position 2 (second record) = Home team
    if team_records and schedule_info:
        team_games_saved = 0
        # Group records by game_id
        records_by_game = {}
        for record in team_records:
            game_id = record.get("_game_id")
            if not game_id:
                continue
            if game_id not in records_by_game:
                records_by_game[game_id] = []
            records_by_game[game_id].append(record)

        for game_id, records in records_by_game.items():
            if len(records) != 2:
                continue

            game_info = schedule_info.get(game_id)
            if not game_info:
                continue

            # API returns: [away_team_stats, home_team_stats]
            away_team_id = get_team_id(game_info["away_team"])
            home_team_id = get_team_id(game_info["home_team"])

            # First record = away team stats
            database.insert_team_game(game_id, away_team_id, 0, records[0])
            team_games_saved += 1

            # Second record = home team stats
            database.insert_team_game(game_id, home_team_id, 1, records[1])
            team_games_saved += 1

        logger.info(f"Saved {team_games_saved} team-game records to database")


def _save_future_games(args, schedule_info, end_date, season_code):
    """Save future games (after end_date) with NULL scores to database.

    Args:
        args: Command line arguments
        schedule_info: Dict mapping game_id to {date, home_team, away_team}
        end_date: Current end date (YYYYMMDD)
        season_code: Season code (e.g., '046')
    """
    future_games = []
    for game_id, info in schedule_info.items():
        if info["date"] > end_date and info["home_team"] and info["away_team"]:
            future_games.append((game_id, info))

    if not future_games:
        logger.info("No future games to save")
        return

    games_saved = 0
    for game_id, info in future_games:
        date = info["date"]
        formatted_date = f"{date[:4]}-{date[4:6]}-{date[6:8]}" if len(date) == 8 else ""
        home_team_id = get_team_id(info["home_team"])
        away_team_id = get_team_id(info["away_team"])
        game_type = parse_game_type(game_id)

        database.insert_game(
            game_id=game_id,
            season_id=season_code,
            game_date=formatted_date,
            home_team_id=home_team_id,
            away_team_id=away_team_id,
            home_score=None,  # Future game - no score
            away_score=None,
            game_type=game_type,
        )
        games_saved += 1

    logger.info(f"Saved {games_saved} future (scheduled) games to database")

    # Generate predictions for future games
    _generate_predictions_for_games(future_games, season_code)


def _generate_predictions_for_games(games, season_code):
    """Generate and save predictions for future games.

    Uses player recent game stats to predict performance.
    Algorithm:
    - Base prediction = (recent 5 avg * 0.6) + (recent 10 avg * 0.4)
    - Home bonus: +5%, Away penalty: -3%
    - Trend bonus: +/-5% if recent 5 avg differs from season avg by >10%
    - Confidence interval: ±1 standard deviation

    Args:
        games: List of (game_id, info) tuples
        season_code: Season code (e.g., '046')
    """

    if not games:
        return

    logger.info(f"Generating predictions for {len(games)} future games...")

    for game_id, info in games:
        home_team_id = get_team_id(info["home_team"])
        away_team_id = get_team_id(info["away_team"])

        # Skip if already has predictions
        if database.has_game_predictions(game_id):
            continue

        all_predictions = []

        # Generate predictions for both teams
        for team_id, is_home in [(home_team_id, True), (away_team_id, False)]:
            players = database.get_team_players(team_id, season_code)
            if not players:
                continue

            # Select top 5 players by PIR as starters
            lineup = _select_optimal_lineup(players[:10])  # Consider top 10 for lineup

            for player in lineup:
                pred = _calculate_player_prediction(
                    player["id"], season_code, player, is_home
                )
                all_predictions.append(
                    {
                        "player_id": player["id"],
                        "team_id": team_id,
                        "is_starter": 1,
                        "predicted_pts": pred["pts"]["pred"],
                        "predicted_pts_low": pred["pts"]["low"],
                        "predicted_pts_high": pred["pts"]["high"],
                        "predicted_reb": pred["reb"]["pred"],
                        "predicted_reb_low": pred["reb"]["low"],
                        "predicted_reb_high": pred["reb"]["high"],
                        "predicted_ast": pred["ast"]["pred"],
                        "predicted_ast_low": pred["ast"]["low"],
                        "predicted_ast_high": pred["ast"]["high"],
                    }
                )

        if not all_predictions:
            continue

        # Calculate team predictions
        home_preds = [p for p in all_predictions if p["team_id"] == home_team_id]
        away_preds = [p for p in all_predictions if p["team_id"] == away_team_id]

        home_total_pts = sum(p["predicted_pts"] for p in home_preds)
        away_total_pts = sum(p["predicted_pts"] for p in away_preds)

        # Get team standings for win probability
        standings = database.get_team_standings(season_code)
        home_standing = next(
            (s for s in standings if s["team_id"] == home_team_id), None
        )
        away_standing = next(
            (s for s in standings if s["team_id"] == away_team_id), None
        )

        home_win_prob, away_win_prob = _calculate_win_probability(
            home_preds, away_preds, home_standing, away_standing
        )

        team_prediction = {
            "home_win_prob": home_win_prob,
            "away_win_prob": away_win_prob,
            "home_predicted_pts": home_total_pts,
            "away_predicted_pts": away_total_pts,
        }

        database.save_game_predictions(game_id, all_predictions, team_prediction)

    logger.info(f"Generated predictions for {len(games)} games")


def _select_optimal_lineup(players):
    """Select optimal 5 players considering position diversity.

    Args:
        players: List of player dicts sorted by PIR

    Returns:
        List of 5 players
    """
    if len(players) <= 5:
        return players

    lineup = []
    positions = {"G": 0, "F": 0, "C": 0}
    limits = {"G": 2, "F": 2, "C": 1}

    # First pass: select by position
    for player in players:
        if len(lineup) >= 5:
            break
        pos = (player.get("pos") or "F")[0]  # First char: G, F, or C
        if positions[pos] < limits[pos]:
            lineup.append(player)
            positions[pos] += 1

    # Second pass: fill remaining with best available
    for player in players:
        if len(lineup) >= 5:
            break
        if player not in lineup:
            lineup.append(player)

    return lineup[:5]


def _calculate_player_prediction(player_id, season_code, player_stats, is_home):
    """Calculate predicted stats for a player.

    Args:
        player_id: Player ID
        season_code: Season code
        player_stats: Player's season averages
        is_home: Whether this is a home game

    Returns:
        Dict with pts/reb/ast predictions including confidence intervals
    """
    import math

    recent_games = database.get_player_recent_games(player_id, season_code, 10)

    prediction = {
        "pts": {"pred": 0, "low": 0, "high": 0},
        "reb": {"pred": 0, "low": 0, "high": 0},
        "ast": {"pred": 0, "low": 0, "high": 0},
    }

    if not recent_games:
        # Use season averages
        for stat in ["pts", "reb", "ast"]:
            val = player_stats.get(stat) or 0
            prediction[stat] = {
                "pred": val,
                "low": max(0, val * 0.7),
                "high": val * 1.3,
            }
        return prediction

    for stat in ["pts", "reb", "ast"]:
        values = [g[stat] or 0 for g in recent_games]
        recent5 = values[:5] if len(values) >= 5 else values
        recent10 = values[:10]

        avg5 = sum(recent5) / len(recent5) if recent5 else 0
        avg10 = sum(recent10) / len(recent10) if recent10 else 0

        # Weighted average
        base_pred = avg5 * 0.6 + avg10 * 0.4

        # Home/away adjustment
        if is_home:
            base_pred *= 1.05
        else:
            base_pred *= 0.97

        # Trend bonus
        season_avg = player_stats.get(stat) or 0
        if season_avg > 0:
            if avg5 > season_avg * 1.1:
                base_pred *= 1.05  # Hot streak
            elif avg5 < season_avg * 0.9:
                base_pred *= 0.95  # Cold streak

        # Standard deviation for confidence interval
        if len(values) > 1:
            variance = sum((v - avg10) ** 2 for v in values) / len(values)
            std_dev = math.sqrt(variance) if variance > 0 else base_pred * 0.15
        else:
            std_dev = base_pred * 0.15

        prediction[stat] = {
            "pred": round(base_pred, 1),
            "low": round(max(0, base_pred - std_dev), 1),
            "high": round(base_pred + std_dev, 1),
        }

    return prediction


def _calculate_win_probability(home_preds, away_preds, home_standing, away_standing):
    """Calculate win probability for each team.

    Args:
        home_preds: List of home team player predictions
        away_preds: List of away team player predictions
        home_standing: Home team standing dict
        away_standing: Away team standing dict

    Returns:
        Tuple of (home_win_prob, away_win_prob) as percentages
    """

    # Base strength from predicted stats
    def calc_strength(preds, standing, is_home):
        strength = sum(
            p["predicted_pts"] + p["predicted_reb"] * 0.5 + p["predicted_ast"] * 0.7
            for p in preds
        )

        if standing:
            win_pct = standing.get("win_pct") or 0.5
            strength *= 0.5 + win_pct

            # Home/away specific
            if is_home:
                home_wins = standing.get("home_wins") or 0
                home_losses = standing.get("home_losses") or 0
                home_total = home_wins + home_losses
                if home_total > 0:
                    home_pct = home_wins / home_total
                    strength *= 0.8 + home_pct * 0.4
            else:
                away_wins = standing.get("away_wins") or 0
                away_losses = standing.get("away_losses") or 0
                away_total = away_wins + away_losses
                if away_total > 0:
                    away_pct = away_wins / away_total
                    strength *= 0.8 + away_pct * 0.4

        return strength

    home_strength = calc_strength(home_preds, home_standing, True)
    away_strength = calc_strength(away_preds, away_standing, False)

    total = home_strength + away_strength
    if total > 0:
        home_prob = round(home_strength / total * 100, 1)
        away_prob = round(100 - home_prob, 1)
    else:
        home_prob, away_prob = 50.0, 50.0

    return home_prob, away_prob


def _ingest_single_season(args, season_code, season_label, active_players, game_types):
    """Ingest data for a single season.

    Args:
        args: Command line arguments
        season_code: WKBL season code (e.g., '046')
        season_label: Season label (e.g., '2025-26')
        active_players: List of active players for enrichment
        game_types: List of game type codes to fetch

    Returns:
        Tuple of (records, team_records, game_items) for the season
    """
    logger.info(f"Processing season {season_label} (code: {season_code})")

    # Set up args for this season
    meta = get_season_meta_by_code(season_code)
    args.first_game_date = meta["firstGameDate"]
    args.selected_id = meta["selectedId"]
    args.selected_game_date = meta["selectedGameDate"]
    args.season_label = season_label

    # Calculate end date (end of season for past seasons, today for current)
    code_num = int(season_code)
    current_code = 46  # 2025-26 season
    if code_num < current_code:
        # Past season - use end of April of the following year
        season_year = 2025 - (46 - code_num)
        end_date = f"{season_year + 1}0430"
    else:
        # Current season - use today or provided end_date
        end_date = args.end_date or datetime.date.today().strftime("%Y%m%d")

    # Get existing game IDs for incremental update
    existing_game_ids = None
    if args.save_db and not args.force_refresh:
        existing_game_ids = database.get_existing_game_ids(season_code)
        if existing_game_ids:
            logger.info(f"Found {len(existing_game_ids)} existing games in database")

    records, team_records, game_items, schedule_info = _fetch_game_records(
        args,
        end_date,
        fetch_team_stats=args.fetch_team_stats,
        existing_game_ids=existing_game_ids,
        game_types=game_types,
    )

    # Save to database if requested
    if args.save_db and game_items:
        _save_to_db(
            args, records, team_records, active_players, game_items, schedule_info
        )

    # Save future games if requested
    if args.save_db and getattr(args, "include_future", False) and schedule_info:
        _save_future_games(args, schedule_info, end_date, season_code)

    # Fetch and save standings if requested
    if getattr(args, "fetch_standings", False) and args.save_db:
        try:
            standings = fetch_team_standings(
                args.cache_dir,
                season_code,
                use_cache=not args.no_cache,
                delay=args.delay,
            )
            if standings:
                database.bulk_insert_team_standings(season_code, standings)
                logger.info(
                    f"Saved {len(standings)} team standings for season {season_label}"
                )
        except Exception as e:
            logger.warning(f"Failed to fetch standings for {season_label}: {e}")

    return records, team_records, game_items


def _ingest_multiple_seasons(args):
    """Ingest data for multiple seasons.

    Args:
        args: Command line arguments with --all-seasons or --seasons
    """
    # Determine which seasons to process
    if args.all_seasons:
        season_codes = list(SEASON_CODES.keys())
        logger.info(f"Processing all {len(season_codes)} historical seasons")
    else:
        season_codes = args.seasons
        logger.info(f"Processing {len(season_codes)} specified seasons")

    # Validate season codes
    for code in season_codes:
        if code not in SEASON_CODES:
            raise SystemExit(
                f"Unknown season code: {code}. Valid codes: {list(SEASON_CODES.keys())}"
            )

    # Convert game_type argument to game_types list
    game_type_mapping = {
        "regular": ["01"],
        "playoff": ["04"],
        "all": ["01", "04"],
    }
    game_types = game_type_mapping.get(args.game_type, ["01"])

    # Load players once for all seasons
    if getattr(args, "load_all_players", False):
        all_players_db = load_all_players(
            args.cache_dir,
            use_cache=not args.no_cache,
            delay=args.delay,
            fetch_profiles=getattr(args, "fetch_profiles", False),
        )
        # Convert to list format for compatibility
        active_players = [{**p, "pno": pno} for pno, p in all_players_db.items()]
        logger.info(
            f"Loaded {len(active_players)} players (active + retired + foreign)"
        )
    else:
        active_players = load_active_players(
            args.cache_dir, use_cache=not args.no_cache, delay=args.delay
        )

    # Initialize database
    if args.save_db:
        database.init_db()

    # Process each season
    total_games = 0
    for season_code in sorted(season_codes):
        season_label = SEASON_CODES[season_code]
        try:
            records, team_records, game_items = _ingest_single_season(
                args, season_code, season_label, active_players, game_types
            )
            total_games += len(game_items)
            logger.info(f"Completed {season_label}: {len(game_items)} new games")
        except Exception as e:
            logger.error(f"Failed to process season {season_label}: {e}")
            continue

    logger.info(
        f"Multi-season ingest complete: {total_games} total new games across {len(season_codes)} seasons"
    )


def main():
    parser = argparse.ArgumentParser(description="WKBL Data Lab ingest")
    parser.add_argument("--first-game-date", help="e.g. 20241027")
    parser.add_argument("--selected-id", help="e.g. 04601055")
    parser.add_argument("--selected-game-date", help="e.g. 20260126")
    parser.add_argument(
        "--season-label",
        help="e.g. 2024-25 (required unless --all-seasons or --seasons)",
    )
    parser.add_argument("--cache-dir", default="data/cache", help="cache dir")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--delay", type=float, default=DELAY)
    parser.add_argument("--output", default="data/wkbl-active.json")
    parser.add_argument(
        "--active-only", action="store_true", help="include only current active players"
    )
    parser.add_argument(
        "--auto", action="store_true", help="derive season params from Data Lab home"
    )
    parser.add_argument("--end-date", help="YYYYMMDD (default: today)")
    parser.add_argument(
        "--save-db", action="store_true", help="save raw records to SQLite database"
    )
    parser.add_argument(
        "--fetch-team-stats", action="store_true", help="also fetch team statistics"
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        help="ignore existing data and re-fetch all games",
    )
    parser.add_argument(
        "--game-type",
        choices=["regular", "playoff", "all"],
        default="regular",
        help="game type to collect (default: regular)",
    )
    parser.add_argument(
        "--all-seasons",
        action="store_true",
        help="collect all historical seasons (2020-21 ~ current)",
    )
    parser.add_argument(
        "--seasons", nargs="+", help="specific season codes to collect (e.g., 044 045)"
    )
    parser.add_argument(
        "--fetch-standings",
        action="store_true",
        help="also fetch team standings/rankings",
    )
    parser.add_argument(
        "--load-all-players",
        action="store_true",
        help="load all players (active + retired + foreign) for correct pno mapping",
    )
    parser.add_argument(
        "--include-future",
        action="store_true",
        help="also save future (scheduled) games with NULL scores to database",
    )
    parser.add_argument(
        "--fetch-profiles",
        action="store_true",
        help="fetch individual player profiles for birth_date (slower, use with --load-all-players)",
    )

    args = parser.parse_args()

    # Handle multi-season collection mode
    if args.all_seasons or args.seasons:
        _ingest_multiple_seasons(args)
        return

    # Single season mode requires --season-label
    if not args.season_label:
        parser.error(
            "--season-label is required (unless using --all-seasons or --seasons)"
        )

    logger.info(f"Starting ingest for season {args.season_label}")

    end_date = _resolve_season_params(args)

    # Get existing game IDs for incremental update
    existing_game_ids = None
    if args.save_db and not args.force_refresh:
        season_code = args.selected_id[:3] if args.selected_id else None
        if season_code:
            existing_game_ids = database.get_existing_game_ids(season_code)
            if existing_game_ids:
                logger.info(
                    f"Found {len(existing_game_ids)} existing games in database"
                )

    # Convert game_type argument to game_types list
    game_type_mapping = {
        "regular": ["01"],
        "playoff": ["04"],
        "all": ["01", "04"],
    }
    game_types = game_type_mapping.get(args.game_type, ["01"])

    records, team_records, game_items, schedule_info = _fetch_game_records(
        args,
        end_date,
        fetch_team_stats=args.fetch_team_stats,
        existing_game_ids=existing_game_ids,
        game_types=game_types,
    )

    # Load players - use load_all_players if --load-all-players is set
    if args.load_all_players:
        all_players_dict = load_all_players(
            args.cache_dir,
            use_cache=not args.no_cache,
            delay=args.delay,
            fetch_profiles=getattr(args, "fetch_profiles", False),
        )
        active_players = [{**p, "pno": pno} for pno, p in all_players_dict.items()]
        logger.info(
            f"Loaded {len(active_players)} players (active + retired + foreign)"
        )
    else:
        active_players = load_active_players(
            args.cache_dir, use_cache=not args.no_cache, delay=args.delay
        )

    # Save to database if requested (only new games)
    if args.save_db and game_items:
        _save_to_db(
            args, records, team_records, active_players, game_items, schedule_info
        )

    # Save future games if requested
    if args.save_db and args.include_future and schedule_info:
        season_code = args.selected_id[:3] if args.selected_id else "046"
        _save_future_games(args, schedule_info, end_date, season_code)

    # Aggregate stats - use DB if available, otherwise use fetched records
    if args.save_db and existing_game_ids:
        # Load all games from DB for complete aggregation
        season_code = args.selected_id[:3] if args.selected_id else "046"
        logger.info("Loading full season stats from database for aggregation")
        db_stats = database.get_all_season_stats(season_code, active_only=False)

        if db_stats:
            # Convert DB stats to player format
            players = _convert_db_stats_to_players(
                db_stats, args.season_label, active_players
            )
        else:
            # Fallback to fetched records
            players = aggregate_players(
                records,
                args.season_label,
                active_players=active_players,
                include_zero=True,
            )
    else:
        players = aggregate_players(
            records, args.season_label, active_players=active_players, include_zero=True
        )

    if args.active_only:
        active_keys = {
            f"{p['name']}|{normalize_team(p['team'])}" for p in active_players
        }
        players = [
            p
            for p in players
            if f"{p['name']}|{normalize_team(p['team'])}" in active_keys
        ]
        logger.info(f"Filtered to {len(players)} active players")

    _write_output(args, players)

    # Fetch and save team standings if requested
    if args.fetch_standings:
        season_code = args.selected_id[:3] if args.selected_id else "046"
        logger.info(f"Fetching team standings for season {season_code}")
        try:
            standings = fetch_team_standings(
                args.cache_dir,
                season_code,
                use_cache=not args.no_cache,
                delay=args.delay,
            )
            if standings:
                logger.info(f"Fetched {len(standings)} team standings")
                if args.save_db:
                    database.bulk_insert_team_standings(season_code, standings)
                # Log standings summary
                for s in standings:
                    logger.info(
                        f"  {s['rank']}. {s['team_name']}: {s['wins']}-{s['losses']} ({s['win_pct']:.3f})"
                    )
            else:
                logger.warning("No standings data found")
        except Exception as e:
            logger.error(f"Failed to fetch standings: {e}")

    logger.info("Ingest complete")


if __name__ == "__main__":
    main()
