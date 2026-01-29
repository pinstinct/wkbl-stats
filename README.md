# WKBL Player Stats

WKBL(한국여자농구연맹) 선수 스탯을 NBA Stats 스타일로 보여주는 대시보드입니다.

**Live Demo**: https://pinstinct.github.io/wkbl-stats/

## 주요 기능

- 2025-26 시즌 선수별 경기당 평균 스탯 조회
- 시즌/팀/포지션 필터링 및 선수 검색
- 컬럼 클릭으로 정렬
- 반응형 디자인 (모바일/태블릿/데스크톱)
  - 모바일: 선수명 고정 + 가로 스크롤로 전체 스탯 확인 가능
- 매일 자동 데이터 업데이트 (GitHub Actions)
- SQLite 데이터베이스로 경기별 기록 저장 (증분 업데이트)

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
| REB/36 | 36분당 환산 리바운드 | `REB × (36 / MIN)` |
| AST/36 | 36분당 환산 어시스트 | `AST × (36 / MIN)` |

PTS, REB, AST 중 2개 이상이 평균 10 이상이면 **Double-Double 평균** 배지가 표시됩니다.

## 로컬 실행

```bash
python3 server.py
```

브라우저에서 http://localhost:8000 접속

## 데이터 수집

수동 실행 (증분 업데이트):

```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --active-only \
  --output data/wkbl-active.json
```

전체 새로고침:

```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --save-db \
  --force-refresh \
  --active-only \
  --output data/wkbl-active.json
```

### 옵션
| 옵션 | 설명 |
|------|------|
| `--season-label` | 시즌 (예: 2025-26) |
| `--auto` | Data Lab에서 시즌 파라미터 자동 탐색 |
| `--end-date` | 집계 종료일 (YYYYMMDD, 기본값: 오늘) |
| `--active-only` | 현역 선수만 필터링 |
| `--save-db` | SQLite 데이터베이스에 경기 기록 저장 |
| `--force-refresh` | 기존 데이터 무시하고 전체 새로고침 |
| `--fetch-team-stats` | 팀 스탯도 함께 수집 |
| `--no-cache` | 캐시 무시하고 새로 수집 |

## 배포

GitHub Pages로 무료 호스팅됩니다.

### 자동 배포
- `main` 브랜치 푸시 시 자동 배포 (`.github/workflows/deploy.yml`)

### 자동 데이터 업데이트
- 매일 오전 6시, 오후 10시 (KST) 자동 실행 (`.github/workflows/update-data.yml`)
- 변경사항이 있을 때만 커밋

## 데이터 출처

- 경기 기록: [WKBL Data Lab](https://datalab.wkbl.or.kr/)
- 선수 프로필: [WKBL 공식 사이트](https://www.wkbl.or.kr/)

## 기술 스택

- **Frontend**: Vanilla JS, CSS (외부 라이브러리 없음)
- **Backend**: Python 3 표준 라이브러리만 사용
- **Hosting**: GitHub Pages (무료)
- **CI/CD**: GitHub Actions (무료)

## 폴더 구조

```
.
├── index.html              # 메인 페이지
├── server.py               # 로컬 개발 서버
├── src/
│   ├── app.js              # 프론트엔드 로직
│   └── styles.css          # 스타일 (반응형 디자인)
├── data/
│   ├── wkbl-active.json    # 현역 선수 스탯 (자동 생성)
│   ├── wkbl.db             # SQLite 데이터베이스 (경기별 기록)
│   ├── sample.json         # 폴백 샘플 데이터
│   └── cache/              # 크롤링 캐시 (git 제외)
├── tools/
│   ├── config.py           # 설정 모듈
│   ├── database.py         # SQLite 스키마 및 DB 작업
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
