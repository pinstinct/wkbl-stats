# Player Shotchart Plan

> 작성일: 2026-02-20

## 목표

`#/players/{id}` 페이지에 선수별 인터랙티브 슛차트를 추가해 개인 슈팅 분포와 효율을 필터 기반으로 분석한다.

## 범위

- 선수 상세 페이지 내 슛차트 섹션 추가
- 필터
  - 시즌(`전체`, 시즌별)
  - 결과(`성공+실패`, `성공만`, `실패만`)
  - 쿼터(`전체`, `1Q~OT`)
  - 존(`PAINT`, `MID`, `3PT`)
- 시각화
  - 코트 오버레이 산점도(성공/실패)
  - 존별 시도/FG%(Bar+Line)
  - 쿼터별 성공/실패(Stacked Bar)
- 요약 카드
  - 시도, 성공, 실패, FG%

## 구현 설계

1. 데이터 계층

- `src/db.js`
  - `getPlayerShotChart(playerId, seasonId?)` 추가
- `src/data/client.js`
  - `getPlayerShotChart(playerId, seasonId?)` 추가

2. 순수 로직

- `src/views/player-shot-logic.js`
  - `normalizePlayerShots`
  - `filterPlayerShots`
  - `buildPlayerShotZoneOptions`

3. UI/렌더링

- `index.html`
  - player detail에 `playerShotSection` 추가
- `src/app.js`
  - `renderPlayerShotSection` 구현
  - 기존 코트 오버레이 플러그인 재사용

4. 스타일

- `src/styles/pages/player-detail.css`
  - player shot 필터/레이아웃/모바일 규칙 추가

## TDD

1. `src/views/player-shot-logic.test.js` 작성
2. `src/data/client.test.js`에 player shot client 테스트 추가
3. 구현 후 `npm run test:front` 통과

## 완료 기준

- `#/players/{id}`에서 선수 슛차트가 노출되고 필터에 반응한다.
- 시즌 변경 시 데이터가 재조회되어 차트/요약이 갱신된다.
- `npm run test:front` 전체 통과.
