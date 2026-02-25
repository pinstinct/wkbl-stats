# 미완 기능 통합 목록

> 정리일: 2026-02-20
> 출처: additional-data-plan.md, advanced-stats-plan.md, players-teams-leaders-fix-plan.md

아래 항목은 각 계획 문서에서 미구현 상태로 남은 기능을 통합 정리한 것이다.
우선순위 순으로 나열한다.

---

## 1. Position Analysis 인제스트 파이프라인

**상태**: DB 스키마 완료, 인제스트 미구현
**출처**: additional-data-plan.md Phase 2
**브랜치**: `feat/phase-a-position-analysis-tdd` (미머지)

### 현재 구현

- `tools/database.py`: `position_matchups` 테이블, `bulk_insert_position_matchups()`, `get_position_matchups()` 존재

### 미구현

- `tools/config.py`: `POSITION_ANALYSIS_URL` 상수
- `tools/ingest_wkbl.py`: `fetch_position_analysis()` 함수, `--fetch-position-analysis` CLI 옵션
- 테스트: position_matchups 관련 테스트

### 데이터 소스

```
GET datalab.wkbl.or.kr/positionAnalysis/search?gameID={game_id}&startSeasonCode=046&endSeasonCode=046
```

JSON API 직접 접근 가능. 경기당 1회 요청.

### 스키마

```sql
CREATE TABLE IF NOT EXISTS position_matchups (
    game_id TEXT NOT NULL,
    position TEXT NOT NULL,          -- G, F, C
    scope TEXT NOT NULL DEFAULT 'vs',
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

---

## 2. 드래프트 기록 수집

**상태**: 미착수
**출처**: additional-data-plan.md Tier 2

### 개요

- URL: `wkbl.or.kr/history/draft.asp`
- 정적 HTML 파싱 (26년분, 1999~2025)
- 데이터: 순위, 팀명, 선수명, 생년월일, 출신학교

### 난점

- 선수 pno 미포함 → 이름+팀 기반 매칭 필요
- HTML 구조가 연도별로 다를 수 있음

### 가치

- 선수 출신학교/드래프트 순위 정보는 다른 소스에서 얻기 어려움
- 선수 프로필 풍부화에 기여

---

## 3. 예측 성능 개선 실험

**상태**: 미착수
**출처**: players-teams-leaders-fix-plan.md P2

### 개요

- 신규 지표 (USG%, PER, NetRtg, Pace 등)를 예측 모델 feature로 추가 실험
- MAE/RMSE/적중률 기준선 비교
- 시즌 홀드아웃 기반 과적합 점검

### 대상 파일

- `src/views/predict-logic.js`
- `tools/stats.py`
- `tests/test_ingest_predictions.py`

---

## 4. Tier 3 고급 지표: BPM / VORP / WS

**상태**: 미착수 (실현 가능성 낮음)
**출처**: advanced-stats-plan.md Phase 7.4

### BPM (Box Plus/Minus)

- NBA 회귀 계수를 WKBL 6팀 리그에 적용하면 모델 불안정
- 자체 피팅은 90명 표본으로 통계적 신뢰도 부족
- 대안: NBA 계수 직접 적용 + "참고용" 표기

### VORP (Value Over Replacement Player)

- BPM에 의존 → BPM 없으면 산출 불가
- 대체 선수 수준(-2.0)은 NBA 기준, WKBL 별도 산정 필요

### WS (Win Shares)

- Tier 1 ORtg/DRtg + Pace 완성 후 구현 가능
- 간소화 버전: 출전시간 비례 배분 가능
- 개인 ORtg/DRtg 전환 완료(2026-02-20)로 기반은 갖춤

---

## 5. team_rosters 스키마 도입 검토

**상태**: 보류
**출처**: refactor-plan.md P3

### 개요

- `team_rosters(season_id, team_id, player_id)` 테이블로 시즌별 로스터 정합성 강화
- 현재는 `player_games` + `players.is_active`로 추론
- 과거 시즌 `gp=0` 선수 처리는 historical team inference로 대체 완료
