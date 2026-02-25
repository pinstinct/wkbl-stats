# Project Structure Guide

이 문서는 WKBL Stats 코드베이스의 디렉터리 책임을 고정해, 기능 추가 시 구조가 다시 복잡해지지 않도록 하기 위한 가이드다.

> 최종 업데이트: 2026-02-25

## Top-level Layout

- `src/`: 프론트엔드 애플리케이션 코드
- `tools/`: 수집/DB/API 등 백엔드 실행 코드
- `tests/`: Python 테스트 (523개)
- `docs/`: 참조 문서 (로드맵, 데이터 소스, 구조 가이드 등)
- `docs/complete/`: 완료된 계획 문서 아카이브
- `data/`: 실행/배포 데이터 산출물

## Frontend (`src/`)

- `src/app.js`: 앱 진입점. 라우팅/페이지 orchestration만 담당.
- `src/db.js`: 브라우저 SQLite 모듈 (sql.js 래퍼, 팀/리그 집계, 고급 지표 계산).
- `src/views/`: 페이지 렌더링과 페이지별 순수 로직.
- `src/views/index.js`: views 배럴 export. `app.js`는 개별 view 파일 대신 이 모듈을 import.
- `src/ui/`: DOM 이벤트 바인딩, 네비게이션/라우터 유틸.
- `src/ui/index.js`: ui 배럴 export. `app.js`는 개별 ui 파일 대신 이 모듈을 import.
- `src/data/`: 데이터 접근 계층(API/로컬 DB 분기).
- `src/styles/`: core/components/pages/responsive 분리된 스타일.

## Backend (`tools/`)

- `tools/ingest_wkbl.py`: 데이터 수집 파이프라인 엔트리.
- `tools/database.py`: SQLite 스키마/쿼리 유틸.
- `tools/api.py`: FastAPI 엔드포인트.
- `tools/stats.py`: 고급 스탯 계산 (TS%, PER, 개인 ORtg/DRtg 등).
- `tools/lineup.py`: 라인업 추적 엔진 (+/-, On/Off Rating).
- `tools/season_utils.py`: 시즌 코드 해석 로직.
- `tools/predict.py`: 예측 시스템 (Game Score 가중 스탯, 승률 예측, 라인업 선정).
- `tools/split_db.py`: DB 분할기 (core/detail 분리).
- `tools/config.py`: URL, 경로, 설정 상수.

## Docs (`docs/`)

활성 참조 문서만 `docs/` 루트에 유지한다.

| 파일                      | 역할                               |
| ------------------------- | ---------------------------------- |
| `project-roadmap.md`      | 프로젝트 전체 로드맵 + 진행 상태   |
| `project-structure.md`    | 디렉터리 책임/규칙 (이 파일)       |
| `data-sources.md`         | WKBL 데이터 수집 엔드포인트/스키마 |
| `sql-query-contract.md`   | API ↔ db.js SQL 쿼리 계약          |
| `regression-checklist.md` | 모바일/테이블 반응형 QA 체크리스트 |

완료된 계획 문서는 `docs/complete/`에 보관:

| 파일                                         | 내용                                 |
| -------------------------------------------- | ------------------------------------ |
| `complete/visualization-plan.md`             | 시각화 + 예측 기능 구현 계획         |
| `complete/refactor-plan.md`                  | P0~P4 리팩토링 계획 (전체 완료)      |
| `complete/advanced-stats-plan.md`            | 고급 지표 Tier 1~3 계획              |
| `complete/advanced-stats-display-plan.md`    | 프론트엔드 고급 지표 표시 개선 계획  |
| `complete/players-teams-leaders-fix-plan.md` | Players/Teams/Leaders 버그 수정 계획 |
| `complete/additional-data-plan.md`           | 추가 데이터 수집 조사/계획           |
| `complete/remaining-features.md`             | 미완 기능 통합 목록                  |
| `complete/static-hosting-troubleshooting.md` | GitHub Pages 정적 호스팅 트러블슈팅  |
| `complete/test-coverage-95-plan.md`          | 테스트 커버리지 95% 달성 계획        |
| `complete/game-shotchart-plan.md`            | 경기 샷차트 구현 계획                |
| `complete/player-shotchart-plan.md`          | 선수 샷차트 구현 계획                |
| `complete/loading-optimization-plan.md`      | 로딩 최적화 계획                     |
| `complete/win-shares-plan.md`                | Win Shares 구현 계획                 |

## Structure Rules

- `app.js`에는 신규 렌더링 HTML 문자열을 직접 추가하지 않는다.
  : 페이지 UI는 `src/views/*`에 추가한다.
- `app.js`에는 신규 이벤트 리스너를 직접 추가하지 않는다.
  : 이벤트는 `src/ui/*` 모듈에 추가하고 `mount/unmount` 패턴을 따른다.
- 동일 도메인 모듈은 배럴(`src/views/index.js`, `src/ui/index.js`)을 통해 import한다.
- 새 순수 로직은 반드시 단위 테스트(`*.test.js`)를 함께 추가한다.
- 완료된 계획 문서는 `docs/complete/`으로 이동한다. `docs/` 루트에는 활성 참조 문서만 유지한다.
