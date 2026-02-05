/**
 * WKBL Stats - Browser SQLite Database Module
 *
 * Uses sql.js (WebAssembly SQLite) to provide client-side database queries.
 * Replaces server-side API calls for GitHub Pages static hosting.
 */

const WKBLDatabase = (function () {
  "use strict";

  // =============================================================================
  // State
  // =============================================================================

  let db = null;
  let initPromise = null;

  const SEASON_CODES = {
    "046": "2025-26",
    "045": "2024-25",
    "044": "2023-24",
    "043": "2022-23",
    "042": "2021-22",
    "041": "2020-21",
  };

  // =============================================================================
  // Initialization
  // =============================================================================

  /**
   * Initialize sql.js and load the database
   * @returns {Promise<boolean>} True if initialization successful
   */
  async function initDatabase() {
    if (db) return true;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        // Initialize sql.js with WASM
        const SQL = await initSqlJs({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
        });

        // Fetch the database file
        const response = await fetch("./data/wkbl.db");
        if (!response.ok) {
          throw new Error(`Failed to fetch database: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));

        console.log("[db.js] Database loaded successfully");
        return true;
      } catch (error) {
        console.error("[db.js] Failed to initialize database:", error);
        initPromise = null;
        throw error;
      }
    })();

    return initPromise;
  }

  /**
   * Check if database is ready
   */
  function isReady() {
    return db !== null;
  }

  // =============================================================================
  // Utility Functions
  // =============================================================================

  /**
   * Execute a query and return results as array of objects
   */
  function query(sql, params = []) {
    if (!db) throw new Error("Database not initialized");

    const stmt = db.prepare(sql);
    stmt.bind(params);

    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  }

  /**
   * Execute a query and return first result
   */
  function queryOne(sql, params = []) {
    const results = query(sql, params);
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Calculate advanced stats for a player row
   */
  function calculateAdvancedStats(d) {
    const pts = d.pts * d.gp;
    const fga = d.total_fga || 0;
    const fta = d.total_fta || 0;
    const fgm = d.total_fgm || 0;
    const tpm = d.total_tpm || 0;
    const ftm = d.total_ftm || 0;

    // TS% = PTS / (2 x (FGA + 0.44 x FTA))
    const tsa = 2 * (fga + 0.44 * fta);
    d.ts_pct = tsa > 0 ? Math.round((pts / tsa) * 1000) / 1000 : 0;

    // eFG% = (FGM + 0.5 x 3PM) / FGA
    d.efg_pct = fga > 0 ? Math.round(((fgm + 0.5 * tpm) / fga) * 1000) / 1000 : 0;

    // PIR = (PTS + REB + AST + STL + BLK - TO - (FGA-FGM) - (FTA-FTM)) / GP
    const reb = d.reb * d.gp;
    const ast = d.ast * d.gp;
    const stl = d.stl * d.gp;
    const blk = d.blk * d.gp;
    const tov = d.tov * d.gp;
    const pirTotal = pts + reb + ast + stl + blk - tov - (fga - fgm) - (fta - ftm);
    d.pir = d.gp > 0 ? Math.round((pirTotal / d.gp) * 10) / 10 : 0;

    // AST/TO ratio
    d.ast_to = d.tov > 0 ? Math.round((d.ast / d.tov) * 100) / 100 : 0;

    // Per 36 minutes stats
    const minAvg = d.min > 0 ? d.min : 1;
    d.pts36 = Math.round((d.pts * 36 / minAvg) * 10) / 10;
    d.reb36 = Math.round((d.reb * 36 / minAvg) * 10) / 10;
    d.ast36 = Math.round((d.ast * 36 / minAvg) * 10) / 10;

    return d;
  }

  /**
   * Round stats to standard precision
   */
  function roundStats(d) {
    for (const key of ["min", "pts", "reb", "ast", "stl", "blk", "tov"]) {
      d[key] = d[key] ? Math.round(d[key] * 10) / 10 : 0;
    }
    return d;
  }

  // =============================================================================
  // API Replacement Functions
  // =============================================================================

  /**
   * Get all players with their season stats
   * Replaces: GET /api/players
   */
  function getPlayers(seasonId, teamId = null, activeOnly = true) {
    let sql = `
      SELECT
        p.id,
        p.name,
        p.position as pos,
        p.height,
        p.is_active,
        t.name as team,
        t.id as team_id,
        COUNT(*) as gp,
        AVG(pg.minutes) as min,
        AVG(pg.pts) as pts,
        AVG(pg.reb) as reb,
        AVG(pg.ast) as ast,
        AVG(pg.stl) as stl,
        AVG(pg.blk) as blk,
        AVG(pg.tov) as tov,
        SUM(pg.fgm) as total_fgm,
        SUM(pg.fga) as total_fga,
        SUM(pg.tpm) as total_tpm,
        SUM(pg.tpa) as total_tpa,
        SUM(pg.ftm) as total_ftm,
        SUM(pg.fta) as total_fta
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (seasonId && seasonId !== "all") {
      sql += " AND g.season_id = ?";
      params.push(seasonId);
    }

    if (activeOnly) {
      sql += " AND p.is_active = 1";
    }

    if (teamId && teamId !== "all") {
      sql += " AND pg.team_id = ?";
      params.push(teamId);
    }

    sql += " GROUP BY pg.player_id ORDER BY AVG(pg.pts) DESC";

    const rows = query(sql, params);

    return rows.map((d) => {
      // Calculate percentages
      d.fgp = d.total_fga ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000 : 0;
      d.tpp = d.total_tpa ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000 : 0;
      d.ftp = d.total_fta ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000 : 0;

      roundStats(d);
      calculateAdvancedStats(d);

      return d;
    });
  }

  /**
   * Get detailed player info with career stats
   * Replaces: GET /api/players/{id}
   */
  function getPlayerDetail(playerId) {
    // Basic player info
    const player = queryOne(
      `SELECT p.*, t.name as team
       FROM players p
       LEFT JOIN teams t ON p.team_id = t.id
       WHERE p.id = ?`,
      [playerId]
    );

    if (!player) return null;

    // Season-by-season stats
    const seasons = query(
      `SELECT
        g.season_id,
        s.label as season_label,
        t.name as team,
        COUNT(*) as gp,
        AVG(pg.minutes) as min,
        AVG(pg.pts) as pts,
        AVG(pg.reb) as reb,
        AVG(pg.ast) as ast,
        AVG(pg.stl) as stl,
        AVG(pg.blk) as blk,
        AVG(pg.tov) as tov,
        SUM(pg.fgm) as total_fgm,
        SUM(pg.fga) as total_fga,
        SUM(pg.tpm) as total_tpm,
        SUM(pg.tpa) as total_tpa,
        SUM(pg.ftm) as total_ftm,
        SUM(pg.fta) as total_fta
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN seasons s ON g.season_id = s.id
      JOIN teams t ON pg.team_id = t.id
      WHERE pg.player_id = ?
      GROUP BY g.season_id
      ORDER BY g.season_id DESC`,
      [playerId]
    );

    player.seasons = {};
    for (const d of seasons) {
      d.fgp = d.total_fga ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000 : 0;
      d.tpp = d.total_tpa ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000 : 0;
      d.ftp = d.total_fta ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000 : 0;

      roundStats(d);
      calculateAdvancedStats(d);

      player.seasons[d.season_id] = d;
    }

    // Recent game log (last 10 games)
    const games = query(
      `SELECT
        pg.*,
        g.game_date,
        g.home_team_id,
        g.away_team_id,
        g.home_score,
        g.away_score,
        ht.name as home_team_name,
        at.name as away_team_name
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE pg.player_id = ?
      ORDER BY g.game_date DESC
      LIMIT 10`,
      [playerId]
    );

    player.recent_games = games.map((d) => {
      const isHome = d.team_id === d.home_team_id;
      const opponent = isHome ? d.away_team_name : d.home_team_name;
      const teamScore = isHome ? d.home_score : d.away_score;
      const oppScore = isHome ? d.away_score : d.home_score;
      const won = teamScore && oppScore ? teamScore > oppScore : null;

      return {
        game_id: d.game_id,
        game_date: d.game_date,
        opponent: opponent,
        is_home: isHome,
        result: won === true ? "W" : won === false ? "L" : "-",
        minutes: d.minutes,
        pts: d.pts,
        reb: d.reb,
        ast: d.ast,
        stl: d.stl,
        blk: d.blk,
        tov: d.tov,
        fgm: d.fgm,
        fga: d.fga,
        tpm: d.tpm,
        tpa: d.tpa,
        ftm: d.ftm,
        fta: d.fta,
      };
    });

    return player;
  }

  /**
   * Get player's full game log
   * Replaces: GET /api/players/{id}/gamelog
   */
  function getPlayerGamelog(playerId, seasonId = null) {
    let sql = `
      SELECT
        pg.*,
        g.game_date,
        g.season_id,
        g.home_team_id,
        g.away_team_id,
        g.home_score,
        g.away_score,
        ht.name as home_team_name,
        at.name as away_team_name
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE pg.player_id = ?
    `;
    const params = [playerId];

    if (seasonId) {
      sql += " AND g.season_id = ?";
      params.push(seasonId);
    }

    sql += " ORDER BY g.game_date DESC";

    const rows = query(sql, params);

    return rows.map((d) => {
      const isHome = d.team_id === d.home_team_id;
      const opponent = isHome ? d.away_team_name : d.home_team_name;
      const teamScore = isHome ? d.home_score : d.away_score;
      const oppScore = isHome ? d.away_score : d.home_score;
      const won = teamScore && oppScore ? teamScore > oppScore : null;

      return {
        game_id: d.game_id,
        game_date: d.game_date,
        season_id: d.season_id,
        opponent: opponent,
        is_home: isHome,
        result: won === true ? "W" : won === false ? "L" : "-",
        minutes: d.minutes,
        pts: d.pts,
        reb: d.reb,
        ast: d.ast,
        stl: d.stl,
        blk: d.blk,
        tov: d.tov,
        fgm: d.fgm,
        fga: d.fga,
        tpm: d.tpm,
        tpa: d.tpa,
        ftm: d.ftm,
        fta: d.fta,
      };
    });
  }

  /**
   * Compare multiple players
   * Replaces: GET /api/players/compare
   */
  function getPlayerComparison(playerIds, seasonId) {
    if (!playerIds || playerIds.length < 2 || playerIds.length > 4) {
      return [];
    }

    const placeholders = playerIds.map(() => "?").join(",");
    const sql = `
      SELECT
        p.id, p.name, p.position, p.height,
        t.name as team,
        COUNT(*) as gp,
        AVG(pg.minutes) as min,
        AVG(pg.pts) as pts,
        AVG(pg.reb) as reb,
        AVG(pg.ast) as ast,
        AVG(pg.stl) as stl,
        AVG(pg.blk) as blk,
        AVG(pg.tov) as tov,
        SUM(pg.fgm) as total_fgm,
        SUM(pg.fga) as total_fga,
        SUM(pg.tpm) as total_tpm,
        SUM(pg.tpa) as total_tpa,
        SUM(pg.ftm) as total_ftm,
        SUM(pg.fta) as total_fta
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE pg.player_id IN (${placeholders}) AND g.season_id = ?
      GROUP BY pg.player_id
    `;

    const rows = query(sql, [...playerIds, seasonId]);

    return rows.map((d) => {
      d.fgp = d.total_fga ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000 : 0;
      d.tpp = d.total_tpa ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000 : 0;
      d.ftp = d.total_fta ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000 : 0;

      roundStats(d);
      calculateAdvancedStats(d);

      // Clean up internal fields
      delete d.total_fgm;
      delete d.total_fga;
      delete d.total_tpm;
      delete d.total_tpa;
      delete d.total_ftm;
      delete d.total_fta;

      return d;
    });
  }

  /**
   * Get all teams
   * Replaces: GET /api/teams
   */
  function getTeams() {
    return query("SELECT id, name, short_name, founded_year FROM teams ORDER BY name");
  }

  /**
   * Get team detail with roster and standings
   * Replaces: GET /api/teams/{id}
   */
  function getTeamDetail(teamId, seasonId) {
    const team = queryOne("SELECT * FROM teams WHERE id = ?", [teamId]);
    if (!team) return null;

    // Current roster
    const roster = query(
      `SELECT DISTINCT
        p.id, p.name, p.position, p.height, p.is_active
      FROM player_games pg
      JOIN players p ON pg.player_id = p.id
      JOIN games g ON pg.game_id = g.id
      WHERE pg.team_id = ? AND g.season_id = ?
      ORDER BY p.name`,
      [teamId, seasonId]
    );
    team.roster = roster;

    // Standings
    const standing = queryOne(
      `SELECT * FROM team_standings WHERE team_id = ? AND season_id = ?`,
      [teamId, seasonId]
    );
    if (standing) {
      team.standings = {
        rank: standing.rank,
        wins: standing.wins,
        losses: standing.losses,
        win_pct: standing.win_pct,
        games_behind: standing.games_behind,
        home_record: `${standing.home_wins}-${standing.home_losses}`,
        away_record: `${standing.away_wins}-${standing.away_losses}`,
        streak: standing.streak,
        last5: standing.last10,
      };
    }

    // Recent games
    const games = query(
      `SELECT
        g.id, g.game_date, g.home_team_id, g.away_team_id,
        g.home_score, g.away_score,
        ht.name as home_team_name,
        at.name as away_team_name
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE g.season_id = ?
        AND (g.home_team_id = ? OR g.away_team_id = ?)
      ORDER BY g.game_date DESC
      LIMIT 10`,
      [seasonId, teamId, teamId]
    );

    team.recent_games = games.map((d) => {
      const isHome = d.home_team_id === teamId;
      const opponent = isHome ? d.away_team_name : d.home_team_name;
      const teamScore = isHome ? d.home_score : d.away_score;
      const oppScore = isHome ? d.away_score : d.home_score;
      const won = teamScore && oppScore ? teamScore > oppScore : null;

      return {
        game_id: d.id,
        date: d.game_date,
        opponent: opponent,
        is_home: isHome,
        result: won === true ? "W" : won === false ? "L" : "-",
        score: teamScore && oppScore ? `${teamScore}-${oppScore}` : "-",
      };
    });

    return team;
  }

  /**
   * Get team standings for a season
   * Replaces: GET /api/seasons/{id}/standings
   */
  function getStandings(seasonId) {
    const rows = query(
      `SELECT ts.*, t.name as team_name, t.short_name
       FROM team_standings ts
       JOIN teams t ON ts.team_id = t.id
       WHERE ts.season_id = ?
       ORDER BY ts.rank`,
      [seasonId]
    );

    return rows.map((d) => ({
      rank: d.rank,
      team_id: d.team_id,
      team_name: d.team_name,
      short_name: d.short_name,
      wins: d.wins,
      losses: d.losses,
      win_pct: d.win_pct,
      games_behind: d.games_behind,
      home_record: `${d.home_wins}-${d.home_losses}`,
      away_record: `${d.away_wins}-${d.away_losses}`,
      streak: d.streak,
      last5: d.last10,
    }));
  }

  /**
   * Get games list
   * Replaces: GET /api/games
   */
  function getGames(seasonId, teamId = null, gameType = null, limit = 50, offset = 0) {
    let sql = `
      SELECT
        g.id, g.game_date, g.home_score, g.away_score, g.game_type,
        g.home_team_id, g.away_team_id,
        ht.name as home_team_name, ht.short_name as home_team_short,
        at.name as away_team_name, at.short_name as away_team_short
      FROM games g
      JOIN teams ht ON g.home_team_id = ht.id
      JOIN teams at ON g.away_team_id = at.id
      WHERE g.season_id = ?
    `;
    const params = [seasonId];

    if (teamId) {
      sql += " AND (g.home_team_id = ? OR g.away_team_id = ?)";
      params.push(teamId, teamId);
    }

    if (gameType) {
      sql += " AND g.game_type = ?";
      params.push(gameType);
    }

    sql += " ORDER BY g.game_date DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return query(sql, params);
  }

  /**
   * Get full boxscore for a game
   * Replaces: GET /api/games/{id}
   */
  function getGameBoxscore(gameId) {
    const game = queryOne(
      `SELECT g.*,
              ht.name as home_team_name,
              at.name as away_team_name
       FROM games g
       JOIN teams ht ON g.home_team_id = ht.id
       JOIN teams at ON g.away_team_id = at.id
       WHERE g.id = ?`,
      [gameId]
    );

    if (!game) return null;

    // Get player stats for both teams
    const players = query(
      `SELECT
        pg.*,
        p.name as player_name,
        p.position,
        t.name as team_name
      FROM player_games pg
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE pg.game_id = ?
      ORDER BY pg.team_id, pg.pts DESC`,
      [gameId]
    );

    game.home_team_stats = [];
    game.away_team_stats = [];

    for (const d of players) {
      const stat = {
        player_id: d.player_id,
        player_name: d.player_name,
        position: d.position,
        minutes: d.minutes,
        pts: d.pts,
        reb: d.reb,
        ast: d.ast,
        stl: d.stl,
        blk: d.blk,
        tov: d.tov,
        pf: d.pf,
        fgm: d.fgm,
        fga: d.fga,
        tpm: d.tpm,
        tpa: d.tpa,
        ftm: d.ftm,
        fta: d.fta,
      };

      if (d.team_id === game.home_team_id) {
        game.home_team_stats.push(stat);
      } else {
        game.away_team_stats.push(stat);
      }
    }

    // Get team game stats if available
    const teamStats = query("SELECT * FROM team_games WHERE game_id = ?", [gameId]);
    for (const d of teamStats) {
      const key = d.is_home ? "home_team_totals" : "away_team_totals";
      game[key] = {
        fast_break_pts: d.fast_break_pts,
        paint_pts: d.paint_pts,
        two_pts: d.two_pts,
        three_pts: d.three_pts,
      };
    }

    return game;
  }

  /**
   * Get all seasons
   * Replaces: GET /api/seasons
   */
  function getSeasons() {
    return query("SELECT id, label, start_date, end_date FROM seasons ORDER BY id DESC");
  }

  /**
   * Get statistical leaders for a category
   * Replaces: GET /api/leaders
   */
  function getLeaders(seasonId, category = "pts", limit = 10) {
    const validCategories = ["pts", "reb", "ast", "stl", "blk", "min", "fgp", "tpp", "ftp"];
    if (!validCategories.includes(category)) {
      category = "pts";
    }

    // Minimum games threshold for percentage categories
    const minGames = ["fgp", "tpp", "ftp"].includes(category) ? 10 : 1;

    let valueExpr;
    switch (category) {
      case "fgp":
        valueExpr = "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.fgm) * 1.0 / SUM(pg.fga) ELSE 0 END";
        break;
      case "tpp":
        valueExpr = "CASE WHEN SUM(pg.tpa) > 0 THEN SUM(pg.tpm) * 1.0 / SUM(pg.tpa) ELSE 0 END";
        break;
      case "ftp":
        valueExpr = "CASE WHEN SUM(pg.fta) > 0 THEN SUM(pg.ftm) * 1.0 / SUM(pg.fta) ELSE 0 END";
        break;
      case "min":
        valueExpr = "AVG(pg.minutes)";
        break;
      default:
        valueExpr = `AVG(pg.${category})`;
    }

    const sql = `
      SELECT
        p.id as player_id, p.name as player_name,
        t.name as team_name, t.id as team_id,
        COUNT(*) as gp,
        ${valueExpr} as value
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE g.season_id = ?
      GROUP BY pg.player_id
      HAVING COUNT(*) >= ?
      ORDER BY value DESC
      LIMIT ?
    `;

    const rows = query(sql, [seasonId, minGames, limit]);
    const isPct = ["fgp", "tpp", "ftp"].includes(category);

    return rows.map((d, i) => ({
      rank: i + 1,
      player_id: d.player_id,
      player_name: d.player_name,
      team_name: d.team_name,
      team_id: d.team_id,
      gp: d.gp,
      value: isPct ? Math.round(d.value * 1000) / 1000 : Math.round(d.value * 10) / 10,
    }));
  }

  /**
   * Get leaders for all major categories
   * Replaces: GET /api/leaders/all
   */
  function getLeadersAll(seasonId, limit = 5) {
    const categories = ["pts", "reb", "ast", "stl", "blk"];
    const result = {};

    for (const cat of categories) {
      result[cat] = getLeaders(seasonId, cat, limit);
    }

    return result;
  }

  /**
   * Search players and teams
   * Replaces: GET /api/search
   */
  function search(queryStr, limit = 10) {
    const pattern = `%${queryStr}%`;

    const players = query(
      `SELECT id, name, position, team_id,
              (SELECT name FROM teams WHERE id = players.team_id) as team
       FROM players WHERE name LIKE ? LIMIT ?`,
      [pattern, limit]
    );

    const teams = query(
      `SELECT id, name, short_name FROM teams
       WHERE name LIKE ? OR short_name LIKE ? LIMIT ?`,
      [pattern, pattern, limit]
    );

    return { players, teams };
  }

  // =============================================================================
  // Public API
  // =============================================================================

  return {
    // Initialization
    initDatabase,
    isReady,

    // Constants
    SEASON_CODES,

    // API replacement functions
    getPlayers,
    getPlayerDetail,
    getPlayerGamelog,
    getPlayerComparison,
    getTeams,
    getTeamDetail,
    getStandings,
    getGames,
    getGameBoxscore,
    getSeasons,
    getLeaders,
    getLeadersAll,
    search,
  };
})();

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = WKBLDatabase;
}
