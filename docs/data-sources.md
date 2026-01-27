# WKBL Data Lab endpoints (findings)

This note captures endpoints discovered by direct HTTP inspection of `https://datalab.wkbl.or.kr/`.
Use these as the basis for a data pipeline that aggregates per-game stats into season totals.

## 1) Player record (per-game stats)

The player record page loads an iframe that points to the per-game stat table.

Example (player record wrapper page):

```
https://datalab.wkbl.or.kr/playerRecord?menu=playerRecord&selectedId=04601055
```

The wrapper includes an iframe src similar to:

```
https://datalab.wkbl.or.kr:9001/data_lab/record_player.asp?season_gu=046&game_type=01&game_no=055
```

This ASP page renders the per-game boxscore table (player rows + columns like MIN, 2PM-A, 3PM-A, REB, AST, ST, TO, BS, PTS, etc.).

## 2) Game list (for iterating games)

Game list HTML (used by the left sidebar calendar) can be requested directly:

```
https://datalab.wkbl.or.kr/game/list?startDate=20260125&prevOrNext=0&selectedId=04601055&selectedGameDate=20260126
```

It returns HTML containing multiple items like:

```
<li class="game-item" data-id="04501001" onclick="selectGame('04501001', true);">
```

You can parse all `data-id` values as game IDs.

There is also a season/month endpoint:

```
https://datalab.wkbl.or.kr/game/list/month?firstGameDate=20241027&selectedId=04601055&selectedGameDate=20260126
```

This response embeds the calendar and the full list for the season/month selection.

## 3) Player analysis (rankings JSON)

The player analysis page triggers JSON for top-5 rankings (score, reb, ast, stl, blk) via:

```
https://datalab.wkbl.or.kr/playerAnalysis/search?gameID=04601055&startSeasonCode=046&endSeasonCode=046
```

This returns JSON with arrays like `scoreRanking`, `rebRanking`, `astRanking`, etc., including player metadata and season averages.

## 4) Active player list (WKBL site)

Current active players list:

```
https://www.wkbl.or.kr/player/player_list.asp
```

Links point to player detail pages:

```
https://www.wkbl.or.kr/player/detail.asp?player_group=12&pno=095778
```

The detail page includes fields like position (포지션) and height (신장).

## Suggested data pipeline

1) Use `game/list/month` (or repeated `game/list`) to collect game IDs for a season.
2) For each game ID, load the player record wrapper (`/playerRecord`) to discover:
   - `season_gu`, `game_type`, and `game_no` (needed for the ASP page)
3) Fetch `record_player.asp` and parse player rows into structured stats.
4) Aggregate per-game stats into season totals/averages.

## Notes

- Be respectful with rate limits. Consider caching responses to disk and incremental updates.
- WKBL Data Lab may change endpoints; always validate periodically.
