/**
 * Parse "W-L" style records and gracefully fallback on malformed values.
 */
export function parseWinLossRecord(record) {
  const [winsRaw, lossesRaw] = String(record || "0-0").split("-");
  return {
    wins: Number.parseInt(winsRaw, 10) || 0,
    losses: Number.parseInt(lossesRaw, 10) || 0,
  };
}

/**
 * Build chart-ready standings series from API standings rows.
 * Returns both sorted rows and precomputed home/away win-loss arrays.
 */
export function buildStandingsChartSeries(standings) {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);

  return {
    sorted,
    labels: sorted.map((team) => team.short_name || team.team_name),
    homeWins: sorted.map((team) => parseWinLossRecord(team.home_record).wins),
    homeLosses: sorted.map(
      (team) => parseWinLossRecord(team.home_record).losses,
    ),
    awayWins: sorted.map((team) => parseWinLossRecord(team.away_record).wins),
    awayLosses: sorted.map(
      (team) => parseWinLossRecord(team.away_record).losses,
    ),
  };
}
