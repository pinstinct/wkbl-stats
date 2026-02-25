# E2E Coverage Guideline

## 목적

- E2E 테스트를 `required`, `recommended`, `optional` 티어로 관리한다.
- 시나리오 커버리지는 `e2e/scenarios/scenario-matrix.yaml`을 단일 소스로 계산한다.
- PR에서는 required tier를 90% 이상으로 강제한다.

## 시나리오 등록 규칙

- 시나리오 ID 형식: `E2E-<AREA>-<NNN>`
- 필수 필드: `id`, `title`, `tier`, `area`, `owner`, `risk`, `preconditions`, `expected`, `testRefs`, `enabled`, `since`, `notes`
- `testRefs`는 명시적으로 유지한다.
  - `spec`: 테스트 파일 경로
  - `title`: 테스트 타이틀에 포함된 ID 접두 (`[E2E-...]`)
  - `tag`: `@required`, `@recommended`, `@optional`

## 테스트 태깅 규칙

- 모든 Playwright 테스트 타이틀은 시나리오 ID를 포함한다.
  - 예: `[E2E-NAV-001] @required nav route players`
- 테스트 1개가 여러 시나리오를 커버해야 한다면, 시나리오별 테스트 분리를 우선한다.

## 커버리지 계산 규칙

- 등록 시나리오 수: `enabled=true`인 시나리오 수
- 자동화 수: `testRefs`가 유효하고 spec 파일이 존재하는 시나리오 수
- 실행 통과 수: 최근 Playwright 결과에서 `passed`로 관측된 시나리오 수
- 커버리지: `실행 통과 수 / 등록 시나리오 수 * 100`

## 실행 명령

```bash
# 티어별 실행
npm run test:e2e:required
npm run test:e2e:recommended
npm run test:e2e:optional

# 티어별 커버리지 리포트 생성
npm run test:e2e:coverage:required
npm run test:e2e:coverage:recommended
npm run test:e2e:coverage:optional
```

리포트 산출물:

- `reports/e2e-coverage-<tier>.json`
- `reports/e2e-coverage-<tier>.md`

## CI 정책

- PR: `required` 실행 + coverage gate(>= 90%)
- main push: `recommended` 실행 + 리포트 아티팩트
- nightly schedule: `optional` 실행 + 리포트 아티팩트

## PR 체크리스트

- 새/변경 E2E 테스트에 시나리오 ID를 포함했다.
- `scenario-matrix.yaml`에 동일 ID를 등록/수정했다.
- `npm run test:e2e:coverage:required`가 로컬에서 통과한다.
- 필요 시 `reports/e2e-coverage-required.md`를 확인했다.
