# Test Coverage 95% 달성 계획

## Context

현재 테스트 커버리지 80% (3343 stmts, 671 missed, 408 tests). 목표 95% 달성을 위해 **504줄 이상** 추가 커버 필요. 소스 코드 수정 없이 테스트 코드만 추가/수정.

### 현재 커버리지

| File                  | Stmts | Miss | Cover | 비고          |
| --------------------- | ----- | ---- | ----- | ------------- |
| tools/ingest_wkbl.py  | 1609  | 600  | 63%   | **주요 타겟** |
| tools/api.py          | 655   | 40   | 94%   |               |
| tools/database.py     | 364   | 11   | 97%   |               |
| tools/predict.py      | 170   | 9    | 95%   |               |
| tools/lineup.py       | 206   | 6    | 97%   |               |
| tools/stats.py        | 276   | 5    | 98%   |               |
| tools/config.py       | 53    | 0    | 100%  |               |
| tools/season_utils.py | 10    | 0    | 100%  |               |

---

## Phase 1: `_save_to_db()` (~230 lines, 15 tests)

**파일 생성:** `tests/test_ingest_save_to_db.py`
**타겟:** `ingest_wkbl._save_to_db()` (lines 2346-2604, ~258 uncovered lines)

단일 함수 중 미커버 최대. DB 함수 호출만 하는 orchestration이라 mock으로 테스트 가능.

| #   | 테스트                                        | 커버 대상                                |
| --- | --------------------------------------------- | ---------------------------------------- |
| 1   | `test_save_to_db_inserts_season_and_teams`    | init_db, insert_season, insert_team 호출 |
| 2   | `test_save_to_db_builds_player_id_map`        | active_players pno → player_id 매핑      |
| 3   | `test_save_to_db_unique_name_fallback`        | game_records만 있는 선수 → name 1건 매치 |
| 4   | `test_save_to_db_placeholder_id`              | 0건/2건+ 매치 → `name_team` placeholder  |
| 5   | `test_save_to_db_resolves_ambiguous`          | resolve_ambiguous_players 호출 검증      |
| 6   | `test_save_to_db_inserts_games_with_schedule` | schedule_info → home/away team 매핑      |
| 7   | `test_save_to_db_inserts_games_no_schedule`   | schedule 없음 → records에서 추론         |
| 8   | `test_save_to_db_single_team_records`         | 1팀만 → home/away 동일                   |
| 9   | `test_save_to_db_calculates_scores`           | pts 합산 → home/away score               |
| 10  | `test_save_to_db_creates_player_game_records` | bulk_insert_player_games 호출            |
| 11  | `test_save_to_db_saves_team_records`          | team_records + schedule → insert         |
| 12  | `test_save_to_db_skips_team_without_schedule` | schedule 없으면 team_records skip        |
| 13  | `test_save_to_db_auto_detects_game_type`      | parse_game_type 사용 검증                |
| 14  | `test_save_to_db_handles_empty_records`       | 빈 records → 삽입 없음                   |
| 15  | `test_save_to_db_active_keys`                 | is_active=1 설정 검증                    |

**Mocking:** `patch("ingest_wkbl.database")` + `MagicMock(args)`

---

## Phase 2: Schedule & Game Fetch (~180 lines, 15 tests)

**파일 생성:** `tests/test_ingest_schedule.py`
**타겟:**

- `_fetch_schedule_from_wkbl()` (lines 1960-2072)
- `_fetch_game_records()` (lines 2151-2217)

**Fixture 추가:** `tests/fixtures/html_samples.py`에 schedule HTML 상수 4-5개

| #   | 테스트                                  | 커버 대상                    |
| --- | --------------------------------------- | ---------------------------- |
| 1   | `test_schedule_regular_season_basic`    | 기본 스케줄 파싱             |
| 2   | `test_schedule_cross_year_dates`        | 연도 경계 (10-12월 vs 1-4월) |
| 3   | `test_schedule_future_games_no_game_no` | 미래 경기 → 순번 자동 부여   |
| 4   | `test_schedule_future_only_regular`     | playoff은 미래경기 생성 안함 |
| 5   | `test_schedule_multiple_game_types`     | 복수 game_type 처리          |
| 6   | `test_schedule_deduplicates`            | 중복 game_id 제거            |
| 7   | `test_schedule_exception_handling`      | 한 월 실패 → 나머지 계속     |
| 8   | `test_schedule_empty_month`             | 빈 테이블                    |
| 9   | `test_schedule_unknown_gun`             | 미지 game_type → 기본값      |
| 10  | `test_fetch_records_basic`              | 기본 records fetch 흐름      |
| 11  | `test_fetch_records_no_iframe`          | iframe 없음 → skip           |
| 12  | `test_fetch_records_relative_iframe`    | 상대경로 → BASE_URL 붙임     |
| 13  | `test_fetch_records_with_team_stats`    | team_stats 포함 경로         |
| 14  | `test_fetch_records_empty`              | 빈 items → 빈 결과           |
| 15  | `test_fetch_records_progress`           | 15+ 게임 진행률 로깅         |

**Mocking:** `patch("ingest_wkbl.fetch")` + sample HTML

---

## Phase 3: Orchestration Functions (~200 lines, 25 tests)

**파일 생성:** `tests/test_ingest_orchestration.py`
**타겟:**

- `_ingest_single_season()` (lines 2970-3146, ~176 lines)
- `_ingest_multiple_seasons()` (lines 3156-3222, ~66 lines)
- `main()` (lines 3369-3647, ~300 lines)
- `_compute_lineups_for_season()` (lines 3230-3254, ~24 lines)

### \_ingest_single_season (10 tests)

| #   | 테스트                                   | 커버 대상                            |
| --- | ---------------------------------------- | ------------------------------------ |
| 1   | `test_single_season_basic_flow`          | 기본 흐름: fetch → save              |
| 2   | `test_single_season_past_end_date`       | 과거 시즌 → 고정 종료일              |
| 3   | `test_single_season_current_uses_today`  | 현재 시즌 → 오늘 날짜                |
| 4   | `test_single_season_incremental`         | force_refresh=False → 기존 ID 제외   |
| 5   | `test_single_season_force_refresh`       | force_refresh=True → 전체 재수집     |
| 6   | `test_single_season_future_games`        | include_future → \_save_future_games |
| 7   | `test_single_season_standings`           | fetch_standings 경로                 |
| 8   | `test_single_season_standings_exception` | standings 실패 → 계속                |
| 9   | `test_single_season_category_stats`      | fetch_team_category_stats 경로       |
| 10  | `test_single_season_no_save_db`          | save_db=False → skip                 |

### \_ingest_multiple_seasons (5 tests)

| #   | 테스트                            | 커버 대상                        |
| --- | --------------------------------- | -------------------------------- |
| 11  | `test_multi_all_seasons`          | all_seasons → 전체 순회          |
| 12  | `test_multi_specific_seasons`     | 특정 코드만 처리                 |
| 13  | `test_multi_invalid_code`         | 잘못된 코드 → 에러               |
| 14  | `test_multi_exception_per_season` | 한 시즌 실패 → 나머지 계속       |
| 15  | `test_multi_resolves_orphans`     | save_db → resolve_orphan_players |

### main() (8 tests)

| #   | 테스트                              | 커버 대상                        |
| --- | ----------------------------------- | -------------------------------- |
| 16  | `test_main_backfill_mode`           | --backfill-games 경로            |
| 17  | `test_main_multi_season_mode`       | --all-seasons 경로               |
| 18  | `test_main_single_season_basic`     | 단일 시즌 기본 흐름              |
| 19  | `test_main_active_only_filter`      | --active-only 필터               |
| 20  | `test_main_db_aggregation`          | save_db → DB에서 집계            |
| 21  | `test_main_db_aggregation_fallback` | DB 빈 결과 → 폴백                |
| 22  | `test_main_compute_lineups`         | --compute-lineups 경로           |
| 23  | `test_main_no_save_db`              | save_db 없음 → aggregate_players |

### \_compute_lineups_for_season (2 tests)

| #   | 테스트                        | 커버 대상             |
| --- | ----------------------------- | --------------------- |
| 24  | `test_compute_lineups_basic`  | 기본 lineup 계산 흐름 |
| 25  | `test_compute_lineups_no_pbp` | PBP 없는 게임 → skip  |

**Mocking:** `monkeypatch(sys, "argv")` + 모든 하위 함수 monkeypatch

---

## Phase 4: Fetch 함수들 (~100 lines, 18 tests)

**파일 생성:** `tests/test_ingest_fetch_functions.py`
**타겟:** 각종 `fetch_*()` 함수 (lines 1665-1940)

| #     | 테스트                             | 커버 대상                  |
| ----- | ---------------------------------- | -------------------------- |
| 1-3   | `test_fetch_play_by_play_*`        | PBP fetch + player_id 해석 |
| 4-5   | `test_fetch_shot_chart_*`          | shot chart + team_id 매핑  |
| 6-7   | `test_fetch_team_category_stats_*` | 카테고리별 fetch_post      |
| 8-9   | `test_fetch_all_head_to_head_*`    | 15쌍 H2H + 예외처리        |
| 10    | `test_fetch_game_mvp_basic`        | MVP fetch + parse          |
| 11-14 | `test_fetch_quarter_scores_*`      | quarter score + 중복제거   |
| 15-16 | `test_fetch_team_standings_*`      | standings POST             |
| 17-18 | `test_get_season_meta_*`           | 시즌 메타 추출             |

**Mocking:** `patch("ingest_wkbl.fetch")`, `patch("sqlite3.connect")`

---

## Phase 5: 기타 파일 Edge Cases (~65 lines, 16 tests)

기존 테스트 파일 수정. 빠르게 처리 가능한 edge case.

### tests/test_api.py (+4 tests, ~40 lines)

| #   | 테스트                       | 커버 대상                                 |
| --- | ---------------------------- | ----------------------------------------- |
| 1   | `test_player_plus_minus`     | lineup_stints → plus_minus 계산 (353-386) |
| 2   | `test_plus_minus_per100`     | pm_per100 계산 (391-399)                  |
| 3   | `test_team_advanced_stats`   | ORtg/DRtg/NetRtg/Pace (1089-1109)         |
| 4   | `test_plus_minus_edge_cases` | None season, 0 possessions (267, 408-459) |

### tests/test_database.py (+3 tests, ~11 lines)

| #   | 테스트                                  | 커버 대상                       |
| --- | --------------------------------------- | ------------------------------- |
| 1   | `test_h2h_quarter_scores_reverse_match` | 역방향 매치 (1555, 1578)        |
| 2   | `test_orphan_tied_minutes`              | minutes 동점 → tied (1710-1713) |
| 3   | `test_orphan_no_orphans`                | 고아 없음 → 0 반환 (1639, 1652) |

### tests/test_predict.py (+2 tests, ~9 lines)

| #   | 테스트                           | 커버 대상                |
| --- | -------------------------------- | ------------------------ |
| 1   | `test_weighted_avg_zero_weights` | total_weight=0 폴백 (56) |
| 2   | `test_win_prob_court_advantage`  | home/away 승률 (251-260) |

### tests/test_lineup.py (+3 tests, ~6 lines)

| #   | 테스트                     | 커버 대상              |
| --- | -------------------------- | ---------------------- |
| 1   | `test_empty_quarter_skip`  | 이벤트 없는 쿼터 (226) |
| 2   | `test_incomplete_starters` | <5명 추론 → skip (231) |
| 3   | `test_lineup_overflow`     | >5명 → trim (316)      |

### tests/test_refactor_p0.py (+4 tests, ~5 lines)

| #   | 테스트                    | 커버 대상               |
| --- | ------------------------- | ----------------------- |
| 1   | `test_drtg_zero_opp_poss` | player_opp_poss=0 (194) |
| 2   | `test_ws_zero_lg_ppg`     | lg_ppg=0 (237)          |
| 3   | `test_per_zero_total_min` | 0분 출전 (532)          |
| 4   | `test_per_zero_lg_aper`   | lg_a_per=0 (600)        |

---

## 예상 결과

| Phase    | 커버 추가 | 누적 | 신규 테스트 |
| -------- | --------- | ---- | ----------- |
| 1        | ~230      | 230  | 15          |
| 2        | ~180      | 410  | 15          |
| 3        | ~200      | 610  | 25          |
| 4        | ~100      | 710  | 18          |
| 5        | ~65       | 775  | 16          |
| **합계** | **~775**  |      | **~89**     |

필요 최소: 504줄 → 보수적 70% 달성률로도 ~542줄 커버 (95% 초과).

## 작업 파일 요약

### 신규 생성 (4개)

- `tests/test_ingest_save_to_db.py`
- `tests/test_ingest_schedule.py`
- `tests/test_ingest_orchestration.py`
- `tests/test_ingest_fetch_functions.py`

### 수정 (6개)

- `tests/fixtures/html_samples.py` — schedule HTML fixture 추가
- `tests/test_api.py` — plus-minus, team advanced stats
- `tests/test_database.py` — orphan edge cases
- `tests/test_predict.py` — fallback branches
- `tests/test_lineup.py` — quarter/lineup edge cases
- `tests/test_refactor_p0.py` — zero denominator guards

## 검증

```bash
# 각 Phase 완료 후
uv run pytest tests/ -v                                    # 전체 테스트 통과
uv run pytest tests/ --cov=tools --cov-report=term-missing # 커버리지 확인
uv run pre-commit run --all-files                          # 린트/포맷
```
