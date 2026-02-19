# 고급 지표 추가 계획

## 현황 요약

### 현재 구현된 지표

| 지표                    | 공식                                | 파일             |
| ----------------------- | ----------------------------------- | ---------------- |
| FG% / 3P% / FT%         | FGM/FGA, TPM/TPA, FTM/FTA           | `tools/stats.py` |
| TS% (True Shooting)     | PTS / (2 × (FGA + 0.44 × FTA))      | `tools/stats.py` |
| eFG% (Effective FG)     | (FGM + 0.5 × TPM) / FGA             | `tools/stats.py` |
| PIR (Performance Index) | (PTS+REB+AST+STL+BLK-TOV-미스) / GP | `tools/stats.py` |
| AST/TO                  | AST / TOV                           | `tools/stats.py` |
| Per-36 (PTS, REB, AST)  | STAT × 36 / MIN                     | `tools/stats.py` |

### 보유 데이터 현황

| 데이터                 | 테이블           | 상태                                                                                 |
| ---------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| 경기별 선수 박스스코어 | `player_games`   | 완전 (MIN, PTS, REB, AST, STL, BLK, TOV, PF, FGM/A, TPM/A, FTM/A, 2PM/A, OREB, DREB) |
| 경기별 팀 스탯         | `team_games`     | 부분 (속공/페인트/2점/3점 **득점만**, FGA 없음)                                      |
| Play-by-Play           | `play_by_play`   | 완전 (쿼터, 시간, 이벤트, 팀/선수, 스코어, 교체 IN/OUT)                              |
| 교체 이벤트            | `play_by_play`   | 경기당 평균 34회 (sub_in 16,685건 / sub_out 16,706건)                                |
| 선수 포지션            | `players`        | 현역 101명 전원 보유                                                                 |
| 팀 순위/전적           | `team_standings` | 완전                                                                                 |
| 경기 스코어            | `games`          | 완전 (쿼터별 점수 포함)                                                              |

### 리그 특성 (지표 설계 시 고려사항)

- **6개 팀**, 시즌당 약 90경기 (정규시즌)
- **40분 경기** (4×10분 쿼터) — NBA 48분과 다름
- 팀당 경기 시간 합계: 약 200분/경기 (5명 × 40분)
- 소표본 특성: NBA 대비 경기 수 적어 통계적 안정성 주의 필요

---

## 추가 가능한 고급 지표

### Tier 1: 즉시 구현 가능 (데이터 준비 완료)

박스스코어 기반 지표. `player_games` 데이터만으로 계산 가능.

#### 1-1. USG% (Usage Rate, 사용률)

선수가 코트에 있을 때 팀 공격을 마무리하는 비율.

```
USG% = 100 × (FGA + 0.44 × FTA + TOV) × (Team_MIN / 5)
       ÷ (MIN × (Team_FGA + 0.44 × Team_FTA + Team_TOV))
```

- **필요 데이터**: 선수 FGA/FTA/TOV/MIN + 팀 FGA/FTA/TOV/MIN (player_games 집계)
- **구현 난이도**: 낮음
- **활용**: 에이스 의존도, 볼 도미넌스 파악

#### 1-2. ORtg / DRtg (Offensive/Defensive Rating, 공격/수비 효율)

100 포제션당 득점/실점. **팀 단위** 계산 후 개인에 적용.

```
Team_Possessions ≈ FGA + 0.44 × FTA + TOV - OREB
Team_ORtg = (Team_PTS / Team_Possessions) × 100
Team_DRtg = (Opp_PTS / Team_Possessions) × 100
```

- **필요 데이터**: 팀 FGA/FTA/TOV/OREB (player_games에서 집계 가능), 상대팀 득점 (games 테이블)
- **주의**: team_games에 FGA 없지만 player_games SUM으로 대체 가능
- **구현 난이도**: 낮음~중간
- **단위**: 팀 ORtg/DRtg → 경기별 + 시즌 평균

#### 1-3. Net Rating (넷 레이팅)

```
Net Rating = ORtg - DRtg
```

- **구현 난이도**: 낮음 (ORtg/DRtg 산출 후 단순 뺄셈)
- **활용**: 팀 경쟁력 종합 판단

#### 1-4. Pace (경기 템포)

팀이 40분 동안 사용하는 포제션 수.

```
Pace = 40 × (Team_Poss + Opp_Poss) / (2 × (Team_MIN / 5))
```

- **필요 데이터**: 양팀 포제션 수, 팀 총 출전시간
- **구현 난이도**: 낮음
- **활용**: 리그 평균 Pace로 다른 지표 정규화

#### 1-5. PER (Player Efficiency Rating)

NBA 공식 PER은 복잡하지만, 리그 평균으로 정규화한 간소화 버전 구현 가능.

```
uPER = (1/MIN) × (
    3PM
  + (2/3) × AST
  + (2 - factor × (Team_AST / Team_FGM)) × FGM
  + (FTM × 0.5 × (1 + (1 - (Team_AST / Team_FGM)) + (2/3) × (Team_AST / Team_FGM)))
  - VOP × TOV
  - VOP × DRB% × (FGA - FGM)
  - VOP × 0.44 × (0.44 + (0.56 × DRB%)) × (FTA - FTM)
  + VOP × (1 - DRB%) × (REB - OREB)
  + VOP × DRB% × OREB
  + VOP × STL
  + VOP × DRB% × BLK
  - PF × ((Lg_FTA / Lg_PF) - 0.44 × (Lg_FTA / Lg_PF) × VOP)
)

factor = (2/3) - (0.5 × (Lg_AST / Lg_FGM)) / (2 × (Lg_FGM / Lg_FTA))
VOP = Lg_PTS / (Lg_FGA - Lg_OREB + Lg_TOV + 0.44 × Lg_FTA)
DRB% = (Lg_REB - Lg_OREB) / Lg_REB

PER = uPER × (Lg_Pace / Team_Pace) × (15 / Lg_avg_uPER)
```

- **필요 데이터**: 모든 박스스코어 + 리그 평균 + 팀 Pace
- **구현 난이도**: 중간 (공식 복잡하지만 데이터는 충분)
- **주의**: 리그 평균 PER이 15.0이 되도록 정규화 필요
- **대안**: 간소화 PER (Hollinger simplified) 적용 가능

#### 1-6. Game Score (Hollinger)

경기별 성과를 단일 숫자로 요약.

```
GmSc = PTS + 0.4×FGM - 0.7×FGA - 0.4×(FTA-FTM) + 0.7×OREB + 0.3×DREB
     + STL + 0.7×AST + 0.7×BLK - 0.4×PF - TOV
```

- **필요 데이터**: 기본 박스스코어 (모두 보유)
- **구현 난이도**: 매우 낮음
- **활용**: 경기별 MVP 선정 기준, 시즌 평균 비교

#### 1-7. Rebound Rate (리바운드율)

```
OREB% = OREB × (Team_MIN / 5) / (MIN × (Team_OREB + Opp_DREB))
DREB% = DREB × (Team_MIN / 5) / (MIN × (Team_DREB + Opp_OREB))
REB%  = REB  × (Team_MIN / 5) / (MIN × (Team_REB + Opp_REB))
```

- **필요 데이터**: 선수/팀/상대팀 리바운드 (모두 보유)
- **구현 난이도**: 낮음

#### 1-8. STL% / BLK% / TOV% / AST%

```
STL% = STL × (Team_MIN / 5) / (MIN × Opp_Poss)
BLK% = BLK × (Team_MIN / 5) / (MIN × (Opp_FGA - Opp_3PA))
TOV% = 100 × TOV / (FGA + 0.44 × FTA + TOV)
AST% = AST / (((MIN / (Team_MIN / 5)) × Team_FGM) - FGM)
```

- **필요 데이터**: 기본 박스스코어 + 상대팀 데이터
- **구현 난이도**: 낮음

---

### Tier 2: PBP 처리 필요 (중간 난이도)

Play-by-Play 교체 이벤트를 활용한 라인업 기반 지표.

#### 2-1. On/Off Rating (온/오프 레이팅)

선수가 코트에 있을 때 vs 없을 때 팀 넷 레이팅 차이.

```
On_Rating  = (코트 ON 시 팀 득점 - 실점) / 코트 ON 포제션 × 100
Off_Rating = (코트 OFF 시 팀 득점 - 실점) / 코트 OFF 포제션 × 100
On/Off Diff = On_Rating - Off_Rating
```

**구현 방식:**

1. PBP sub_in/sub_out 이벤트로 **시점별 온코트 5명** 추적
2. 스코어 변화(home_score/away_score)를 온코트 선수에 귀속
3. 포제션 구분: FGA/FTA/TOV 이벤트 카운트

**데이터 확인:**

- sub_in: 16,685건, sub_out: 16,706건 (경기당 ~34회)
- 교체 시점에 스코어 기록됨 → 구간별 득실점 계산 가능
- player_id 포함 → 라인업 추적 가능

**구현 난이도**: 높음 (라인업 상태 머신 구현 필요)

**라인업 추적 로직 (핵심):**

```python
def track_lineups(game_id):
    """PBP 이벤트로 시점별 온코트 선수 추적"""
    # 1. 경기 시작 선발 5명 결정 (첫 이벤트 전 player_games에서 추론)
    # 2. sub_in → 선수 추가, sub_out → 선수 제거
    # 3. 각 구간의 스코어 변화를 해당 라인업에 귀속
    # 4. 쿼터 전환 시 라인업 리셋 주의
```

**주의사항:**

- 선발 라인업 결정: PBP에 명시 없음 → 첫 교체 전 이벤트 참여 선수로 추론
- 쿼터 시작 시 라인업 재추론 필요 (교체 없이 쿼터 전환 가능)

#### 2-2. Simple +/- (단순 플러스마이너스)

선수 출전 중 팀 득실점 차이.

```
+/- = (코트 ON 시 팀 득점) - (코트 ON 시 상대 득점)
```

- On/Off Rating의 부분 집합 (ON 구간만 계산)
- **구현 난이도**: 중간 (라인업 추적 동일)
- On/Off 구현 시 함께 산출 가능

---

### Tier 3: 통계 모델링 필요 (높은 난이도)

회귀 분석이나 외부 계수가 필요한 지표. 6팀 리그에서 통계적 신뢰도 한계 있음.

#### 3-1. BPM (Box Plus/Minus)

```
BPM = a₁×(adj_REB%) + a₂×(adj_AST%) + a₃×(adj_STL%) + a₄×(adj_BLK%)
    + a₅×(adj_TOV%) + a₆×(adj_USG%) + a₇×(adj_ORtg) + ... + Intercept
    + Team_Adjustment
```

- NBA BPM은 회귀 계수(a₁~a₇)를 다시즌 데이터로 피팅
- **WKBL 적용 문제점:**
  - 6팀 × ~15명 = 90명 표본 → 회귀 모델 불안정
  - NBA 계수를 그대로 쓰면 리그 특성 반영 불가
  - 최소 3~5시즌 데이터 필요 (현재 6시즌 보유하긴 함)
- **대안**: NBA 계수를 WKBL에 직접 적용 (정확도 보장 안 됨, 참고용)
- **구현 난이도**: 매우 높음

#### 3-2. VORP (Value Over Replacement Player)

```
VORP = (BPM - (-2.0)) × (MIN_played / Team_MIN)
```

- BPM에 의존 → BPM 없으면 VORP도 불가
- 대체 선수 수준(-2.0)은 NBA 기준, WKBL 별도 산정 필요
- **구현 난이도**: BPM 구현 후 낮음

#### 3-3. WS (Win Shares)

```
OWS = (Player_ORtg - League_ORtg) × Player_Possessions / (League_Pace × GP × 0.32)
DWS = (League_DRtg - Player_DRtg) × Player_Possessions / (League_Pace × GP × 0.32)
WS = OWS + DWS
WS/40 = WS × 40 / Total_MIN  (NBA는 WS/48)
```

- ORtg/DRtg가 팀 수준이면 개인 배분 로직 필요
- **구현 난이도**: 높음
- **대안**: 팀 WS를 개인에 시간 비례 배분 (간소화)

---

## 구현 계획

### Phase 7.1: 기반 인프라 (Tier 1 전제 조건)

리그/팀 수준 집계 함수와 저장 구조.

#### 작업 내용

1. **리그 시즌 통계 집계 함수** (`tools/stats.py`)

   ```python
   def compute_league_stats(season_id: str) -> dict:
       """리그 전체 평균/합계 산출 (PER 정규화 등에 사용)"""
       # Lg_PTS, Lg_FGA, Lg_FTA, Lg_OREB, Lg_DREB, Lg_AST, Lg_STL, Lg_BLK, Lg_TOV, Lg_PF
       # Lg_Pace, Lg_ORtg, Lg_DRtg
   ```

2. **팀 경기별 집계 쿼리** (`tools/database.py`)
   - player_games에서 팀별 FGA/FTA/TOV/OREB 집계
   - 상대팀 데이터 조인 (games 테이블의 home/away 관계 활용)

3. **포제션 추정 함수** (`tools/stats.py`)
   ```python
   def estimate_possessions(fga, fta, tov, oreb):
       return fga + 0.44 * fta + tov - oreb
   ```

#### 산출물

- `compute_league_stats()` — 시즌 리그 평균
- `compute_team_game_stats()` — 경기별 팀 슈팅 집계 (player_games 기반)
- `estimate_possessions()` — 포제션 추정

---

### Phase 7.2: Tier 1 지표 구현

#### 작업 내용

1. **`tools/stats.py` 확장** — 새 지표 계산 함수들
   - `compute_usage_rate()` — USG%
   - `compute_ratings()` — ORtg, DRtg, Net Rating
   - `compute_pace()` — Pace
   - `compute_per()` — PER (Hollinger 공식)
   - `compute_game_score()` — Game Score
   - `compute_rate_stats()` — REB%, STL%, BLK%, TOV%, AST%

2. **`tools/database.py`** — 시즌 고급 통계 조회 함수
   - `get_player_advanced_stats()` — 개인 고급 지표 (시즌 집계)
   - `get_team_advanced_stats()` — 팀 고급 지표

3. **`tools/api.py`** — API 엔드포인트 확장
   - `GET /api/players/{id}` 응답에 고급 지표 추가
   - `GET /api/players` 정렬/필터에 고급 지표 추가
   - `GET /api/teams/{id}` 응답에 팀 ORtg/DRtg/Net Rating 추가

4. **`src/db.js`** — 프론트엔드 쿼리
   - 고급 지표 계산 SQL (sql.js에서 실행)

5. **프론트엔드 표시**
   - 선수 상세 페이지에 고급 지표 섹션 추가
   - 선수 목록 테이블에 컬럼 추가 (토글/탭)
   - 리더보드에 고급 지표 카테고리 추가

#### 추가 지표 목록

| 지표    | 분류         | 설명                       |
| ------- | ------------ | -------------------------- |
| USG%    | 공격         | 팀 공격 사용률             |
| ORtg    | 공격         | 100 포제션당 득점          |
| DRtg    | 수비         | 100 포제션당 실점          |
| Net Rtg | 종합         | ORtg - DRtg                |
| Pace    | 팀           | 40분당 포제션 수           |
| PER     | 종합         | 리그 평균 15.0 정규화 효율 |
| GmSc    | 종합         | 경기별 성과 점수           |
| REB%    | 리바운드     | 리바운드 확보율            |
| AST%    | 플레이메이킹 | 어시스트 비율              |
| STL%    | 수비         | 스틸 비율                  |
| BLK%    | 수비         | 블록 비율                  |
| TOV%    | 공격         | 턴오버 비율                |

---

### Phase 7.3: Tier 2 지표 구현 (On/Off)

#### 작업 내용

1. **라인업 추적 엔진** (`tools/lineup.py` 신규)

   ```python
   def track_game_lineups(game_id: str) -> list[LineupStint]:
       """PBP 데이터로 경기 내 라인업 구간 추적"""
       # 1. 선발 5명 추론 (첫 이벤트 참여자 + player_games)
       # 2. sub_in/sub_out으로 라인업 변경 추적
       # 3. 구간별 (lineup, start_score, end_score, possessions) 반환

   def compute_on_off_rating(player_id: str, season_id: str) -> dict:
       """선수 On/Off 레이팅 계산"""
       # 전 경기 라인업 데이터에서:
       # - 해당 선수 ON 구간: 팀 득점, 실점, 포제션
       # - 해당 선수 OFF 구간: 팀 득점, 실점, 포제션
       # → On/Off diff 산출
   ```

2. **라인업 데이터 테이블** (`tools/database.py`)

   ```sql
   CREATE TABLE IF NOT EXISTS lineup_stints (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       game_id TEXT NOT NULL,
       stint_order INTEGER NOT NULL,   -- 구간 순서
       quarter TEXT NOT NULL,          -- Q1~Q4, OT
       team_id TEXT NOT NULL,
       player1_id TEXT, player2_id TEXT, player3_id TEXT,
       player4_id TEXT, player5_id TEXT,
       start_score_for INTEGER,        -- 시작 시 팀 득점
       start_score_against INTEGER,    -- 시작 시 상대 득점
       end_score_for INTEGER,          -- 종료 시 팀 득점
       end_score_against INTEGER,      -- 종료 시 상대 득점
       duration_seconds REAL,          -- 구간 시간(초)
       possessions REAL,               -- 추정 포제션 수
       UNIQUE (game_id, team_id, stint_order)
   );
   ```

3. **+/- 계산** — 라인업 구간 데이터에서 자동 산출
   - 경기별 +/- → player_games에 컬럼 추가 또는 별도 테이블
   - 시즌 +/- → 집계

4. **프론트엔드** — 선수 상세 페이지에 On/Off 섹션

#### 기술적 난점

- **선발 라인업 추론**: PBP에 선발 명시 없음
  - 해결: 각 쿼터 첫 이벤트까지 등장하는 선수 5명 = 선발
  - 보완: player_games의 minutes 기준 상위 5명과 교차 검증
- **쿼터 전환**: 2쿼터 시작 시 라인업이 1쿼터 말과 다를 수 있음
  - 해결: 각 쿼터를 독립 추적, 첫 sub 전 이벤트로 재추론
- **동시 교체**: sub_in/sub_out 같은 game_clock에 여러 건
  - 해결: event_order로 정렬, 같은 시점의 교체를 한 번에 처리

---

### Phase 7.4: Tier 3 지표 (선택적) — TODO

> **상태**: 미구현. 통계 모델링 복잡도와 소표본 한계로 인해 보류.

#### [ ] TODO: BPM/VORP — 권장하지 않음

- NBA BPM의 회귀 계수는 수천 시즌-선수 데이터로 피팅
- WKBL 6팀 × 6시즌 = ~540 선수-시즌 → 자체 모델 불안정
- **대안**: NBA 계수 직접 적용 + "참고용" 표기
  - 정확도 보장 불가하지만 상대 비교는 의미 있을 수 있음

#### [ ] TODO: WS (Win Shares) — 조건부 구현

- Tier 1의 ORtg/DRtg + Pace 완성 후 구현 가능
- 팀 승리를 개인에 배분하는 로직 필요
- **간소화 버전**: 출전시간 비례 배분
  ```
  Player_WS = Team_Wins × (Player_MIN / Team_Total_MIN)
              × (Player_ORtg / Team_ORtg)  # 공격 기여 가중
  ```

---

## 기술 결정사항

### 계산 시점: 실시간 vs 사전 계산

| 방식                    | 장점                        | 단점                          |
| ----------------------- | --------------------------- | ----------------------------- |
| **실시간 (SQL)**        | 항상 최신, 저장 공간 불필요 | 복잡한 쿼리, sql.js 성능 한계 |
| **사전 계산 (DB 저장)** | 빠른 조회, 프론트엔드 단순  | 데이터 갱신 시 재계산 필요    |

**권장: 하이브리드**

- 단순 지표 (USG%, GmSc, TOV%): SQL로 실시간 계산
- 복잡 지표 (PER, ORtg/DRtg, On/Off): 사전 계산 후 DB 저장
- ingest 시 `--compute-advanced` 옵션으로 재계산

### WKBL 맞춤 조정

| 항목      | NBA  | WKBL | 비고                                      |
| --------- | ---- | ---- | ----------------------------------------- |
| 경기 시간 | 48분 | 40분 | Per-36 대신 Per-40 병행, WS/48 대신 WS/40 |
| FTA 계수  | 0.44 | 0.44 | 동일 적용 (FIBA 규칙 유사)                |
| PER 기준  | 15.0 | 15.0 | 리그 평균 = 15.0 유지                     |
| 팀 수     | 30   | 6    | 소표본 주의, 신뢰 구간 표시 권장          |

### 최소 출전 기준

소표본 지표의 왜곡 방지:

| 지표                   | 최소 기준          |
| ---------------------- | ------------------ |
| 슈팅 % (FG%, 3P%, FT%) | 현행 유지          |
| USG%, PER, Rate stats  | 시즌 총 100분 이상 |
| ORtg/DRtg              | 시즌 10경기 이상   |
| On/Off Rating          | 시즌 200분 이상    |

---

## 일정 추정

| Phase | 내용                            | 예상 범위      |
| ----- | ------------------------------- | -------------- |
| 7.1   | 기반 인프라 (리그 집계, 포제션) | 작음           |
| 7.2   | Tier 1 지표 12개                | 중간           |
| 7.3   | Tier 2 On/Off Rating            | 큼             |
| 7.4   | Tier 3 BPM/VORP/WS              | 매우 큼 (선택) |

**권장 우선순위**: Phase 7.1 → 7.2 → 7.3 순서. Tier 3는 Tier 1~2 완성 후 필요성 재평가.

---

## 프론트엔드 표시 계획

### 선수 상세 페이지 (`#/players/{id}`)

기존 "기본 스탯" 아래에 **"고급 지표"** 탭/섹션 추가:

```
┌─────────────────────────────────────────────────┐
│ 고급 지표                                        │
├──────────┬──────┬──────┬──────┬──────┬──────────┤
│ PER      │ USG% │ ORtg │ DRtg │ NetRtg│ GmSc   │
│ 18.5     │ 24.3 │ 108  │ 102  │ +6.0  │ 14.2   │
├──────────┼──────┼──────┼──────┼──────┼──────────┤
│ REB%     │ AST% │ STL% │ BLK% │ TOV% │ On/Off  │
│ 12.4     │ 18.7 │ 2.1  │ 1.3  │ 14.2 │ +4.8   │
└──────────┴──────┴──────┴──────┴──────┴──────────┘
```

### 선수 목록 페이지 (`#/players`)

- "Advanced" 탭 추가 (기존 Basic 탭과 토글)
- 컬럼: PER, USG%, TS%, ORtg, DRtg, NetRtg

### 리더보드 (`#/leaders`)

- 고급 지표 카테고리 추가: PER, USG%, NetRtg, GmSc

### 팀 페이지 (`#/teams/{id}`)

- 팀 고급 지표: ORtg, DRtg, NetRtg, Pace

---

## 참고 자료

- [Basketball Reference Glossary](https://www.basketball-reference.com/about/glossary.html)
- [NBA Advanced Stats Definitions](https://www.nba.com/stats/help/glossary)
- [PER Calculation](https://www.basketball-reference.com/about/per.html)
- [BPM Methodology](https://www.basketball-reference.com/about/bpm2.html)
- [Win Shares](https://www.basketball-reference.com/about/ws.html)
