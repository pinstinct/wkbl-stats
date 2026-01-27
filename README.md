# WKBL Player Stats (Scaffold)

WKBL Data Lab 데이터를 NBA Stats 스타일로 보여주는 초기 스캐폴드입니다.
현재는 2025-26 시즌 데이터를 시즌 시작일부터 오늘까지 자동 수집해 표시하도록 구성되어 있습니다.

## 실행 방법

데이터를 최신화한 뒤 로컬 서버로 실행하세요.

```bash
python3 server.py
```

브라우저에서 `http://localhost:8000` 접속.

## 현재 구현된 흐름

- 서버 시작 시 ingest 실행 → 2025-26 시즌 데이터를 오늘 날짜까지 수집
- WKBL 현역 선수 리스트와 매핑해 포지션/신장 정보를 보강
- 같은 날짜 재실행 시 ingest 스킵(하루 1회 캐싱)
- 프런트는 `data/wkbl-active.json`을 우선 로드, 없으면 샘플 데이터로 폴백

## 데이터 수집 (ingest)

직접 실행할 때:

```bash
python3 tools/ingest_wkbl.py \
  --season-label 2025-26 \
  --auto \
  --end-date 20260127 \
  --active-only \
  --output data/wkbl-active.json
```

- `--auto`: Data Lab 홈에서 시즌 시작일/게임 ID를 자동으로 찾음
- `--end-date`: 오늘(YYYYMMDD)까지 집계
- `--active-only`: 현역 선수만 필터링

캐싱:

- `data/cache/ingest_status.json`에 마지막 실행 날짜 저장
- 같은 날짜에 `server.py` 재실행 시 ingest 생략

스크립트는 `game/list/month`에서 gameID 목록을 수집한 뒤, 각 경기의 `record_player.asp`를 파싱해 시즌 평균 스탯으로 집계합니다.
또한 `wkbl.or.kr/player/player_list.asp`에서 현역 선수 명단을 가져와 프로필(포지션/신장)과 연결하고, 현역 선수만 필터링합니다.

## 프런트 데이터 연결

`src/app.js`의 `loadData()`에서 fetch 경로를 바꾸면 됩니다.

```js
const res = await fetch("./data/wkbl-active.json");
```

### players 스키마

```json
{
  "id": "wkbl-001",
  "name": "선수명",
  "team": "팀명",
  "pos": "G/F/C",
  "height": "170cm",
  "season": "2024-25",
  "gp": 30,
  "min": 31.2,
  "pts": 15.8,
  "reb": 4.1,
  "ast": 6.3,
  "stl": 1.9,
  "blk": 0.2,
  "fgp": 0.438,
  "tpp": 0.351,
  "ftp": 0.822
}
```

## 폴더 구조

```
.
├─ index.html
├─ server.py
├─ src/
│  ├─ app.js
│  └─ styles.css
├─ data/
│  └─ sample.json
├─ docs/
│  └─ data-sources.md
└─ tools/
   └─ ingest_wkbl.py
```
