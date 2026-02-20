# WKBL 데이터 수집 가이드

이 문서는 WKBL Data Lab에서 선수 스탯을 수집하는 방법을 설명합니다.

## 데이터 수집 흐름

```
┌─────────────────────────────────────────────────────────────────────┐
│                        tools/ingest_wkbl.py                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. 시즌 파라미터 탐색 (--auto)                                        │
│    GET https://datalab.wkbl.or.kr/                                  │
│    → 시즌 시작일, selectedId 추출                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. 경기 목록 조회                                                     │
│    GET https://datalab.wkbl.or.kr/game/list/month                   │
│    → 시즌 내 모든 game_id 목록 추출                                    │
│    → end-date까지의 경기만 필터링                                      │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. 경기별 박스스코어 수집 (반복)                                        │
│    GET https://datalab.wkbl.or.kr/playerRecord?selectedId={game_id} │
│    → iframe src에서 record_player.asp URL 추출                        │
│                                                                     │
│    GET https://datalab.wkbl.or.kr:9001/data_lab/record_player.asp   │
│    → HTML 테이블 파싱                                                 │
│    → 선수별 경기 기록 추출:                                            │
│       - 이름, 팀, 포지션                                              │
│       - 출전시간, 득점, 리바운드, 어시스트, 스틸, 블록, 턴오버            │
│       - 2점슛(성공-시도), 3점슛(성공-시도), 자유투(성공-시도)             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. 현역 선수 명단 조회                                                 │
│    GET https://www.wkbl.or.kr/player/player_list.asp                │
│    → 현역 선수 이름, 팀, pno(선수ID) 추출                               │
│                                                                     │
│    GET https://www.wkbl.or.kr/player/detail.asp?pno={pno} (각 선수)  │
│    → 포지션, 신장 추출                                                │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. 데이터 집계 (aggregate_players)                                   │
│    - 선수별 경기 기록 합산                                             │
│    - 경기당 평균 계산 (PTS, REB, AST, STL, BLK, TOV, MIN)             │
│    - 슈팅 퍼센티지 계산 (FG%, 3P%, FT%)                               │
│    - 2차 지표 계산 (TS%, eFG%, AST/TO, PIR, PER36)                   │
│    - 현역 선수 정보와 매칭 (포지션, 신장 보강)                           │
│    - --active-only 시 현역 선수만 필터링                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. 데이터베이스 저장 (--save-db 옵션)                                  │
│    → data/wkbl.db (SQLite)                                          │
│    → 테이블: seasons, teams, players, games, player_games, team_games│
│    → 이미 저장된 경기는 스킵 (증분 업데이트)                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. JSON 출력                                                        │
│    → data/wkbl-active.json                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 핵심 함수

| 함수                         | 역할                                                 |
| ---------------------------- | ---------------------------------------------------- |
| `fetch()`                    | URL GET 요청 + 캐싱 + 재시도 로직                    |
| `fetch_post()`               | URL POST 요청 + 캐싱 + 재시도 로직                   |
| `get_season_meta()`          | 시즌 파라미터 자동 탐색                              |
| `get_season_meta_by_code()`  | 시즌 코드로 메타데이터 조회                          |
| `parse_game_type()`          | game_id에서 경기 유형 추출 (regular/playoff/allstar) |
| `parse_game_list_items()`    | 경기 목록에서 game_id 추출                           |
| `parse_player_tables()`      | 박스스코어 HTML → 선수별 기록 파싱                   |
| `fetch_team_standings()`     | 팀 순위 수집 (AJAX POST)                             |
| `parse_standings_html()`     | 순위 HTML → 팀별 순위 파싱                           |
| `load_active_players()`      | 현역 선수 명단 + 프로필 수집                         |
| `aggregate_players()`        | 경기 기록 → 시즌 평균 집계                           |
| `_compute_averages()`        | 1차/2차 지표 계산                                    |
| `_ingest_single_season()`    | 단일 시즌 데이터 수집                                |
| `_ingest_multiple_seasons()` | 복수 시즌 일괄 수집                                  |

---

## 엔드포인트 상세

### 1. 경기별 박스스코어 (Player Record)

선수 기록 페이지는 iframe을 통해 실제 스탯 테이블을 로드합니다.

**Wrapper 페이지:**

```
https://datalab.wkbl.or.kr/playerRecord?menu=playerRecord&selectedId=04601055
```

**iframe 내 ASP 페이지:**

```
https://datalab.wkbl.or.kr:9001/data_lab/record_player.asp?season_gu=046&game_type=01&game_no=055
```

이 페이지에서 파싱하는 데이터:

- 선수명, 포지션
- MIN (출전시간, MM:SS 형식)
- 2PM-A (2점슛 성공-시도)
- 3PM-A (3점슛 성공-시도)
- FTM-A (자유투 성공-시도)
- OFF, DEF, REB (리바운드)
- AST, PF, STL, TO, BLK, PTS

### 2. 경기 목록 (Game List)

시즌 전체 경기 목록을 가져옵니다.

**월별 목록:**

```
https://datalab.wkbl.or.kr/game/list/month?firstGameDate=20241027&selectedId=04601055&selectedGameDate=20260126
```

**일별 목록:**

```
https://datalab.wkbl.or.kr/game/list?startDate=20260125&prevOrNext=0&selectedId=04601055&selectedGameDate=20260126
```

HTML에서 `data-id` 속성으로 game_id 추출:

```html
<li
  class="game-item"
  data-id="04501001"
  onclick="selectGame('04501001', true);"
></li>
```

### 3. 선수 분석 JSON (Player Analysis)

Top-5 랭킹 데이터 (득점, 리바운드, 어시스트, 스틸, 블록):

```
https://datalab.wkbl.or.kr/playerAnalysis/search?gameID=04601055&startSeasonCode=046&endSeasonCode=046
```

응답 JSON 구조:

```json
{
  "scoreRanking": [...],
  "rebRanking": [...],
  "astRanking": [...],
  "stlRanking": [...],
  "blkRanking": [...]
}
```

### 4. 팀 순위 (Team Standings)

AJAX POST 요청으로 팀 순위를 가져옵니다.

**엔드포인트:**

```
POST https://www.wkbl.or.kr/game/ajax/ajax_team_rank.asp
```

**파라미터:**

```
season_gu=046  # 시즌 코드
gun=1          # 1: 정규시즌, 4: 플레이오프
```

**응답:** HTML 테이블 (11개 컬럼)
| 인덱스 | 컬럼 | 예시 |
|--------|------|------|
| 0 | 순위 | 1 |
| 1 | 팀명 | KB스타즈 |
| 2 | 경기수 | 18 |
| 3 | 승/패 | 13승 5패 |
| 4 | 승률 | 72.2 |
| 5 | 승차 | 0.0 |
| 6 | 홈 전적 | 6-3 |
| 7 | 원정 전적 | 7-2 |
| 8 | 중립 전적 | 0-0 |
| 9 | 최근 5경기 | 3-2 |
| 10 | 연속 기록 | 연3승 |

### 5. 경기 일정 (Game Schedule)

월별 경기 일정을 가져옵니다. 홈/원정 팀 정보 포함.

**엔드포인트:**

```
GET https://www.wkbl.or.kr/game/sch/inc_list_1_new.asp?season_gu=046&ym=202501&viewType=2&gun=1
```

**파라미터:**

- `season_gu`: 시즌 코드
- `ym`: 년월 (YYYYMM)
- `viewType`: 2 (리스트 뷰)
- `gun`: 1 (정규시즌), 4 (플레이오프)

**응답:** HTML 테이블 (날짜, 원정팀, 홈팀, game_no)

### 6. 선수 목록 (WKBL 공식 사이트)

**현역 선수 목록:**

```
https://www.wkbl.or.kr/player/player_list.asp
https://www.wkbl.or.kr/player/player_list.asp?player_group=12  # 동일
```

**은퇴 선수 목록:**

```
https://www.wkbl.or.kr/player/player_list.asp?player_group=11
```

**외국인 선수 목록:**

```
https://www.wkbl.or.kr/player/player_list.asp?player_group=F11
```

**선수 상세 - 현역 (포지션, 신장, 생년월일):**

```
https://www.wkbl.or.kr/player/detail.asp?pno=095778
```

**선수 상세 - 은퇴/외국인:**

```
https://www.wkbl.or.kr/player/detail2.asp?pno=095035
```

상세 페이지에서 파싱하는 정보:

- 포지션: `포지션</span> - G`
- 신장: `신장</span> - 175 cm`
- 생년월일: `생년월일</span> - 1990.02.27`

**선수 ID (pno):**

- 6자리 숫자 (예: 095778, 095035)
- 시즌/팀 이동과 무관하게 고유한 선수 식별자
- `--load-all-players` 옵션으로 현역+은퇴+외국인 선수 전체 로드 가능

### 7. Play-by-Play (DataLab)

경기의 실시간 이벤트를 추출합니다.

**엔드포인트:**

```
GET https://datalab.wkbl.or.kr/playByPlay?menu=playByPlay&selectedId={game_id}
```

**데이터:** `drawPlayerButton()` 호출에서 이벤트 ID, 홈/원정 점수, 쿼터, 시간 추출

### 8. Shot Chart (DataLab)

경기의 슈팅 위치 데이터를 추출합니다.

**엔드포인트:**

```
GET https://datalab.wkbl.or.kr/shotCharts?menu=shotCharts&selectedId={game_id}
```

**데이터:** `<a class="shot-icon shot-suc/fail">` 요소에서 좌표(x, y), 성공/실패, 선수 ID, 쿼터 추출

### 9. 팀 카테고리별 순위 (WKBL 공식)

팀별 12개 카테고리 순위를 수집합니다.

**엔드포인트:**

```
POST https://www.wkbl.or.kr/game/ajax/ajax_part_team_rank.asp
```

**파라미터:**

```
season_gu=046  # 시즌 코드
opart=1~12     # 카테고리 (1=득점, 2=실점, 3=리바운드, ...)
```

**카테고리:** pts, pts_against, reb, ast, stl, blk, tpm, two_pm, ftm, tpp, two_pp, ftp

### 10. 상대전적 (WKBL 공식)

팀 간 상대전적을 수집합니다 (6C2 = 15 조합).

**엔드포인트:**

```
POST https://www.wkbl.or.kr/game/ajax/ajax_report.asp
```

**파라미터:**

```
season_gu=046
tcode1=01      # WKBL 팀 코드 (01=KB, 03=삼성, 05=우리, 07=신한, 09=하나, 11=BNK)
tcode2=03
```

### 11. 경기 MVP (WKBL 공식)

시즌 경기 MVP 목록을 수집합니다.

**엔드포인트:**

```
GET https://www.wkbl.or.kr/game/today_mvp.asp?sscode={season_code}
```

**데이터:** 순위, 선수(pno 포함), 팀, 날짜, 출전시간, PTS, REB, AST, STL, BLK, TOV, EFF

### 12. Team Analysis (DataLab)

팀 매치업 분석 페이지에서 쿼터별 점수와 경기장 정보를 추출합니다.

**엔드포인트:**

```
GET https://datalab.wkbl.or.kr/teamAnalysis?id={game_id}&homeTeamCode={code1}&awayTeamCode={code2}
```

**데이터:** HTML 내 `JSON.parse('...')` 패턴에서 추출

```json
{
  "matchRecordList": [
    {
      "gameID": "04601012",
      "gameDate": "20251129",
      "courtName": "인천도원체육관",
      "homeTeamScoreQ1": 20,
      "homeTeamScoreQ2": 12,
      "homeTeamScoreQ3": 22,
      "homeTeamScoreQ4": 11,
      "homeTeamScoreEQ": 0,
      "awayTeamScoreQ1": 15,
      "awayTeamScoreQ2": 18,
      "awayTeamScoreQ3": 14,
      "awayTeamScoreQ4": 11,
      "awayTeamScoreEQ": 0
    }
  ]
}
```

**효율:** 15 요청(6C2 매치업)으로 시즌 전체 쿼터 점수 수집 (경기당 요청보다 6배 효율적)

---

## 데이터 소스 요약

| 데이터             | URL                                                  | 용도                            |
| ------------------ | ---------------------------------------------------- | ------------------------------- |
| 경기별 박스스코어  | `datalab.wkbl.or.kr:9001/data_lab/record_player.asp` | 선수별 경기 기록                |
| 경기별 팀 기록     | `datalab.wkbl.or.kr:9001/data_lab/record_team.asp`   | 팀별 경기 기록                  |
| 경기 목록          | `datalab.wkbl.or.kr/game/list/month`                 | game_id 수집                    |
| 경기 일정          | `wkbl.or.kr/game/sch/inc_list_1_new.asp`             | 홈/원정 팀, 날짜                |
| 팀 순위            | `wkbl.or.kr/game/ajax/ajax_team_rank.asp`            | 시즌 순위표 (POST)              |
| 현역 선수 명단     | `wkbl.or.kr/player/player_list.asp`                  | 현역 선수 pno 수집              |
| 은퇴 선수 명단     | `wkbl.or.kr/player/player_list.asp?player_group=11`  | 은퇴 선수 pno 수집              |
| 외국인 선수 명단   | `wkbl.or.kr/player/player_list.asp?player_group=F11` | 외국인 선수 pno 수집            |
| 선수 프로필 (현역) | `wkbl.or.kr/player/detail.asp`                       | 포지션, 신장, 생년월일          |
| 선수 프로필 (은퇴) | `wkbl.or.kr/player/detail2.asp`                      | 포지션, 신장, 생년월일          |
| Play-by-Play       | `datalab.wkbl.or.kr/playByPlay`                      | 경기 실시간 이벤트              |
| Shot Chart         | `datalab.wkbl.or.kr/shotCharts`                      | 슈팅 위치 데이터                |
| 팀 카테고리 순위   | `wkbl.or.kr/game/ajax/ajax_part_team_rank.asp`       | 팀별 12개 카테고리 순위 (POST)  |
| 상대전적 (H2H)     | `wkbl.or.kr/game/ajax/ajax_report.asp`               | 팀 간 상대전적 (POST)           |
| 경기 MVP           | `wkbl.or.kr/game/today_mvp.asp`                      | 시즌 경기 MVP 목록              |
| Team Analysis      | `datalab.wkbl.or.kr/teamAnalysis`                    | 쿼터별 점수, 경기장 정보 (JSON) |

---

## 데이터베이스 스키마

`--save-db` 옵션 사용 시 SQLite 데이터베이스에 저장됩니다.

```
seasons ─┐
         │
teams ───┼──→ games ──→ player_games (경기별 선수 기록)
         │        └──→ team_games (경기별 팀 기록)
         │        └──→ game_predictions (선수 예측)
         │        └──→ game_team_predictions (팀 예측)
         │        └──→ play_by_play (플레이바이플레이)
         │        └──→ shot_charts (샷 차트)
         │        └──→ lineup_stints (라인업 구간)
         │        └──→ position_matchups (포지션 매치업)
         │
         ├──→ team_standings (시즌 순위)
         ├──→ team_category_stats (팀 카테고리 순위)
         ├──→ head_to_head (상대전적)
         └──→ game_mvp (경기 MVP)
players ─┘
event_types (이벤트 코드 마스터)
```

| 테이블                  | 설명                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `seasons`               | 시즌 정보 (label, 시작일, 종료일)                               |
| `teams`                 | 팀 정보 (이름, 약칭)                                            |
| `players`               | 선수 정보 (pno, 이름, 팀, 포지션, 신장, 생년월일)               |
| `games`                 | 경기 정보 (날짜, 홈/원정팀, 점수, 쿼터 점수, 경기장, game_type) |
| `player_games`          | 경기별 선수 기록 (MIN, PTS, REB, AST, 슈팅 등)                  |
| `team_games`            | 경기별 팀 기록 (속공, 페인트존 득점 등)                         |
| `team_standings`        | 시즌 순위 (rank, wins, losses, win_pct, games_behind)           |
| `game_predictions`      | 선수별 경기 예측 (예측 PTS/REB/AST, 신뢰구간)                   |
| `game_team_predictions` | 팀별 경기 예측 (승률, 예상 점수)                                |
| `play_by_play`          | 플레이바이플레이 이벤트 (쿼터, 시계, 이벤트 유형, 점수)         |
| `shot_charts`           | 샷 차트 (선수, 좌표, 성공/실패, 쿼터)                           |
| `lineup_stints`         | 라인업 구간 (5인 조합, 득실점, 시간)                            |
| `position_matchups`     | 포지션 매치업 분석 (G/F/C별 스탯 비교)                          |
| `team_category_stats`   | 팀 카테고리별 순위 (12개 카테고리)                              |
| `head_to_head`          | 팀 간 상대전적 (점수, 경기장, 승자)                             |
| `game_mvp`              | 경기 MVP (선수, 스탯, EFF)                                      |
| `event_types`           | PBP 이벤트 코드 마스터 (코드, 한국어명, 카테고리)               |
| `_meta_descriptions`    | 테이블/컬럼 설명 메타데이터                                     |

### Game Types

| game_type | 설명                      |
| --------- | ------------------------- |
| `regular` | 정규시즌 경기             |
| `playoff` | 플레이오프 경기           |
| `allstar` | 올스타 게임 (game_id 001) |

### 테이블 상세 스키마

#### seasons (시즌)

| 컬럼         | 타입    | 설명                                            |
| ------------ | ------- | ----------------------------------------------- |
| `id`         | TEXT    | PK, 시즌 코드 (예: 046)                         |
| `label`      | TEXT    | 시즌 라벨 (예: 2025-26)                         |
| `start_date` | TEXT    | 시즌 시작일 (YYYY-MM-DD)                        |
| `end_date`   | TEXT    | 시즌 종료일 (YYYY-MM-DD), 진행 중인 시즌은 NULL |
| `is_current` | INTEGER | 현재 시즌 여부 (1: 현재, 0: 과거)               |

#### team_standings (팀 순위)

| 컬럼           | 타입    | 설명                         |
| -------------- | ------- | ---------------------------- |
| `id`           | INTEGER | PK, 자동 증가                |
| `season_id`    | TEXT    | 시즌 코드 (FK → seasons.id)  |
| `team_id`      | TEXT    | 팀 ID (FK → teams.id)        |
| `rank`         | INTEGER | 순위                         |
| `games_played` | INTEGER | 경기 수                      |
| `wins`         | INTEGER | 승                           |
| `losses`       | INTEGER | 패                           |
| `win_pct`      | REAL    | 승률 (0.000 ~ 1.000)         |
| `games_behind` | REAL    | 승차                         |
| `home_wins`    | INTEGER | 홈 승                        |
| `home_losses`  | INTEGER | 홈 패                        |
| `away_wins`    | INTEGER | 원정 승                      |
| `away_losses`  | INTEGER | 원정 패                      |
| `streak`       | TEXT    | 연속 기록 (예: 연3승, 연2패) |
| `last5`        | TEXT    | 최근 5경기 (예: 3-2)         |
| `updated_at`   | TEXT    | 마지막 업데이트 시간         |

**UNIQUE 제약:** `(season_id, team_id)`

#### games (경기)

| 컬럼           | 타입    | 설명                                |
| -------------- | ------- | ----------------------------------- |
| `id`           | TEXT    | PK, game_id (예: 04601055)          |
| `season_id`    | TEXT    | 시즌 코드 (FK → seasons.id)         |
| `game_date`    | TEXT    | 경기 날짜 (YYYY-MM-DD)              |
| `home_team_id` | TEXT    | 홈팀 ID (FK → teams.id)             |
| `away_team_id` | TEXT    | 원정팀 ID (FK → teams.id)           |
| `home_score`   | INTEGER | 홈팀 점수                           |
| `away_score`   | INTEGER | 원정팀 점수                         |
| `home_q1`      | INTEGER | 홈팀 1쿼터 점수                     |
| `home_q2`      | INTEGER | 홈팀 2쿼터 점수                     |
| `home_q3`      | INTEGER | 홈팀 3쿼터 점수                     |
| `home_q4`      | INTEGER | 홈팀 4쿼터 점수                     |
| `home_ot`      | INTEGER | 홈팀 연장전 점수                    |
| `away_q1`      | INTEGER | 원정팀 1쿼터 점수                   |
| `away_q2`      | INTEGER | 원정팀 2쿼터 점수                   |
| `away_q3`      | INTEGER | 원정팀 3쿼터 점수                   |
| `away_q4`      | INTEGER | 원정팀 4쿼터 점수                   |
| `away_ot`      | INTEGER | 원정팀 연장전 점수                  |
| `venue`        | TEXT    | 경기장 이름                         |
| `game_type`    | TEXT    | 경기 유형 (regular/playoff/allstar) |

#### players (선수)

| 컬럼         | 타입    | 설명                                |
| ------------ | ------- | ----------------------------------- |
| `id`         | TEXT    | PK, 선수 ID (pno, 예: 095778)       |
| `name`       | TEXT    | 선수 이름                           |
| `birth_date` | TEXT    | 생년월일 (YYYY-MM-DD)               |
| `height`     | TEXT    | 신장 (예: 180 cm)                   |
| `position`   | TEXT    | 포지션 (G/F/C)                      |
| `team_id`    | TEXT    | 현재 소속팀 ID (FK → teams.id)      |
| `is_active`  | INTEGER | 현역 여부 (1: 현역, 0: 은퇴/외국인) |

**참고:** `id`(pno)는 WKBL 공식 사이트에서 부여하는 고유 선수 번호입니다. 팀 이동이나 시즌과 무관하게 동일한 값을 유지하므로, 선수의 커리어 기록 추적에 활용됩니다.

#### player_games (경기별 선수 기록)

| 컬럼        | 타입    | 설명                      |
| ----------- | ------- | ------------------------- |
| `id`        | INTEGER | PK, 자동 증가             |
| `game_id`   | TEXT    | 경기 ID (FK → games.id)   |
| `player_id` | TEXT    | 선수 ID (FK → players.id) |
| `team_id`   | TEXT    | 팀 ID (FK → teams.id)     |
| `minutes`   | REAL    | 출전 시간 (분)            |
| `pts`       | INTEGER | 득점                      |
| `off_reb`   | INTEGER | 공격 리바운드             |
| `def_reb`   | INTEGER | 수비 리바운드             |
| `reb`       | INTEGER | 총 리바운드               |
| `ast`       | INTEGER | 어시스트                  |
| `stl`       | INTEGER | 스틸                      |
| `blk`       | INTEGER | 블록                      |
| `tov`       | INTEGER | 턴오버                    |
| `pf`        | INTEGER | 파울                      |
| `fgm`       | INTEGER | 야투 성공 (2점 + 3점)     |
| `fga`       | INTEGER | 야투 시도                 |
| `tpm`       | INTEGER | 3점슛 성공                |
| `tpa`       | INTEGER | 3점슛 시도                |
| `ftm`       | INTEGER | 자유투 성공               |
| `fta`       | INTEGER | 자유투 시도               |
| `two_pm`    | INTEGER | 2점슛 성공                |
| `two_pa`    | INTEGER | 2점슛 시도                |

**UNIQUE 제약:** `(game_id, player_id)`

#### team_games (경기별 팀 기록)

| 컬럼             | 타입    | 설명                     |
| ---------------- | ------- | ------------------------ |
| `id`             | INTEGER | PK, 자동 증가            |
| `game_id`        | TEXT    | 경기 ID (FK → games.id)  |
| `team_id`        | TEXT    | 팀 ID (FK → teams.id)    |
| `is_home`        | INTEGER | 홈 여부 (1: 홈, 0: 원정) |
| `fast_break_pts` | INTEGER | 속공 득점                |
| `paint_pts`      | INTEGER | 페인트존 득점            |
| `two_pts`        | INTEGER | 2점슛 득점               |
| `three_pts`      | INTEGER | 3점슛 득점               |
| `reb`            | INTEGER | 리바운드                 |
| `ast`            | INTEGER | 어시스트                 |
| `stl`            | INTEGER | 스틸                     |
| `blk`            | INTEGER | 블록                     |
| `tov`            | INTEGER | 턴오버                   |
| `pf`             | INTEGER | 파울                     |

**UNIQUE 제약:** `(game_id, team_id)`

**참고:** `two_pts`, `three_pts`는 득점(points)이며, 슈팅 시도 횟수가 아닙니다. 데이터 소스(record_team.asp)가 슈팅 시도 횟수를 제공하지 않습니다.

#### \_meta_descriptions (메타데이터)

테이블과 컬럼에 대한 설명을 저장하는 메타 테이블입니다.

| 컬럼          | 타입 | 설명                             |
| ------------- | ---- | -------------------------------- |
| `table_name`  | TEXT | 테이블 이름                      |
| `column_name` | TEXT | 컬럼 이름 (NULL이면 테이블 설명) |
| `description` | TEXT | 설명                             |

**PRIMARY KEY:** `(table_name, column_name)`

```python
# 사용 예시
from tools import database

# 테이블 설명 조회
desc = database.get_table_description("player_games")
# → "경기별 선수 기록 (핵심 테이블)"

# 컬럼 설명 조회
cols = database.get_column_descriptions("player_games")
# → {"id": "자동 증가 PK", "pts": "득점", ...}
```

---

## 주의사항

- 요청 간 0.15초 딜레이를 두어 서버 부하 방지
- 캐시를 활용하여 불필요한 중복 요청 방지
- DB에 이미 저장된 경기는 자동으로 스킵 (증분 업데이트)
- WKBL Data Lab 엔드포인트는 변경될 수 있으므로 주기적으로 검증 필요
- HTML 파싱 시 `&amp;` 등 HTML 엔티티 디코딩 필요
