# SQL Query Contract (P3-2)

Updated: 2026-02-09

목적: `tools/api.py`와 `src/db.js`의 유사 조회 결과가 핵심 필드 기준으로 동일한 의미를 유지하도록 계약을 명시한다.

## 1) Players Contract (`GET /players`)

### Query params

- `season`: 시즌 코드 또는 `all`
- `team`: 팀 ID (optional)
- `active_only`: 기본 `true`
- `include_no_games`: 기본 `false`

### Behavioral contract

- `season` 지정 시 집계는 해당 시즌 경기(`games.season_id`) 기준.
- `include_no_games=true`이면 `gp=0` 선수 포함.
- `active_only=true`이면 현역만 포함.
- `active_only=false` + `include_no_games=true`일 때:
  - 요청 시즌에 출전 기록이 없으면
  - `<= season` 범위의 마지막 출전팀으로 팀을 추론한다.
- 응답 선수는 `id` 중복이 없어야 한다.

### Core stat fields

- `gp`, `min`, `pts`, `reb`, `ast`, `stl`, `blk`, `tov`
- `fgp`, `tpp`, `ftp`
- `ts_pct`, `efg_pct`, `pir`, `ast_to`
- `pts36`, `reb36`, `ast36`

## 2) Team Detail Contract (`GET /teams/{id}`)

### Query params

- `season`: 시즌 코드 (required, `all` 불가)

### Behavioral contract

- `roster`는 아래 합집합:
  - 해당 시즌에 팀 소속으로 출전한 선수
  - 현재 팀 소속 현역 선수 중 해당 시즌 `gp=0` 선수
- `recent_games`는 완료 경기만 포함:
  - `home_score IS NOT NULL`
  - `away_score IS NOT NULL`
- `recent_games` 정렬은 최신일자 우선(`game_date DESC`).

### Recent game fields

- `game_id`, `date`, `opponent`, `is_home`, `result`, `score`

## 3) Performance Index Contract (SQLite)

다음 인덱스는 시즌/팀/선수 상세 조회 경로에서 유지되어야 한다.

- `idx_player_games_team_game (team_id, game_id)`
- `idx_player_games_player_game (player_id, game_id)`
- `idx_games_season_date_id (season_id, game_date, id)`

## 4) Regression tests

- `tests/test_api.py`
  - `test_get_players_contract_fixture`
  - `test_get_players_include_no_games_inactive_historical_team_inference`
  - `test_get_team_detail_roster_includes_active_no_games_player`
  - `test_get_team_detail_recent_games_excludes_future_games`
  - `test_get_team_detail_contract_fixture`
- `tests/test_database.py`
  - `test_init_db_creates_performance_indexes`
- Fixture:
  - `tests/fixtures/api_contracts.json`
