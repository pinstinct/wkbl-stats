# Players/Teams/Leaders 개선 작업 계획서

작성일: 2026-02-19

## 진행 현황

- 업데이트일: 2026-02-19
- 브랜치: `feat/p0-tdd-players-leaders-sorting`
- P0 상태: 완료
  - `#/players/:id` 고급 지표 계산에 시즌별 팀/리그 컨텍스트 연결 완료 (`src/db.js`)
  - `#/players/:id` 시즌 집계에 `plus_minus` 합산 컬럼 추가 (`src/db.js`)
  - leaders `PER` 섹션 데이터 공급 경로 복구 (`src/db.js`)
  - players 테이블 헤더 정렬을 이벤트 위임 방식으로 전환 (`src/ui/page-events.js`, `src/app.js`)
  - players `%` 지표 정렬을 표시 스케일 기준으로 보정 (`src/views/players-logic.js`)
  - players 기본 탭 `±` 헤더를 `코트마진`으로 표기 통일 (`src/views/players.js`)
  - `#statsTable th[title]` 커서를 `pointer`로 통일 (`src/styles/core/base.css`)
  - leaders 빈 섹션에 안내 문구 표시 추가 (`src/views/leaders.js`)
  - 회귀 테스트 추가 및 통과:
    - `src/ui/page-events.test.js`
    - `src/views/leaders.test.js`
    - `src/views/players-logic.test.js`
    - `src/views/players.test.js`
    - `npm run test:front` 전체 통과 (41 tests)

## 목적

- 사용자 제보 버그(표시/정렬/데이터 누락)를 우선 해결한다.
- PC/Mobile 모두에서 동작/가독성을 검증한다.
- 디자인 일관성(기본/고급 탭 버튼)을 개선한다.
- 추가 지표 반영 후 예측 성능 개선 가능성을 검토한다.

## 범위 요약

### [버그]

1. players 페이지 카드(`.player-card`)의 기본/2차/고급 지표 설명 툴팁 누락
2. `#statsTable` 헤더 클릭 정렬(기본/고급 탭 모두) 보강
3. `#/players/:id` 고급 지표가 `-`로 나오는 문제 수정
4. 팀 고급 지표(`div#teamStatsSection`) 설명 툴팁 누락
5. `div.standings-section`에 고급 지표 추가 + 헤더 정렬 지원
6. leaders 페이지 PER 섹션 공란 수정

### [디자인]

7. `기본`/`고급` 버튼을 주변 UI 톤에 맞게 스타일 개선

### [개선사항]

8. 추가 지표를 포함해 예측 정확도 상향 가능성 검토

## 현재 코드 기준 핵심 원인(확인됨)

- `#statsTable` 정렬 이벤트는 초기 렌더의 `th`에만 바인딩되어 탭 전환 후 교체된 헤더에는 정렬 이벤트가 유실될 수 있음  
  (`src/app.js`)
- `#/players/:id`의 시즌 고급 지표 계산 시 팀/리그 컨텍스트 없이 `calculateAdvancedStats(d)`를 호출하고 있어 일부 고급 지표가 `-` 또는 미계산으로 표시됨  
  (`src/db.js`)
- leaders의 `PER` 카드는 존재하지만 `getLeadersAll()` 카테고리 목록에서 `per`가 누락되어 데이터가 채워지지 않음  
  (`src/db.js`)
- 툴팁 표시는 `title`/`data-tooltip`이 혼용되어 있고 모바일에서 hover 툴팁이 비활성화되어 있어 설명 노출 방식이 일관적이지 않음  
  (`src/views/players.js`, `src/views/teams.js`, `src/styles/core/base.css`)
- `기본/고급` 탭 버튼 전용 스타일 정의가 부족해 브라우저 기본 버튼 스타일로 노출됨  
  (`index.html`, `src/styles`)

## 실행 순서 (우선순위)

### P0 (즉시)

1. `#/players/:id` 고급 지표 계산 로직 보정
2. leaders PER 데이터 채우기
3. `#statsTable` 기본/고급 탭 정렬 안정화

### P1 (동일 스프린트)

4. players 카드 툴팁 설명 노출 일관화(PC/Mobile)
5. team 고급 지표 툴팁 설명 노출 일관화(PC/Mobile)
6. standings 고급 지표 컬럼 및 정렬 기능 추가
7. 탭 버튼 디자인 개선

### P2 (후속)

8. 예측 성능 개선 실험(지표 추가 효과 측정)

## 상세 작업 항목

### 1) players 카드/팀 고급 지표 설명 툴팁 보강

- 대상 파일:
  - `src/views/players.js`
  - `src/views/teams.js`
  - `src/styles/core/base.css`
- 작업:
  - 통계 카드 설명 속성을 `data-tooltip` 중심으로 통일
  - 설명 문자열 누락 시 빈 툴팁이 뜨지 않도록 fallback 처리
  - 모바일에서는 hover 대신 탭 가능한 안내 방식(`title`/아이콘/접힘 설명)으로 보완
- 완료 기준:
  - PC에서 카드 hover 시 설명이 비어 있지 않음
  - Mobile에서 설명 확인 경로가 존재하고 동작함

### 2) players 테이블 정렬(기본/고급) 보강

- 대상 파일:
  - `src/app.js`
  - `src/views/players.js`
  - `src/views/players-logic.js`
- 작업:
  - 헤더 재렌더링 이후에도 동작하도록 이벤트 위임 방식으로 변경
  - 탭 전환 시 유효한 정렬 키/방향 유지 로직 추가
  - 정렬 상태 UI(선택 컬럼/방향) 표시 보강
- 완료 기준:
  - 기본/고급 탭 모두 헤더 클릭 정렬 동작
  - 탭 전환 후에도 정렬 기능 정상 유지

### 3) `#/players/:id` 고급 지표 `-` 노출 문제 수정

- 대상 파일:
  - `src/db.js`
  - `src/views/player-detail.js`
- 작업:
  - 선수 시즌 집계 시 팀/리그 시즌 집계를 연결해 고급 지표 계산
  - `calculateAdvancedStats()` 호출 경로를 `getPlayers()`와 동일 컨텍스트로 정렬
  - 계산 불가 케이스(표본 부족/분모 0)는 명시적 처리
- 완료 기준:
  - 동일 시즌에서 players 목록과 player detail의 고급 지표 값 일관성 확보
  - `-`는 실제 계산 불가 케이스에만 표시

### 4) 팀 상세(`teamStatsSection`) 툴팁 설명 보강

- 대상 파일:
  - `src/views/teams.js`
  - `src/styles/core/base.css`
- 작업:
  - 팀 고급 지표 카드에 설명 문자열 표준화(ORtg/DRtg/NetRtg/Pace/GP)
  - PC/Mobile 노출 정책 통일
- 완료 기준:
  - 팀 상세 카드의 `?`/툴팁이 항목별 설명을 정상 노출

### 5) standings에 고급 지표 추가 + 정렬

- 대상 파일:
  - `index.html`
  - `src/views/teams.js`
  - `src/app.js`
  - `src/db.js`
  - `src/styles/responsive/common.css`
- 작업:
  - standings 테이블에 고급 지표 컬럼(예: ORtg, DRtg, NetRtg, Pace) 추가
  - 헤더 `data-key` 및 정렬 핸들러 구현
  - 모바일 가로 스크롤/고정 컬럼 레이아웃 재검증
- 완료 기준:
  - standings 고급 지표가 렌더되고 헤더 정렬 가능
  - 모바일에서 열 겹침/가독성 문제 없음

### 6) leaders PER 섹션 공란 수정

- 대상 파일:
  - `src/db.js`
  - `src/app.js`
  - `src/views/leaders.js`
- 작업:
  - `getLeadersAll()` 카테고리에 `per` 포함
  - PER 값 포맷(소수점 자리수) 일관화
  - 데이터 없음 시 빈 카드 대신 안내 문구 표시
- 완료 기준:
  - leaders 페이지 PER 카드가 실제 순위 데이터로 채워짐

### 7) 기본/고급 버튼 디자인 개선

- 대상 파일:
  - `src/styles/core/base.css` (또는 컴포넌트 스타일 파일)
- 작업:
  - `.tab-btn`, `.tab-btn.active`, hover/focus/disabled 스타일 정의
  - 주변 컴포넌트(카드, 테이블 헤더)와 톤 통일
  - 키보드 포커스 접근성(`:focus-visible`) 반영
- 완료 기준:
  - 버튼이 프로젝트 디자인 톤에 맞고 상태별(기본/hover/active/focus) 시인성 확보

### 8) 예측 성능 개선 검토(추가 지표 반영)

- 대상 파일:
  - `src/views/predict-logic.js`
  - `tools/stats.py`
  - `tests/test_ingest_predictions.py` 등 관련 테스트
- 작업:
  - 신규 지표(예: USG%, PER, NetRtg, Pace, 코트마진)를 feature 후보로 실험
  - 기준선 대비 검증 지표(MAE/RMSE/적중률) 비교
  - 시즌 홀드아웃 기준 과적합 점검
- 완료 기준:
  - 기준선 대비 개선 여부를 수치로 제시(개선 없으면 제외 근거 명시)

## 검증 체크리스트 (PC/Mobile 공통)

- players
  - `.player-card` 설명 확인 가능
  - `#statsTable` 기본/고급 정렬 동작
- player detail
  - `#/players/:id` 고급 지표 값 정상 노출
- team detail
  - `#teamStatsSection` 설명 노출
- teams standings
  - 고급 지표 컬럼 표시/정렬
  - 모바일 스크롤 및 고정 컬럼 정상
- leaders
  - PER 카드 데이터 표시
- 디자인
  - 탭 버튼 상태별 스타일 정상

## 권장 구현/검증 순서

1. 데이터 정확도 이슈(P0-1, P0-2) 먼저 해결
2. 정렬 동작(P0-3) 적용
3. 툴팁/UX(P1-4, P1-5) 정리
4. standings 확장(P1-6) 적용
5. 버튼 스타일(P1-7) 마감
6. 예측 개선 실험(P2-8) 별도 브랜치/실험 노트로 수행

## 산출물

- 코드 변경 PR 1: 데이터/정렬 버그 수정(P0)
- 코드 변경 PR 2: 툴팁/standings/디자인(P1)
- 분석 리포트 1: 예측 개선 실험 결과(P2)
