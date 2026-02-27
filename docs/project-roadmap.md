# WKBL Stats 프로젝트 로드맵

## 목표

Basketball Reference 스타일의 종합 WKBL 통계 사이트 구축

## 리팩토링 현황

- P0~P4 전체 완료 (시즌 상수 공통화, 뷰/데이터/이벤트 분리, CSS 분할, 데이터 정확도, 테스트 보강)
- 상세 기록: `docs/complete/refactor-plan.md`

## 현재 상태 (2026-02-27)

| 단계       | 상태    | 설명                                                                           |
| ---------- | ------- | ------------------------------------------------------------------------------ |
| Phase 1    | ✅ 완료 | SQLite DB 기반 구축, 증분 업데이트                                             |
| Phase 2    | ✅ 완료 | 팀 순위, 역대 시즌, 플레이오프 분리                                            |
| Phase 3    | ✅ 완료 | REST API 서버 구축                                                             |
| Phase 4    | ✅ 완료 | 선수/팀/경기 상세 페이지, 리더보드                                             |
| Phase 5    | ✅ 완료 | 고급 기능 (선수 비교, 트렌드 차트, 전역 검색)                                  |
| Phase 6    | ✅ 완료 | 추가 데이터 수집 (PBP, 샷차트, H2H, MVP, 쿼터점수)                             |
| Phase 6.3  | ✅ 완료 | 데이터 품질 (고아 선수 해결, 이벤트 카테고리 세분화)                           |
| Phase 7    | ✅ 완료 | 고급 지표 Tier 1 (GmSc, USG%, ORtg/DRtg, Pace, PER 등 14개)                    |
| Phase 7.3  | ✅ 완료 | 고급 지표 Tier 2 — On/Off Rating & +/- (라인업 추적 엔진)                      |
| Phase 7.4  | ✅ 완료 | 개인 ORtg/DRtg (팀 수준 → 개인 수준 전환)                                      |
| Phase 8    | ✅ 완료 | 프론트엔드 고급 지표 표시 (정적 호스팅 팀 컨텍스트 계산 포함)                  |
| Phase 8.5a | ✅ 완료 | 게임 상세 + 선수 상세 인터랙티브 슛차트 대시보드 (시즌/선수/결과/쿼터/존 필터) |
| Phase 8.5b | ✅ 완료 | BBR 정합성 개선 (P0~P4 완료, BPM/VORP 보류)                                    |
| Phase 9    | ✅ 완료 | 예측 시스템 리팩토링 (Game Score 가중, 다요소 승률, STL/BLK)                   |
| Phase 10   | ✅ 완료 | 로딩 속도 개선 (DB 분할, IndexedDB 캐싱, 스켈레톤 UI)                          |
| 리팩토링   | ✅ 완료 | P0~P4 전체 (구조 분리, CSS 정리, 데이터 정확도, 테스트 보강)                   |

### 최근 업데이트 (2026-02-26)

- [x] 로드맵 진행 상태 코드 대비 재검증 및 업데이트
- [x] Phase 8.5a(인터랙티브 슛차트) ✅ 완료 확인, Phase 8.5b(BBR 정합성)로 분리
- [x] `#/games/{id}` 예정 경기 화면에서 `선발` 배지 선수명 클릭 시 `#/predict/{playerId}`로 이동하도록 링크 라우팅 개선
- [x] `#/predict/{playerId}` 딥링크 진입 시 해당 선수 예측 결과 자동 로드
- [x] 회귀 테스트 추가: 예정 경기 선발 링크(`predict`) / 완료 경기 링크(`players`) 분기 검증
- [x] Playwright E2E를 `required/recommended/optional` 3티어로 확장
- [x] 시나리오 매트릭스(`e2e/scenarios/scenario-matrix.yaml`) + 커버리지 리포터(`tools/e2e_coverage_report.py`) 도입
- [x] CI 분리 운영: PR(required >= 90% 게이트), main(recommended 모니터링), schedule(optional 모니터링)
- [x] 탭 복귀 시 자동 데이터 갱신 (`visibilitychange` + ETag 비교 + 5분 staleness threshold)
- [x] `SKIP_INGEST=1` 서버 시작 옵션 문서화

---

## 1. 데이터 소스 분석 (완료)

### WKBL Data Lab (datalab.wkbl.or.kr)

| 카테고리                   | 엔드포인트              | 데이터                                                 | 상태       |
| -------------------------- | ----------------------- | ------------------------------------------------------ | ---------- |
| **경기별 선수 박스스코어** | `record_player.asp`     | MIN, PTS, REB, AST, STL, BLK, TO, FG, 3P, FT           | ✅ 사용 중 |
| **경기별 팀 기록**         | `record_team.asp`       | 속공, 페인트존, 2/3점 득점, REB, AST, STL, BLK, TO, PF | ✅ 사용 중 |
| **경기 목록**              | `game/list/month`       | 시즌별 game_id, 날짜, 팀                               | ✅ 사용 중 |
| **선수 랭킹 (JSON)**       | `playerAnalysis/search` | 득점/리바운드/어시스트/스틸/블록 Top 5                 | 🆕 발견    |
| **Play-by-Play**           | `playByPlay`            | 경기 실시간 이벤트 (득점, 파울 등)                     | ✅ 사용 중 |
| **Shot Chart**             | `shotCharts`            | 슈팅 위치 데이터 (좌표, 성공/실패)                     | ✅ 사용 중 |
| **Team Analysis**          | `teamAnalysis`          | 쿼터별 점수, 경기장, 팀 매치업 분석 (JSON)             | ✅ 사용 중 |

### WKBL 공식 사이트 (wkbl.or.kr)

| 카테고리             | 엔드포인트                     | 데이터                                           | 상태       |
| -------------------- | ------------------------------ | ------------------------------------------------ | ---------- |
| **현역 선수 목록**   | `player/player_list.asp`       | 이름, 팀, pno                                    | ✅ 사용 중 |
| **선수 프로필**      | `player/detail.asp`            | 포지션, 신장, 생년월일, 출신학교                 | ✅ 사용 중 |
| **팀 순위**          | `ajax/ajax_team_rank.asp`      | 순위, 승/패, 홈/원정 전적, 연속 기록, 최근 5경기 | ✅ 사용 중 |
| **경기 일정**        | `game/sch/inc_list_1_new.asp`  | 날짜, 홈/원정팀, 점수, game_no                   | ✅ 사용 중 |
| **팀 카테고리 순위** | `ajax/ajax_part_team_rank.asp` | 팀별 12개 카테고리 순위 (POST)                   | ✅ 사용 중 |
| **상대전적 (H2H)**   | `ajax/ajax_report.asp`         | 팀 간 상대전적 (POST)                            | ✅ 사용 중 |
| **경기 MVP**         | `game/today_mvp.asp`           | 시즌 경기 MVP 목록                               | ✅ 사용 중 |

### 수집 현황

1. **팀 기록 (record_team.asp)** ✅ 구현됨
   - 경기별 팀 스탯 (속공, 페인트존 득점, 2/3점 득점)
   - `--fetch-team-stats` 옵션으로 수집
   - 참고: 슈팅 시도 횟수는 제공되지 않음 (득점만 제공)

2. **팀 순위 (ajax_team_rank.asp)** ✅ 구현됨
   - 시즌 순위표 (POST 요청)
   - 홈/원정 전적, 최근 5경기, 연속 기록
   - `--fetch-standings` 옵션으로 수집

3. **경기 일정 (inc_list_1_new.asp)** ✅ 구현됨
   - 홈/원정 팀 구분에 사용
   - 정규시즌(gun=1)/플레이오프(gun=4) 구분 가능
   - `--game-type` 옵션으로 필터링

4. **Play-by-Play (playByPlay)** ✅ 구현됨
   - 경기 실시간 이벤트 (득점, 파울 등)
   - `--fetch-play-by-play` 옵션으로 수집 (경기당 1회)

5. **Shot Chart (shotCharts)** ✅ 구현됨
   - 슈팅 위치 데이터 (좌표, 성공/실패, 선수, 쿼터)
   - `--fetch-shot-charts` 옵션으로 수집 (경기당 1회)

6. **팀 카테고리 순위 (ajax_part_team_rank.asp)** ✅ 구현됨
   - 12개 카테고리별 팀 순위 (득점, 실점, 리바운드, 어시스트 등)
   - `--fetch-team-category-stats` 옵션으로 수집 (시즌당 12회)

7. **상대전적 (ajax_report.asp)** ✅ 구현됨
   - 6C2 = 15 팀 조합별 경기 결과
   - `--fetch-head-to-head` 옵션으로 수집

8. **경기 MVP (today_mvp.asp)** ✅ 구현됨
   - 시즌 경기 MVP 목록 (순위, 스탯, EFF)
   - `--fetch-game-mvp` 옵션으로 수집 (시즌당 1회)

9. **쿼터별 점수 + 경기장 (teamAnalysis)** ✅ 구현됨
   - Team Analysis JSON에서 matchRecordList 파싱
   - games 테이블에 home_q1~q4, away_q1~q4, home_ot, away_ot, venue 추가
   - `--fetch-quarter-scores` 옵션으로 수집 (시즌당 15회, 효율적)

---

## 2. DB 스키마 설계

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     seasons     │     │      teams      │     │     players     │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ label           │     │ name            │     │ name            │
│ start_date      │     │ short_name      │     │ birth_date      │
│ end_date        │     │ logo_url        │     │ height          │
│ is_playoff      │     │ founded_year    │     │ position        │
└─────────────────┘     └─────────────────┘     │ team_id (FK)    │
        │                       │               └─────────────────┘
        │                       │                        │
        │   ┌───────────────────┤                        │
        │   │                   │                        │
        ▼   ▼                   │                        │
┌─────────────────────┐         │                        │
│  team_standings     │         │                        │
├─────────────────────┤         │                        │
│ season_id (FK)      │         │                        │
│ team_id (FK)        │         │                        │
│ rank, wins, losses  │         │                        │
│ home/away records   │         │                        │
│ streak, last5       │         │                        │
└─────────────────────┘         │                        │
                                │                        │
        ┌───────────────────────┴────────────────────────┘
        │
        ▼
┌─────────────────────┐
│       games         │
├─────────────────────┤
│ id (PK)             │
│ season_id (FK)      │
│ game_date           │
│ home_team_id (FK)   │
│ away_team_id (FK)   │
│ home_score          │
│ away_score          │
│ home_q1~q4, home_ot │  ← 쿼터별 점수
│ away_q1~q4, away_ot │
│ venue               │  ← 경기장
│ game_type           │ (regular/playoff/allstar)
└─────────────────────┘
        │
        ├───────────────────────────────┐
        ├───────────────┐               │
        ▼               ▼               ▼
┌───────────────┐ ┌───────────────┐ ┌─────────────────────┐
│ player_games  │ │  team_games   │ │   play_by_play      │
├───────────────┤ ├───────────────┤ ├─────────────────────┤
│ game_id (FK)  │ │ game_id (FK)  │ │ game_id (FK)        │
│ player_id     │ │ team_id (FK)  │ │ event_order, quarter│
│ team_id (FK)  │ │ is_home       │ │ game_clock, scores  │
│ minutes       │ │ fast_break_pts│ │ event_type          │
│ pts, reb, ast │ │ paint_pts     │ └─────────────────────┘
│ stl, blk, tov │ │ two_pts       │
│ fgm, fga      │ │ three_pts     │ ┌─────────────────────┐
│ tpm, tpa      │ │ reb, ast, stl │ │    shot_charts      │
│ ftm, fta      │ │ blk, tov, pf  │ ├─────────────────────┤
│ off_reb       │ └───────────────┘ │ game_id, player_id  │
│ def_reb, pf   │                   │ x, y, made, quarter │
└───────────────┘                   └─────────────────────┘

┌─────────────────────────┐
│   position_matchups     │  ← Detail DB
├─────────────────────────┤
│ game_id, position       │
│ scope, home/away stats  │
│ norm_values (JSON)      │
└─────────────────────────┘

┌────────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐
│ team_category_stats    │  │   head_to_head      │  │    game_mvp     │
├────────────────────────┤  ├─────────────────────┤  ├─────────────────┤
│ season_id, team_id     │  │ season_id           │  │ season_id       │
│ category, rank, value  │  │ team1_id, team2_id  │  │ player_id       │
│ games_played           │  │ game_date, venue    │  │ team_id, rank   │
└────────────────────────┘  │ scores, winner      │  │ pts, reb, ast   │
                            └─────────────────────┘  │ evaluation_score│
┌─────────────────────┐                              └─────────────────┘
│ _meta_descriptions  │  ← 메타데이터 (테이블/컬럼 설명)
├─────────────────────┤
│ table_name          │
│ column_name         │
│ description         │
└─────────────────────┘
```

---

## 3. 단계별 개발 계획

### Phase 1: 데이터 기반 구축 ✅ 완료

- [x] SQLite DB 스키마 구현 (`tools/database.py`)
- [x] 기존 ingest 스크립트를 DB 저장으로 전환 (`--save-db` 옵션)
- [x] 경기별 raw 데이터 저장 (player_games 테이블)
- [x] 시즌/팀/선수 마스터 데이터 구축
- [x] 증분 업데이트 구현 (이미 DB에 있는 경기는 스킵)
- [x] home/away 팀 구분 개선 (현재 동일 팀으로 표시됨)

### Phase 2: 데이터 수집 확장 ✅ 완료

- [x] WKBL Data Lab 추가 엔드포인트 탐색
- [x] 팀 스탯 수집 (`--fetch-team-stats` 옵션, `team_games` 테이블)
- [x] 팀 순위 수집 (`--fetch-standings` 옵션, `team_standings` 테이블)
- [x] 역대 시즌 데이터 수집 (`--all-seasons`, `--seasons` 옵션, 2020-21 ~ 현재)
- [x] 플레이오프 데이터 분리 (`--game-type` 옵션, game_type 컬럼)
- [x] 올스타 게임 자동 감지 (game_id 001 → allstar)
- [x] 데이터베이스 메타데이터 테이블 (`_meta_descriptions`)

**참고:**

- team_games: 슈팅 시도 횟수가 아닌 득점(two_pts, three_pts)만 제공
- team_standings: 최근 10경기가 아닌 5경기(last5) 데이터 제공

### Phase 3: API 서버 구축 ✅ 완료

- [x] FastAPI로 REST API 구현 (`tools/api.py`)
- [x] 선수 조회 API (`/api/players`, `/api/players/{id}`, `/api/players/{id}/gamelog`)
- [x] 팀 조회 API (`/api/teams`, `/api/teams/{id}`)
- [x] 경기 조회 API (`/api/games`, `/api/games/{id}`)
- [x] 시즌 스탯 집계 API (`/api/seasons/{id}/standings`)
- [x] 리더보드 API (`/api/leaders`, `/api/leaders/all`)
- [x] OpenAPI 자동 문서화 (`/api/docs`, `/api/redoc`)

### Phase 4: 프론트엔드 확장 ✅ 완료

- [x] 모바일 반응형 테이블 (선수명 고정 + 가로 스크롤)
- [x] 선수 카드에 GP(출전 경기 수) 표시
- [x] 2차 지표 섹션 추가 (TS%, eFG%, AST/TO, PIR, PER36)
- [x] Double-Double/Triple-Double 평균 배지
- [x] SPA 라우팅 시스템 (hash-based)
- [x] 선수 상세 페이지 (`#/players/{id}` - 시즌별 기록, 최근 경기 로그)
- [x] 팀 페이지 (`#/teams`, `#/teams/{id}` - 순위표, 로스터, 최근 경기)
- [x] 경기 상세 페이지 (`#/games/{id}` - 박스스코어)
- [x] 리더보드 (`#/leaders` - 득점/리바운드/어시스트/스틸/블록 부문별 Top 5)

### Phase 5: 고급 기능 ✅ 완료

- [x] 선수 비교 도구 (`#/compare` - 최대 4명 선수 비교, 바 차트 시각화)
- [x] 트렌드 차트 (Chart.js 기반 시즌별 득점/리바운드/어시스트 추이)
- [x] 검색 기능 강화 (전역 검색 모달, Ctrl+K 단축키, 선수/팀 통합 검색)
- [x] 시즌/커리어 하이라이트 API (`/players/{id}/highlights`)
- [x] 선수 비교 API (`/players/compare`)
- [x] 통합 검색 API (`/search`)

### Phase 6: 추가 데이터 수집 ✅ 완료 (2026-02-10)

- [x] games 테이블에 쿼터별 점수(Q1~Q4, OT) + 경기장(venue) 컬럼 추가
- [x] Play-by-Play 테이블 (`play_by_play`) + 파서/fetch 함수
- [x] Shot Chart 테이블 (`shot_charts`) + 파서/fetch 함수
- [x] 팀 카테고리별 순위 테이블 (`team_category_stats`) + 12개 카테고리 수집
- [x] 상대전적 테이블 (`head_to_head`) + 6C2=15 팀 조합 수집
- [x] 경기 MVP 테이블 (`game_mvp`) + 파서/fetch 함수
- [x] Team Analysis JSON에서 쿼터 점수/경기장 일괄 수집 (15 요청/시즌)
- [x] CLI 옵션 6개 추가 (`--fetch-play-by-play`, `--fetch-shot-charts`, `--fetch-team-category-stats`, `--fetch-head-to-head`, `--fetch-game-mvp`, `--fetch-quarter-scores`)
- [x] GitHub Actions 워크플로우 업데이트
- [x] `src/db.js`에 프론트엔드 쿼리 함수 6개 추가
- [x] 데이터베이스 테스트 12개 추가 (총 77개)

### Phase 6.1: 파서 버그 수정 + 데이터 품질 개선 ✅ 완료 (2026-02-11)

- [x] 쿼터 점수 시즌 필터 수정 (API가 전 시즌 데이터 반환하는 문제)
- [x] H2H 파서 재작성 (paired row 파싱, team1/2_scores 쿼터점수 추출)
- [x] PBP 파서 재작성 (li 태그 전체 캡처, quarter/clock/score/team_id 추출)

### Phase 8.5a: 게임 상세 인터랙티브 슛차트 ✅ 완료 (2026-02-20)

- [x] `#/games/{id}` 슛차트 필터 패널 (선수/성공실패/쿼터)
- [x] 메인 슛 분포 Scatter 차트 (성공/실패 분리)
- [x] 존별 시도 + FG% 복합 차트
- [x] 쿼터별 성공/실패 누적 차트
- [x] 팀 필터(홈/원정) 추가
- [x] OT 쿼터 라벨(OT1, OT2...) 동적 지원
- [x] 메인 슛 분포 코트 라인 오버레이(Chart.js plugin) 적용
- [x] 현재 필터 상태 기반 슛차트 PNG export
- [x] 문자열 쿼터(`Q1`, `OT1`) 파싱/필터 정합성 수정
- [x] WKBL 좌표계 축 스케일(0~291, 18~176)로 슛 점/코트 오버레이 정렬
- [x] `Shotcharts / Shotzones` 탭 분리 UI
- [x] Shotzones 테이블(Zone/FGM/FGA/FG%) 추가
- [x] 필터 순서 팀 우선(팀→선수→결과→쿼터) 정렬
- [x] 팀 선택 기반 선수 옵션 재구성(팀-선수 매칭 보정)
- [x] 슛차트 스케일 확장으로 코트 clipping 완화
- [x] 코트 비율 고정(`307:176`) 적용으로 반응형 왜곡 완화
- [x] 오버레이 원/호 `ellipse` 렌더로 3점 라인 뭉개짐 완화
- [x] 3점 직선/아크 연결 좌표를 단일 기하로 정렬
- [x] player-team reconcile 로직으로 팀/선수 필터 불일치 보정
- [x] 3점 반경 120 기준 재정렬(직선-아크 조인 높이 자동 계산)
- [x] TDD: `src/views/game-shot-logic.test.js` + `src/data/client.test.js` 확장
- [x] 코트 SVG 정밀화(선/호 치수 미세조정)
- [x] EVENT_TYPE_MAP 추가 (한국어→영어 이벤트 코드 24종)
- [x] event_types 마스터 테이블 추가 (코드, 한국어명, 카테고리)
- [x] shot_charts 스키마 개선 (is_home 제거, shot_zone 좌표 기반 자동 분류)
- [x] shot_chart 파서: team_id 해결 (home/away 선수 체크박스 파싱)
- [x] PBP player_id 해결 (player_games 테이블에서 이름 매칭)
- [x] 파서 테스트 16개 추가 (총 93개)

### Phase 6.2: 스키마 정리 + 쿼터점수 보강 (2026-02-11)

- [x] event_detail 컬럼 제거 (play_by_play, 100% NULL 중복)
- [x] play_by_play.event_type → event_types.code FK 추가
- [x] "정규작전타임" → "timeout" 이벤트 타입 추가 (537건 unknown 해소)
- [x] H2H 데이터에서 games 쿼터점수 자동 채우기 (populate_quarter_scores_from_h2h)
- [x] 테스트 2개 추가 (총 95개)

### Phase 6.3: 데이터 품질 — 고아 선수 해결 + 이벤트 카테고리 (2026-02-12)

- [x] event_types 카테고리 세분화: foul(3종), turnover(2종) 분리 (기존 "other")
- [x] 고아 선수 ID 해결 알고리즘 구현 (이적 선수 `이름_팀` → 정식 pno 매핑)
  - `resolve_ambiguous_players()` — 수집 시 단일 시즌 내 해결 (ingest_wkbl.py)
  - `resolve_orphan_players()` — DB 레벨 크로스 시즌 해결 (database.py)
  - 시즌 비중첩 + 인접성 휴리스틱, 평균 출전시간 tiebreak
- [x] 6명 고아 선수 전원 해결 (고아라, 김지영, 김진영, 김아름, 김단비, 김정은)
- [x] 테스트 7개 추가 (총 102개)

### Phase 7: 고급 지표 Tier 1 ✅ 완료 (2026-02-12)

- [x] Game Score (John Hollinger) — `game_score`
- [x] TOV% (Turnover Percentage) — `tov_pct`
- [x] USG% (Usage Rate) — `usg_pct`
- [x] ORtg / DRtg / Net Rating (팀 공격·수비 효율) — `off_rtg`, `def_rtg`, `net_rtg`
- [x] Pace (팀 경기 속도) — `pace`
- [x] OREB% / DREB% / REB% (리바운드 비율) — `oreb_pct`, `dreb_pct`, `reb_pct`
- [x] AST% / STL% / BLK% (기여도 비율) — `ast_pct`, `stl_pct`, `blk_pct`
- [x] PER (Player Efficiency Rating, Hollinger) — `per`
- [x] DB 인프라: `get_team_season_totals()`, `get_opponent_season_totals()`, `get_league_season_totals()`
- [x] `compute_advanced_stats()` 시그니처 확장 (team_stats, league_stats kwargs)
- [x] API 통합: `get_players()`, `get_player_detail()`, `get_player_comparison()` 모두 고급 지표 포함
- [x] 테스트 20개 추가 (총 122개)

### Phase 7.3: 고급 지표 Tier 2 — On/Off Rating & +/- ✅ 완료 (2026-02-19)

- [x] `tools/lineup.py` — 라인업 추적 엔진 (신규)
  - `infer_starters()` — 쿼터별 선발 5명 추론 (이벤트 + minutes 보충)
  - `track_game_lineups()` — 경기 전체 라인업 구간(stint) 추적
  - `compute_player_plus_minus()` — 경기별 +/- 계산
  - `compute_player_on_off()` — 시즌 On/Off Rating 계산
  - `resolve_null_player_ids()` — PBP description에서 이름 추출하여 NULL player_id 해결
- [x] `lineup_stints` DB 테이블 + CRUD (`save_lineup_stints`, `get_lineup_stints`, `get_player_plus_minus_season`)
- [x] API 통합: 박스스코어 `plus_minus_game`, 시즌 `plus_minus_per_game`/`plus_minus_per100`
- [x] 인제스트 통합: `--compute-lineups` CLI 옵션, PBP fetch 후 자동 계산
  - 운영 권장 실행: `--save-db --fetch-play-by-play --compute-lineups` (라인업 기반 +/- 데이터 보장)
- [x] 테스트 18개 추가 (총 140개)

### Phase 7.4: 개인 ORtg/DRtg 전환 ✅ 완료 (2026-02-20)

- [x] 팀 수준 ORtg/DRtg → 개인 수준 ORtg/DRtg 전환
  - `tools/stats.py`: `compute_individual_ortg()`, `compute_individual_drtg()` 추가
  - `tools/database.py`: `get_player_game_stats_for_ratings()` 경기별 상세 데이터 조회
  - `tools/api.py`: 개인 ORtg/DRtg API 통합
  - `src/db.js`: 정적 호스팅에서 개인 ORtg/DRtg 계산
- [x] 테스트 3개 추가 (총 143개)

### Phase 7.5: Win Shares (WS) 추가 ✅ 완료 (2026-02-20)

- [x] `tools/stats.py`: OWS/DWS/WS/WS40 계산 추가
- [x] `tools/database.py`: `get_team_wins_by_season()` 추가
- [x] `tools/api.py`: standings 기반 `team_wins/losses` 전달 + WS 리더(`category=ws`) 지원
- [x] `src/db.js`: 정적 호스팅 WS 계산 동기화 + WS 리더 지원
- [x] `src/views/players.js`, `src/views/player-detail.js`: WS 표시 (`WS/40`은 계산값만 유지, UI 미표시)

### Phase 8: 프론트엔드 고급 지표 표시 ✅ 완료 (2026-02-19)

- [x] 선수 목록 (`#/players`) — Basic/Advanced 탭 토글
  - Advanced 탭: PER, GmSc, USG%, TOV%, ORtg, DRtg, NetRtg, REB%, AST%, STL%, BLK%, +/-/G, +/-/100
  - 선수 카드 사이드바에 "고급 지표" 3번째 섹션 추가
- [x] 선수 상세 (`#/players/{id}`) — 고급 지표 섹션 추가
  - 최신 시즌 PER, GmSc, USG%, TOV%, ORtg, DRtg, NetRtg, OREB%~BLK%, +/-/G, +/-/100
- [x] 리더보드 (`#/leaders`) — 카테고리 확장
  - 추가: GmSc, TS%, PIR, PER
  - `api.py` + `db.js` 모두 지원
- [x] 팀 상세 (`#/teams/{id}`) — 팀 고급 지표 섹션
  - ORtg, DRtg, NetRtg, Pace
- [x] 순위표 (`#/teams`) — 고급 지표 컬럼 추가 + 정렬
  - ORtg, DRtg, NetRtg, Pace 컬럼
- [x] 정적 호스팅(db.js/sql.js)에서 팀 컨텍스트 계산 완료
  - `getTeamSeasonStats()`, `getLeagueSeasonStats()` SQL 집계
  - PER, USG%, ORtg, DRtg, 모든 rate stats 정적 호스팅에서도 계산

### Phase 9: 예측 시스템 리팩토링 ✅ 완료 (2026-02-20)

- [x] `tools/predict.py` — 예측 로직 모듈 분리 (신규)
  - `calculate_player_prediction()` — Game Score 가중 평균, 상대팀 수비력 보정, 출전시간 안정성 반영
  - `calculate_win_probability()` — 6요소 복합 모델 (Net Rating 35%, 예측 스탯 25%, 승률 15%, H2H 10%, 모멘텀 10%, 홈 어드밴티지 5%)
  - `select_optimal_lineup()` — Game Score 기반 정렬, 출전시간 15분 미만 선수 제외
- [x] 예측 스탯 확장: PTS/REB/AST → PTS/REB/AST/**STL/BLK**
- [x] DB 스키마: `game_predictions` 테이블에 `predicted_stl/blk` 컬럼 추가
- [x] `get_player_recent_games()` 쿼리 확장 (슈팅 스탯 9개 추가)
- [x] `ingest_wkbl.py` 리팩토링: 예측 함수 `predict.py`로 위임, 상대팀/시즌 컨텍스트 전달
- [x] 프론트엔드 동기화: `app.js`, `home.js`, `predict.js`, `predict-logic.js`
  - Game Score 가중 평균, 상대팀 보정, STL/BLK 렌더링
  - 다요소 승리 확률 모델 (Net Rating + H2H + 모멘텀)
- [x] 테스트 18개 추가 (총 169개)
- [x] Graceful degradation: 모든 개선 사항이 데이터 미존재 시 기존 방식으로 폴백

### Phase 10: 로딩 속도 개선 ✅ 완료 (2026-02-25)

- [x] 스켈레톤 UI (`src/styles/skeleton.css`, `src/ui/skeleton.js`)
  - 펄스 애니메이션 키프레임, 홈 페이지 레이아웃 플레이스홀더
  - DB 로딩 완료 시 자동 숨김 (`skeleton-hidden` 클래스)
- [x] IndexedDB 캐싱 (`src/data/idb-cache.js`)
  - `saveToCache()`, `loadFromCache()`, `clearCache()` with ETag 메타데이터
  - 백그라운드 ETag 체크로 캐시 자동 갱신
  - 재방문 시 네트워크 없이 즉시 DB 로드
- [x] DB 분할 (`tools/split_db.py`)
  - `wkbl-core.db`: 필수 테이블 (players, teams, games, standings 등)
  - `wkbl-detail.db`: 대용량 테이블 (play_by_play, shot_charts, lineup_stints, position_matchups)
  - 2단계 로딩: core DB 우선 로드 → detail DB 백그라운드 프리로드
  - `wkbl.db` 폴백 지원 (미분할 환경 호환)
- [x] GitHub Actions + server.py 인제스트 후 자동 분할
- [x] Python 테스트 22개 추가 (Python 총 523개)
- [x] 탭 복귀 시 자동 데이터 갱신 (`visibilitychange`)
  - `src/db.js`: `refreshDatabase()` — ETag 비교 → core/detail DB 메모리 교체 + IndexedDB 캐시 업데이트
  - `src/app.js`: `visibilitychange` 리스너 — 5분 staleness threshold, 갱신 시 `handleRoute()` 재렌더링
  - 테스트 6개 추가 (db.integration.test.js)

### Phase 8.5b: Basketball Reference 정합성 개선 계획 ✅ 완료 (2026-02-26)

목표: Basketball Reference 기준 지표 정의와 현재 구현(`tools/stats.py`, `src/db.js`)의 차이를 줄여 지표 일관성과 해석 신뢰도를 높인다.

#### 점검 결과 (2026-02-20)

- 추가 후보 지표
  - `3PAr` (3PA/FGA), `FTr` (FTA/FGA)
  - `OWS`, `DWS`, `WS/40` UI 노출 (계산값은 이미 존재)
  - `OBPM`, `DBPM`, `BPM`, `VORP` (중장기; 계수/보정 모델 필요)
- 계산식 정합성 이슈
  - `PER`: 정적 계산(`src/db.js:computePER`)과 백엔드 계산(`tools/stats.py:_compute_per`) 수식이 상이
  - `PER`: 파울 패널티/리그 평균 정규화 항이 Basketball Reference 공식과 완전 일치하지 않음
  - `Possessions`: 현재 단순 추정식(`FGA + 0.44×FTA + TOV - OREB`) 사용으로 `Pace`, `ORtg/DRtg`, 일부 Rate 계열이 BBR 값과 체계적으로 차이
  - `WS`: `Marginal Points Per Win` 계수/보정이 BBR 방식과 달라 절대값 스케일 차이 가능

#### 실행 계획

1. P0 (즉시): PER 계산식 단일화 + 프론트/백엔드 값 정합성 복구
   - [x] `src/db.js:computePER()`를 `tools/stats.py:_compute_per()`와 동일 수식으로 정렬
   - [x] `tools/stats.py:_compute_per()`에서 BBR 공식 대비 차이 항(`PF penalty`, `lg_aPER`) 재검토
   - [x] 동일 입력 fixture에 대해 API/정적 계산 `PER` 오차 임계값(`abs <= 0.1`) 회귀 테스트 추가

2. P1 (단기): Possessions 공식을 BBR 표준식으로 전환 가능한 구조로 분리
   - [x] `estimate_possessions()`를 단순식/표준식 선택 가능한 전략 함수로 분리
   - [x] `Pace`, `ORtg/DRtg`, Rate 계열에 미치는 영향 범위 측정(시즌 전체 diff 리포트)
   - [x] 리그 규모(6팀, 40분) 기준으로 표준식 채택 또는 하이브리드 유지 결정
     - **결정: `simple` 유지** (2026-02-26)
     - PER max rank Δ=3 (max abs Δ=0.3), DRtg max Δ=4.5, Pace max Δ=3.1
     - DWS/WS rank 변동 크지만 절대값 차이 미미 (DWS max Δ=0.19, WS max Δ=0.15)
     - 6팀 리그에서 opponent ORB% 보정 효과가 NBA 대비 제한적
     - `_compute_per()`에 strategy 전달 버그 수정 완료 (simple/bbr_standard 전환 가능 구조 유지)
     - diff 리포트: `tools/possession_diff_report.py --season 046`

3. P2 (단기): Win Shares 보정
   - [x] `marginal_ppw` 계산을 BBR 문서식 기준으로 재검증
     - **결정: 현행 유지** (2026-02-26)
     - BBR 대비: pace 조정 유무(marginal_ppw), replacement_def 계수(0.08 vs 0.14)
     - diff 리포트 결과: WS max |Δ|=0.05, rank 변동 max=4 (71명 기준)
     - 6팀 리그에서 팀 간 pace 편차가 크므로 pace 조정이 합리적 (BBR은 30팀 평균에 수렴)
     - replacement_def 0.08은 소규모 리그의 대체 선수 수준 보수적 반영에 적합
   - [x] `OWS`, `DWS`, `WS`, `WS/40` 분포/표시 sanity check 및 회귀 테스트 추가
   - [x] API/정적 계산 동치성 테스트 추가 (compare 경로 포함)

4. P3 (중기): BBR 주요 누락 지표 추가
   - [x] `3PAr`, `FTr` 계산/노출 (players, detail, compare, leaders)
   - [x] `OWS`, `DWS`, `WS`, `WS/40` UI 노출 확장 (players/detail/compare)
   - [x] 리더보드에서 `WS/40` 제거 (저표본 과대노출 방지)
   - [x] 문서(`README.md`, `docs/data-sources.md`)에 공식/해석/주의사항 동기화

#### 후속 품질 보강 (2026-02-25)

- [x] 수치 표현 정밀도 조정: `OWS/DWS/WS` 2자리, `WS/40` 3자리, `AST/TO` 2자리
- [x] Compare 페이지 `OWS/DWS/WS/WS40` 지표가 `-`로 노출되던 정적 계산 경로 수정
- [x] Leaders 페이지에서 `WS/40` 카드 제거
- [x] E2E 추가: `E2E-LEADERS-002`, `E2E-COMPARE-003`, `E2E-PLAYERS-003`

5. P4 (중장기): BPM/VORP 도입 타당성 검토
   - [x] NBA 계수 직접 이식 대신 WKBL 데이터 기반 보정(또는 비도입) 방침 수립
   - [x] 표본 수/안정성 기준(최소 시즌 수, 최소 분수) 정의 후 PoC
     - **결정: 보류** (2026-02-26)
     - BPM v2.0은 NBA 회귀 계수 기반 (30팀, 82경기/팀) → 6팀 30경기 리그 직접 이식 부적합
     - lineup_stints 데이터는 6시즌(041~046) 15,637건 존재하나, 팀 수(6) × 경기 수(~30)의 표본 크기가 회귀 모델 학습에 불충분
     - NBA BPM은 ~450팀시즌 데이터로 학습; WKBL은 현재 ~36팀시즌으로 과적합 위험
     - 대안: 현재 `plus_minus_per_game`, `plus_minus_per100`이 유사 역할 수행 중
     - RAPM 기반 BPM 계수 학습은 최소 100+ 팀시즌 축적 후 재검토

#### 완료 기준 (Definition of Done)

- 프론트(`src/db.js`)와 백엔드(`tools/stats.py`)의 동명 지표 값이 허용 오차 내 일치
- 핵심 고급 지표(`PER`, `WS`, `ORtg/DRtg`, `USG%`)에 대해 공식/코드/문서가 동일 정의를 사용
- 미구현 BBR 지표의 우선순위와 도입/보류 근거가 문서에 명시

참고 기준:

- https://www.basketball-reference.com/about/glossary.html
- https://www.basketball-reference.com/about/per.html
- https://www.basketball-reference.com/about/ratings.html
- https://www.basketball-reference.com/about/ws.html
- https://www.basketball-reference.com/about/bpm2.html

---

## 4. 기술 스택

| 영역                | 기술                                              | 비고                               |
| ------------------- | ------------------------------------------------- | ---------------------------------- |
| **DB**              | SQLite                                            | `data/wkbl.db`                     |
| **Backend**         | FastAPI + uvicorn                                 | REST API + 정적 파일 서빙          |
| **Frontend**        | Vanilla JS + Chart.js                             | SPA (hash-based routing)           |
| **Package Manager** | uv                                                | `pyproject.toml` + `uv.lock`       |
| **Code Quality**    | pre-commit (ruff, mypy, bandit, eslint, prettier) | Python + Frontend 자동 린팅/포맷팅 |
| **Hosting**         | GitHub Pages                                      | 정적 프론트엔드                    |
| **Data Update**     | GitHub Actions                                    | 매일 자동 업데이트                 |

---

## 5. 무료 호스팅 전략

| 서비스             | 용도            | 무료 티어  |
| ------------------ | --------------- | ---------- |
| **GitHub Pages**   | 정적 프론트엔드 | 무제한     |
| **Railway/Render** | API 서버        | 월 500시간 |
| **Supabase**       | PostgreSQL DB   | 500MB      |
| **PlanetScale**    | MySQL DB        | 1GB        |

---

## 6. 참고 사이트

- [Basketball Reference](https://www.basketball-reference.com/) - 목표 레퍼런스
- [WKBL Data Lab](https://datalab.wkbl.or.kr/) - 데이터 소스
- [WKBL 공식 사이트](https://www.wkbl.or.kr/) - 선수 프로필

---

## 7. 향후 개선 아이디어

| 기능           | 설명                                               | 우선순위 |
| -------------- | -------------------------------------------------- | -------- |
| 시즌 비교      | 두 시즌의 팀/선수 스탯 비교                        | 낮음     |
| 예측 모델 개선 | ~~USG%/PER 등 신규 feature 실험~~ Phase 9에서 완료 | ✅ 완료  |
| 드래프트 기록  | 드래프트 순위/출신학교 수집                        | 낮음     |
| PWA 지원       | 오프라인 접근, 앱 설치                             | 낮음     |
| 다크 모드      | 테마 전환 지원                                     | 낮음     |
| i18n           | 영어 지원                                          | 낮음     |

미완 항목 상세: `docs/complete/remaining-features.md`
