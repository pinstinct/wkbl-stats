# Refactor Plan (Updated 2026-02-09)

목표: 기능/화면은 유지하면서 유지보수 비용을 줄이고, 데이터 계산 일관성과 테스트 가능성을 높인다.

---

## 점검 결과 요약

- 테스트 상태: `uv run pytest -q` 기준 **60 passed**.
- 현재 병목 파일:
  - `src/app.js` 3,181 lines
  - `src/styles.css` 3,427 lines
  - `src/db.js` 1,227 lines
  - `tools/ingest_wkbl.py` 2,452 lines
- 최근 UI 반응형 이슈(고정열/모바일 간격/네비게이션)는 다수 해결됨.
- 따라서 다음 단계의 핵심은 **기능 추가보다 구조 분리/중복 제거**.

---

## 완료된 리팩터링(최근 반영)

1. 모바일/중간 해상도 테이블 UX 개선
- players / teams / games / schedule에서 고정열 + 가로 스크롤 정리.

2. 상세 진입 스크롤 리셋
- `#/players/:id` 진입 시 중간 스크롤 시작 문제 해소.

3. 반응형 내비게이션
- 큰 화면: 가로 링크, 작은 화면: 햄버거 드롭다운.

---

## 추가 리팩터링 필요 항목

### P0 (리스크 낮고 효과 큼)

1. 시즌/설정 상수 단일화
- 현재 시즌 맵/기본 시즌이 `src/app.js`, `src/db.js`, `tools/config.py`에 중복.
- `src/shared/seasons.js`(프론트) + `tools/config.py`(백엔드 원본)로 소스 오브 트루스 정리.

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
- 남음: 프론트 뷰 분리(`app.js` 모듈화)와 CSS 분할(P1/P2)

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

- 진행: `players` 뷰 분리 1차 완료
- 추가: `src/views/players.js` (`renderPlayersTable`, `renderPlayerSummaryCard`)
- 변경: `src/app.js`에서 players 테이블/요약카드 렌더링을 view 모듈 호출로 전환
- 남음: `player-detail`, `teams`, `games`, `schedule`, `leaders`, `compare`, `predict` 순차 분리

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

### P3 (데이터 정확도/성능)

9. 시즌별 로스터 정합성 강화
- 계획된 `team_rosters(season_id, team_id, player_id)` 테이블 도입 검토 지속.
- 과거 시즌 `gp=0` 선수 표시 정확도 개선.

10. SQL 쿼리 재사용/검증 강화
- `src/db.js`와 `tools/api.py` 간 유사 쿼리 공통 스펙 문서화.
- 동일 입력에 동일 출력이 나오는지 snapshot/fixture 테스트 추가.

### P4 (테스트 보강)

11. 프론트 순수 함수 테스트 추가
- 대상: 포맷 함수, 정렬/필터 함수, 예측 배지/상태 판정 로직.
- DOM 결합 전 로직을 함수화해서 단위 테스트 가능하게 정리.

12. 회귀 체크리스트 갱신
- 최근 발생했던 모바일 고정열/오버플로우 케이스를 체크리스트에 추가.

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
