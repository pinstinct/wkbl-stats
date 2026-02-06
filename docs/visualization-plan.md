# WKBL Stats 시각화 및 예측 기능 구현 계획

## 구현 현황 (2026-02-06 업데이트)

### 완료된 기능

#### Phase 1: 시각화 강화
- [x] 슈팅 효율 트렌드 차트 (선수 상세)
- [x] 선수 스탯 레이더 차트 (선수 상세)
- [x] 최근 경기 바 차트 (선수 상세)
- [x] 팀 순위 시각화 (팀 페이지)
- [x] 비교 페이지 Chart.js 업그레이드

#### Phase 2: 경기 일정 페이지
- [x] 일정 페이지 (`#/schedule`) - D-day 카운트다운, 예정/최근 경기
- [x] `--include-future` 옵션으로 미래 경기 수집
- [x] 미래 경기 파싱 (game_no 없는 경기도 캡처)
- [x] GitHub Actions 워크플로우에 미래 경기 수집 추가

#### Phase 3: 선수 활약 예측
- [x] 예측 페이지 (`#/predict`) - 개별 선수 예측
- [x] **메인 홈페이지 게임 예측** (`#/`)
  - 다음 경기 기반 라인업 추천
  - PIR 기반 최적 선발 5인 선정
  - 선수별 예측 스탯 (PTS, REB, AST) + 신뢰 구간
  - 팀 승률 예측
  - 예측 방식 안내 (접이식 설명)

#### Phase 4: 코트마진 지표
- [x] 코트마진 계산 및 표시 (박스스코어)
- [x] `getPlayerCourtMargin()`, `getPlayersCourtMargin()` 함수

#### Phase 5: 예측 저장 및 비교 (NEW)
- [x] **예측 자동 저장** (ingest 시점에 DB 저장)
  - `--include-future` 옵션으로 미래 경기 수집 시 자동 예측 생성
  - 선수별: 예측 득점/리바운드/어시스트 + 신뢰 구간
  - 팀별: 승률 예측, 예상 총득점
  - 저장 위치: `game_predictions`, `game_team_predictions` 테이블
- [x] **박스스코어 예측 비교** (`#/games/{id}`)
  - 예측 vs 실제 승패 비교 (적중/실패 표시)
  - 예상 점수 vs 실제 점수
  - 선수별 예측 범위 내/초과/미달 색상 표시
  - 추천 선발 선수 뱃지 표시
- [x] `team_standings.last10` → `last5` 컬럼명 정정
- [x] `--load-all-players` 단일 시즌 모드 적용 버그 수정

#### Phase 6: UI 개선 (2026-02-06)
- [x] **선수 카드 코트마진 표시** (`#/players`) - +/- 색상 표시
- [x] **일정 페이지 구분자 변경** - "@" → "vs"
- [x] **예정 경기 예상 점수 표시** (`#/games/{id}`) - 미래 경기에도 예상 점수 표시
- [x] **생일 표시 형식 개선** - "YYYY-MM-DD (만 XX세)"
- [x] CLAUDE.md, README.md 문서 정리 및 최신화

#### Phase 7: 코드 정리 및 리팩토링 (2026-02-06)
- [x] **API 폴백 로직 제거** - 정적 호스팅(sql.js) 전용으로 단순화
  - `apiBase`, `fallbackPath` CONFIG 제거
  - `useApi`, `useLocalDb` 상태 변수 제거
  - `apiGet()` 함수 제거
  - HEAD /api/health 체크 제거 (405 에러 해결)
- [x] **fetch 함수 단순화** - 모든 fetch 함수를 `initLocalDb() → WKBLDatabase → JSON` 패턴으로 통일
- [x] **.gitignore 정리** - `tools/data/`, `data/cache/` 캐시 디렉토리 무시 추가
- [x] **약 200줄 이상의 불필요한 코드 제거**

### 라우트 구조 변경
| Before | After | Description |
|--------|-------|-------------|
| `#/` (선수 목록) | `#/` (게임 예측) | 홈페이지가 다음 경기 예측으로 변경 |
| - | `#/players` | 선수 목록이 별도 라우트로 이동 |

### 추가된 파일/함수

**src/db.js:**
- `getPlayerCourtMargin()` - 선수별 코트마진 계산
- `getPlayersCourtMargin()` - 여러 선수 코트마진 일괄 조회
- `getUpcomingGames()` - 예정 경기 조회
- `getRecentGames()` - 최근 완료 경기 조회
- `getNextGame()` - 다음 경기 조회
- `getTeamRoster()` - 팀 로스터 + 시즌 스탯 조회
- `getGamePredictions()` - DB에서 예측 조회
- `hasGamePredictions()` - 예측 존재 여부 확인

**src/app.js:**
- `loadMainPage()` - 메인 예측 페이지 로드
- `loadGamePage()` - 박스스코어 페이지 + 예측 비교 표시
- `generateOptimalLineup()` - PIR 기반 최적 라인업 생성
- `getPlayerPrediction()` - 선수 스탯 예측 계산
- `calculateTeamStrength()` - 팀 강도 계산 (승률 예측용)
- `renderLineupPlayers()` - 라인업 카드 렌더링
- `renderTotalStats()` - 팀 예상 스탯 렌더링
- 기타 차트 함수들

**tools/database.py:**
- `game_predictions` 테이블 - 선수별 예측 스탯
- `game_team_predictions` 테이블 - 팀 승률 예측
- `get_team_players()` - 팀 로스터 조회 (예측용)
- `get_player_recent_games()` - 선수 최근 경기 조회 (예측용)
- `save_game_predictions()` - 예측 저장 함수
- `get_game_predictions()` - 예측 조회 함수
- `has_game_predictions()` - 예측 존재 여부 확인

**tools/ingest_wkbl.py:**
- `_fetch_schedule_from_wkbl()` 수정 - 미래 경기 파싱 지원
- `_save_future_games()` - 미래 경기 DB 저장
- `_generate_predictions_for_games()` - 미래 경기 예측 생성 및 저장
- `_select_optimal_lineup()` - PIR 기반 최적 라인업 선정
- `_calculate_player_prediction()` - 선수 스탯 예측 계산
- `_calculate_win_probability()` - 팀 승률 예측 계산

**src/styles.css:**
- `.main-prediction-*` - 메인 예측 페이지 스타일
- `.main-game-*` - 경기 카드 스타일
- `.main-lineup-*`, `.lineup-*` - 라인업 카드 스타일
- `.prediction-explanation` - 예측 방식 안내 스타일
- `.boxscore-prediction` - 박스스코어 예측 비교 섹션
- `.prediction-legend` - 예측 범례 스타일
- `.pred-hit`, `.pred-over`, `.pred-under` - 예측 적중 색상
- `.starter-badge` - 선발 추천 뱃지

**index.html:**
- `#boxscorePrediction` - 예측 비교 섹션
- `#boxscorePredictionLegend` - 예측 범례

**.github/workflows/update-data.yml:**
- `--include-future` 옵션 추가 (매일 미래 경기 수집)

---

## 개요

Chart.js 4.4.1을 사용하여 다양한 통계 시각화 구현.

---

## Phase 1: 시각화 강화

### 1.1 슈팅 효율 트렌드 차트
- **위치**: 선수 상세 페이지 (`#/players/{id}`)
- **차트 종류**: Line chart
- **데이터**: FG%, 3P%, FT%, TS% 시즌별 추이
- **파일**: `src/app.js`, `index.html`

### 1.2 선수 스탯 레이더 차트
- **위치**: 선수 상세 페이지
- **차트 종류**: Radar/Spider chart
- **데이터**: PTS, REB, AST, STL, BLK, PIR (리그 백분위 기준)
- **파일**: `src/app.js`, `index.html`

### 1.3 최근 경기 성적 바 차트
- **위치**: 선수 상세 페이지 (게임로그 섹션)
- **차트 종류**: Horizontal bar chart
- **데이터**: 최근 10-15경기 PTS/REB/AST

### 1.4 팀 순위 시각화
- **위치**: 팀 페이지 (`#/teams`)
- **차트 종류**: Horizontal bar chart
- **데이터**: 승률, 홈/어웨이 성적

### 1.5 비교 페이지 차트 업그레이드
- **현재**: HTML/CSS로 만든 수동 바
- **변경**: Chart.js 레이더 차트 + 바 차트

---

## Phase 2: 경기 일정 페이지

### 2.1 백엔드 수정 (ingest_wkbl.py)
- `--include-future` 옵션 추가
- 미래 경기를 DB에 저장 (score = NULL)
- 현재 월 + 다음 2개월 일정 가져오기

### 2.2 API/쿼리 추가
- `src/db.js`: `getUpcomingGames()` 함수
- `tools/api.py`: `/games/upcoming` 엔드포인트 (선택)

### 2.3 프론트엔드 페이지
- **라우트**: `#/schedule`
- **구성요소**:
  - 다음 경기 하이라이트 카드 (D-day 카운트다운)
  - 예정 경기 목록 (팀 필터)
  - 최근 경기 결과 (최근 5경기)

### 2.4 네비게이션 추가
- `index.html`에 "일정" 메뉴 추가

---

## Phase 3: 선수 활약 예측 페이지

### 3.1 예측 알고리즘 (고급)

**기본 예측:**
```
기본값 = (최근 5경기 평균 × 0.6) + (최근 10경기 평균 × 0.4)
```

**홈/어웨이 보정:**
```
홈 경기: 기본값 × 1.05 (역사적으로 약 5% 상승)
어웨이: 기본값 × 0.97
```

**상대팀 수비력 반영:**
```
상대팀 실점 순위 1-2위: 예측값 × 0.90
상대팀 실점 순위 3-4위: 예측값 × 1.00
상대팀 실점 순위 5-6위: 예측값 × 1.10
```

**시즌 트렌드 분석:**
```
최근 5경기 평균 > 시즌 평균: "상승세" 표시 (+5% 보정)
최근 5경기 평균 < 시즌 평균: "하락세" 표시 (-5% 보정)
```

**신뢰 구간:**
```
하한 = 예측값 - (표준편차 × 1.0)
상한 = 예측값 + (표준편차 × 1.0)
```

### 3.2 페이지 구조
- **라우트**: `#/predict`
- **구성요소**:
  - 선수 검색/선택
  - 예측 결과 카드 (PTS, REB, AST 범위 표시)
  - 최근 성적 트렌드 차트
  - 예측 근거 설명

### 3.3 시각화
- 신뢰 구간 바 차트
- 최근 10경기 + 예측값 라인 차트

---

## Phase 4: 코트마진 (Court Margin) 지표 추가

### 4.1 코트마진 정의
**코트마진 (Court Margin / On-Court Plus-Minus)**은 특정 선수가 코트에 있을 때와 없을 때의 팀 득실점 차이를 나타내는 지표.

```
코트마진 = (선수 출전 시 팀 득점 - 선수 출전 시 팀 실점) / 출전 경기 수
```

WKBL 데이터에서는 경기별 +/- 데이터가 없으므로, 다음과 같이 근사 계산:
```
코트마진 ≈ (팀 평균 득점 × 출전시간비율) - (팀 평균 실점 × 출전시간비율)
         = 출전시간비율 × (팀 평균 득점 - 팀 평균 실점)
```

또는 개별 경기 기준:
```
경기별 코트마진 = (팀 득점 - 팀 실점) × (선수 출전시간 / 40분)
시즌 코트마진 = 경기별 코트마진의 합 / 출전 경기 수
```

### 4.2 데이터 요구사항
- `player_games` 테이블에서 가져올 수 있는 정보:
  - 선수 출전 시간 (minutes)
  - 경기 ID → games 테이블에서 home_score, away_score
  - 선수 소속팀 → 홈/어웨이 구분

### 4.3 구현 위치
- **선수 상세 페이지**: 커리어 요약에 코트마진 표시
- **선수 목록**: 테이블에 코트마진 컬럼 추가 (선택적)
- **비교 페이지**: 코트마진 비교 항목 추가
- **예측 페이지**: 코트마진 기반 팀 기여도 분석

### 4.4 시각화
- 코트마진 트렌드 라인 차트 (시즌별)
- 코트마진 분포 히스토그램 (리그 전체 대비)
- 레이더 차트에 코트마진 추가

### 4.5 코드 수정
- `src/db.js`: `calculateCourtMargin()` 함수 추가
- `src/app.js`: 코트마진 표시 로직 추가
- `src/styles.css`: 코트마진 뱃지/표시 스타일

---

## Phase 5: 예측 저장 및 비교

### 5.1 예측 저장 워크플로우

```
[데이터 수집 시점]
ingest_wkbl.py --include-future
       │
       ├─→ 미래 경기 목록 가져오기
       │
       ├─→ 각 경기에 대해:
       │     ├─→ 홈/원정 팀 로스터 조회 (get_team_players)
       │     ├─→ 각 선수 최근 10경기 조회 (get_player_recent_games)
       │     ├─→ PIR 기반 최적 5인 선정 (_select_optimal_lineup)
       │     ├─→ 선수별 예측 계산 (_calculate_player_prediction)
       │     ├─→ 팀 승률 예측 (_calculate_win_probability)
       │     └─→ DB에 저장 (save_game_predictions)
       │
       └─→ game_predictions, game_team_predictions 테이블

[브라우저]
#/games/{id} 박스스코어 페이지
       │
       ├─→ DB에서 예측 조회 (getGamePredictions)
       ├─→ 실제 결과와 비교
       └─→ 예측 적중/실패 표시
```

### 5.2 예측 테이블 스키마

**game_predictions** (선수별 예측):
| 컬럼 | 타입 | 설명 |
|------|------|------|
| game_id | TEXT | 경기 ID (FK) |
| player_id | TEXT | 선수 ID (FK) |
| team_id | TEXT | 팀 ID (FK) |
| is_starter | INTEGER | 추천 선발 여부 (1=선발) |
| predicted_pts | REAL | 예측 득점 |
| predicted_pts_low | REAL | 예측 득점 하한 |
| predicted_pts_high | REAL | 예측 득점 상한 |
| predicted_reb | REAL | 예측 리바운드 |
| predicted_ast | REAL | 예측 어시스트 |

**game_team_predictions** (팀 예측):
| 컬럼 | 타입 | 설명 |
|------|------|------|
| game_id | TEXT | 경기 ID (FK) |
| home_win_prob | REAL | 홈팀 승률 예측 (0-100) |
| away_win_prob | REAL | 원정팀 승률 예측 (0-100) |
| home_predicted_pts | REAL | 홈팀 예상 총득점 |
| away_predicted_pts | REAL | 원정팀 예상 총득점 |

### 5.3 박스스코어 예측 비교 UI

- **팀 예측 비교**: 승률 예측 vs 실제 결과 (적중/실패)
- **점수 비교**: 예상 점수 vs 실제 점수
- **선수별 표시**:
  - 선발 추천 선수: 파란색 "선발" 뱃지
  - 득점 예측 범위 내: 녹색 배경
  - 득점 예측 초과: 파란색 배경
  - 득점 예측 미달: 빨간색 배경

---

## 수정할 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/app.js` | 차트 함수들, 라우트 핸들러, 예측 알고리즘, 코트마진 계산 |
| `index.html` | 새 뷰 섹션, 캔버스 요소, 네비게이션 |
| `src/db.js` | `getUpcomingGames()`, `getPlayerRecentGames()`, `calculateCourtMargin()` |
| `src/styles.css` | 일정 카드, 예측 결과, 코트마진 스타일 |
| `tools/ingest_wkbl.py` | 미래 경기 저장 로직 |

---

## 구현 순서 (권장)

```
1. Phase 1 (시각화) - 기존 데이터 활용, 즉시 구현 가능
   └── 1.1 슈팅 효율 차트 → 1.4 팀 순위 → 1.2 레이더 → 1.5 비교

2. Phase 4 (코트마진) - 기존 데이터로 계산 가능
   └── 4.5 계산 함수 → 4.3 표시 → 4.4 시각화

3. Phase 2 (일정) - ingest 수정 필요
   └── 2.1 백엔드 → 2.2 쿼리 → 2.3 프론트 → 2.4 스타일

4. Phase 3 (예측) - 가장 복잡
   └── 3.1 알고리즘 → 3.2 페이지 → 3.3 시각화
```

---

## 의존성

- **추가 라이브러리 불필요**: Chart.js 4.4.1, sql.js 1.10.3 이미 CDN으로 로드됨

---

## 검증 방법

1. `python3 -m http.server 8000`으로 로컬 테스트
2. 각 페이지 접속하여 차트 렌더링 확인
3. 브라우저 콘솔에서 에러 없는지 확인
4. 모바일 뷰에서 반응형 확인

---

## 코트마진 계산 예시

```javascript
// 경기별 코트마진 계산
function calculateGameCourtMargin(playerMinutes, teamScore, opponentScore) {
  const playTimeRatio = playerMinutes / 40; // 40분 = 풀타임
  const scoreDiff = teamScore - opponentScore;
  return scoreDiff * playTimeRatio;
}

// 시즌 코트마진 (평균)
function calculateSeasonCourtMargin(games) {
  const margins = games.map(g => calculateGameCourtMargin(g.minutes, g.teamScore, g.oppScore));
  return margins.reduce((a, b) => a + b, 0) / games.length;
}
```

---

## 참고: 고급 코트마진 지표

향후 확장 가능한 고급 지표:
- **On/Off Rating**: 선수 출전 시 vs 미출전 시 팀 효율 차이
- **Box Plus/Minus (BPM)**: 박스스코어 기반 추정 +/-
- **Net Rating**: 100 포제션당 득실점 차이

현재 WKBL 데이터로는 On/Off 비교가 불가능하므로, 출전 시간 가중 득실점 차이로 근사합니다.
