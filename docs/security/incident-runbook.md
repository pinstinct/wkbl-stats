# Security Incident Runbook

## 1) 탐지 (Detect)

- CI 보안 게이트 실패(CodeQL/gitleaks/npm audit/ZAP) 또는 운영 경보(429/5xx 급증) 발생 시 Incident 생성
- Incident 기록 항목:
  - 최초 감지 시각(UTC/KST)
  - 탐지 채널(CI, 로그, 사용자 신고)
  - 영향 범위(API, 프런트, 데이터, 배포 파이프라인)

## 2) 분류 (Triage)

- Sev1: 데이터 유출 가능성, 원격 코드 실행, 인증우회
- Sev2: 서비스 중단/대규모 오류, 고위험 취약점 노출
- Sev3: 제한적 기능 영향, 중위험 취약점

## 3) 격리 (Containment)

- CI 경로:
  - 취약 의존성/시크릿 노출 PR 즉시 머지 차단
- 런타임 경로:
  - CORS 허용 오리진 축소
  - 레이트리밋 상향 조정
  - 문제 라우트 임시 비활성화(필요 시)

## 4) 제거/복구 (Eradication / Recovery)

- 취약 버전 패치 및 재배포
- 키/토큰 노출 시 즉시 교체 및 폐기
- 복구 확인:
  - `npm audit` high/critical 0
  - `pytest`, `vitest` 회귀 통과
  - ZAP baseline 재실행

## 5) 사후 분석 (Postmortem)

- 48시간 내 RCA 작성:
  - 원인, 영향, 탐지 지연 원인
  - 재발방지 액션(코드/정책/모니터링)
- 문서 업데이트:
  - ASVS 체크리스트, 보안 정책, CI 게이트

## 6) 운영 체크리스트

- [ ] Incident 티켓 생성
- [ ] 책임자/리뷰어 지정
- [ ] 임시 완화 조치 완료
- [ ] 영구 수정 배포 완료
- [ ] 사후 분석 배포 및 합의
