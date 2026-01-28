# WKBL Stats 프로젝트 로드맵

## 목표
Basketball Reference 스타일의 종합 WKBL 통계 사이트 구축

---

## 1. 데이터 소스 분석 (완료)

### WKBL Data Lab (datalab.wkbl.or.kr)

| 카테고리 | 엔드포인트 | 데이터 | 상태 |
|----------|-----------|--------|------|
| **경기별 선수 박스스코어** | `record_player.asp` | MIN, PTS, REB, AST, STL, BLK, TO, FG, 3P, FT | ✅ 사용 중 |
| **경기별 팀 기록** | `record_team.asp` | 속공, 페인트존, 2/3점슛, 리바운드, 어시스트, 스틸, 블록, 파울, 턴오버 | 🆕 발견 |
| **경기 목록** | `game/list/month` | 시즌별 game_id, 날짜, 팀 | ✅ 사용 중 |
| **선수 랭킹 (JSON)** | `playerAnalysis/search` | 득점/리바운드/어시스트/스틸/블록 Top 5 | 🆕 발견 |

### WKBL 공식 사이트 (wkbl.or.kr)

| 카테고리 | 엔드포인트 | 데이터 | 상태 |
|----------|-----------|--------|------|
| **현역 선수 목록** | `player/player_list.asp` | 이름, 팀, pno | ✅ 사용 중 |
| **선수 프로필** | `player/detail.asp` | 포지션, 신장, 생년월일, 출신학교 | ✅ 사용 중 |
| **팀 순위** | `game/team_rank.asp` | 순위, 팀명, 경기수, 승/패, 승률, 승차 | 🆕 발견 (AJAX) |
| **경기 일정** | `game/sch/schedule1.asp` | 날짜, 홈/원정팀, 점수, game_no | 🆕 발견 |

### 추가 수집 가능 데이터

1. **팀 기록 (record_team.asp)**
   - 경기별 팀 스탯 (속공, 페인트존 득점, 슈팅 성공률 등)
   - 팀 리더 (득점, 어시스트, 리바운드, 블록 부문)

2. **팀 순위 (ajax_team_rank.asp)**
   - 시즌 순위표 (AJAX로 동적 로드)
   - 홈/원정/중립 전적, LAST5, 연속 기록

3. **경기 일정 (schedule1.asp)**
   - 달력/리스트 형식의 전체 경기 일정
   - 정규시즌/플레이오프 구분 가능

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
                                                 └─────────────────┘
        │                       │                        │
        └───────────┬───────────┴────────────────────────┘
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
          │ game_type           │ (정규시즌/플레이오프)
          └─────────────────────┘
                    │
                    ▼
          ┌─────────────────────┐
          │   player_games      │  ← 핵심 테이블 (경기별 선수 기록)
          ├─────────────────────┤
          │ id (PK)             │
          │ game_id (FK)        │
          │ player_id (FK)      │
          │ team_id (FK)        │
          │ minutes             │
          │ pts, reb, ast       │
          │ stl, blk, tov       │
          │ fgm, fga            │
          │ tpm, tpa            │
          │ ftm, fta            │
          │ off_reb, def_reb    │
          │ pf                  │
          └─────────────────────┘
```

---

## 3. 단계별 개발 계획

### Phase 1: 데이터 기반 구축 (2-3주)
- [x] SQLite DB 스키마 구현 ✅ (`tools/database.py`)
- [x] 기존 ingest 스크립트를 DB 저장으로 전환 ✅ (`--save-db` 옵션)
- [x] 경기별 raw 데이터 저장 (player_games 테이블) ✅
- [x] 시즌/팀/선수 마스터 데이터 구축 ✅
- [ ] home/away 팀 구분 개선 (현재 동일 팀으로 표시됨)

### Phase 2: 데이터 수집 확장 (2주)
- [x] WKBL Data Lab 추가 엔드포인트 탐색 ✅
- [x] 팀 스탯 수집 ✅ (`--fetch-team-stats` 옵션, `team_games` 테이블)
- [ ] 팀 순위 수집 (`ajax_team_rank.asp` 호출)
- [ ] 역대 시즌 데이터 수집 (2020-21 ~ 현재)
- [ ] 플레이오프 데이터 분리

**참고:** 팀 스탯 데이터 소스에 일부 불일치가 있음 (동일 데이터 반환 문제). 추가 조사 필요.

### Phase 3: API 서버 구축 (2주)
- [ ] FastAPI 또는 Flask로 REST API 구현
- [ ] 선수 조회 API (`/players`, `/players/{id}`)
- [ ] 팀 조회 API (`/teams`, `/teams/{id}`)
- [ ] 경기 조회 API (`/games`, `/games/{id}`)
- [ ] 시즌 스탯 집계 API

### Phase 4: 프론트엔드 확장 (3주)
- [ ] 선수 상세 페이지 (경기별 기록, 시즌별 평균, 커리어 통계)
- [ ] 팀 페이지 (로스터, 팀 스탯, 경기 일정)
- [ ] 경기 상세 페이지 (박스스코어)
- [ ] 리더보드 (부문별 랭킹)
- [ ] 시즌 비교

### Phase 5: 고급 기능 (선택)
- [ ] 선수 비교 도구
- [ ] 트렌드 차트
- [ ] 검색 기능 강화
- [ ] 시즌/커리어 하이라이트 자동 계산

---

## 4. 기술 스택 제안

| 영역 | 현재 | 제안 |
|------|------|------|
| **DB** | JSON 파일 | SQLite → PostgreSQL (확장 시) |
| **Backend** | Python 스크립트 | FastAPI |
| **Frontend** | Vanilla JS | 유지 또는 React/Vue |
| **Hosting** | GitHub Pages | Vercel/Railway (API 서버 필요 시) |
| **Data Update** | GitHub Actions | 유지 |

---

## 5. 무료 호스팅 전략

| 서비스 | 용도 | 무료 티어 |
|--------|------|-----------|
| **GitHub Pages** | 정적 프론트엔드 | 무제한 |
| **Railway/Render** | API 서버 | 월 500시간 |
| **Supabase** | PostgreSQL DB | 500MB |
| **PlanetScale** | MySQL DB | 1GB |

---

## 6. 참고 사이트

- [Basketball Reference](https://www.basketball-reference.com/) - 목표 레퍼런스
- [WKBL Data Lab](https://datalab.wkbl.or.kr/) - 데이터 소스
- [WKBL 공식 사이트](https://www.wkbl.or.kr/) - 선수 프로필
