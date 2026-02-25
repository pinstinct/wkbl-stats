# Playwright E2E 운영 체계 (구현 완료 기준)

## 요약

- 기존 스모크 중심 E2E를 `required/recommended/optional` 3티어 체계로 확장했다.
- 시나리오 단일 소스(`scenario-matrix.yaml`)와 자동 커버리지 리포트(`json/md`)를 도입했다.
- PR에서는 required tier 90% 하드 게이트, main/schedule은 권장/옵션 모니터링으로 분리했다.

## 현재 구현 상태

1. 시나리오 카탈로그

- `e2e/scenarios/scenario-matrix.yaml` 추가
- 시나리오 메타 필드 고정:
  - `id`, `title`, `tier`, `area`, `owner`, `risk`, `preconditions`, `expected`, `testRefs`, `enabled`, `since`, `notes`
- 등록 현황:
  - required 10개
  - recommended 10개
  - optional 10개

2. 테스트 구조

- `e2e/required/core.spec.js`
- `e2e/recommended/interaction.spec.js`
- `e2e/optional/resilience.spec.js`
- 각 테스트 타이틀에 시나리오 ID와 티어 태그 포함:
  - 예: `[E2E-NAV-001] @required ...`

3. 커버리지 계산기

- `tools/e2e_coverage_report.py`
- 입력: Playwright JSON 결과 + scenario matrix
- 출력:
  - `reports/e2e-coverage-<tier>.json`
  - `reports/e2e-coverage-<tier>.md`
  - `reports/e2e-coverage.json`
  - `reports/e2e-coverage.md`
- strict 매핑 검증:
  - matrix에는 있으나 테스트에 없는 ID
  - 테스트 결과에는 있으나 matrix에 없는 ID

4. 실행 스크립트

- 티어 실행:
  - `npm run test:e2e:required`
  - `npm run test:e2e:recommended`
  - `npm run test:e2e:optional`
- 티어 커버리지:
  - `npm run test:e2e:coverage:required`
  - `npm run test:e2e:coverage:recommended`
  - `npm run test:e2e:coverage:optional`
  - `npm run test:e2e:coverage:all`

5. CI 운영

- PR:
  - `e2e-required` 실행
  - required coverage >= 90% 하드 게이트
  - 리포트 아티팩트 업로드 + step summary 출력
- main push:
  - `e2e-recommended` 실행(모니터링)
  - 리포트 아티팩트 업로드 + step summary 출력
- schedule:
  - `e2e-optional` 실행(모니터링)
  - 리포트 아티팩트 업로드 + step summary 출력

## 운영 문서

- 가이드: `docs/e2e-coverage-guideline.md`
- 회귀 체크리스트 연동: `docs/regression-checklist.md`
- README 실행 명령 업데이트 완료

## 참고

- 로컬 E2E 서버 기동은 `playwright.config.js`에서 `.venv/bin/python3` 우선 사용.
- 브라우저는 `chromium` 단일 프로젝트로 운영한다.
