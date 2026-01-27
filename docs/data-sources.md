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
│ 6. JSON 출력                                                        │
│    → data/wkbl-active.json                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 핵심 함수

| 함수 | 역할 |
|------|------|
| `fetch()` | URL 요청 + 캐싱 + 재시도 로직 |
| `get_season_meta()` | 시즌 파라미터 자동 탐색 |
| `parse_game_list_items()` | 경기 목록에서 game_id 추출 |
| `parse_player_tables()` | 박스스코어 HTML → 선수별 기록 파싱 |
| `load_active_players()` | 현역 선수 명단 + 프로필 수집 |
| `aggregate_players()` | 경기 기록 → 시즌 평균 집계 |
| `_compute_averages()` | 1차/2차 지표 계산 |

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
<li class="game-item" data-id="04501001" onclick="selectGame('04501001', true);">
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

### 4. 현역 선수 목록 (WKBL 공식 사이트)

**선수 목록:**
```
https://www.wkbl.or.kr/player/player_list.asp
```

**선수 상세 (포지션, 신장):**
```
https://www.wkbl.or.kr/player/detail.asp?player_group=12&pno=095778
```

상세 페이지에서 파싱하는 정보:
- 포지션: `포지션</span> - G`
- 신장: `신장</span> - 175 cm`

---

## 데이터 소스 요약

| 데이터 | URL | 용도 |
|--------|-----|------|
| 경기별 박스스코어 | `datalab.wkbl.or.kr:9001/data_lab/record_player.asp` | 선수별 경기 기록 |
| 경기 목록 | `datalab.wkbl.or.kr/game/list/month` | game_id 수집 |
| 현역 선수 명단 | `wkbl.or.kr/player/player_list.asp` | 현역 필터링 |
| 선수 프로필 | `wkbl.or.kr/player/detail.asp` | 포지션, 신장 |

---

## 주의사항

- 요청 간 0.15초 딜레이를 두어 서버 부하 방지
- 캐시를 활용하여 불필요한 중복 요청 방지
- WKBL Data Lab 엔드포인트는 변경될 수 있으므로 주기적으로 검증 필요
- HTML 파싱 시 `&amp;` 등 HTML 엔티티 디코딩 필요
