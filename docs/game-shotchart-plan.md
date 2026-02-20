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
- 슛 차트 좌표를 코트 오버레이 배경으로 개선 ✅ 완료 (Chart.js court overlay plugin)
- 이미지 Export(PNG) 기능 ✅ 완료

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
- 메인 슛 분포 차트에 코트 라인 오버레이 플러그인 적용
- 현재 필터 상태를 반영한 슛차트 PNG 저장 버튼 추가
- `Q1/Q2/OT1` 문자열 쿼터 파싱 로직 추가 (필터 무반응 이슈 수정)
- WKBL 실좌표계(`x: 0~291`, `y: 18~176`) 기준으로 슛차트 축/코트 오버레이 정합성 수정
- `Shotcharts / Shotzones` 탭 분리 UI 추가
- Shotzones 탭에 `Zone/FGM/FGA/FG%` 표 렌더 추가
- 필터 순서 조정: 팀 → 선수 → 결과 → 쿼터
- 팀 선택 시 선수 목록을 해당 팀 선수로 재구성 (팀-선수 불일치 이슈 수정)
- 슛차트 표시 영역 확장(`x: -8~299`, `y: 10~186`)으로 코트/포인트 clipping 완화
- 코트 컨테이너를 고정 비율(`307:176`)로 전환해 반응형 왜곡 완화
- 코트 오버레이 원/호를 `ellipse` 기반으로 렌더링해 3점 라인 뭉개짐 완화
- 3점 직선/곡선 연결 기하를 단일 정의로 통일해 이음새 불일치 수정
- 박스스코어 선수-팀 매핑으로 shot 팀 ID를 보정(reconcile)해 팀/선수 필터 불일치 완화
- 3점 반경을 zone 기준(120)으로 재고정하고 조인 높이를 자동 계산해 아크 위치 교정
