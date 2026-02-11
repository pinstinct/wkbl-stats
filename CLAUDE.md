# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WKBL Player Stats dashboard - displays Korean Women's Basketball League data in an NBA Stats-style interface. Scrapes game data from WKBL Data Lab, aggregates per-game stats into season averages, and enriches with player profile information.

## Commands

**Start server** (auto-ingests daily data):

```bash
uv sync        # first time only
uv run python3 server.py
```

- Frontend: http://localhost:8000
- API: http://localhost:8000/api/
- API Docs: http://localhost:8000/api/docs

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

**Full refresh** (re-fetch all games + future schedule):

```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --load-all-players \
  --force-refresh \
  --include-future \
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
  --fetch-standings \
  --include-future
```

### Ingest Options

| Option                              | Description                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `--auto`                            | Auto-discover season start date and game IDs from Data Lab                            |
| `--end-date YYYYMMDD`               | Aggregate stats up to this date (default: today)                                      |
| `--active-only`                     | Filter to current active players only                                                 |
| `--load-all-players`                | Load all players (active + retired + foreign) for correct pno mapping                 |
| `--save-db`                         | Save game records to SQLite database                                                  |
| `--force-refresh`                   | Ignore existing data, re-fetch all games                                              |
| `--fetch-team-stats`                | Also collect team statistics                                                          |
| `--fetch-standings`                 | Also collect team standings/rankings                                                  |
| `--game-type {regular,playoff,all}` | Game type to collect (default: regular)                                               |
| `--all-seasons`                     | Collect all historical seasons (2020-21 ~ current)                                    |
| `--seasons 044 045`                 | Collect specific seasons by code                                                      |
| `--include-future`                  | Save future (scheduled) games with NULL scores to database                            |
| `--fetch-profiles`                  | Fetch individual player profiles for birth_date (slower, use with --load-all-players) |
| `--backfill-games {id...}`          | Backfill predictions for specific game IDs                                            |
| `--fetch-play-by-play`              | Fetch play-by-play data for each game (per-game, slower)                              |
| `--fetch-shot-charts`               | Fetch shot chart data for each game (per-game, slower)                                |
| `--fetch-team-category-stats`       | Fetch team category rankings (12 categories per season)                               |
| `--fetch-head-to-head`              | Fetch head-to-head records for all team pairs (15 pairs per season)                   |
| `--fetch-game-mvp`                  | Fetch game MVP data for the season                                                    |
| `--fetch-quarter-scores`            | Fetch quarter scores and venue via Team Analysis (15 requests per season)             |

### Testing

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ --cov=tools --cov-report=term-missing

# Run specific test file
uv run pytest tests/test_database.py -v
uv run pytest tests/test_api.py -v
```

**Test coverage (93 tests total):**

- `test_database.py`: Database operations (42 tests)
  - Database init, CRUD operations, season stats, boxscore, standings, predictions
  - Team game operations, game queries, bulk operations, future game predictions
  - Quarter scores, play-by-play, shot charts, team category stats, head-to-head, game MVP
- `test_api.py`: REST API endpoints (30 tests)
  - Health, players, teams, games, seasons, standings, leaders, search, compare
- `test_parsers.py`: Parser functions (16 tests)
  - Play-by-play, head-to-head, shot chart, player profile, event type mapping
- `test_ingest_predictions.py`: Ingest prediction backfill (3 tests)
- `test_refactor_p0.py`: Advanced stats and season resolver (2 tests)

## Frontend Pages (SPA)

Hash-based routing system for single-page application.

| URL              | Page          | Description                                                  |
| ---------------- | ------------- | ------------------------------------------------------------ |
| `#/`             | Home          | Game prediction with optimal starting lineup recommendations |
| `#/players`      | Players       | Player list with filters, sorting, search                    |
| `#/players/{id}` | Player Detail | Career summary, season stats, trend chart, game log          |
| `#/teams`        | Teams         | Standings table (rank, W-L, home/away)                       |
| `#/teams/{id}`   | Team Detail   | Roster, recent games                                         |
| `#/games`        | Games         | Game cards with scores                                       |
| `#/games/{id}`   | Boxscore      | Full box score (home/away player stats, TS%, PIR, +/-)       |
| `#/leaders`      | Leaders       | Top 5 in PTS/REB/AST/STL/BLK                                 |
| `#/compare`      | Compare       | Player comparison tool (up to 4 players)                     |
| `#/schedule`     | Schedule      | Upcoming and recent games with D-day countdown               |
| `#/predict`      | Predict       | Individual player performance prediction                     |

**Global Search**: Press `Ctrl+K` (or `Cmd+K` on Mac) to open global search modal.

## Architecture

**GitHub Pages (Static Hosting) - Default:**

```
Frontend SPA (src/app.js)
       ↓
   src/db.js
       ↓
sql.js (WASM) ← fetch(data/wkbl.db)
```

**Server Mode (Render/Local):**

```
server.py (FastAPI) ─┬─ /api/* → tools/api.py (REST API)
                     └─ /* → Static files (index.html, src/, data/)
                           ↓
                     Frontend SPA (src/app.js)
                           ↓
                     Hash-based routing → API calls → Render views
```

**Fallback Priority:** Local DB (sql.js) → JSON file (API 폴백 제거됨, 2026-02-06)

**Data Pipeline:**

```
tools/ingest_wkbl.py → SQLite DB (data/wkbl.db) → JSON (data/wkbl-active.json)
```

## Key Files

**Frontend (Static Hosting):**

- `index.html` - SPA with all view templates (includes Chart.js, sql.js CDN)
- `src/app.js` - Frontend: routing, data fetching, view rendering, charts
- `src/db.js` - Browser SQLite module (sql.js wrapper for client-side queries)
- `src/styles.css` - Responsive styles for all pages
- `data/wkbl.db` - SQLite database (fetched by browser for static hosting)
- `data/wkbl-active.json` - Generated player stats (JSON fallback)

**Backend (Server Mode):**

- `server.py` - FastAPI server + daily ingest orchestration
- `tools/api.py` - REST API endpoints (players, teams, games, compare, search)
- `tools/ingest_wkbl.py` - Web scraper and data aggregation pipeline
- `tools/database.py` - SQLite schema and database operations
- `tools/config.py` - Centralized configuration (URLs, paths, settings)

**Data & Config:**

- `data/cache/` - HTTP response cache (reduces network requests)
- `pyproject.toml` - Project dependencies (managed by uv)
- `uv.lock` - Locked dependency versions
- `Dockerfile` - Docker build for Render deployment
- `render.yaml` - Render service configuration
- `requirements.txt` - Python dependencies for Docker/Render
- `.dockerignore` - Files excluded from Docker build

## REST API

API documentation available at `/api/docs` (Swagger UI) or `/api/redoc` (ReDoc).

| Endpoint                           | Description                     |
| ---------------------------------- | ------------------------------- |
| `GET /api/players`                 | All players with season stats   |
| `GET /api/players/compare`         | Compare 2-4 players (ids param) |
| `GET /api/players/{id}`            | Player detail with career stats |
| `GET /api/players/{id}/gamelog`    | Player's game log               |
| `GET /api/players/{id}/highlights` | Career/season highlights        |
| `GET /api/teams`                   | All teams                       |
| `GET /api/teams/{id}`              | Team detail with roster         |
| `GET /api/games`                   | Game list                       |
| `GET /api/games/{id}`              | Full game boxscore              |
| `GET /api/seasons`                 | All seasons                     |
| `GET /api/seasons/{id}/standings`  | Team standings                  |
| `GET /api/leaders`                 | Statistical leaders             |
| `GET /api/leaders/all`             | Leaders for all categories      |
| `GET /api/search`                  | Global search (players, teams)  |
| `GET /api/health`                  | Health check                    |

Query parameters:

- `season`: Season code (e.g., `046` for 2025-26) or `all` for all seasons
- `team`: Team ID filter (e.g., `kb`, `samsung`)
- `category`: Leader category (`pts`, `reb`, `ast`, `stl`, `blk`, `fgp`, `tpp`, `ftp`)
- `ids`: Comma-separated player IDs (for compare)
- `q`: Search query (for search)
- `limit`, `offset`: Pagination

## Database Schema

```
seasons ─┐
         │
teams ───┼──→ games ──→ player_games (per-game player stats)
         │        └──→ team_games (per-game team stats)
         │        └──→ game_predictions (player stat predictions)
         │        └──→ game_team_predictions (team win predictions)
         │        └──→ play_by_play (play-by-play events)
         │        └──→ shot_charts (shot chart data)
         │
         ├──→ team_standings (season standings)
         ├──→ team_category_stats (team category rankings)
         ├──→ head_to_head (team H2H records)
         └──→ game_mvp (game MVP records)
players ─┘
event_types (master table for PBP event codes)
```

Key tables:

- `seasons`: Season info (id=046, label=2025-26, start_date, end_date)
- `teams`: Team info (id=kb, name=KB스타즈, short_name=KB)
- `players`: Player info (id=pno, name, team_id, position, height)
- `games`: Game metadata (id=04601055, date, home/away teams, scores, quarter scores, venue, game_type)
- `player_games`: Per-game player stats (MIN, PTS, REB, AST, shooting splits)
- `team_games`: Per-game team stats (fast_break_pts, paint_pts, two_pts, three_pts)
- `team_standings`: Season standings (rank, wins, losses, win_pct, home/away records, streak, last5)
- `game_predictions`: Player stat predictions (predicted_pts/reb/ast with confidence intervals)
- `game_team_predictions`: Team win probability predictions (home/away win_prob, predicted_pts)
- `play_by_play`: Play-by-play events (quarter, game_clock, event_type, team_id, player_id, scores)
- `shot_charts`: Shot chart data (x, y coordinates, made/missed, player, team_id, quarter, shot_zone)
- `event_types`: Event type master table (code, name_kr, category: scoring/rebounding/defense/etc.)
- `team_category_stats`: Team category rankings (pts, reb, ast, etc. per season)
- `head_to_head`: Head-to-head records between teams (scores, venue, winner)
- `game_mvp`: Game MVP records (player stats, evaluation score, rank)
- `_meta_descriptions`: Table/column descriptions metadata

**Note:** Predictions are generated during ingest (`--include-future`) and stored in DB tables. Browser reads from DB via sql.js.

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

| Season  | Code |
| ------- | ---- |
| 2025-26 | 046  |
| 2024-25 | 045  |
| 2023-24 | 044  |
| 2022-23 | 043  |
| 2021-22 | 042  |
| 2020-21 | 041  |

## Game ID Structure

Format: `SSSTTGGG` (e.g., `04601055`)

- `SSS`: Season code (046 = 2025-26)
- `TT`: Game type (01 = regular, 04 = playoff)
- `GGG`: Game number (001 = all-star, 002+ = regular games)

## Development

### Render Deployment (Server Mode)

Render provides server-based API with FastAPI. Use this for server-side features or if you prefer traditional API architecture.

**Setup:**

1. Go to [render.com](https://render.com) and connect GitHub repo
2. Create **New Web Service** → Select repo
3. Settings: Runtime = Docker, Instance Type = Free
4. Deploy

**Deployment Files:**

- `Dockerfile` - Docker build configuration (Python 3.12 + uvicorn)
- `render.yaml` - Render service configuration
- `requirements.txt` - Python dependencies (fastapi, uvicorn)
- `.dockerignore` - Excludes cache files from Docker build
- `tools/config.py` - Reads `PORT` from environment variable

**Free Tier Limitations:**

- Server sleeps after 15 minutes of inactivity
- First request after sleep takes 10-30 seconds (cold start)
- Data persists in Docker image (from repo), not runtime changes

**Updating Data on Render:**

1. Run GitHub Action to update repo data (see below)
2. Render auto-redeploys on push, or manually trigger deploy

### GitHub Actions (Data Updates)

| Workflow               | Trigger         | Description                                             |
| ---------------------- | --------------- | ------------------------------------------------------- |
| `update-data.yml`      | Daily (6AM KST) | Update current season data + future games + predictions |
| `update-data-full.yml` | Manual only     | Fetch all seasons including retired players             |

**Run data update**: GitHub → Actions → Select workflow → "Run workflow"

Data files committed by Actions:

- `data/wkbl-active.json` - Player season averages
- `data/wkbl.db` - SQLite database (game records, future schedules)

### GitHub Pages (Static Hosting - Recommended)

GitHub Pages now provides **full functionality** using sql.js (WebAssembly SQLite).
The browser fetches `data/wkbl.db` and runs all queries client-side.

**How it works:**

1. `sql.js` WASM module loaded from CDN (jsdelivr)
2. `data/wkbl.db` fetched via HTTP
3. All queries run in browser (no server needed)

**CDN Dependencies:**

```html
<!-- Chart.js for trend charts -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<!-- sql.js for browser SQLite -->
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js"></script>
```

**Setup:**

1. GitHub → Settings → Pages → Source: Deploy from branch (main)
2. Push to main branch triggers automatic deployment

**Local testing (simulates GitHub Pages):**

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

**All features work:** Player stats, game logs, box scores, standings, leaders, search, comparison.

**Troubleshooting:** See `docs/static-hosting-troubleshooting.md` for common issues and solutions.

### Pre-commit Hooks

This project uses pre-commit for code quality checks. Hooks run automatically on every commit.

**Setup:**

```bash
uv sync
uv run pre-commit install
```

**Manual run:**

```bash
uv run pre-commit run --all-files
```

**Configured hooks:**

| Hook        | Purpose                           |
| ----------- | --------------------------------- |
| ruff-check  | Linting (includes import sorting) |
| ruff-format | Code formatting (replaces black)  |
| mypy        | Type checking                     |
| bandit      | Security analysis                 |

## Branches

| Branch       | Description                                          |
| ------------ | ---------------------------------------------------- |
| `main`       | Static hosting with sql.js (GitHub Pages compatible) |
| `server-api` | Server-based API version (FastAPI + REST endpoints)  |

## Known Limitations

- **Playoff data unavailable**: WKBL Data Lab does not provide boxscore data for playoff games. Game IDs with type code "04" (e.g., `04604010`) return empty player records. Only regular season and all-star games have detailed statistics.
- **All-star games**: Game number "001" is always treated as all-star regardless of type code.
- **is_active field maintenance**: The `players.is_active` field is set by the ingest script based on WKBL's official active roster (not game records). Active players include those with no game records (injured, benched, rookies). If the field is incorrect, the player list will appear empty on GitHub Pages (static hosting).

## Notes

- Dependencies managed with uv (`uv sync` to install)
- Ingest script adds 0.15s delays between requests to be respectful to WKBL servers
- Incremental updates: only fetches games not already in database
- HTTP responses are cached in `data/cache/` to avoid redundant network requests
- **Static hosting**: Uses sql.js (WebAssembly) to run SQLite queries in browser
- **Fallback chain**: Local DB (sql.js) → JSON file (API 폴백 제거됨)
- Frontend falls back to `data/wkbl-active.json` when local DB is unavailable
- **Player ID tracking**: Use `--load-all-players` to load all 700+ players (active, retired, foreign) and correctly map player IDs (pno). Without this flag, retired players in historical data may get incorrect placeholder IDs.
- Player IDs (pno) are consistent across seasons, enabling tracking of player career stats and team transfer history.

## Documentation

| Document                                 | Description                                                |
| ---------------------------------------- | ---------------------------------------------------------- |
| `docs/data-sources.md`                   | WKBL Data Lab API endpoints and data schemas               |
| `docs/project-roadmap.md`                | Feature roadmap and development plans                      |
| `docs/static-hosting-troubleshooting.md` | GitHub Pages issues and solutions (sql.js, CDN, is_active) |
