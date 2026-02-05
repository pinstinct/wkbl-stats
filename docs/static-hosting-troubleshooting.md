# GitHub Pages 정적 호스팅 트러블슈팅

이 문서는 GitHub Pages에서 sql.js를 사용한 정적 호스팅 구현 과정에서 발생한 문제와 해결 방법을 기록합니다.

## 개요

WKBL Stats는 GitHub Pages에서 서버 없이 동작하기 위해 sql.js(WebAssembly SQLite)를 사용합니다. 브라우저에서 직접 SQLite 데이터베이스를 로드하고 쿼리를 실행합니다.

## 아키텍처

```
브라우저
    ↓
sql.js (WASM) 로드 ← CDN (jsdelivr)
    ↓
wkbl.db fetch ← GitHub Pages
    ↓
클라이언트 사이드 SQL 쿼리 실행
    ↓
UI 렌더링
```

## 사용 기술

| 기술 | 버전 | 용도 |
|------|------|------|
| sql.js | 1.10.3 | 브라우저에서 SQLite 실행 (WebAssembly) |
| Chart.js | 4.4.1 | 시즌별 추이 차트 |
| jsdelivr CDN | - | sql.js 및 WASM 파일 호스팅 |

## 발생한 문제

### 문제 1: 메인 페이지에서 선수 데이터가 표시되지 않음

**증상:**
- GitHub Pages 배포 후 메인 페이지가 빈 화면으로 표시
- 테이블에 데이터가 로드되지 않음
- 콘솔에 명확한 에러 없음

**원인 분석:**

1. **sql.js CDN 불안정**
   - 기존: `https://sql.js.org/dist/sql-wasm.js`
   - sql.js.org 공식 CDN은 가끔 응답이 느리거나 불안정

2. **is_active 필드 데이터 오류** (주요 원인)
   - DB의 `players.is_active` 필드가 잘못 설정됨
   - 2025-26 시즌에 실제 경기한 선수들이 `is_active=0`으로 설정
   - `is_active=1`인 선수 17명 중 2025-26 시즌 경기 기록이 있는 선수: **0명**

**데이터 상태 (수정 전):**
```sql
-- is_active 분포
SELECT is_active, COUNT(*) FROM players GROUP BY is_active;
-- 0|159
-- 1|17

-- 2025-26 시즌 경기한 활성 선수
SELECT COUNT(DISTINCT pg.player_id)
FROM player_games pg
JOIN games g ON pg.game_id = g.id
JOIN players p ON pg.player_id = p.id
WHERE g.season_id = '046' AND p.is_active = 1;
-- 결과: 0 (문제!)
```

**코드 흐름 분석:**

```javascript
// db.js - getPlayers 함수
function getPlayers(seasonId, teamId = null, activeOnly = true) {
  // activeOnly가 true이면 is_active = 1인 선수만 조회
  if (activeOnly) {
    sql += " AND p.is_active = 1";
  }
}

// app.js - fetchPlayers 함수
async function fetchPlayers(season) {
  const activeOnly = season !== "all";  // 기본 시즌이면 true
  return WKBLDatabase.getPlayers(seasonId, null, activeOnly);
  // → is_active=1 AND season='046' 조건으로 조회
  // → 결과: 0명 (빈 배열)
}
```

## 해결 방법

### 1. sql.js CDN 변경

**변경 전 (index.html):**
```html
<script src="https://sql.js.org/dist/sql-wasm.js"></script>
```

**변경 후:**
```html
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js"></script>
```

**변경 전 (src/db.js):**
```javascript
const SQL = await initSqlJs({
  locateFile: (file) => `https://sql.js.org/dist/${file}`,
});
```

**변경 후:**
```javascript
const SQL = await initSqlJs({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
});
```

**변경 이유:**
- jsdelivr는 npm 패키지를 안정적으로 서빙하는 CDN
- 버전을 명시하여 예기치 않은 breaking change 방지
- 글로벌 CDN으로 응답 속도 향상

### 2. is_active 필드 수정

**수정 SQL:**
```sql
-- 모든 선수를 비활성으로 초기화
UPDATE players SET is_active = 0;

-- 2025-26 시즌에 경기한 선수들을 활성으로 설정
UPDATE players SET is_active = 1
WHERE id IN (
  SELECT DISTINCT pg.player_id
  FROM player_games pg
  JOIN games g ON pg.game_id = g.id
  WHERE g.season_id = '046'
);
```

**수정 후 데이터 상태:**
```sql
SELECT is_active, COUNT(*) FROM players GROUP BY is_active;
-- 0|93
-- 1|83

-- 2025-26 시즌 경기한 활성 선수: 83명
```

## 디버깅 과정

### 1. 리소스 접근성 확인

```bash
# 모든 리소스가 200 OK인지 확인
curl -s -o /dev/null -w "%{http_code}" https://blog.limhm.dev/wkbl-stats/
curl -s -o /dev/null -w "%{http_code}" https://blog.limhm.dev/wkbl-stats/data/wkbl.db
curl -s -o /dev/null -w "%{http_code}" https://blog.limhm.dev/wkbl-stats/data/wkbl-active.json
```

### 2. 데이터 무결성 확인

```bash
# JSON 파일 검증
curl -s http://localhost:8080/data/wkbl-active.json | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Players: {len(d[\"players\"])}')"

# SQLite 데이터 검증
sqlite3 data/wkbl.db "SELECT COUNT(*) FROM players WHERE is_active = 1;"
```

### 3. 디버그 로그 추가 (임시)

```javascript
// app.js에 임시 로그 추가
async function init() {
  console.log("[app.js] init() started");
  const dbResult = await initLocalDb();
  console.log("[app.js] initLocalDb result:", dbResult);
  // ...
}
```

## Fallback 전략

앱은 세 가지 데이터 소스를 순차적으로 시도합니다:

```
1. Local DB (sql.js)  → 실패 시
2. Server API         → 실패 시
3. JSON 파일 fallback
```

```javascript
async function fetchPlayers(season) {
  // 1. Local DB (GitHub Pages)
  if (state.useLocalDb || !state.useApi) {
    // sql.js로 쿼리 실행
  }

  // 2. Server API (Render)
  if (state.useApi) {
    // /api/players 호출
  }

  // 3. JSON fallback
  const res = await fetch(CONFIG.dataPath);
  return (await res.json()).players;
}
```

## 주의사항

### 데이터 업데이트 시

1. **ingest 스크립트 실행 후 is_active 확인**
   ```bash
   sqlite3 data/wkbl.db "
     SELECT COUNT(*) FROM players p
     WHERE p.is_active = 1
     AND EXISTS (
       SELECT 1 FROM player_games pg
       JOIN games g ON pg.game_id = g.id
       WHERE pg.player_id = p.id AND g.season_id = '046'
     );"
   ```

2. **CDN 버전 고정**
   - sql.js 버전을 명시적으로 지정 (`@1.10.3`)
   - 메이저 버전 업그레이드 시 테스트 필요

### CORS 관련

- GitHub Pages는 동일 도메인이므로 CORS 문제 없음
- CDN(jsdelivr)은 CORS 헤더를 포함하여 응답

## 관련 파일

| 파일 | 역할 |
|------|------|
| `index.html` | sql.js CDN 로드 |
| `src/db.js` | sql.js 초기화 및 쿼리 함수 |
| `src/app.js` | 데이터 fetching 및 fallback 로직 |
| `data/wkbl.db` | SQLite 데이터베이스 |
| `data/wkbl-active.json` | JSON fallback 데이터 |

## 참고 링크

- [sql.js GitHub](https://github.com/sql-js/sql.js)
- [sql.js 문서](https://sql.js.org/)
- [jsdelivr](https://www.jsdelivr.com/)
- [GitHub Pages 문서](https://docs.github.com/en/pages)
