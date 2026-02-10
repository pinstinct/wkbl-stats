# Refactor Plan (Updated 2026-02-10)

목표: 기능/화면은 유지하면서 유지보수 비용을 줄이고, 데이터 계산 일관성과 테스트 가능성을 높인다.

---

## 점검 결과 요약

- 테스트 상태: `uv run pytest -q` 기준 **57 passed**.
- 프론트 테스트: `npm run test:front` 기준 **38 passed (18 files)**.
- 코드 품질 훅: `pre-commit`에 Python + Frontend(`eslint`/`prettier`) 체인 적용.
- 현재 병목 파일:
  - `src/app.js` 2,623 lines
  - `src/styles/core/base.css` 558 lines
  - `src/styles/pages/main-prediction.css` 444 lines
  - `src/styles/pages/compare.css` 335 lines
  - `src/db.js` 1,220 lines
  - `tools/ingest_wkbl.py` 2,452 lines
- 최근 UI 반응형 이슈(고정열/모바일 간격/네비게이션)는 다수 해결됨.
- 따라서 다음 단계의 핵심은 **기능 추가보다 구조 분리/중복 제거**.

### 추가 점검 (2026-02-10)

- `src/app.js` 내부 순위 차트 전적 파싱(`home_record`/`away_record`) 중복 로직을 확인.
- TDD로 `src/views/teams-chart-logic.test.js`를 먼저 추가하고 실패를 확인한 뒤 구현.
- `src/views/teams-chart-logic.js`에 `parseWinLossRecord`, `buildStandingsChartSeries`를 분리.
- `src/app.js`의 `renderStandingsChart`가 신규 로직 모듈을 사용하도록 전환.
- 결과: 차트 데이터 생성 규칙이 단위 테스트로 고정되어 회귀 위험이 감소.
- 라우팅 순수 로직(`hash -> route`, `nav-link active`)을 분리 대상으로 확인.
- TDD로 `src/ui/router-logic.test.js`를 먼저 추가하고 실패를 확인한 뒤 구현.
- `src/ui/router-logic.js`에 `getRouteFromHash`, `isNavLinkActive`를 분리.
- `src/app.js`의 `getRoute`, `updateNavLinks`가 신규 로직 모듈을 사용하도록 전환.
- 결과: 라우팅 규칙이 단위 테스트로 고정되어 회귀 위험이 감소.
- 추가로 `resolveRouteTarget(path, id)`를 도입해 라우트 분기 결정을 순수 함수로 분리.
- `src/app.js`의 `handleRoute`는 분기 계산 대신 실행만 담당하도록 단순화.

---

## 완료된 리팩터링(최근 반영)

1. 모바일/중간 해상도 테이블 UX 개선

- players / teams / games / schedule에서 고정열 + 가로 스크롤 정리.

2. 상세 진입 스크롤 리셋

- `#/players/:id` 진입 시 중간 스크롤 시작 문제 해소.

3. 반응형 내비게이션

- 큰 화면: 가로 링크, 작은 화면: 햄버거 드롭다운.

4. 개발 품질 게이트 확장

- `pre-commit`에 프론트 lint/security/format 검사 추가.

---

## 추가 리팩터링 필요 항목

### P0 (리스크 낮고 효과 큼)

1. 시즌/설정 상수 단일화

- 현재 시즌 맵/기본 시즌이 `src/app.js`, `src/db.js`, `tools/config.py`에 중복.
- `src/seasons.js`(프론트) + `tools/config.py`(백엔드 원본)로 소스 오브 트루스 정리.

2. 스탯 계산 로직 공통화

- TS%, eFG%, PIR, per36 계산이 `src/db.js`와 `tools/api.py`에 중복.
- 계산식이 한쪽만 바뀌는 drift 방지를 위해 공통 함수/테스트 케이스로 분리.

3. API/DB 파라미터 계약 명확화

- `season`, `activeOnly`, `includeNoGames` 규칙이 페이지별로 다르게 적용됨.
- 필터 규칙을 문서화하고, 프론트 fetch 레이어에서 강제.

### P0 진행 현황 (2026-02-09)

- 완료: 백엔드 시즌 해석 공통화 (`tools/season_utils.py`)
- 완료: 백엔드 고급 스탯 계산 공통화 (`tools/stats.py`, `tools/api.py` 적용)
- 완료: `/players`에 `include_no_games` 계약 반영 및 테스트 추가
- 완료: 프론트 시즌 상수 단일화 (`src/seasons.js`, `src/app.js`, `src/db.js`, `index.html`)
- 상태: P0 완료

### P1 (구조 개선)

4. `src/app.js` 뷰 단위 분리

- 권장 분리:
  - `src/views/home.js`
  - `src/views/players.js`
  - `src/views/player-detail.js`
  - `src/views/teams.js`
  - `src/views/team-detail.js`
  - `src/views/games.js`
  - `src/views/game-detail.js`
  - `src/views/schedule.js`
  - `src/views/leaders.js`
  - `src/views/compare.js`
  - `src/views/predict.js`
- `app.js`는 라우팅/공통 초기화만 담당.

5. 프론트 데이터 접근 계층 도입

- `WKBLDatabase.*` 직접 호출을 각 뷰에서 제거.
- `src/data/*` 모듈로 통합해 API fallback/로컬 DB 분기 단일화.

6. 이벤트 바인딩 책임 분리

- 현재 `init()`에 다수 리스너가 집중되어 있음.
- 뷰별 `mount/unmount`로 분리해 중복 바인딩/사이드이펙트 리스크 축소.

### P1 진행 현황 (2026-02-09)

- 완료: `players`, `player-detail`, `teams`, `games`, `game-detail`, `schedule`, `leaders`, `compare`, `predict` 렌더링 모듈 분리
- 추가: `src/views/players.js` (`renderPlayersTable`, `renderPlayerSummaryCard`)
- 추가: `src/views/player-detail.js` (`renderCareerSummary`, `renderPlayerSeasonTable`, `renderPlayerGameLogTable`)
- 추가: `src/views/teams.js` (`renderStandingsTable`, `renderTeamRoster`, `renderTeamRecentGames`)
- 추가: `src/views/games.js`, `src/views/game-detail.js`, `src/views/schedule.js`, `src/views/leaders.js`, `src/views/compare.js`, `src/views/predict.js`
- 변경: `src/app.js`에서 각 페이지 렌더링을 view 모듈 호출로 전환
- 완료: 데이터 접근 레이어 1차 도입 (`src/data/client.js`) 및 기존 `fetch*` 래퍼 통합
- 완료: 내비게이션 이벤트 `mount/unmount` 분리 (`src/ui/responsive-nav.js`)
- 완료: compare/predict/global-search 이벤트 `mount/unmount` 분리 (`src/ui/page-events.js`)
- 완료: 홈 렌더링 분리 (`src/views/home.js`)
- 추가: `src/views/player-detail.test.js`, `src/views/home.test.js`, `src/data/client.test.js`, `src/ui/responsive-nav.test.js`, `src/ui/page-events.test.js`
- 추가: `src/views/teams-chart-logic.js`, `src/views/teams-chart-logic.test.js`
- 추가: `src/ui/router-logic.js`, `src/ui/router-logic.test.js`
- 상태: P1 완료, 다음 단계는 P2(CSS 분할)

### P2 (CSS 유지보수성)

7. `src/styles.css` 분할

- 권장 구조:
  - `src/styles/base.css`
  - `src/styles/layout.css`
  - `src/styles/components.css`
  - `src/styles/pages/*.css`
- 페이지 범위를 `#view-*`로 고정해 전역 충돌 최소화.

8. 반응형 브레이크포인트 체계화

- 현재 페이지별 임계값이 분산됨.
- `--bp-*` 토큰 및 공통 media 규칙으로 통일.

### P2 진행 현황 (2026-02-09)

- 완료: `src/styles.css`를 import 진입 파일로 전환
- 완료: CSS를 `src/styles/core/*`, `src/styles/components/*`, `src/styles/pages/*`, `src/styles/responsive/*`로 분할
- 완료: 공통 브레이크포인트 토큰 추가 (`src/styles/core/base.css`: `--bp-*`)
- 완료: 중복 `compare` 스타일 정리(legacy/신규 규칙 충돌 제거, 실제 사용 클래스 기준으로 단순화)
- 완료: 중복 media query 병합(`src/styles/components/charts.css`)
- 상태: P2 완료

### P3 (데이터 정확도/성능)

9. 시즌별 로스터 정합성 강화

- 계획된 `team_rosters(season_id, team_id, player_id)` 테이블 도입 검토 지속.
- 과거 시즌 `gp=0` 선수 표시 정확도 개선.

10. SQL 쿼리 재사용/검증 강화

- `src/db.js`와 `tools/api.py` 간 유사 쿼리 공통 스펙 문서화.
- 동일 입력에 동일 출력이 나오는지 snapshot/fixture 테스트 추가.

### P3 진행 현황 (2026-02-09)

- 완료: `/players`의 `include_no_games`를 `active_only=false`까지 확장해 과거 시즌 마지막 소속팀(`<= season`) 기준으로 `gp=0` 선수 팀 추론
- 완료: `/teams/{id}` 상세 로스터에 `해당 시즌 출전 선수 + 현역 gp=0 선수`를 함께 포함하도록 정합성 보강
- 완료: `/teams/{id}` 상세 `recent_games`를 완료 경기(득점 존재)만 반환하도록 쿼리 계약 정렬 (`src/db.js`와 동작 일치)
- 완료: 시즌/팀/선수 조회 경로용 복합 인덱스 추가
  - `idx_player_games_team_game (team_id, game_id)`
  - `idx_player_games_player_game (player_id, game_id)`
  - `idx_games_season_date_id (season_id, game_date, id)`
- 완료: SQL/API 공통 계약 문서화 (`docs/sql-query-contract.md`)
- 추가: API 회귀 테스트
  - `test_get_players_include_no_games_inactive_historical_team_inference`
  - `test_get_team_detail_roster_includes_active_no_games_player`
  - `test_get_team_detail_recent_games_excludes_future_games`
  - `test_get_players_contract_fixture`
  - `test_get_team_detail_contract_fixture`
- 추가: DB 스키마 인덱스 회귀 테스트
  - `test_init_db_creates_performance_indexes`
- 추가: 계약 fixture 파일
  - `tests/fixtures/api_contracts.json`
- 상태: P3-1 완료, P3-2(SQL 공통 스펙/스냅샷) 완료, team_rosters 스키마 도입 검토는 후속 과제

### P4 (테스트 보강)

11. 프론트 순수 함수 테스트 추가

- 대상: 포맷 함수, 정렬/필터 함수, 예측 배지/상태 판정 로직.
- DOM 결합 전 로직을 함수화해서 단위 테스트 가능하게 정리.
- 진행: Vitest 테스트 베이스 및 view 모듈 단위 테스트 추가

12. 회귀 체크리스트 갱신

- 최근 발생했던 모바일 고정열/오버플로우 케이스를 체크리스트에 추가.

### P4 진행 현황 (2026-02-09)

- 완료: 프론트 순수 로직 테스트 추가(Vitest)
  - `src/views/players-logic.test.js`
  - `src/views/predict-logic.test.js`
  - `src/views/schedule-logic.test.js`
- 완료: 로직 분리(테스트 가능 구조)
  - `src/views/players-logic.js` (`filterPlayers`, `sortPlayers`)
  - `src/views/predict-logic.js` (`calculatePrediction`, `buildPredictionCompareState`)
  - `src/views/schedule-logic.js` (`getDayCountdownLabel`)
- 완료: 앱 연결
  - `src/app.js`에서 선수 필터/정렬 및 예측 결과 배지 판정 로직을 순수 로직 모듈로 교체
  - `src/views/schedule.js`에서 카운트다운 계산 로직을 순수 함수로 교체
- 완료: 회귀 체크리스트 문서 추가 (`docs/regression-checklist.md`)
- 상태: P4 완료

---

## 권장 구현 순서

1. P0-1: 상수 단일화 + 계산식 공통화
2. P1-1: app.js 분리(뷰 2~3개씩 점진 분해)
3. P1-2: data access 레이어 정착
4. P2: CSS 파일 분할 + 브레이크포인트 통일
5. P3~P4: 로스터 정확도 + 테스트 확대

---

## 완료 기준 (Definition of Done)

- 기능 회귀 없음 (`uv run pytest -q` 통과 + 수동 UI 체크)
- 계산식 단일 소스화(중복 구현 제거)
- `app.js`/`styles.css` 단일 파일 비대화 해소
- 모바일/태블릿 오버플로우 이슈 재발 방지 규칙 문서화
