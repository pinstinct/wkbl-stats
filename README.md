# WKBL Stats

WKBL(한국여자농구연맹) 통계를 Basketball Reference 스타일로 보여주는 대시보드입니다.

**Live Demo**: https://pinstinct.github.io/wkbl-stats/

## 주요 기능

- **경기 예측** - 다음 경기 승률 예측 및 추천 선발 라인업
- **선수 활약 예측** - 개별 선수 득점/리바운드/어시스트 예측 (신뢰 구간 포함)
- **경기 일정** - 예정 경기 및 최근 결과, 예측 적중 여부 표시
- 선수별 경기당 평균 스탯 조회 (2020-21 ~ 현재)
- 선수 상세 페이지 (커리어 스탯, 시즌별 기록, 트렌드 차트, 레이더 차트)
- 팀 순위표 (승률 차트, 홈/원정 기록)
- 경기 박스스코어 (예측 vs 실제 비교)
- **게임 슛차트 대시보드** (`#/games/{id}`: Shotcharts/Shotzones 탭, 팀→선수→성공-실패→쿼터(OT 포함) 필터, 팀-선수 연동, 존별/쿼터별 차트, PNG 저장, WKBL 좌표계 코트 오버레이)
- 부문별 리더보드 (득점/리바운드/어시스트/스틸/블록/PER/GmSc/TS%/PIR/WS)
- **선수 비교 도구** (최대 4명 비교, 레이더/바 차트)
- **전역 검색** (Ctrl+K 단축키, 선수/팀 통합 검색)
- 반응형 디자인 (모바일/태블릿/데스크톱)
- REST API 제공 (`/api/docs`에서 Swagger UI 확인)
- 매일 자동 데이터 업데이트 (GitHub Actions)

## 페이지

| URL              | 페이지     | 설명                                           |
| ---------------- | ---------- | ---------------------------------------------- |
| `#/`             | 홈         | 다음 경기 예측 및 추천 라인업                  |
| `#/players`      | 선수 목록  | 필터/정렬/검색, 선수 카드                      |
| `#/players/{id}` | 선수 상세  | 커리어 요약, 시즌별 기록, 트렌드/레이더 차트   |
| `#/teams`        | 팀 순위    | 순위표, 승률 차트                              |
| `#/teams/{id}`   | 팀 상세    | 로스터, 최근 경기                              |
| `#/games`        | 경기 목록  | 완료된 경기 카드                               |
| `#/games/{id}`   | 박스스코어 | 양팀 선수별 스탯, 예측 비교, 인터랙티브 슛차트 |
| `#/schedule`     | 일정       | 예정/최근 경기, 예측 적중 여부                 |
| `#/leaders`      | 리더보드   | 부문별 Top 5                                   |
| `#/compare`      | 선수 비교  | 최대 4명 비교, 레이더/바 차트                  |
| `#/predict`      | 선수 예측  | 개별 선수 활약 예측                            |

## 스탯 지표

### 기본 스탯

| 지표 | 설명                  |
| ---- | --------------------- |
| GP   | 출전 경기 수          |
| MIN  | 경기당 평균 출전 시간 |
| PTS  | 경기당 평균 득점      |
| REB  | 경기당 평균 리바운드  |
| AST  | 경기당 평균 어시스트  |
| STL  | 경기당 평균 스틸      |
| BLK  | 경기당 평균 블록      |
| TOV  | 경기당 평균 턴오버    |
| FG%  | 야투 성공률           |
| 3P%  | 3점슛 성공률          |
| FT%  | 자유투 성공률         |

### 2차 지표

| 지표     | 설명                     | 계산식                                                                                                   |
| -------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| TS%      | True Shooting %          | `PTS / (2 × (FGA + 0.44 × FTA))`                                                                         |
| eFG%     | Effective FG%            | `(FGM + 0.5 × 3PM) / FGA`                                                                                |
| AST/TO   | 어시스트/턴오버 비율     | `AST / TO`                                                                                               |
| PIR      | Performance Index Rating | `(PTS + REB + AST + STL + BLK - TOV - (FGA - FGM) - (FTA - FTM)) / GP`                                   |
| PTS/36   | 36분당 환산 득점         | `PTS × (36 / MIN)`                                                                                       |
| GmSc     | Game Score (Hollinger)   | `PTS + 0.4×FGM - 0.7×FGA - 0.4×(FTA-FTM) + 0.7×OREB + 0.3×DREB + STL + 0.7×AST + 0.7×BLK - 0.4×PF - TOV` |
| 코트마진 | 출전시간 가중 득실차     | 경기별 `(팀 득실차 × 출전시간/40)`의 시즌 평균 (players: 시즌 기준, players/{id}: 커리어 전체 기준)      |

### 고급 지표

| 지표       | 설명                             | 계산식/정의                                                                                                   |
| ---------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| PER        | Player Efficiency Rating         | Hollinger uPER 기반 `aPER = pace_adj × uPER`, `PER = aPER × (15 / lg_aPER)`                                   |
| USG%       | Usage Rate (사용률)              | `100 × (FGA + 0.44×FTA + TOV) × (Team_MIN/5) / (MIN × (Team_FGA + 0.44×Team_FTA + Team_TOV))`                 |
| ORtg       | Individual Offensive Rating      | 박스스코어 기반 개인 공격 생산 추정치 (`Points Produced`, `Total Possessions`)를 이용한 100포제션당 득점 지표 |
| DRtg       | Individual Defensive Rating      | 박스스코어 기반 스탑(Stop) 추정치를 이용한 100포제션당 실점 지표 (낮을수록 좋음)                              |
| NetRtg     | Net Rating                       | `ORtg - DRtg`                                                                                                 |
| Pace       | 팀 경기 템포                     | `40 × (Team_Poss + Opp_Poss) / (2 × Team_MIN/5)`                                                              |
| TOV%       | Turnover Percentage              | `100 × TOV / (FGA + 0.44×FTA + TOV)`                                                                          |
| OREB%      | Offensive Rebound Rate           | `100 × OREB × (Team_MIN/5) / (MIN × (Team_OREB + Opp_DREB))`                                                  |
| DREB%      | Defensive Rebound Rate           | `100 × DREB × (Team_MIN/5) / (MIN × (Team_DREB + Opp_OREB))`                                                  |
| REB%       | Total Rebound Rate               | `100 × REB × (Team_MIN/5) / (MIN × (Team_REB + Opp_REB))`                                                     |
| AST%       | Assist Percentage                | `100 × AST / (((MIN/(Team_MIN/5)) × Team_FGM) - FGM)`                                                         |
| STL%       | Steal Percentage                 | `100 × STL × (Team_MIN/5) / (MIN × Opp_Poss)`                                                                 |
| BLK%       | Block Percentage                 | `100 × BLK × (Team_MIN/5) / (MIN × (Opp_FGA - Opp_3PA))`                                                      |
| WS         | Win Shares                       | `WS = OWS + DWS` (팀 승리에 대한 공격/수비 기여도 승수 환산)                                                  |
| OWS / DWS  | Offensive / Defensive Win Shares | 공격/수비 기여를 각각 승수로 환산 (현재 API/계산에 포함)                                                      |
| WS/40      | 40분당 Win Shares                | `WS / Total_MIN × 40` (WKBL 40분 경기 기준)                                                                   |
| +/- (Game) | 경기 박스스코어 온코트 +/-       | `plus_minus_game`: 라인업 스틴트에서 경기 단위 온코트 득실차 합계                                             |
| +/-/G      | 시즌 경기당 온코트 득실차        | `plus_minus_per_game = plus_minus_total / GP` (라인업 스틴트 기반)                                            |
| +/-/100    | 100포제션당 온코트 득실차        | `plus_minus_per100 = 100 × plus_minus_total / 추정 온코트 포제션` (팀 템포 차이 보정)                         |

참고:

- ORtg/DRtg/PER/WS는 Basketball Reference 방법론을 참고한 구현이며, 일부 항목은 WKBL 데이터 구조(40분 경기, 리그 규모)에 맞춘 근사/보정이 적용되어 있다.
- Plus/Minus 해석: 시즌 간/팀 간 비교 정확성은 `+/-/100`이 높고, 직관적 경기 평균 영향은 `+/-/G`가 읽기 쉽다.

## 로컬 실행

```bash
# 의존성 설치 (첫 실행 시)
uv sync

# 서버 실행
uv run python3 server.py
```

- Frontend: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

## 테스트

```bash
# 백엔드/데이터 테스트
uv run pytest -q

# 프론트 단위 테스트 (Vitest)
npm ci
npm run test:front
```

## 코드 품질 (pre-commit)

```bash
# 훅 설치
uv run pre-commit install

# 전체 수동 실행
uv run pre-commit run --all-files
```

- Python: `ruff-check`, `ruff-format`, `mypy`, `bandit`
- Frontend: `eslint`(보안 규칙 포함), `prettier --check`

## REST API

| Endpoint                           | Description                      |
| ---------------------------------- | -------------------------------- |
| `GET /api/players`                 | 선수 목록 + 시즌 스탯            |
| `GET /api/players/compare`         | 선수 비교 (ids 파라미터로 2-4명) |
| `GET /api/players/{id}`            | 선수 상세 (커리어 스탯)          |
| `GET /api/players/{id}/gamelog`    | 선수 경기 로그                   |
| `GET /api/players/{id}/highlights` | 선수 하이라이트 (커리어 하이)    |
| `GET /api/teams`                   | 팀 목록                          |
| `GET /api/teams/{id}`              | 팀 상세 (로스터)                 |
| `GET /api/games`                   | 경기 목록                        |
| `GET /api/games/{id}`              | 박스스코어                       |
| `GET /api/seasons/{id}/standings`  | 팀 순위                          |
| `GET /api/seasons`                 | 시즌 목록                        |
| `GET /api/leaders`                 | 리더보드                         |
| `GET /api/leaders/all`             | 전체 카테고리 리더보드           |
| `GET /api/search`                  | 통합 검색 (선수/팀)              |
| `GET /api/health`                  | 헬스 체크                        |

Query parameters: `season`, `team`, `category`, `limit`, `offset`, `q` (검색어), `ids` (비교용)

## 데이터 수집

```bash
# 증분 업데이트 (새 경기 + 미래 일정)
uv run python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --fetch-play-by-play \
  --compute-lineups \
  --load-all-players \
  --include-future \
  --active-only \
  --output data/wkbl-active.json

# 전체 새로고침
uv run python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --fetch-play-by-play \
  --compute-lineups \
  --load-all-players \
  --force-refresh \
  --include-future \
  --active-only \
  --output data/wkbl-active.json
```

## 배포

GitHub Pages로 정적 파일 호스팅 (sql.js로 브라우저에서 SQLite 쿼리 실행).

- `main` 브랜치 푸시 시 자동 배포
- 매일 오전 6시 (KST) 데이터 자동 업데이트

## 데이터 출처

- 경기 기록: [WKBL Data Lab](https://datalab.wkbl.or.kr/)
- 선수 프로필: [WKBL 공식 사이트](https://www.wkbl.or.kr/)

## 기술 스택

| 영역            | 기술                                    |
| --------------- | --------------------------------------- |
| Frontend        | Vanilla JS, CSS (SPA with hash routing) |
| Backend         | FastAPI, uvicorn                        |
| Database        | SQLite                                  |
| Package Manager | uv (Python), npm (Frontend tooling)     |
| Hosting         | GitHub Pages                            |
| CI/CD           | GitHub Actions                          |

## 폴더 구조

```
.
├── index.html               # SPA 메인 페이지 (모든 뷰 템플릿)
├── package.json             # 프론트 테스트(vitest) 설정
├── server.py                # FastAPI 서버 (로컬/Render)
├── pyproject.toml           # 프로젝트 의존성
├── uv.lock                  # 의존성 잠금
├── src/
│   ├── app.js               # 프론트엔드 엔트리 (라우팅/페이지 orchestration)
│   ├── db.js                # 브라우저 SQLite (sql.js 래퍼)
│   ├── seasons.js           # 프론트 공유 시즌 상수
│   ├── styles.css           # 스타일 import 엔트리
│   ├── data/                # 프론트 데이터 접근 레이어
│   ├── ui/                  # 이벤트 바인딩/라우터 로직
│   │   └── index.js         # ui 배럴 export
│   ├── views/               # 페이지 렌더링/순수 로직
│   │   └── index.js         # views 배럴 export
│   └── styles/              # core/components/pages/responsive 분할 스타일
├── data/
│   ├── wkbl-active.json     # 현역 선수 스탯 (자동 생성)
│   ├── wkbl.db              # SQLite 데이터베이스
│   └── cache/               # 크롤링 캐시 (git 제외)
├── tools/
│   ├── api.py               # REST API 엔드포인트
│   ├── config.py            # 설정 모듈
│   ├── database.py          # SQLite 스키마 및 쿼리
│   ├── ingest_wkbl.py       # 데이터 수집 스크립트
│   ├── stats.py             # 고급 스탯 계산 (PER, ORtg/DRtg, USG% 등)
│   ├── lineup.py            # 라인업 추적 엔진 (+/-, On/Off Rating)
│   └── season_utils.py      # 시즌 코드 해석
├── tests/                   # Python 테스트 (143개)
├── docs/
│   ├── project-roadmap.md   # 프로젝트 로드맵
│   ├── project-structure.md # 구조 원칙/디렉터리 역할 가이드
│   ├── data-sources.md      # 데이터 소스/DB 스키마 문서
│   ├── sql-query-contract.md # SQL 쿼리 계약
│   ├── regression-checklist.md # QA 체크리스트
│   └── bak/                 # 완료된 계획 문서 아카이브
└── .github/workflows/
    ├── update-data.yml      # 일일 데이터 업데이트
    └── update-data-full.yml # 전체 히스토리 업데이트 (수동)
```

## 라이선스

MIT
