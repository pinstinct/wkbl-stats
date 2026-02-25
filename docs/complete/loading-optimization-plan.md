# 로딩 속도 개선 계획

## 문제

현재 홈페이지 접속 시 **38MB wkbl.db** 전체를 다운로드해야 하므로 첫 로딩이 3~5초(느린 네트워크에서는 10초+) 소요됨.

## DB 크기 분석

| 테이블                 | 크기        | 비율   | 사용 페이지     |
| ---------------------- | ----------- | ------ | --------------- |
| play_by_play + 인덱스  | ~26 MB      | 68%    | 게임 상세만     |
| shot_charts + 인덱스   | ~6.4 MB     | 17%    | 게임 상세만     |
| lineup_stints + 인덱스 | ~2.1 MB     | 6%     | 게임 상세만     |
| **나머지 (core)**      | **~3.5 MB** | **9%** | **모든 페이지** |

**핵심 발견**: PBP/샷차트/라인업 데이터는 **게임 상세 페이지(`#/games/{id}`)에서만 사용**되고, 홈/선수/팀/리더 등 대부분의 페이지는 core 데이터(3.5MB)만 필요함.

---

## 방안 1: DB 분할 (Core + Detail)

**효과: 38MB → 2.6MB (gzip 시 0.6MB), 약 15배 개선**

### 구현

1. **빌드 시 DB 분할** (`tools/split_db.py` 신규)
   - `data/wkbl.db` → `data/wkbl-core.db` (2.6MB) + `data/wkbl-detail.db` (35MB)
   - core: seasons, teams, players, games, player_games, team_games, team_standings, game_predictions, game_team_predictions, team_category_stats, head_to_head, game_mvp, event_types, \_meta_descriptions
   - detail: play_by_play, shot_charts, lineup_stints

2. **db.js 수정** — 2단계 로딩
   - `initDatabase()`: core DB만 로드 (첫 로딩 ~0.6MB gzipped)
   - `initDetailDatabase()`: 게임 상세 페이지 진입 시 detail DB 로드
   - detail DB는 별도 sql.js 인스턴스로 관리

3. **app.js 수정** — 게임 상세 페이지에서만 detail DB 초기화
   - `getPlayByPlay()`, `getShotChart()` 호출 시 detail DB 사용
   - 라인업 관련 쿼리도 detail DB로 라우팅

4. **ingest 파이프라인 수정** — 인제스트 완료 후 자동 분할
   - GitHub Actions에서 분할 스크립트 실행

### 수정 파일

- `tools/split_db.py` (신규)
- `src/db.js` — initDatabase 분리, detail DB 로딩 추가
- `src/app.js` — 게임 상세에서 detail DB init 호출
- `.github/workflows/update-data.yml` — 분할 스크립트 추가

---

## 방안 2: IndexedDB 캐싱

**효과: 두 번째 방문부터 네트워크 요청 제거**

### 구현

1. **db.js에 IndexedDB 캐싱 레이어 추가**
   - DB 파일 다운로드 후 IndexedDB에 저장 (ETag/Last-Modified 기반)
   - 재방문 시 IndexedDB에서 로드, 백그라운드로 신선도 체크
   - 업데이트 있으면 백그라운드에서 갱신 후 알림

### 수정 파일

- `src/db.js` — IndexedDB read/write 로직 추가

---

## 방안 3: 스켈레톤 UI

**효과: 사용자가 로딩 중임을 인지, 체감 대기시간 감소**

### 구현

1. **index.html에 인라인 스켈레톤 CSS/HTML 추가**
   - DB 로딩 전에 즉시 렌더되는 레이아웃 뼈대
   - 네비게이션, 카드 플레이스홀더, 펄스 애니메이션

2. **app.js에서 로딩 완료 시 스켈레톤 → 실제 콘텐츠 전환**

### 수정 파일

- `index.html` — 스켈레톤 HTML/CSS
- `src/app.js` — 전환 로직
- `src/styles/` — 스켈레톤 스타일

---

## 방안 4: 홈페이지 전용 경량 JSON

**효과: 홈 페이지를 DB 로딩 없이 즉시 표시**

### 구현

1. **인제스트 시 홈페이지 데이터 JSON 생성** (`data/home-summary.json`, ~5KB)
   - 다음 경기 정보, 양팀 예상 라인업, 승률 예측, 순위
   - 이미 계산된 결과를 정적 JSON으로 저장

2. **app.js에서 홈 페이지 진입 시 JSON 먼저 로드**
   - JSON으로 즉시 렌더 → 백그라운드에서 DB 로딩

### 수정 파일

- `tools/ingest_wkbl.py` — JSON 생성 로직 추가
- `src/app.js` — 홈 페이지 JSON 우선 로딩

---

## 방안 비교

|                 | 방안 1: DB 분할    | 방안 4: 홈 JSON         |
| --------------- | ------------------ | ----------------------- |
| **효과 범위**   | 모든 페이지        | 홈 페이지만             |
| **초기 로딩**   | 2.6MB (gzip 0.6MB) | ~5KB (홈만) + 이후 38MB |
| **구현 복잡도** | 중 (DB 2개 관리)   | 중 (JSON 스키마 동기화) |
| **추천**        | 근본적 해결        | 보조적                  |

---

## 추천 실행 순서

| 순서 | 방안                         | 예상 효과            | 난이도 |
| ---- | ---------------------------- | -------------------- | ------ |
| 1    | **DB 분할** 또는 **홈 JSON** | 초기 로딩 대폭 개선  | 중     |
| 2    | **IndexedDB 캐싱**           | 재방문 시 네트워크 0 | 중     |
| 3    | **스켈레톤 UI**              | 체감 대기시간 감소   | 하     |

---

## 검증 방법

1. 분할 후 DB 크기 확인: `ls -lh data/wkbl-core.db data/wkbl-detail.db`
2. 모든 페이지 정상 동작 확인 (홈, 선수, 팀, 게임 상세, 리더, 비교 등)
3. 게임 상세 페이지에서 PBP/샷차트/라인업 정상 로드 확인
4. 기존 테스트 통과: `uv run pytest tests/ -v`
5. 브라우저 DevTools Network 탭에서 로딩 크기/시간 측정
