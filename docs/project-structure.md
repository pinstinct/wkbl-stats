# Project Structure Guide

이 문서는 WKBL Stats 코드베이스의 디렉터리 책임을 고정해, 기능 추가 시 구조가 다시 복잡해지지 않도록 하기 위한 가이드다.

## Top-level Layout

- `src/`: 프론트엔드 애플리케이션 코드
- `tools/`: 수집/DB/API 등 백엔드 실행 코드
- `tests/`: Python 테스트
- `docs/`: 설계/운영/리팩토링 문서
- `data/`: 실행/배포 데이터 산출물

## Frontend (`src/`)

- `src/app.js`: 앱 진입점. 라우팅/페이지 orchestration만 담당.
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
- `tools/stats.py`, `tools/season_utils.py`: 공통 계산/시즌 로직.

## Structure Rules

- `app.js`에는 신규 렌더링 HTML 문자열을 직접 추가하지 않는다.
  : 페이지 UI는 `src/views/*`에 추가한다.
- `app.js`에는 신규 이벤트 리스너를 직접 추가하지 않는다.
  : 이벤트는 `src/ui/*` 모듈에 추가하고 `mount/unmount` 패턴을 따른다.
- 동일 도메인 모듈은 배럴(`src/views/index.js`, `src/ui/index.js`)을 통해 import한다.
- 새 순수 로직은 반드시 단위 테스트(`*.test.js`)를 함께 추가한다.

## Suggested Next Split

- `src/app.js`에서 포맷/차트 생성 보조 함수를 `src/views/*-logic.js`로 지속 분리.
- 라우트 액션 실행(`handleRoute`)도 매핑 테이블 기반으로 추가 단순화.
