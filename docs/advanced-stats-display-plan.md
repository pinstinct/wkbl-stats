# Advanced Stats 표시 개선 계획

작성일: 2026-02-19

## 현황 분석

### 문제 1: 선수 목록 Advanced 탭 — 지표가 `-` 로 표시됨

`src/views/players.js`의 `ADVANCED_THEAD_HTML`에는 다음 컬럼이 정의되어 있지만,
`src/db.js`의 `calculateAdvancedStats()`가 이 값들을 **계산하지 않아** 전부 `undefined → "-"`로 표시된다.

| 컬럼   | 표시 현황 | 미계산 이유                          |
| ------ | --------- | ------------------------------------ |
| PER    | `-`       | 팀·리그 집계 필요                    |
| GmSc   | ✅ 계산됨 | —                                    |
| USG%   | `-`       | 팀 FGA/FTA/TOV 집계 필요             |
| TOV%   | ✅ 계산됨 | —                                    |
| ORtg   | `-`       | 팀 득점·포제션 집계 필요             |
| DRtg   | `-`       | 상대팀 득점·포제션 집계 필요         |
| NetRtg | `-`       | ORtg - DRtg                          |
| OREB%  | `-`       | 팀·상대 리바운드 집계 필요           |
| DREB%  | `-`       | 팀·상대 리바운드 집계 필요           |
| REB%   | `-`       | 팀·상대 리바운드 집계 필요           |
| AST%   | `-`       | 팀 FGM 집계 필요                     |
| STL%   | `-`       | 상대 포제션 집계 필요                |
| BLK%   | `-`       | 상대 2PA 집계 필요                   |
| +/-    | `-`       | player_games에 직접 저장된 값 미사용 |

### 문제 2: Leaders 페이지 — PER 카테고리 비작동

`src/app.js`의 `LEADER_CATEGORIES`에 `{ key: "per", label: "PER" }`이 정의되어 있지만,
`src/db.js`의 `getLeaders()`의 `validCategories` 배열에 `"per"`이 없어 **자동으로 `"pts"`로 fallback**된다.
즉, PER 탭을 눌러도 득점 순위가 표시된다.

### 근본 원인

백엔드(`tools/stats.py`)는 `team_stats`와 `league_stats` 집계값을 DB에서 별도로 조회한 후 Python으로 계산한다.
프론트엔드 정적 모드(`src/db.js`, sql.js)는 이 집계를 수행하지 않아 팀 문맥 지표가 전부 누락된다.

---

## 해결 전략

`tools/stats.py`에 이미 완성된 수식이 있다. 이를 `src/db.js`에서 SQL 집계 + JS 계산으로 재구현한다.

### 데이터 흐름

```
player_games (개인 통계)  ─┐
team_games   (팀 통계)    ─┼─→ SQL 집계 쿼리 → JS 수식 → 화면 표시
player_games (league 합계) ─┘
```

`player_games`의 팀별 합산으로 `team_stats`를 구성할 수 있다.
(`team_games` 테이블을 활용하면 더 정확하지만, `player_games`만으로도 근사값 산출 가능)

---

## 작업 목록

### Task 1: `src/db.js` — `plus_minus` 추가 (난이도: 쉬움)

**배경**: `plus_minus`는 팀 집계 없이 `player_games` 테이블에서 직접 합산 가능.

**수정 파일**: `src/db.js`

**작업 내용**:

1. `getPlayers()` SQL의 SELECT에 `SUM(pg.plus_minus) as total_plus_minus` 추가
2. `calculateAdvancedStats()` 또는 `getPlayers()` map에서
   `d.plus_minus = d.total_plus_minus || 0` 할당

**확인**: `player_games` 테이블에 `plus_minus` 컬럼 존재 여부 확인 필요
(없으면 `lineup_stints`에서 집계하는 방식 검토)

---

### Task 2: `src/db.js` — 팀 집계 헬퍼 함수 추가 (난이도: 중간)

**배경**: USG%, ORtg, DRtg, OREB%, DREB%, REB%, AST%, STL%, BLK%, PER 모두
팀 시즌 합계(`team_stats`)와 상대 시즌 합계(`opp_stats`)가 필요하다.

**수정 파일**: `src/db.js`

**작업 내용**: 새 함수 `getTeamSeasonStats(seasonId)` 구현

```javascript
// 반환 구조 (팀별 Map)
{
  "kb": {
    team_min: 1200,      // 팀 전체 선수 분 합계 (≈ 경기수 × 5 × 40)
    team_pts: 2400,
    team_fgm: 900, team_fga: 1800,
    team_tpm: 200, team_tpa: 500,
    team_ftm: 300, team_fta: 400,
    team_tov: 350,
    team_oreb: 280, team_dreb: 700, team_reb: 980,
    opp_pts: 2300,
    opp_fgm: 860, opp_fga: 1750,
    opp_tpm: 190, opp_tpa: 480,
    opp_ftm: 290, opp_fta: 390,
    opp_tov: 330,
    opp_oreb: 260, opp_dreb: 680, opp_reb: 940,
    opp_tpa: 480
  },
  ...
}
```

**SQL 전략**:

- `player_games` JOIN `games` → 팀별 합산 (분, 득점, FG, 리바운드, TO 등)
- 상대팀 통계: `games` 테이블의 홈/어웨이 관계를 이용해 같은 게임의 상대 팀 합산
- 또는 `team_games` 테이블 활용 (컬럼 구성 확인 필요)

---

### Task 3: `src/db.js` — 리그 집계 헬퍼 함수 추가 (PER용, 난이도: 중간)

**배경**: PER은 리그 평균 지표(`league_stats`)로 보정하는 계산식 필요.

**수정 파일**: `src/db.js`

**작업 내용**: 새 함수 `getLeagueSeasonStats(seasonId)` 구현

```javascript
// 반환 구조
{
  lg_min: 50000,   // 전체 선수 분 합계
  lg_pts: 12000,
  lg_fga: 9000, lg_fgm: 4500,
  lg_fta: 2000, lg_ftm: 1500,
  lg_oreb: 1400, lg_dreb: 3500, lg_reb: 4900,
  lg_ast: 2200,
  lg_tov: 1800,
  lg_pf: 2500,
  lg_stl: 800,
  lg_blk: 300
}
```

**SQL**: `player_games` JOIN `games WHERE season_id = ?` → 전체 합산 (단일 쿼리)

---

### Task 4: `src/db.js` — `calculateAdvancedStats()` 확장 (난이도: 중간)

**배경**: Task 2·3의 집계값을 인자로 받아 팀 문맥 지표를 계산하는 로직 추가.
`tools/stats.py`의 `compute_advanced_stats()` 수식을 JS로 포팅.

**수정 파일**: `src/db.js`

**함수 시그니처 변경**:

```javascript
// 기존
function calculateAdvancedStats(d)

// 변경
function calculateAdvancedStats(d, teamStats = null, leagueStats = null)
```

**추가 계산 (tools/stats.py 수식 그대로)**:

```
USG%    = 100 × (FGA + 0.44×FTA + TOV) × (TeamMIN/5) / (MIN × (TmFGA + 0.44×TmFTA + TmTOV))
ORtg    = TmPTS / TmPoss × 100
DRtg    = OppPTS / OppPoss × 100
NetRtg  = ORtg − DRtg
Pace    = 40 × (TmPoss + OppPoss) / (2 × TmMIN/5)
OREB%   = 100 × OREB × (TmMIN/5) / (MIN × (TmOREB + OppDREB))
DREB%   = 100 × DREB × (TmMIN/5) / (MIN × (TmDREB + OppOREB))
REB%    = 100 × REB  × (TmMIN/5) / (MIN × (TmREB  + OppREB))
AST%    = 100 × AST / ((MIN/(TmMIN/5)) × TmFGM − FGM)
STL%    = 100 × STL × (TmMIN/5) / (MIN × OppPoss)
BLK%    = 100 × BLK × (TmMIN/5) / (MIN × (OppFGA − Opp3PA))
PER     = Hollinger 수식 (tools/stats.py _compute_per() 참조)
```

**TmPoss 계산**:

```
Poss = FGA + 0.44×FTA + TOV − OREB
```

---

### Task 5: `src/db.js` — `getPlayers()` 에 집계 연동 (난이도: 중간)

**수정 파일**: `src/db.js`

**작업 내용**:

1. `getPlayers()` 함수 진입부에서 `getTeamSeasonStats(seasonId)` 호출
2. PER 계산 시 `getLeagueSeasonStats(seasonId)` 호출
3. 선수별 map에서 해당 팀의 `teamStats`를 조회하여 `calculateAdvancedStats(d, teamStats, leagueStats)` 호출
4. SQL SELECT에 `avg_off_reb`, `avg_def_reb`, `avg_pf` 이미 있음 — 유지

**성능 고려**: 팀/리그 집계는 `getPlayers()` 호출 시 1회만 실행. 선수별 반복 없음.

---

### Task 6: `src/db.js` — `getLeaders()` PER 지원 추가 (난이도: 어려움)

**수정 파일**: `src/db.js`

**작업 내용**:

현재 `getLeaders()`는 단일 SQL로 순위를 낸다.
PER은 팀·리그 집계 후 JS에서 계산해야 하므로 **별도 경로**로 처리.

**방안 A (추천)**: `category === "per"` 일 때 분기

```javascript
if (category === "per") {
  return getLeadersByPER(seasonId, limit);
}
```

`getLeadersByPER()` 내부:

1. 선수 전체 집계 SQL (현재 `getPlayers` SQL과 동일)
2. `getTeamSeasonStats()` + `getLeagueSeasonStats()` 호출
3. 각 선수 PER 계산
4. 내림차순 정렬 후 상위 `limit`명 반환

**방안 B**: `getPlayers()` 결과를 재사용해 PER 기준 정렬

- 이미 PER이 계산된 선수 배열이 있으면 Leaders 호출 시 재사용 가능
- 하지만 Leaders와 Players는 독립적으로 호출되므로 캐싱 로직 필요

→ **방안 A로 구현** (단순하고 명확)

**`validCategories` 업데이트**:

```javascript
const validCategories = [
  "pts",
  "reb",
  "ast",
  "stl",
  "blk",
  "min",
  "fgp",
  "tpp",
  "ftp",
  "game_score",
  "ts_pct",
  "pir",
  "per", // ← 추가
];
```

---

### Task 7: 테스트 작성 (난이도: 중간)

**추가할 테스트**: 기존 `tests/test_refactor_p0.py` 패턴 참고.

현재 `test_refactor_p0.py`는 Python `tools/stats.py`를 테스트한다.
프론트 `src/db.js`는 브라우저 JS이므로 단위 테스트 추가가 어렵다.

→ **통합 테스트**: `test_api.py` 또는 별도 `test_db_js.py`에서
SQLite DB 상태를 검증하는 방식으로 추가.

실제로는 수동 검증:

- `python3 -m http.server 8000` 후 브라우저에서 Advanced 탭 확인
- Leaders → PER 탭 정상 표시 확인
- 계산값을 `tools/stats.py` 결과와 비교 검증

---

## 작업 순서 및 의존 관계

```
Task 1 (plus_minus)          ← 독립적, 먼저 완료 가능
Task 2 (팀 집계 헬퍼)        ← Task 3·4·5·6의 전제조건
Task 3 (리그 집계 헬퍼)      ← Task 4(PER)의 전제조건, Task 2와 병행 가능
Task 4 (calculateAdvanced 확장)  ← Task 2, 3 완료 후
Task 5 (getPlayers 연동)     ← Task 4 완료 후
Task 6 (getLeaders PER)      ← Task 2, 3 완료 후 (Task 4·5와 병행 가능)
Task 7 (검증)                ← Task 5, 6 완료 후
```

---

## 수정 파일 목록

| 파일                     | 변경 내용                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `src/db.js`              | 팀/리그 집계 헬퍼 추가, `calculateAdvancedStats()` 확장, `getPlayers()` 연동, `getLeaders()` PER 지원 |
| `src/db.js` (plus_minus) | SQL SELECT에 `SUM(pg.plus_minus)` 추가                                                                |

테스트 파일이나 백엔드 파일은 **수정 불필요** (백엔드 계산은 이미 완성됨).

---

## 사전 확인 사항

작업 시작 전 확인이 필요한 항목:

1. **`player_games.plus_minus` 컬럼 존재 여부**

   ```sql
   PRAGMA table_info(player_games);
   ```

2. **`team_games` 테이블 컬럼 구성** (Task 2 SQL 방식 결정에 필요)

   ```sql
   PRAGMA table_info(team_games);
   ```

3. **`player_games`에 `off_reb`, `def_reb` 컬럼 존재 여부** (OREB%, DREB% 계산에 필요)
   → 이미 `calculateAdvancedStats()`에서 `avg_off_reb`, `avg_def_reb`를 사용하므로 존재함 ✅

4. **현재 시즌 데이터 충분성** (팀 집계가 의미 있으려면 경기 수가 어느 정도 있어야 함)

---

## 예상 결과

작업 완료 후:

- **선수 목록 Advanced 탭**: PER, USG%, ORtg, DRtg, NetRtg, OREB%, DREB%, REB%, AST%, STL%, BLK%, +/- 모두 수치 표시
- **Leaders 페이지**: PER 탭 선택 시 PER 순위 정상 표시
- **GitHub Pages (정적 호스팅)**: sql.js 환경에서도 모든 지표 작동
- **서버 모드**: 기존과 동일 (백엔드는 이미 계산 완료)
