# Prediction Accuracy TDD Plan

Updated: 2026-02-26

## Goal

Improve home/schedule win-loss prediction quality while keeping split engines:

- Home: runtime prediction in `src/app.js`
- Schedule: DB-backed prediction in `src/db.js`

Primary optimization metrics:

- Hit Rate (winner classification)
- Brier Score (probability quality)

## Baseline (current project DB snapshot)

- Completed games with cached team prediction: 79
- Surface hit rate: 68.4%
- Surface Brier: 0.2126
- Data leakage risk: most predictions were generated after game date

This plan enforces pregame-only evaluation for correctness badges.

## Public Interface Changes

### Backend DB (`tools/database.py`)

- Add table: `game_team_prediction_runs`
  - append-only run history per game
  - stores `prediction_kind` (`pregame` / `backfill`), `model_version`, `generated_at`
- Extend `game_team_predictions`
  - `model_version TEXT`
  - `pregame_generated_at TEXT`
- Extend `save_game_predictions()`
  - `prediction_kind`
  - `model_version`
  - `promote_latest`
  - `generated_at` (for deterministic tests/backfills)

### Frontend contract (`src/db.js`)

- `getGamePredictions(gameId, options)` supports:
  - `pregameOnly` boolean
  - `asOfDate` string (`YYYY-MM-DD`)
- If `pregameOnly=true`, resolve from run table (latest pregame run, optional as-of filter)

### Shared parameters

- Add `data/prediction_params.json`
- Home runtime and ingest-side probability model read aligned weights/version

## TDD Workflow

1. RED: add failing tests for
   - Opponent context robustness without `min` field
   - Future-game force refresh bypassing stale-skip behavior
   - New DB schema/table/column contract
   - Pregame-only selection behavior
   - Win probability blend + calibration helpers
   - Front no-pregame badge behavior
2. GREEN: minimal implementation to satisfy tests
3. REFACTOR: reduce duplication and move tunables to params file

## Validation Strategy

- Unit tests: ingest helpers, DB query contract, probability math
- Front unit/integration: schedule badge behavior with/without pregame run
- Backtest script:
  - hit rate
  - Brier
  - log loss
  - ECE
  - bin-wise calibration

## Rollout

1. Ship schema + backward-compatible reads
2. Enable run-history writes for future ingest
3. Switch schedule correctness badge to pregame-only
4. Run backtest and compare against baseline

## Risks

- Legacy DB files may miss new table/columns
  - mitigated with migration + fallback reads
- Small sample size for calibration bins
  - mitigated with identity fallback
- Split-engine drift
  - mitigated by shared parameter file and parity tests

## Implementation Update (2026-02-26)

### Completed

- Added prediction run history table and migration path:
  - `game_team_prediction_runs`
  - `game_team_predictions.model_version`
  - `game_team_predictions.pregame_generated_at`
- Extended prediction save/query contracts for run-kind aware reads and pregame gating.
- Added shared model params file:
  - `data/prediction_params.json`
- Implemented v2 blend path (rules + Elo) and calibration fallback handling.
- Applied schedule/home pregame-only display rule:
  - no pregame run -> show `사전예측없음` and hide hit/miss badge.
- Added pregame rebuild lock and corrected success counting logic:
  - success counted only when a new pregame run is created.
- Hardened security headers/CSP for sql.js wasm runtime:
  - default allows `'wasm-unsafe-eval'`
  - `'unsafe-eval'` is opt-in via `SECURITY_ALLOW_UNSAFE_EVAL=1`.
- Preserved exhibition handling in DB upsert and forced known all-star game exclusion.
- Removed obsolete helper signature usage (`_save_future_games`) and aligned call sites.

### Added/Updated Tests (TDD)

- Backend:
  - `tests/test_database.py`
  - `tests/test_ingest_helpers.py`
  - `tests/test_ingest_predictions.py`
  - `tests/test_ingest_orchestration.py`
  - `tests/test_predict.py`
  - `tests/test_predict_backtest.py`
  - `tests/test_server.py`
- Frontend:
  - `src/views/predict-logic.test.js`
  - `src/db.integration.test.js`
  - `src/app.behavior.integration.test.js`

### Verification Snapshot

- Backend full suite: `uv run pytest -q` -> `600 passed`, coverage `95.27%`
- Frontend full suite: `npm run test:front` -> `128 passed`
- No blocking P0/P1 defects found in latest review pass.

### Deployment Notes

- Ready to deploy from code quality/test perspective.
- Keep runtime artifacts out of commit/package:
  - `data/*.db`
  - generated files under `reports/prediction/`
