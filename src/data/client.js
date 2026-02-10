/**
 * Data client facade used by views/controllers.
 * Keeps DB initialization and query defaults in one place.
 */
export function resolvePlayersQuery({ season, defaultSeason }) {
  const isCurrentSeason = season === defaultSeason;
  return {
    seasonId: season === "all" ? null : season,
    // Only the current season should be filtered by active roster.
    activeOnly: season !== "all" && isCurrentSeason,
    // Historical season tables should still show players with 0 GP.
    includeNoGames: season !== "all",
  };
}

/**
 * Create frontend data gateway with one behavior contract:
 * - list endpoints return empty collections when DB is unavailable
 * - detail endpoints throw not-found style errors for UI handling
 */
export function createDataClient({ initDb, getDb, getSeasonLabel }) {
  // Ensure every call shares the same lazy-init behavior.
  async function withDb() {
    await initDb();
    return getDb();
  }

  return {
    async getPlayers({ season, defaultSeason }) {
      const db = await withDb();
      if (!db) return [];
      const query = resolvePlayersQuery({ season, defaultSeason });
      return db.getPlayers(
        query.seasonId,
        null,
        query.activeOnly,
        query.includeNoGames,
      );
    },

    async getPlayerDetail(playerId) {
      const db = await withDb();
      if (!db) throw new Error("Player not found");
      const player = db.getPlayerDetail(playerId);
      if (!player) throw new Error("Player not found");
      return player;
    },

    async getPlayerGamelog(playerId) {
      const db = await withDb();
      if (!db) return [];
      return db.getPlayerGamelog(playerId);
    },

    async getTeams() {
      const db = await withDb();
      if (!db) return { teams: [] };
      return { teams: db.getTeams() };
    },

    async getStandings(season) {
      const db = await withDb();
      if (!db) return { standings: [] };
      return {
        season,
        season_label: getSeasonLabel(season),
        standings: db.getStandings(season),
      };
    },

    async getTeamDetail(teamId, season) {
      const db = await withDb();
      if (!db) throw new Error("Team not found");
      const team = db.getTeamDetail(teamId, season);
      if (!team) throw new Error("Team not found");
      return { season, ...team };
    },

    async getGames(season) {
      const db = await withDb();
      if (!db) return [];
      return db.getGames(season, null, null, 50, 0, true);
    },

    async getGameBoxscore(gameId) {
      const db = await withDb();
      if (!db) throw new Error("Game not found");
      const boxscore = db.getGameBoxscore(gameId);
      if (!boxscore) throw new Error("Game not found");
      return boxscore;
    },

    async getLeaders(season, category, limit = 10) {
      const db = await withDb();
      if (!db) return [];
      return db.getLeaders(season, category, limit);
    },

    async getLeadersAll(season) {
      const db = await withDb();
      if (!db) return {};
      return db.getLeadersAll(season, 5);
    },

    async search(query, limit = 10) {
      const db = await withDb();
      if (!db) return { players: [], teams: [] };
      return db.search(query, limit);
    },

    async getPlayerComparison(playerIds, season) {
      const db = await withDb();
      if (!db) return [];
      return db.getPlayerComparison(playerIds, season);
    },
  };
}
