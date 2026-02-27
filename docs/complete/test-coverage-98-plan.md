# 테스트 커버리지 98% 계획 — 실제 결함 검출 중심

## Context

현재 커버리지: Python 95.27% (192 uncovered / 4058), Frontend 95.04%.
목표: Python 98%+, Frontend threshold 96% (app.js vm.Script 한계).

커버리지 수치가 아닌 **실제 프로덕션 버그를 잡는 테스트**만 작성한다.
`if __name__ == "__main__"` 같은 trivial 브랜치는 제외.

## Uncovered 라인 요약

| 파일 | 미커버 | 주요 결함 유형 |
|------|--------|---------------|
| `ingest_wkbl.py` | 108줄 | 네트워크 오류 복구, 파싱 실패, 데이터 검증 |
| `api.py` | 27줄 | 나눗셈 오류, rate limit, proxy IP |
| `e2e_coverage_report.py` | 17줄 | 입력 검증 |
| `database.py` | 16줄 | 하위 호환 폴백, 쿼터점수 파싱 |
| `server.py` | 7줄 | 시작 예외 처리 |
| `stats.py` | 6줄 | 0 나눗셈 가드 |
| `predict.py` | 5줄 | 캘리브레이션 엣지 |
| `lineup.py` | 5줄 | NULL 선수 해결 |
| `app.js` | ~140줄 | vm.Script 한계 (대부분 커버 불가) |
| `db.js` | ~3줄 | TS% 0 나눗셈, null 처리 |

---

## Phase 1: 인제스트 네트워크 오류 복구 (~30 statements)

**파일**: `tests/test_ingest_fetch_functions.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_fetch_urlerror_retry_then_success` | 1회차 URLError → 2회차 성공 | 일시적 DNS 장애 시 데이터 누락 |
| `test_fetch_socket_timeout_retry` | 1회차 socket.timeout → 2회차 성공 | 타임아웃 시 전체 인제스트 실패 |
| `test_fetch_all_retries_exhausted` | 3회 모두 실패 → None 반환 | None이 하위 코드에서 AttributeError |
| `test_get_season_meta_label_not_found` | Data Lab 홈에서 시즌 미발견 | SystemExit 미처리로 서버 중단 |
| `test_parse_player_list_empty_name` | `<a>` 태그에 빈 텍스트 | 이름 없는 유령 선수 DB 삽입 |
| `test_parse_player_list_no_pno` | href에 pno 파라미터 없음 | None ID로 DB insert 실패 |
| `test_parse_standings_gb_dash` | 1위 팀 GB 값이 "-" | `float("-")` ValueError |
| `test_parse_standings_non_numeric_pct` | 승률 셀 형식 이상 | 파싱 실패 crash |
| `test_fetch_profile_connection_error` | 개별 프로필 fetch 시 예외 | 1명 실패로 전체 배치 중단 |

## Phase 2: API 나눗셈/rate limit (~25 statements)

**파일**: `tests/test_api.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_plus_minus_per_game_zero_gp` | lineup_stints 있지만 gp=0 | ZeroDivisionError → API 500 |
| `test_plus_minus_per100_no_team_stats` | 선수 팀 team_totals 없음 | KeyError → 500 에러 |
| `test_plus_minus_per100_zero_possessions` | 팀 FGA+FTA+TOV 모두 0 | 나눗셈 오류 → 500 |
| `test_trusted_proxies_invalid_network` | 잘못된 IP 형식 설정 | 서버 시작 시 ValueError |
| `test_rate_limit_content_length_non_numeric` | Content-Length: "abc" | int() ValueError |
| `test_position_matchups_endpoint` | `/api/games/{id}/position-matchups` 정상 | 문서화된 엔드포인트 미동작 |

## Phase 3: DB 하위 호환 & 쿼터점수 (~16 statements)

**파일**: `tests/test_database.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_get_predictions_pregame_fallback_old_schema` | prediction_runs 비어있고 predictions에만 데이터 | 구 DB에서 예측 유실 |
| `test_get_predictions_pregame_as_of_date_filter` | pregame_generated_at이 as_of_date 이후 | 미래 예측이 과거 분석에 혼입 |
| `test_populate_quarter_scores_malformed` | H2H scores "20-18" (쿼터 2개) | IndexError → 쿼터점수 누락 |
| `test_populate_quarter_scores_no_game_match` | H2H 날짜/팀 조합 없음 | 무한 루프/crash 없이 skip |
| `test_populate_quarter_scores_reverse_team` | H2H team1이 실제 away팀 | 홈/원정 쿼터점수 뒤바뀜 |

## Phase 4: 고급 지표 0 나눗셈 (~6 statements)

**파일**: `tests/test_stats.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_per_league_ppg_zero` | 시즌 초 리그 총 득점 0 | ZeroDivisionError |
| `test_ws_marginal_ppw_zero` | 리그 pace 0 | WS 무한대 반환 |
| `test_individual_ortg_zero_total_min` | 출전시간 0 선수 | ORtg 계산 crash |

## Phase 5: 예측/라인업 엣지 (~10 statements)

**파일**: `tests/test_predict.py`, `tests/test_lineup.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_calibrate_no_matching_bin` | raw_prob이 모든 bin 범위 밖 | crash 대신 raw 값 반환 |
| `test_win_prob_total_score_zero` | 양팀 예측 점수 모두 0 | 나눗셈 오류 |
| `test_lineup_all_below_min_threshold` | 모든 선수 15분 미만 | 빈 라인업 → 원본 폴백 |
| `test_resolve_null_ids_no_name_match` | PBP 이름이 name_map에 없음 | crash 없이 skip |
| `test_stint_lineup_exceeds_five` | 교체 누락으로 6명 on-court | 데이터 무결성 위반 |

## Phase 6: 서버 시작 예외 (~5 statements)

**파일**: `tests/test_server.py`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_startup_ingest_exception_continues` | run_ingest_if_needed() 예외 | 인제스트 실패 시 서버 미시작 |
| `test_favicon_served_when_exists` | favicon.svg 존재 시 응답 | 항상 404 반환 |

## Phase 7: Frontend — db.js & app.js (~15 lines)

**파일**: `src/db.integration.test.js`, `src/app.behavior.integration.test.js`

| 테스트 | 시나리오 | 방지하는 버그 |
|--------|----------|--------------|
| `test_ts_pct_zero_fga_fta` | FGA=0, FTA=0 선수 경기 | TS% NaN UI 표시 |
| `test_plus_minus_per100_null_leaders` | null plus_minus_per100 | 리더보드 정렬 깨짐 |
| `test_visibility_change_stale_refresh` | 5분+ 후 탭 복귀 | 오래된 데이터 표시 |
| `test_visibility_change_error_silent` | refreshDatabase 예외 | 탭 복귀 시 앱 crash |
| `test_search_navigate_player` | 검색→선수→/predict/{id} | 검색 네비게이션 미작동 |

---

## 구현 순서

1→2→3→4→5→6→7 (위 Phase 순서 그대로, 결함 확률 높은 순)

## 예상 결과

| 영역 | 현재 | 추가 테스트 | 예상 커버리지 |
|------|------|------------|--------------|
| Python | 95.27% | ~35개 | ~98% |
| Frontend | 95.04% | ~7개 | ~96% |

## Threshold 변경

- `pyproject.toml`: `--cov-fail-under=98`
- `vitest.config.js`: `thresholds: { lines: 96 }` (app.js vm.Script 한계)

## 검증

```bash
uv run pytest tests/ -v --cov=tools --cov=server --cov-report=term-missing
npm run test:front:coverage
```
