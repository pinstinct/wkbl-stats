# WKBL Stats

WKBL(한국여자농구연맹) 통계를 Basketball Reference 스타일로 보여주는 대시보드입니다.

**Live Demo**: https://pinstinct.github.io/wkbl-stats/

## 주요 기능

- 선수별 경기당 평균 스탯 조회 (2020-21 ~ 현재)
- 선수 상세 페이지 (커리어 스탯, 시즌별 기록, 최근 경기 로그)
- 팀 페이지 (순위표, 로스터, 최근 경기)
- 경기 박스스코어
- 부문별 리더보드 (득점/리바운드/어시스트/스틸/블록)
- 시즌/팀/포지션 필터링 및 선수 검색
- 반응형 디자인 (모바일/태블릿/데스크톱)
- REST API 제공 (`/api/docs`에서 Swagger UI 확인)
- 매일 자동 데이터 업데이트 (GitHub Actions)

## 페이지

| URL | 페이지 | 설명 |
|-----|--------|------|
| `#/` | 홈 | 선수 목록 + 필터/정렬/검색 |
| `#/players/{id}` | 선수 상세 | 커리어 요약, 시즌별 기록, 최근 경기 |
| `#/teams` | 팀 순위 | 순위표 (승률, 홈/원정, 연속기록) |
| `#/teams/{id}` | 팀 상세 | 로스터, 최근 경기 |
| `#/games` | 경기 목록 | 경기 카드 (날짜, 팀, 점수) |
| `#/games/{id}` | 박스스코어 | 양팀 선수별 스탯 |
| `#/leaders` | 리더보드 | 부문별 Top 5 |

## 스탯 지표

### 기본 스탯
| 지표 | 설명 |
|------|------|
| GP | 출전 경기 수 |
| MIN | 경기당 평균 출전 시간 |
| PTS | 경기당 평균 득점 |
| REB | 경기당 평균 리바운드 |
| AST | 경기당 평균 어시스트 |
| STL | 경기당 평균 스틸 |
| BLK | 경기당 평균 블록 |
| TOV | 경기당 평균 턴오버 |
| FG% | 야투 성공률 |
| 3P% | 3점슛 성공률 |
| FT% | 자유투 성공률 |

### 2차 지표 (Advanced Stats)
| 지표 | 설명 | 계산식 |
|------|------|--------|
| TS% | True Shooting % | `PTS / (2 × (FGA + 0.44 × FTA))` |
| eFG% | Effective FG% | `(FGM + 0.5 × 3PM) / FGA` |
| AST/TO | 어시스트/턴오버 비율 | `AST / TO` |
| PIR | Performance Index Rating | 유럽식 종합 효율 지표 |
| PTS/36 | 36분당 환산 득점 | `PTS × (36 / MIN)` |

## 로컬 실행

```bash
# 의존성 설치 (첫 실행 시)
uv sync

# 서버 실행
uv run python3 server.py
```

- Frontend: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/players` | 선수 목록 + 시즌 스탯 |
| `GET /api/players/{id}` | 선수 상세 (커리어 스탯) |
| `GET /api/players/{id}/gamelog` | 선수 경기 로그 |
| `GET /api/teams` | 팀 목록 |
| `GET /api/teams/{id}` | 팀 상세 (로스터) |
| `GET /api/games` | 경기 목록 |
| `GET /api/games/{id}` | 박스스코어 |
| `GET /api/seasons/{id}/standings` | 팀 순위 |
| `GET /api/leaders` | 리더보드 |
| `GET /api/health` | 헬스 체크 |

Query parameters: `season`, `team`, `category`, `limit`, `offset`

## 데이터 수집

```bash
# 증분 업데이트 (새 경기만)
uv run python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --load-all-players \
  --active-only \
  --output data/wkbl-active.json

# 전체 새로고침
uv run python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --load-all-players \
  --force-refresh \
  --active-only \
  --output data/wkbl-active.json
```

## 배포

GitHub Pages로 정적 파일 호스팅.

- `main` 브랜치 푸시 시 자동 배포
- 매일 오전 6시, 오후 10시 (KST) 데이터 자동 업데이트

## 데이터 출처

- 경기 기록: [WKBL Data Lab](https://datalab.wkbl.or.kr/)
- 선수 프로필: [WKBL 공식 사이트](https://www.wkbl.or.kr/)

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | Vanilla JS, CSS (SPA with hash routing) |
| Backend | FastAPI, uvicorn |
| Database | SQLite |
| Package Manager | uv |
| Hosting | GitHub Pages |
| CI/CD | GitHub Actions |

## 폴더 구조

```
.
├── index.html              # SPA 메인 페이지 (모든 뷰 템플릿)
├── server.py               # FastAPI 서버
├── pyproject.toml          # 프로젝트 의존성
├── uv.lock                 # 의존성 잠금
├── src/
│   ├── app.js              # 프론트엔드 (라우팅, API 호출, 렌더링)
│   └── styles.css          # 반응형 스타일
├── data/
│   ├── wkbl-active.json    # 현역 선수 스탯 (자동 생성)
│   ├── wkbl.db             # SQLite 데이터베이스
│   ├── sample.json         # 폴백 샘플 데이터
│   └── cache/              # 크롤링 캐시 (git 제외)
├── tools/
│   ├── api.py              # REST API 엔드포인트
│   ├── config.py           # 설정 모듈
│   ├── database.py         # SQLite 스키마
│   └── ingest_wkbl.py      # 데이터 수집 스크립트
├── docs/
│   ├── data-sources.md     # 데이터 소스 문서
│   └── project-roadmap.md  # 프로젝트 로드맵
└── .github/workflows/
    ├── deploy.yml          # GitHub Pages 배포
    └── update-data.yml     # 데이터 자동 업데이트
```

## 라이선스

MIT
