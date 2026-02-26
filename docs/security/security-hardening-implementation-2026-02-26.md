# WKBL Security Hardening Implementation (2026-02-26)

## 범위

- API CORS 정책 강화 (화이트리스트 기반)
- API 요청 제한 (레이트리밋/요청 크기 제한)
- 서버 공통 보안 헤더 추가
- CSP 강화 (`unsafe-eval`, `unsafe-inline` 제거)
- CDN 런타임 의존 제거 (로컬 vendor 자산 사용)
- JS 의존성 보안 업데이트 및 `npm audit` 게이트 도입
- CI/CD 공급망 하드닝 (GitHub Actions SHA pin)
- 보안 스캔 워크플로 추가 (CodeQL, gitleaks, ZAP baseline)
- ASVS L1 체크리스트/인시던트 런북 문서화

## 주요 변경 파일

- Backend/API
  - `tools/config.py`
  - `tools/api.py`
  - `server.py`
- Frontend/CSP
  - `index.html`
  - `src/db.js`
  - `src/app.js`
  - `src/styles/core/base.css`
  - `src/styles/core/layout.css`
  - `src/vendor/chart.umd.js`
  - `src/vendor/sql-wasm.js`
  - `src/vendor/sql-wasm.wasm`
- CI/Supply chain
  - `.github/workflows/ci.yml`
  - `.github/workflows/deploy.yml`
  - `.github/workflows/update-data.yml`
  - `.github/workflows/update-data-full.yml`
  - `.github/workflows/codeql.yml`
  - `.github/workflows/gitleaks.yml`
  - `.github/workflows/zap-baseline.yml`
  - `.github/dependabot.yml`
- 보안 감사/문서
  - `tools/check_npm_audit.mjs`
  - `docs/security/npm-audit-baseline.json`
  - `docs/security/asvs-l1-checklist.md`
  - `docs/security/incident-runbook.md`
  - `README.md`

## 검증 결과

- `npm audit`: high=0, critical=0
- `pytest`: 570 passed
- `vitest`: 125 passed
- `lint:front`: 에러 0 (경고만 존재)
- `format:front:check`: 통과

## 운영 메모

- 레이트리밋 임계값은 환경변수로 조정 가능:
  - `API_RATE_LIMIT_PER_MINUTE`
  - `API_SEARCH_RATE_LIMIT_PER_MINUTE`
  - `API_RATE_LIMIT_WINDOW_SECONDS`
- CORS 허용 오리진은 `API_ALLOW_ORIGINS`로 관리.
- 배포 전 최종 `npm audit --json` 재실행 권장.
