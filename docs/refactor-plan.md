# Refactor Plan (All-Inclusive)

목표: 기능 유지 + 데이터 정확도 개선 + 구조 개선을 **모두 포함**한 리팩토링 태스크 정의.

---

## 범위 요약

- **Frontend**: 라우팅/상태/렌더링 분리, 반응형 규칙 정리
- **Data Access**: DB 호출 경로 통합, 시즌/필터 로직 표준화
- **Ingest/DB**: 시즌 로스터 정확도 개선(시즌별 로스터 테이블)
- **Tests**: ingest/DB 중심 테스트 강화 (의미없는 UI 정적 테스트는 제외)

---

## 진행 원칙

- 기능 변경은 **작은 단위 커밋**으로 분리
- 사용자-facing UI 변화는 **최소화**
- 시즌/로스터 관련 로직은 **정확도 우선**
- 테스트는 **로직 검증 위주**

---

## 태스크 백로그 (우선순위 포함)

### P0 (즉시 효과/리스크 낮음)

1. **Data Access 레이어 도입**
   - `src/data/players.js`, `src/data/games.js` 등 모듈 생성
   - `WKBLDatabase` 직접 호출 제거 → `data/*`에서만 사용
   - API fallback도 동일 인터페이스로 통합

2. **필터/시즌 로직 표준화**
   - `getPlayers`에 `season`, `team`, `includeNoGames`, `rosterMode` 명확화
   - 현재 시즌 vs 과거 시즌 처리 규칙 문서화

3. **유틸리티 분리**
   - `src/utils/format.js` (숫자/퍼센트/사인/날짜)
   - `src/utils/dom.js` (간단한 엘리먼트 헬퍼)


### P1 (구조 개선/중간 리스크)

4. **뷰 단위 렌더링 분리**
   - `src/views/players.js`
   - `src/views/player-detail.js`
   - `src/views/games.js`
   - 라우팅은 `app.js`에서만 관리

5. **상태 관리 정리**
   - `state`를 페이지별로 구분 (`state.players`, `state.games`, ...)
   - 라우팅 이동 시 필요한 상태만 초기화


### P2 (정확도 개선/DB 변경)

6. **시즌별 로스터 테이블 도입**
   - DB 스키마: `team_rosters (season_id, team_id, player_id, created_at)`
   - ingest 과정에서 **시즌 로스터 수집/저장**
   - 과거 시즌 0경기 선수 표시를 정확하게 지원

7. **로스터 수집 로직 추가**
   - WKBL player list 페이지에서 시즌별 로스터 파싱
   - 시즌 코드/팀 기준으로 로스터 저장


### P3 (CSS 정리/UX 정합성)

8. **CSS 스코프 정리**
   - 공통/페이지별 분리 (`base`, `layout`, `players`, `games`)
   - 모바일 규칙은 페이지 스코프(`#view-players` 등)로 제한

9. **모바일 레이아웃 재점검**
   - players / player-detail / games / schedule 우선
   - 세로 스택 + 표 가로 스크롤 일관화


### P4 (테스트/검증)

10. **DB/ingest 테스트 보강**
   - 시즌 로스터 저장/조회 테스트
   - 시즌/팀 필터 검증 테스트

11. **회귀 테스트 체크리스트 문서화**
   - 주요 페이지 UI 체크리스트 작성
   - 릴리즈 전 수동 점검 가이드

---

## 구현 순서 (권장)

1. P0-1 (Data Access/필터 표준화)
2. P0-2 (유틸 분리)
3. P1 (뷰/상태 분리)
4. P2 (시즌 로스터 정확도 개선)
5. P3 (CSS 정리)
6. P4 (테스트/검증 강화)

---

## 산출물 목록

- `src/data/*`
- `src/utils/*`
- `src/views/*`
- DB 스키마 업데이트 + migration
- `tools/ingest_wkbl.py` 확장
- `tests/test_roster.py` (예상)
- 이 문서 업데이트 유지
