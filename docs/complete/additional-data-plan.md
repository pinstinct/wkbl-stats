# 추가 데이터 수집 계획

> 조사일: 2026-02-10
> 상태: Phase 1 구현 완료 (2026-02-10)

## 조사 범위

| 소스             | URL                  | 접근 가능 여부         |
| ---------------- | -------------------- | ---------------------- |
| WKBL Data Lab    | `datalab.wkbl.or.kr` | O                      |
| WKBL 공식 사이트 | `www.wkbl.or.kr`     | O                      |
| 네이버 스포츠    | `m.sports.naver.com` | X (API 인증 필요, 403) |

---

## 현재 수집 중인 데이터

| 데이터                 | 엔드포인트                         | 상태       |
| ---------------------- | ---------------------------------- | ---------- |
| 경기별 선수 박스스코어 | `datalab:9001/record_player.asp`   | ✅ 수집 중 |
| 경기별 팀 기록         | `datalab:9001/record_team.asp`     | ✅ 수집 중 |
| 경기 목록              | `datalab/game/list/month`          | ✅ 수집 중 |
| 팀 순위                | `wkbl/ajax/ajax_team_rank.asp`     | ✅ 수집 중 |
| 경기 일정              | `wkbl/game/sch/inc_list_1_new.asp` | ✅ 수집 중 |
| 선수 명단/프로필       | `wkbl/player/player_list.asp`      | ✅ 수집 중 |

## 기존 계획 (진행 중)

> `docs/eager-percolating-kernighan.md` 계획의 5가지 데이터

| #   | 데이터           | 엔드포인트                          | 구현 상태                         |
| --- | ---------------- | ----------------------------------- | --------------------------------- |
| 1   | Play-by-Play     | `datalab/playByPlay`                | ✅ 완료 (DB + 파서 + fetch + CLI) |
| 2   | Shot Chart       | `datalab/shotCharts`                | ✅ 완료 (DB + 파서 + fetch + CLI) |
| 3   | 팀 카테고리 순위 | `wkbl/ajax/ajax_part_team_rank.asp` | ✅ 완료 (DB + 파서 + fetch + CLI) |
| 4   | 상대전적 (H2H)   | `wkbl/ajax/ajax_report.asp`         | ✅ 완료 (DB + 파서 + fetch + CLI) |
| 5   | 경기 MVP         | `wkbl/game/today_mvp.asp`           | ✅ 완료 (DB + 파서 + fetch + CLI) |

---

## 신규 발견 데이터

### DataLab 신규 엔드포인트

#### 1. Lead Tracker (쿼터별 점수 + 득점 흐름)

- **URL**: `datalab.wkbl.or.kr/leadTracker?menu=leadTracker&selectedId={game_id}`
- **로딩**: 서버 렌더링 HTML + JS (`drawPlayerButton()` 함수 호출)
- **데이터**:
  - 쿼터별 점수표 (Q1~Q4, 연장 포함)
  - 모든 득점 이벤트의 시간, 홈/원정 누적 점수, 이벤트 ID
- **`drawPlayerButton()` 파라미터**:
  ```
  drawPlayerButton(false, eventId, homeScore, awayScore, 'Q1', totalQuarters, quarterIndex, minute, second, isHome, isAway)
  예: drawPlayerButton(false, 1781743, 2, 0, 'Q1', 4, 0, 17, 13, true, false)
  ```
- **가치**: **높음** - games 테이블에 쿼터별 점수가 없음. 득점 흐름 시각화 가능.
- **중복**: PBP와 일부 중복되지만, 쿼터별 점수표는 여기서만 간단히 추출 가능.

#### 2. Team Analysis (팀 매치업 분석 JSON)

- **URL**: `datalab.wkbl.or.kr/teamAnalysis?id={game_id}`
- **로딩**: HTML + **임베디드 JSON** (`JSON.parse()`)
- **JSON 구조**:
  ```json
  {
    "versusList": [
      {
        "season": "046",
        "seasonName": "2025-2026",
        "homeWin": 3,
        "homeLose": 0
      }
    ],
    "homeTeamStatistics": {
      "teamCode": "03",
      "scoreAvg": 70.15,
      "rebAvg": 39.52,
      "astAvg": 17.96,
      "stlAvg": 7.59,
      "blkAvg": 2.74,
      "scoreRank": 2,
      "rebRank": 4,
      "astRank": 3,
      "scorePercent": 75.61,
      "scoreMax": 74.64,
      "scoreMin": 58.07
    },
    "matchRecordList": [
      {
        "gameID": "04601012",
        "gameDate": "20251129",
        "courtName": "인천도원체육관",
        "courtShortName": "인천",
        "homeTeamCode": "03",
        "awayTeamCode": "07",
        "homeTeamScore": 65,
        "awayTeamScore": 58,
        "homeTeamScoreQ1": 20,
        "homeTeamScoreQ2": 12,
        "homeTeamScoreQ3": 22,
        "homeTeamScoreQ4": 11,
        "homeTeamScoreEQ": 0,
        "homeFirstHalfScore": 32,
        "homeSecondHalfScore": 33,
        "homeTeamRank": 4,
        "homeTeamWin": 2,
        "homeTeamLose": 2,
        "winnerTeamCode": "03",
        "winnerTeamName": "삼성생명"
      }
    ]
  }
  ```
- **가치**: **매우 높음**
  - 쿼터별 점수 (Q1~Q4 + 연장)
  - 전반/후반 점수
  - 경기장 이름 (courtName, courtShortName)
  - 경기 시점 팀 순위/전적
  - 시즌별 상대전적 집계 (versusList)
  - 팀 시즌 평균 + 순위 + 백분위 (homeTeamStatistics)
- **특이사항**: 기존 계획의 H2H 데이터(ajax_report.asp)보다 훨씬 풍부한 JSON 구조. 이 엔드포인트 하나로 쿼터 점수 + H2H + 팀 비교를 모두 처리 가능.

#### 3. Position Analysis (포지션별 매치업 JSON)

- **URL**: `datalab.wkbl.or.kr/positionAnalysis/search?gameID={game_id}&startSeasonCode=046&endSeasonCode=046`
- **로딩**: JSON API (직접 접근 가능)
- **JSON 구조**:
  ```json
  {
    "positionStatistics": [
      {
        "position": "C",
        "homeScore": 17.5,
        "awayScore": 20.25,
        "homeFgm3": 0.0,
        "homeReb": 8.25,
        "homeAst": 3.0,
        "homeStl": 0.75,
        "homeBlk": 1.5,
        "homeEff": 30.04,
        "homeNomalizedValueArray": [0.79, 0.64, 0.68, 0.66, 0.75, 0.54]
      }
    ],
    "wholePositionAverageScore": [
      { "position": "G", "homeScore": 17.32, "awayScore": 28.32 }
    ]
  }
  ```
- **가치**: **중간** - 포지션별 매치업 비교(G vs G, F vs F, C vs C). 레이더 차트용 정규화 데이터 포함.

### WKBL 공식 사이트 신규 엔드포인트

#### 4. 선수 카테고리 순위 (개인 스탯 랭킹)

- **URL**: `GET wkbl.or.kr/game/ajax/ajax_player_record.asp?season_gu={season}&part={category}`
- **유효한 part 값**: `point`, `rebound`, `assist`, `steal`, `block`, `minute` (6개)
  - `3point`, `foul`, `freethrow`, `efficiency` → 500 에러 (비활성)
- **데이터 (part=point)**:
  | 순위 | 선수 | 소속 | G | 3점 | 2점 | 자유투 | 총득점 | 평균득점 |
  |------|------|------|---|-----|-----|--------|--------|---------|
  | 1 | 이해란 | 삼성생명 | 22 | - | - | - | 411 | 18.68 |
- **데이터 (part=rebound)**:
  | 순위 | 선수 | 소속 | G | OFF | ORPG | DEF | DRPG | TOT | RPG |
  |------|------|------|---|-----|------|-----|------|-----|-----|
  | 1 | 김단비 | 우리은행 | 22 | 78 | 3.55 | 177 | 8.05 | 255 | 11.59 |
- **가치**: **낮음** - 기존 player_games 데이터로 계산 가능. 단, 공식 순위 확인용으로 참고 가치 있음.
- **추천**: 수집하지 않음 (기존 데이터로 계산 가능)

#### 5. 드래프트 기록

- **URL**: `wkbl.or.kr/history/draft.asp`
- **로딩**: 정적 HTML (26년분 데이터, 1999~2025)
- **데이터**: 순위, 팀명, 선수명, 생년월일, 출신학교
- **가치**: **중간** - 선수 출신학교 정보는 다른 곳에서 얻기 어려움
- **참고**: 선수 pno 미포함 (이름+팀으로 매칭 필요)

#### 6. 수상 기록

- **URL**: `wkbl.or.kr/history/awards.asp`
- **로딩**: 정적 HTML (27년분, 1998~2025)
- **카테고리**: 역대 BEST5, 라운드 MIP/MVP, 개인수상(통계), 개인수상(투표)
- **가치**: **중간** - 선수 프로필 풍부화. 단, pno 미포함.

#### 7. 이적 정보

- **URL**: `POST wkbl.or.kr/player/ajax/ajax_trade_info.asp`
- **데이터**: 연도별 이적 내역 (원래 팀 → 새 팀, 선수명)
- **가치**: **낮음** - 이적 시즌 정보는 player_games로 추론 가능

#### 8. FA 계약 정보

- **URL**: `wkbl.or.kr/history/fa_result.asp`
- **로딩**: 정적 HTML (2021~2025)
- **데이터**: FA 구분, 원소속, 이적팀, 계약기간, 연봉, 계약금, 총액
- **가치**: **낮음** - 대시보드 성격과 맞지 않음 (재무 데이터)

#### 9. 팀 정보 (경기장, 코칭스태프)

- **URL**: `wkbl.or.kr/team/teaminfo.asp?team_code={code}`
- **데이터**: 창단연도, 구단주, 감독/코치진, 경기장(이름/주소/수용인원), 우승 이력
- **가치**: **낮음** - 거의 변하지 않는 정적 데이터

#### 10. 역대 기록

- **URL**: `wkbl.or.kr/history/major_team.asp`
- **데이터**: 팀/개인 역대 최고/최저 기록 (1경기 최다 득점, 3점슛, 연승 등)
- **가치**: **낮음** - 흥미로운 데이터지만 파싱 복잡, 갱신 빈도 낮음

### 네이버 스포츠

- **API Gateway**: `api-gw.sports.naver.com` → **403 Forbidden** (인증 필요)
- **페이지**: React SPA, 서버 사이드 데이터 없음 (JS 번들에서 API 호출)
- **결론**: 프로그래밍적 접근 불가. 수집 대상에서 제외.

---

## 구현 우선순위

### Tier 1: 높은 가치 + 쉬운 구현 (기존 계획에 추가)

| #   | 데이터                                            | 이유                                                       | 구현 난이도 |
| --- | ------------------------------------------------- | ---------------------------------------------------------- | ----------- |
| A   | **쿼터별 점수** (Lead Tracker 또는 Team Analysis) | games 테이블에 없는 데이터, 박스스코어 화면 풍부화         | 쉬움        |
| B   | **경기장 정보** (Team Analysis JSON)              | courtName, courtShortName - games 테이블에 venue 컬럼 추가 | 쉬움        |

### Tier 2: 중간 가치 (별도 구현)

| #   | 데이터                           | 이유                          | 구현 난이도                |
| --- | -------------------------------- | ----------------------------- | -------------------------- |
| C   | **Position Analysis** (JSON API) | 포지션별 매치업 시각화 가능   | 쉬움 (JSON API)            |
| D   | **드래프트 기록**                | 선수 출신학교 + 드래프트 순위 | 중간 (정적 HTML, pno 매칭) |
| E   | **수상 기록**                    | 선수 프로필 풍부화            | 중간 (정적 HTML, pno 매칭) |

### Tier 3: 낮은 가치 (당장 불필요)

| #   | 데이터             | 이유                      |
| --- | ------------------ | ------------------------- |
| F   | 선수 카테고리 순위 | 기존 데이터로 계산 가능   |
| G   | 이적 정보          | player_games로 추론 가능  |
| H   | FA 계약            | 대시보드 성격과 무관      |
| I   | 팀 정보 (정적)     | 정적 데이터, 낮은 활용도  |
| J   | 역대 기록          | 파싱 복잡, 낮은 갱신 빈도 |
| K   | 네이버 스포츠      | API 접근 불가             |

---

## 구현 계획

### Phase 1: 기존 계획 완료 + Tier 1 통합

기존 5개 데이터(PBP, 샷차트, 팀카테고리, H2H, MVP) 파서 구현과 함께:

#### 1-A. games 테이블에 쿼터 점수 + 경기장 컬럼 추가

**방법**: Team Analysis JSON에서 `matchRecordList` 파싱

```sql
-- games 테이블에 컬럼 추가
ALTER TABLE games ADD COLUMN home_q1 INTEGER;
ALTER TABLE games ADD COLUMN home_q2 INTEGER;
ALTER TABLE games ADD COLUMN home_q3 INTEGER;
ALTER TABLE games ADD COLUMN home_q4 INTEGER;
ALTER TABLE games ADD COLUMN home_ot INTEGER;  -- 연장 (EQ)
ALTER TABLE games ADD COLUMN away_q1 INTEGER;
ALTER TABLE games ADD COLUMN away_q2 INTEGER;
ALTER TABLE games ADD COLUMN away_q3 INTEGER;
ALTER TABLE games ADD COLUMN away_q4 INTEGER;
ALTER TABLE games ADD COLUMN away_ot INTEGER;
ALTER TABLE games ADD COLUMN venue TEXT;       -- 경기장 이름
```

**데이터 소스**: `datalab.wkbl.or.kr/teamAnalysis?id={game_id}` 의 `matchRecordList`

- 한 번의 요청으로 해당 매치업의 모든 경기 쿼터 점수를 한꺼번에 수집 가능
- 효율적: 15개 매치업(6팀 조합) × 요청 1회 = 15 요청으로 전체 시즌 쿼터 점수 수집

**대안**: Lead Tracker 페이지에서도 쿼터 점수 추출 가능하지만, 경기당 1회 요청 필요 (비효율적)

#### 1-B. 기존 PBP 파서에 video_timestamp 추가 (선택)

PBP HTML에서 Wowza HLS 타임스탬프를 추출해 play_by_play 테이블에 저장:

- `video_start_ms` INTEGER (예: 916000)
- 향후 하이라이트 클립 기능 기초 데이터

### Phase 2: Position Analysis

#### 2-A. position_matchups 테이블 추가

```sql
CREATE TABLE IF NOT EXISTS position_matchups (
    game_id TEXT NOT NULL,
    position TEXT NOT NULL,          -- G, F, C
    scope TEXT NOT NULL DEFAULT 'vs', -- 'vs' (상대전적), 'season' (시즌 전체)
    home_pts REAL, away_pts REAL,
    home_tpm REAL, away_tpm REAL,
    home_reb REAL, away_reb REAL,
    home_ast REAL, away_ast REAL,
    home_stl REAL, away_stl REAL,
    home_blk REAL, away_blk REAL,
    home_eff REAL, away_eff REAL,
    PRIMARY KEY (game_id, position, scope)
);
```

**데이터 소스**: `datalab.wkbl.or.kr/positionAnalysis/search?gameID={id}&startSeasonCode=046&endSeasonCode=046`

- JSON API로 직접 접근 가능 (파싱 불필요)
- 경기당 1회 요청

### Phase 3: 드래프트 + 수상 기록 (후속 과제)

선수 프로필 풍부화를 위한 historical 데이터 수집. pno 매칭 전략 수립 필요.

---

## 수정 대상 파일

### Phase 1 (기존 계획 + Tier 1)

| 파일                      | 변경 내용                                                                    |
| ------------------------- | ---------------------------------------------------------------------------- |
| `tools/config.py`         | `TEAM_ANALYSIS_URL` 상수 추가                                                |
| `tools/database.py`       | games 테이블 스키마에 쿼터 점수/경기장 컬럼 추가, 관련 함수 수정             |
| `tools/ingest_wkbl.py`    | 기존 5개 파서 + `parse_team_analysis_json()` + `fetch_quarter_scores()` 추가 |
| `tests/test_database.py`  | 쿼터 점수 저장/조회 테스트 추가                                              |
| `src/db.js`               | 쿼터 점수 쿼리 함수 추가                                                     |
| `.github/workflows/*.yml` | CLI 플래그 추가                                                              |

### Phase 2 (Position Analysis)

| 파일                     | 변경 내용                         |
| ------------------------ | --------------------------------- |
| `tools/config.py`        | `POSITION_ANALYSIS_URL` 상수 추가 |
| `tools/database.py`      | position_matchups 테이블 추가     |
| `tools/ingest_wkbl.py`   | `fetch_position_analysis()` 추가  |
| `tests/test_database.py` | position_matchups 테스트 추가     |

---

## 효율성 분석

### Team Analysis JSON 활용 전략

기존 계획의 H2H (`ajax_report.asp`)를 Team Analysis JSON으로 **대체/보완** 가능:

| 기능           | 기존 계획 (ajax_report.asp) | Team Analysis JSON          |
| -------------- | --------------------------- | --------------------------- |
| 상대전적 W-L   | O                           | O (versusList)              |
| 경기별 점수    | O (총점만)                  | O (쿼터별 점수 포함)        |
| 경기장 정보    | X                           | O (courtName)               |
| 팀 시즌 평균   | X                           | O (homeTeamStatistics)      |
| 팀 순위/백분위 | X                           | O (scoreRank, scorePercent) |

**결론**: Team Analysis JSON이 H2H보다 풍부. 단, H2H는 전체 팀 매트릭스를 한번에 볼 수 있어 보완적으로 유지.

### 요청 수 비교

| 방법          | 쿼터 점수 수집 방법 | 시즌당 요청 수  |
| ------------- | ------------------- | --------------- |
| Lead Tracker  | 경기당 1회          | ~90회 (경기 수) |
| Team Analysis | 매치업당 1회        | 15회 (6C2 조합) |

→ **Team Analysis 방식이 6배 효율적**

---

## 요약

| 구분                   | 항목 수 | 내용                                          |
| ---------------------- | ------- | --------------------------------------------- |
| 기존 계획 (진행 중)    | 5개     | PBP, 샷차트, 팀카테고리, H2H, MVP             |
| 신규 추가 (Tier 1)     | 2개     | 쿼터별 점수, 경기장 정보                      |
| 신규 추가 (Tier 2)     | 3개     | 포지션 분석, 드래프트, 수상 기록              |
| 수집하지 않음 (Tier 3) | 6개     | 개인 순위, 이적, FA, 팀정보, 역대기록, 네이버 |
