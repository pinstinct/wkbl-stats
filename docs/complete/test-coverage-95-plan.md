# WKBL 다중 프로젝트 95% 커버리지 달성 결과 (완료)

## 기준 일자

- 2026-02-25

## 목표와 원칙

- 목표:
  - 백엔드 커버리지 95% 이상
  - 프론트 커버리지 95% 이상 (`src/**/*.js` 엄격 분모)
- 원칙:
  - 프로덕션 코드(`tools/*.py`, `src/*.js`)는 수정하지 않고 테스트/설정/CI만 변경
  - 내부 구현 호출 횟수 검증 위주가 아닌, 사용자 관찰 결과/데이터 계약/오류 경로 검증 위주

## 최종 결과

- 백엔드:
  - `uv run pytest --cov=tools --cov=server --cov-report=term-missing --cov-fail-under=95`
  - 결과: **95.43%**, 531 passed
- 프론트:
  - `npm run test:front:coverage` (`vitest --coverage`)
  - 결과: **95.13%** (global threshold 95 통과)

## 반영된 설정/CI

- `package.json`
  - `test:front:coverage` 스크립트 추가
  - `@vitest/coverage-v8`, `jsdom`, `sql.js` devDependency 반영
- `vitest.config.js`
  - `test.coverage.include = ["src/**/*.js"]`
  - `test.coverage.exclude = ["src/**/*.test.js", "src/**/*.global.js"]`
  - line threshold 95
- `pyproject.toml`
  - pytest coverage gate(`--cov-fail-under=95`) 고정
- `.github/workflows/ci.yml`
  - `backend-coverage`, `frontend-coverage` 잡 추가

## 테스트 구현 요약

### 프론트

- 신규:
  - `src/app.behavior.integration.test.js`
  - `src/db.integration.test.js`
  - `src/seasons.test.js`
  - `src/ui/index.test.js`
  - `src/views/index.test.js`
  - `src/test-utils/frontend-fixtures.js`
- 수정:
  - `src/data/client.test.js`
  - `src/views/player-detail.test.js`
  - `src/views/players.test.js`
- 정리:
  - 중복/계측 충돌을 만들던 기존 `app.integration` 테스트는 제거

### 백엔드

- 신규:
  - `tests/test_split_db_cli.py`
- 수정:
  - `tests/test_api.py`

## 검증 포인트(고가치 시나리오)

- 프론트:
  - 라우팅/뷰 전환, 검색/비교/예측 이벤트, fallback UI 분기
  - DB 로딩(fallback 포함), 캐시/etag 경로, SQL 조회 계약
  - 코트마진/plus-minus/per100 등 계산 결과 계약
- 백엔드:
  - plus-minus/per100 edge case
  - season all/invalid 입력 처리
  - highlights/compare 에러 경로
  - split_db CLI 인자/출력 계약

## 재실행 명령

```bash
# Frontend strict coverage
npm run test:front:coverage

# Backend strict coverage
uv run pytest --cov=tools --cov=server --cov-report=term-missing --cov-fail-under=95
```
