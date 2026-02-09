# Regression Checklist

## Scope

- Target date: 2026-02-09
- Focus: mobile/table responsiveness and fixed-column table overflow regressions

## UI Checklist

- `players` list
  - Mobile: `data-key="name"` fixed column is visible while stats columns are horizontally scrollable.
  - No clipped cells when table is wider than viewport.
- `players/:id` detail
  - Initial page load starts at top (`scrollTop=0` behavior).
  - Mobile table column spacing remains dense without text overlap.
- `teams` standings
  - Mobile: rank/team columns remain fixed while right-side metrics scroll horizontally.
  - Rank/team column widths are compact and readable.
  - Standings text is centered.
- `teams/:id` detail
  - `#teamRosterTable` and `#teamGamesTable` widths are aligned at 1289px.
  - Mobile: reduced column gap rules are applied in `.detail-section`.
- `games/:id` detail
  - Mobile: player name column remains fixed while other stats are horizontally scrollable.
  - `미출장` badge rendering stays inside the player column and does not overflow.
- `schedule`
  - At 1289px, `schedule-section` cards do not overflow container bounds.
  - Upcoming/recent sections show team names (wrapping to two lines is acceptable).
  - Recent results include both score and team names.
- Navigation
  - Large screens: `nav.nav-links` is inline.
  - Smaller screens: hamburger menu appears next to `.brand` and toggles reliably.

## Data Checklist

- Past season team filter should not include future-only active rookies.
- `/teams/{id}` recent games should include completed games only (score present).

## Automated Checks

- `uv run pytest -q`
- `npm run test:front`
- `uv run pre-commit run --all-files`
