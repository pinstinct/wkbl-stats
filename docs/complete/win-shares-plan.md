# Win Shares (WS) 구현 계획서

## 개요

Win Shares는 개인 선수가 팀 승리에 기여한 정도를 **승수 단위**로 환산한 지표이다.
Basketball Reference의 방법론(Dean Oliver 기반)을 따르되, WKBL 6팀 리그 특성에 맞게 조정한다.

**공식 구성:**

```
WS = OWS + DWS
```

- **OWS (Offensive Win Shares)**: 공격 기여도 → 승리 환산
- **DWS (Defensive Win Shares)**: 수비 기여도 → 승리 환산

## 구현 반영 상태 (2026-02-20)

- 백엔드/프론트 데이터 계층에 `ows`, `dws`, `ws`, `ws_40` 계산 로직 반영 완료
- 리더보드 `ws` 카테고리 반영 완료
- UI는 `WS`만 노출, `WS/40`은 값이 매우 작아 해석성이 낮아 현재 비노출(계산/응답은 유지)

---

## 현재 인프라 점검

### 이미 구현된 것 (재사용 가능)

| 구성 요소                    | 위치                                            | 비고                                |
| ---------------------------- | ----------------------------------------------- | ----------------------------------- |
| 개인 Points Produced (PProd) | `stats.py:_compute_player_off_rtg()` L111-144   | `pprod` 변수 (현재 return 안 함)    |
| 개인 Total Possessions       | `stats.py:_compute_player_off_rtg()` L107       | `tot_poss` 변수 (현재 return 안 함) |
| 개인 DRtg                    | `stats.py:_compute_player_def_rtg()`            | 완전 구현됨                         |
| 팀 시즌 토탈                 | `database.py:get_team_season_totals()` L813     | FGA, FTA, PTS, MIN 등               |
| 상대 시즌 토탈               | `database.py:get_opponent_season_totals()` L849 | 상대팀 FGA, PTS 등                  |
| 리그 시즌 토탈               | `database.py:get_league_season_totals()` L889   | 리그 전체 합산                      |
| 팀 승/패                     | `team_standings` 테이블                         | `wins`, `losses` 컬럼               |
| 리그 Pace                    | `_LEAGUE_STATS["lg_pace"]`                      | PER 계산에서 이미 사용              |
| `estimate_possessions()`     | `stats.py` L12-14                               | 범용 함수                           |

### 신규 필요 사항

| 구성 요소                               | 설명                                          |
| --------------------------------------- | --------------------------------------------- |
| `_compute_player_off_rtg()` 반환값 확장 | `pprod`, `tot_poss`도 함께 반환               |
| 팀 승수 전달 경로                       | `team_standings` → `compute_advanced_stats()` |
| WS 계산 로직                            | `stats.py`에 신규 함수 또는 기존 함수 확장    |
| 프론트엔드 WS 계산                      | `src/db.js`에 동일 로직 구현                  |

---

## WS 계산 공식 (Basketball Reference 방식)

### Step 1: Marginal Offense (한계 공격 생산량)

```
Marginal_Offense = PProd - 0.92 * (Lg_PTS / Lg_Poss) * Player_Poss
```

- `PProd`: 개인 Points Produced (이미 `_compute_player_off_rtg()`에서 계산)
- `Lg_PTS / Lg_Poss`: 리그 평균 possession당 득점
- `Player_Poss`: 개인 Total Possessions (이미 `_compute_player_off_rtg()`에서 계산)
- `0.92`: 대체 선수(replacement level) 계수

### Step 2: Marginal Points per Win

```
Marginal_PPW = 2 * Lg_PPG * (Team_Pace / Lg_Pace)
```

- `Lg_PPG`: 리그 경기당 평균 득점 = `Lg_PTS / Lg_GP`
- `Team_Pace / Lg_Pace`: 팀 속도 보정 계수
- **참고**: BBR은 피타고리안 기대 승률을 사용하지만, WKBL은 6팀 30경기 소규모 리그이므로 단순화된 공식 사용

### Step 3: OWS (Offensive Win Shares)

```
OWS = Marginal_Offense / Marginal_PPW
```

### Step 4: Marginal Defense (한계 수비 기여)

```
# DRtg 기반 접근 (BBR 방식 간소화)
Player_Def_Pts_Saved = (Lg_DRtg - Player_DRtg) / 100 * Player_Def_Poss
Marginal_Defense = Player_Def_Pts_Saved + 0.08 * Lg_PPG * (Player_MIN / (Team_MIN / 5))
```

- `Lg_DRtg`: 리그 평균 DRtg (정의상 = 리그 평균 ORtg ≈ `Lg_PTS / Lg_Poss * 100`)
- `Player_DRtg`: 개인 DRtg (이미 구현됨)
- `Player_Def_Poss`: `Opp_Poss * (Player_MIN / (Team_MIN / 5))`
- `0.08`: 대체 선수 수비 마진

### Step 5: DWS (Defensive Win Shares)

```
DWS = Marginal_Defense / Marginal_PPW
```

### Step 6: Win Shares

```
WS = OWS + DWS
WS/48 = WS / (Player_MIN * GP) * 48 * GP_team_avg_minutes
```

> **WS/48**: 48분당 Win Shares (출전 시간 보정, 선수 간 비교용)

---

## WKBL 리그 특성 고려사항

| 항목        | NBA  | WKBL | 조정 방향                         |
| ----------- | ---- | ---- | --------------------------------- |
| 팀 수       | 30   | 6    | 리그 평균 안정성 낮음 → 샘플 주의 |
| 경기 수     | 82   | ~30  | 소표본 → WS 값이 작음 (정상)      |
| 경기 시간   | 48분 | 40분 | WS/48 대신 **WS/40** 사용         |
| 교체 선수풀 | 넓음 | 좁음 | 대체 선수 계수 유지 (0.92/0.08)   |

**경기 시간 40분 조정:**

- WKBL은 10분 x 4쿼터 = 40분
- `WS/40 = WS / (Player_Total_MIN) * 40 * Team_GP`

---

## 구현 계획

### 1단계: `stats.py` 수정 — ORtg 함수 반환값 확장

**파일:** `tools/stats.py`

**변경:** `_compute_player_off_rtg()` 반환 타입을 `Optional[float]` → `Optional[tuple[float, float, float]]`로 변경

```python
# 현재: return _r(100 * pprod / tot_poss, 1)
# 변경: return (_r(100 * pprod / tot_poss, 1), pprod, tot_poss)
```

**주의:** 이 함수를 호출하는 `compute_advanced_stats()` 내부도 함께 수정

### 2단계: `stats.py` — WS 계산 로직 추가

**파일:** `tools/stats.py`

`compute_advanced_stats()` 함수 내부에 WS 계산 블록 추가 (PER 계산 직후):

```python
# --- Win Shares (require team_stats + league_stats + team_wins) ---
if team_stats and league_stats and "team_wins" in team_stats:
    ows = _compute_ows(pprod, tot_poss, league_stats, team_stats)
    dws = _compute_dws(d.get("def_rtg"), total_min, team_stats, league_stats)
    d["ows"] = ows
    d["dws"] = dws
    d["ws"] = _r(ows + dws, 2)
    if total_min > 0:
        d["ws_40"] = _r((ows + dws) / total_min * 40 * gp, 3)
```

### 3단계: `api.py` — 팀 승수 전달 경로 추가

**파일:** `tools/api.py`

`_build_team_stats()` 함수에서 `team_standings` 테이블의 `wins` 값을 `team_stats` dict에 포함:

```python
def _build_team_stats(team_id, team_totals, opp_totals, standings=None):
    ...
    result["team_wins"] = standings.get(team_id, {}).get("wins", 0)
    result["team_losses"] = standings.get(team_id, {}).get("losses", 0)
    return result
```

**영향 범위:** `get_players()`, `get_player_detail()`, `get_player_comparison()` 등 `_build_team_stats()`를 호출하는 모든 곳에서 standings dict를 전달해야 함

### 4단계: `database.py` — 팀 승수 조회 함수 (기존 활용)

**파일:** `tools/database.py`

`get_team_standings()` (L1159)이 이미 존재. standings를 `{team_id: {wins, losses, ...}}` 형태로 변환하는 헬퍼만 추가:

```python
def get_team_wins_by_season(season_id: str) -> Dict[str, Dict]:
    """Returns {team_id: {"wins": N, "losses": N}}."""
    standings = get_team_standings(season_id)
    return {s["team_id"]: {"wins": s["wins"], "losses": s["losses"]} for s in standings}
```

### 5단계: `src/db.js` — 프론트엔드 WS 계산 추가

**파일:** `src/db.js`

`calculateAdvancedStats()` 함수 내부에 동일한 WS 계산 로직 추가.
`computePlayerOffRtg()` (L200)도 `pprod`, `totPoss`를 함께 반환하도록 수정.

standings 데이터는 이미 `getStandings()` (L1327)에서 조회 가능.

### 6단계: 테스트 작성

**파일:** `tests/test_refactor_p0.py`

```python
def test_compute_win_shares():
    """WS = OWS + DWS, positive for productive player."""

def test_ws_without_standings():
    """WS should not appear when team wins/losses unavailable."""

def test_ws_40_normalization():
    """WS/40 should normalize by playing time."""

def test_ows_zero_floor():
    """OWS should be floored at 0 (no negative OWS)."""
```

예상 추가 테스트: **4~5개**

### 7단계: 문서 업데이트

- `CLAUDE.md`: Player Data Schema에 `ows`, `dws`, `ws`, `ws_40` 추가
- `docs/project-roadmap.md`: Phase 7.5 항목 추가

---

## 변경 파일 요약

| 파일                        | 변경 내용                                     | 난이도 |
| --------------------------- | --------------------------------------------- | ------ |
| `tools/stats.py`            | ORtg 반환값 확장 + WS 계산 함수 추가          | **중** |
| `tools/api.py`              | `_build_team_stats()`에 standings 전달        | **하** |
| `tools/database.py`         | `get_team_wins_by_season()` 헬퍼 추가         | **하** |
| `src/db.js`                 | `computePlayerOffRtg()` 반환값 확장 + WS 계산 | **중** |
| `tests/test_refactor_p0.py` | WS 테스트 4~5개                               | **하** |
| `CLAUDE.md`                 | 스키마 문서 업데이트                          | **하** |
| `docs/project-roadmap.md`   | Phase 7.5 추가                                | **하** |

**총 변경 파일: 7개** | **예상 신규 코드: ~120줄** | **예상 테스트: 4~5개**

---

## 출력 필드 명세

| 필드    | 타입  | 설명                         | 예시  |
| ------- | ----- | ---------------------------- | ----- |
| `ows`   | float | Offensive Win Shares         | 1.8   |
| `dws`   | float | Defensive Win Shares         | 1.2   |
| `ws`    | float | Total Win Shares (OWS + DWS) | 3.0   |
| `ws_40` | float | Win Shares per 40 minutes    | 0.125 |

**표시 위치:**

- 선수 목록 Advanced 탭
- 선수 상세 고급 지표 섹션
- 리더보드 카테고리 (ws)
- `ws_40`는 API/DB 계산 필드로 유지하며 현재 UI에서는 숨김

---

## 리스크 & 대안

| 리스크                                    | 영향             | 대안                                                   |
| ----------------------------------------- | ---------------- | ------------------------------------------------------ |
| standings 미수집 시즌                     | WS 계산 불가     | WS 필드를 null로 처리 (기존 패턴과 동일)               |
| 소표본(30경기) 변동성                     | WS 절대값이 작음 | 누적 WS 중심으로 해석, 필요 시 소수점 자릿수 확장      |
| `_compute_player_off_rtg()` 시그니처 변경 | 기존 테스트 영향 | tuple 반환 후 호출부에서 unpack, 기존 테스트 최소 수정 |

---

## 구현 순서 (TDD)

1. 테스트 먼저 작성 (RED)
2. `stats.py` ORtg 반환값 확장 + WS 계산 (GREEN)
3. `database.py` 헬퍼 추가
4. `api.py` standings 전달 경로
5. `src/db.js` 프론트엔드 동기화
6. 기존 테스트 통과 확인 (REFACTOR)
7. 문서 업데이트
