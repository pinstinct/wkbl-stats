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

**Manual data ingest**:
```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --end-date YYYYMMDD \
  --active-only \
  --output data/wkbl-active.json
```

Options:
- `--auto`: Auto-discover season start date and game IDs from Data Lab
- `--end-date`: Aggregate stats up to this date
- `--active-only`: Filter to current active players only

## Architecture

```
server.py → runs daily ingest check → tools/ingest_wkbl.py
    ↓
Fetches game IDs from datalab.wkbl.or.kr/game/list/month
    ↓
Scrapes boxscores from record_player.asp for each game
    ↓
Aggregates into season averages
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
- `src/app.js` - Frontend state management, filtering, sorting, rendering
- `data/wkbl-active.json` - Generated player stats (primary data file)
- `data/cache/ingest_status.json` - Tracks last ingest date to avoid redundant runs

## Data Sources

External endpoints (documented in `docs/data-sources.md`):
- `datalab.wkbl.or.kr/game/list/month` - Game calendar with game IDs
- `datalab.wkbl.or.kr:9001/data_lab/record_player.asp` - Per-game boxscores
- `wkbl.or.kr/player/player_list.asp` - Active player roster
- `wkbl.or.kr/player/detail.asp` - Individual player profiles

## Player Data Schema

```json
{
  "id": "wkbl-001",
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
  "fgp": 0.438,
  "tpp": 0.351,
  "ftp": 0.822
}
```

## Notes

- No external dependencies - uses Python 3 standard library only
- Ingest script adds 0.15s delays between requests to be respectful to WKBL servers
- Frontend falls back to `data/sample.json` if `wkbl-active.json` unavailable
