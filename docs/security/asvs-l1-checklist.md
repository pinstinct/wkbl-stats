# OWASP ASVS L1 Checklist (WKBL)

## 1. Architecture / Design

- [x] 공개 엔드포인트 목록 식별 및 문서화
- [x] CORS 화이트리스트 정책 적용
- [x] 보안 헤더(HSTS, XFO, Referrer, Permissions, nosniff) 적용

## 2. Authentication / Session

- [ ] API key/JWT 기반 접근통제 필요 여부 재평가
- [x] 인증 미적용 상태에서 남용 방어(레이트리밋) 적용

## 3. Access Control

- [x] 읽기 전용 공개 API로 권한 없는 쓰기 엔드포인트 없음 확인
- [ ] 프록시/게이트웨이 단에서 IP allow/deny 정책 검토

## 4. Validation / Sanitization

- [x] SQL 파라미터 바인딩 사용
- [x] 프런트 HTML escape 유틸 적용
- [x] 요청 크기 제한 적용 (`API_MAX_REQUEST_BYTES`)

## 5. Configuration

- [x] CSP에서 `unsafe-eval`, `unsafe-inline` 제거
- [x] CDN 런타임 의존 제거(로컬 vendor 자산)
- [x] GitHub Actions SHA pin 적용

## 6. Dependency / Supply Chain

- [x] `npm audit` high/critical 0 달성
- [x] Dependabot 주간 업데이트 구성
- [x] CodeQL + gitleaks + ZAP baseline 워크플로 추가

## 7. Logging / Monitoring

- [x] 429 응답 + `Retry-After` 표준화
- [x] 레이트리밋 초과 로깅
- [ ] 운영 대시보드 경보 규칙(4xx/5xx 급증) 연결

## 8. Verification

- [x] API/서버 보안 회귀 테스트 추가
- [x] 프런트/백엔드 회귀 테스트 통과
- [ ] 배포 환경 실 URL 대상 DAST 정기 점검 결과 리뷰 프로세스 수립
