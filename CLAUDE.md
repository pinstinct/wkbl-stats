# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WKBL Player Stats dashboard - displays Korean Women's Basketball League data in an NBA Stats-style interface. Scrapes game data from WKBL Data Lab, aggregates per-game stats into season averages, and enriches with player profile information.

## Commands

**Start server** (auto-ingests daily data):
```bash
python3 server.py
```
Access at http://localhost:8000

**Manual data ingest** (incremental - only fetches new games):
```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --load-all-players \
  --active-only \
  --output data/wkbl-active.json
```

**Full refresh** (re-fetch all games):
```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --load-all-players \
  --force-refresh \
  --active-only \
  --output data/wkbl-active.json
```

**Full historical data** (all seasons, all game types, all players):
```bash
python3 tools/ingest_wkbl.py \
  --auto \
  --save-db \
  --load-all-players \
  --all-seasons \
  --game-type all \
  --fetch-team-stats \
  --fetch-standings
```

### Ingest Options

| Option | Description |
|--------|-------------|
| `--auto` | Auto-discover season start date and game IDs from Data Lab |
| `--end-date YYYYMMDD` | Aggregate stats up to this date (default: today) |
| `--active-only` | Filter to current active players only |
| `--load-all-players` | Load all players (active + retired + foreign) for correct pno mapping |
| `--save-db` | Save game records to SQLite database |
| `--force-refresh` | Ignore existing data, re-fetch all games |
| `--fetch-team-stats` | Also collect team statistics |
| `--fetch-standings` | Also collect team standings/rankings |
| `--game-type {regular,playoff,all}` | Game type to collect (default: regular) |
| `--all-seasons` | Collect all historical seasons (2020-21 ~ current) |
| `--seasons 044 045` | Collect specific seasons by code |

## Architecture

```
server.py → runs daily ingest check → tools/ingest_wkbl.py
    ↓
Fetches game IDs from datalab.wkbl.or.kr/game/list/month
    ↓
Checks SQLite DB for existing games (skip if already stored)
    ↓
Scrapes boxscores from record_player.asp for NEW games only
    ↓
Saves to SQLite database (data/wkbl.db)
    ↓
Aggregates into season averages (from DB)
    ↓
Enriches with player profiles (position, height) from wkbl.or.kr
    ↓
Outputs data/wkbl-active.json
    ↓
Frontend (src/app.js) loads JSON and renders interactive table
```

## Key Files

- `server.py` - HTTP server + daily ingest orchestration
- `tools/ingest_wkbl.py` - Web scraper and data aggregation pipeline
- `tools/database.py` - SQLite schema and database operations
- `tools/config.py` - Centralized configuration (URLs, paths, settings)
- `src/app.js` - Frontend state management, filtering, sorting, rendering
- `data/wkbl.db` - SQLite database (game-by-game records)
- `data/wkbl-active.json` - Generated player stats (primary data file for frontend)
- `data/cache/` - HTTP response cache (reduces network requests)

## Database Schema

```
seasons ─┐
         │
teams ───┼──→ games ──→ player_games (per-game player stats)
         │        └──→ team_games (per-game team stats)
         │
         └──→ team_standings (season standings)
players ─┘
```

Key tables:
- `seasons`: Season info (id=046, label=2025-26, start_date, end_date)
- `teams`: Team info (id=kb, name=KB스타즈, short_name=KB)
- `players`: Player info (id=pno, name, team_id, position, height)
- `games`: Game metadata (id=04601055, date, home/away teams, scores, game_type)
- `player_games`: Per-game player stats (MIN, PTS, REB, AST, shooting splits)
- `team_games`: Per-game team stats (fast_break_pts, paint_pts, two_pts, three_pts)
- `team_standings`: Season standings (rank, wins, losses, win_pct, home/away records, streak)
- `_meta_descriptions`: Table/column descriptions metadata

See `docs/data-sources.md` for detailed column definitions.

## Data Sources

External endpoints (documented in `docs/data-sources.md`):
- `datalab.wkbl.or.kr/game/list/month` - Game calendar with game IDs
- `datalab.wkbl.or.kr:9001/data_lab/record_player.asp` - Per-game boxscores
- `datalab.wkbl.or.kr:9001/data_lab/record_team.asp` - Per-game team stats
- `wkbl.or.kr/player/player_list.asp` - Active player roster
- `wkbl.or.kr/player/detail.asp` - Individual player profiles
- `wkbl.or.kr/game/ajax/ajax_team_rank.asp` - Team standings (POST)
- `wkbl.or.kr/game/sch/inc_list_1_new.asp` - Game schedule by month

## Player Data Schema

```json
{
  "id": "095123",
  "name": "선수명",
  "team": "팀명",
  "pos": "G/F/C",
  "height": "170cm",
  "season": "2025-26",
  "gp": 30,
  "min": 31.2,
  "pts": 15.8,
  "reb": 4.1,
  "ast": 6.3,
  "stl": 1.9,
  "blk": 0.2,
  "tov": 2.1,
  "fgp": 0.438,
  "tpp": 0.351,
  "ftp": 0.822,
  "ts_pct": 0.542,
  "efg_pct": 0.489,
  "ast_to": 3.0,
  "pts36": 18.2,
  "reb36": 4.7,
  "ast36": 7.3,
  "pir": 12.5,
  "dd_cats": 2
}
```

## Season Codes

| Season | Code |
|--------|------|
| 2025-26 | 046 |
| 2024-25 | 045 |
| 2023-24 | 044 |
| 2022-23 | 043 |
| 2021-22 | 042 |
| 2020-21 | 041 |

## Game ID Structure

Format: `SSSTTGGG` (e.g., `04601055`)
- `SSS`: Season code (046 = 2025-26)
- `TT`: Game type (01 = regular, 04 = playoff)
- `GGG`: Game number (001 = all-star, 002+ = regular games)

## Development

### Pre-commit Hooks

This project uses pre-commit for code quality checks. Hooks run automatically on every commit.

**Setup:**
```bash
pip install pre-commit
pre-commit install
```

**Manual run:**
```bash
pre-commit run --all-files
```

**Configured hooks:**

| Hook | Purpose |
|------|---------|
| ruff-check | Linting (includes import sorting) |
| ruff-format | Code formatting (replaces black) |
| mypy | Type checking |
| bandit | Security analysis |

## Known Limitations

- **Playoff data unavailable**: WKBL Data Lab does not provide boxscore data for playoff games. Game IDs with type code "04" (e.g., `04604010`) return empty player records. Only regular season and all-star games have detailed statistics.
- **All-star games**: Game number "001" is always treated as all-star regardless of type code.

## Notes

- No external dependencies for runtime - uses Python 3 standard library only
- Ingest script adds 0.15s delays between requests to be respectful to WKBL servers
- Incremental updates: only fetches games not already in database
- HTTP responses are cached in `data/cache/` to avoid redundant network requests
- Frontend falls back to `data/sample.json` if `wkbl-active.json` unavailable
- **Player ID tracking**: Use `--load-all-players` to load all 700+ players (active, retired, foreign) and correctly map player IDs (pno). Without this flag, retired players in historical data may get incorrect placeholder IDs.
- Player IDs (pno) are consistent across seasons, enabling tracking of player career stats and team transfer history.
