// Barrel module for view/render logic.
// Keep app.js imports stable even when individual view files move.
export { renderLineupPlayers, renderTotalStats } from "./home.js";
export { renderPlayersTable, renderPlayerSummaryCard } from "./players.js";
export { filterPlayers, sortPlayers } from "./players-logic.js";
export {
  renderCareerSummary,
  renderPlayerAdvancedStats,
  renderPlayerGameLogTable,
  renderPlayerSeasonTable,
} from "./player-detail.js";
export {
  renderStandingsTable,
  renderTeamRecentGames,
  renderTeamRoster,
  renderTeamStats,
  sortStandings,
} from "./teams.js";
export { buildStandingsChartSeries } from "./teams-chart-logic.js";
export { renderGamesList } from "./games.js";
export { renderBoxscoreRows, sortBoxscorePlayers } from "./game-detail.js";
export {
  buildThreePointGeometry,
  reconcileShotTeams,
  buildZoneTableRows,
  buildPlayerSelectOptions,
  getCourtArcRadii,
  getCourtAspectRatio,
  getShotChartScaleBounds,
  buildShotChartExportName,
  buildQuarterSelectOptions,
  buildQuarterSeries,
  buildZoneSeries,
  filterGameShots,
  getQuarterLabel,
  normalizeGameShots,
  summarizeGameShots,
} from "./game-shot-logic.js";
export { renderLeadersGrid } from "./leaders.js";
export {
  renderCompareCards,
  renderCompareSelected,
  renderCompareSuggestions,
} from "./compare.js";
export {
  buildPredictionCompareState,
  calculatePrediction,
} from "./predict-logic.js";
export {
  renderPredictCards,
  renderPredictFactors,
  renderPredictPlayerInfo,
  renderPredictSuggestions,
} from "./predict.js";
export {
  renderNextGameHighlight,
  renderRecentResults,
  renderUpcomingGames,
} from "./schedule.js";
