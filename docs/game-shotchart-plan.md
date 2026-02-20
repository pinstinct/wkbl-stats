# Game Shotchart Dashboard Plan

> 작성일: 2026-02-20

## 목표

`#/games/{id}` 페이지에 정적 이미지가 아닌 인터랙티브 슛차트 대시보드를 추가해,
선수/성공-실패/쿼터 필터에 반응하는 분석 화면을 제공한다.

## 범위

### MVP (이번 구현)

- 게임 상세 페이지 내 슛차트 섹션 추가
- 필터 3종 지원
  - 선수 선택 (`all`, 개별 선수)
  - 결과 토글 (`all`, `made`, `miss`)
  - 쿼터 선택 (`all`, `1~4`)
- 시각화 3종
  - 메인 슛 분포(Scatter)
  - 존별 시도/FG%(Bar + Line)
  - 쿼터별 성공/실패 분포(Stacked Bar)
- 요약 카드 4개
  - 시도, 성공, 실패, FG%

### 확장 (다음 단계)

- Overtime(OT) 쿼터 라벨 처리 ✅ 완료
- 팀 필터(홈/원정) 추가 ✅ 완료
- 슛 차트 좌표를 코트 오버레이 배경으로 개선 ✅ 완료 (CSS court overlay)
- 이미지 Export(PNG) 기능

## 구현 설계

1. 데이터 계층

- `src/data/client.js`
- `getGameShotChart(gameId, playerId?)` 추가

2. 순수 로직

- `src/views/game-shot-logic.js`
- 함수:
  - `normalizeGameShots`
  - `filterGameShots`
  - `summarizeGameShots`
  - `buildZoneSeries`
  - `buildQuarterSeries`

3. UI 구조

- `index.html` (`#view-game`)
- 슛차트 섹션, 필터 폼, 요약 카드, 캔버스 3개 추가

4. 렌더링 오케스트레이션

- `src/app.js`
- `loadGamePage()`에서 박스스코어 + 샷데이터 동시 로드
- Chart.js 인스턴스 생성/갱신/해제 관리
- 필터 변경 시 전체 차트/카드 동기 갱신

5. 스타일

- `src/styles/pages/game-detail.css`
- 슛차트 레이아웃/필터/카드/반응형 스타일 추가

## TDD 계획

1. Red

- `src/views/game-shot-logic.test.js` 생성
- `src/data/client.test.js`에 `getGameShotChart` 테스트 추가

2. Green

- 로직/클라이언트 구현으로 테스트 통과

3. Refactor

- app/HTML/CSS 통합 후 전체 프론트 테스트 재실행

## 완료 기준

- `#/games/{id}`에서 필터 변경 시 슛차트/요약이 즉시 반영된다.
- 필터 결과 0건일 때 안내 메시지가 노출된다.
- `npm run test:front` 전체 통과.

## 2026-02-20 추가 구현 결과

- 팀 필터(`전체/원정/홈`) 추가
- 쿼터 드롭다운 동적 생성 + OT 라벨(`OT1`, `OT2`...) 지원
- 쿼터 차트 라벨도 OT를 반영하도록 업데이트
- 메인 슛 분포 차트에 코트 배경 오버레이 적용
