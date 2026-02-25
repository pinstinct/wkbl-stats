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
  let detailDb = null;
  let initPromise = null;
  let detailInitPromise = null;

  const SEASON_CODES = window.WKBLShared?.SEASON_CODES || {};

  // =============================================================================
  // IndexedDB Caching Helpers
  // =============================================================================

  const DB_CACHE_KEY = "wkbl-core";

  /**
   * Fetch a database file with IndexedDB caching and ETag revalidation.
   * @param {string} url - URL to fetch
   * @param {string} cacheKey - IndexedDB cache key
   * @param {object} SQL - sql.js SQL module
   * @returns {Promise<object>} sql.js Database instance
   */
  async function fetchDbWithCache(url, cacheKey, SQL) {
    const cache = typeof IDBCache !== "undefined" ? IDBCache : null; // eslint-disable-line no-undef

    // Try loading from IndexedDB cache first
    if (cache) {
      try {
        const cached = await cache.loadFromCache(cacheKey);
        if (cached && cached.buffer) {
          const cachedDb = new SQL.Database(new Uint8Array(cached.buffer));
          console.log(`[db.js] Loaded ${cacheKey} from IndexedDB cache`);

          // Background ETag check for freshness
          checkForUpdate(url, cacheKey, cached.etag, cache);

          return cachedDb;
        }
      } catch (e) {
        console.warn("[db.js] IndexedDB cache read failed:", e.message);
      }
    }

    // No cache — fetch from network
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch database: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const etag = response.headers.get("ETag") || null;

    // Save to IndexedDB cache (fire-and-forget)
    if (cache) {
      cache
        .saveToCache(cacheKey, buffer, etag)
        .catch((_e) =>
          console.warn("[db.js] IndexedDB cache write failed:", _e.message),
        );
    }

    return new SQL.Database(new Uint8Array(buffer));
  }

  /**
   * Background ETag check — if server has newer data, update cache silently.
   */
  function checkForUpdate(url, cacheKey, cachedEtag, cache) {
    if (!cachedEtag) return;
    fetch(url, { method: "HEAD" })
      .then((res) => {
        const serverEtag = res.headers.get("ETag");
        if (serverEtag && serverEtag !== cachedEtag) {
          console.log(`[db.js] New version detected for ${cacheKey}`);
          fetch(url)
            .then((r) => r.arrayBuffer())
            .then((buffer) => {
              cache
                .saveToCache(cacheKey, buffer, serverEtag)
                .then(() => {
                  console.log(
                    `[db.js] Cache updated for ${cacheKey}, reload for latest data`,
                  );
                })
                .catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        // Network error during background check — ignore silently
      });
  }

  // =============================================================================
  // Initialization
  // =============================================================================

  /**
   * Initialize sql.js and load the core database.
   * Tries wkbl-core.db first, falls back to wkbl.db (unsplit).
   * @returns {Promise<boolean>} True if initialization successful
   */
  async function initDatabase() {
    if (db) return true;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
        });

        // Try split core DB first, fall back to full DB
        db = await fetchDbWithCache("./data/wkbl-core.db", DB_CACHE_KEY, SQL);
        console.log("[db.js] Database loaded successfully");
        return true;
      } catch (_error) {
        // Fallback: try the original unsplit database
        try {
          const SQL = await initSqlJs({
            locateFile: (file) =>
              `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
          });
          db = await fetchDbWithCache("./data/wkbl.db", "wkbl-full", SQL);
          console.log("[db.js] Loaded full database (fallback)");
          return true;
        } catch (fallbackError) {
          console.error(
            "[db.js] Failed to initialize database:",
            fallbackError,
          );
          initPromise = null;
          throw fallbackError;
        }
      }
    })();

    return initPromise;
  }

  /**
   * Initialize the detail database (play-by-play, shot charts, lineups).
   * Called lazily when game detail pages need this data.
   * @returns {Promise<boolean>} True if initialization successful
   */
  async function initDetailDatabase() {
    if (detailDb) return true;
    if (detailInitPromise) return detailInitPromise;

    detailInitPromise = (async () => {
      try {
        const SQL = await initSqlJs({
          locateFile: (file) =>
            `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`,
        });

        detailDb = await fetchDbWithCache(
          "./data/wkbl-detail.db",
          "wkbl-detail",
          SQL,
        );
        console.log("[db.js] Detail database loaded successfully");
        return true;
      } catch (_error) {
        console.warn("[db.js] Detail database not available:", _error.message);
        detailInitPromise = null;
        return false;
      }
    })();

    return detailInitPromise;
  }

  /**
   * Check if database is ready
   */
  function isReady() {
    return db !== null;
  }

  /**
   * Check if detail database is ready
   */
  function isDetailReady() {
    return detailDb !== null;
  }

  // =============================================================================
  // Utility Functions
  // =============================================================================

  /**
   * Execute a query on a specific database instance.
   */
  function _execQuery(database, sql, params) {
    const stmt = database.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  /**
   * Execute a query on the detail database (or main db as fallback).
   * Returns empty array if neither DB has the table.
   */
  function detailQuery(sql, params = []) {
    if (detailDb) {
      try {
        return _execQuery(detailDb, sql, params);
      } catch (_e) {
        // Table might not exist in detail DB
      }
    }
    // Fallback to main DB (unsplit case)
    if (db) {
      try {
        return _execQuery(db, sql, params);
      } catch (_e) {
        // Table doesn't exist in main DB either
      }
    }
    return [];
  }

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
   * Get team season totals + opponent totals for all teams in a season.
   * Used for computing team-context stats (USG%, ORtg, DRtg, rate stats, PER).
   * Returns a Map: team_id → { team_min, team_pts, team_fgm, team_fga, ... }
   */
  function getTeamSeasonStats(seasonId) {
    const params = seasonId && seasonId !== "all" ? [seasonId] : [];
    const seasonFilter =
      seasonId && seasonId !== "all" ? "WHERE g.season_id = ?" : "";

    const sql = `
      WITH tgt AS (
        SELECT pg.game_id, pg.team_id,
          SUM(pg.fgm) as fgm, SUM(pg.fga) as fga,
          SUM(pg.tpm) as tpm, SUM(pg.tpa) as tpa,
          SUM(pg.ftm) as ftm, SUM(pg.fta) as fta,
          SUM(pg.off_reb) as oreb, SUM(pg.def_reb) as dreb, SUM(pg.reb) as reb,
          SUM(pg.tov) as tov,
          SUM(pg.minutes) as total_min,
          SUM(pg.pts) as pts
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        ${seasonFilter}
        GROUP BY pg.game_id, pg.team_id
      )
      SELECT
        t.team_id,
        SUM(t.fgm) as team_fgm, SUM(t.fga) as team_fga,
        SUM(t.tpm) as team_tpm, SUM(t.tpa) as team_tpa,
        SUM(t.ftm) as team_ftm, SUM(t.fta) as team_fta,
        SUM(t.oreb) as team_oreb, SUM(t.dreb) as team_dreb, SUM(t.reb) as team_reb,
        SUM(t.tov) as team_tov,
        SUM(t.total_min) as team_min,
        SUM(t.pts) as team_pts,
        SUM(o.fgm) as opp_fgm, SUM(o.fga) as opp_fga,
        SUM(o.tpm) as opp_tpm, SUM(o.tpa) as opp_tpa,
        SUM(o.ftm) as opp_ftm, SUM(o.fta) as opp_fta,
        SUM(o.oreb) as opp_oreb, SUM(o.dreb) as opp_dreb, SUM(o.reb) as opp_reb,
        SUM(o.tov) as opp_tov,
        SUM(o.pts) as opp_pts
      FROM tgt t
      JOIN tgt o ON o.game_id = t.game_id AND o.team_id != t.team_id
      GROUP BY t.team_id
    `;

    const rows = query(sql, params);
    const map = new Map();
    for (const r of rows) {
      map.set(r.team_id, r);
    }

    if (seasonId && seasonId !== "all") {
      const standings = query(
        "SELECT team_id, wins, losses FROM team_standings WHERE season_id = ?",
        [seasonId],
      );
      for (const s of standings) {
        const teamStats = map.get(s.team_id);
        if (teamStats) {
          teamStats.team_wins = s.wins;
          teamStats.team_losses = s.losses;
        }
      }
    }

    return map;
  }

  /**
   * Get league season totals for PER normalization.
   * Returns a single object with aggregated league stats.
   */
  function getLeagueSeasonStats(seasonId) {
    const params = seasonId && seasonId !== "all" ? [seasonId] : [];
    const seasonFilter =
      seasonId && seasonId !== "all" ? "AND g.season_id = ?" : "";

    const sql = `
      SELECT
        SUM(pg.minutes) as lg_min,
        SUM(pg.pts) as lg_pts,
        SUM(pg.fgm) as lg_fgm, SUM(pg.fga) as lg_fga,
        SUM(pg.tpm) as lg_tpm,
        SUM(pg.ftm) as lg_ftm, SUM(pg.fta) as lg_fta,
        SUM(pg.off_reb) as lg_oreb, SUM(pg.def_reb) as lg_dreb, SUM(pg.reb) as lg_reb,
        SUM(pg.ast) as lg_ast,
        SUM(pg.tov) as lg_tov,
        SUM(pg.pf) as lg_pf,
        SUM(pg.stl) as lg_stl,
        SUM(pg.blk) as lg_blk
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      WHERE 1=1 ${seasonFilter}
    `;
    const lg = queryOne(sql, params) || {};
    const lgPoss = estimatePossessions(
      lg.lg_fga || 0,
      lg.lg_fta || 0,
      lg.lg_tov || 0,
      lg.lg_oreb || 0,
    );
    const lgMin5 = safeDiv(lg.lg_min || 0, 5);
    lg.lg_poss = lgPoss;
    lg.lg_pace = lgMin5 > 0 ? (40 * lgPoss) / lgMin5 : 0;
    return lg;
  }

  /**
   * Estimate possessions with selectable strategy.
   * - simple: FGA + 0.44*FTA + TOV - OREB
   * - bbr_standard: BBR-style team possession estimator
   */
  function estimatePossessions(fga, fta, tov, oreb, options = {}) {
    const { strategy = "simple" } = options;
    if (strategy === "bbr_standard") {
      const {
        fgm,
        opp_fga,
        opp_fta,
        opp_tov,
        opp_oreb,
        opp_fgm,
        opp_dreb,
        team_dreb,
      } = options;
      if (
        fgm != null &&
        opp_fga != null &&
        opp_fta != null &&
        opp_tov != null &&
        opp_oreb != null &&
        opp_fgm != null &&
        opp_dreb != null &&
        team_dreb != null
      ) {
        const teamOrbPct = safeDiv(oreb, oreb + opp_dreb);
        const oppOrbPct = safeDiv(opp_oreb, opp_oreb + team_dreb);
        const teamTerm =
          fga + 0.4 * fta - 1.07 * teamOrbPct * (fga - fgm) + tov;
        const oppTerm =
          opp_fga +
          0.4 * opp_fta -
          1.07 * oppOrbPct * (opp_fga - opp_fgm) +
          opp_tov;
        return Math.round(0.5 * (teamTerm + oppTerm) * 10) / 10;
      }
    }
    return fga + 0.44 * fta + tov - oreb;
  }

  function estimateTeamAndOppPossessions(ts) {
    const strategy = ts.poss_strategy || "simple";
    const teamPoss = estimatePossessions(
      ts.team_fga,
      ts.team_fta,
      ts.team_tov,
      ts.team_oreb,
      {
        strategy,
        fgm: ts.team_fgm,
        opp_fga: ts.opp_fga,
        opp_fta: ts.opp_fta,
        opp_tov: ts.opp_tov,
        opp_oreb: ts.opp_oreb,
        opp_fgm: ts.opp_fgm,
        opp_dreb: ts.opp_dreb,
        team_dreb: ts.team_dreb,
      },
    );
    const oppPoss = estimatePossessions(
      ts.opp_fga,
      ts.opp_fta,
      ts.opp_tov,
      ts.opp_oreb,
      {
        strategy,
        fgm: ts.opp_fgm,
        opp_fga: ts.team_fga,
        opp_fta: ts.team_fta,
        opp_tov: ts.team_tov,
        opp_oreb: ts.team_oreb,
        opp_fgm: ts.team_fgm,
        opp_dreb: ts.team_dreb,
        team_dreb: ts.opp_dreb,
      },
    );
    return { teamPoss, oppPoss };
  }

  function safeDiv(n, d) {
    return d ? n / d : 0;
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function totalFromRow(d, totalKey, avgKey) {
    if (d[totalKey] !== undefined && d[totalKey] !== null) return d[totalKey];
    return (d[avgKey] || 0) * (d.gp || 0);
  }

  function computePlayerOffRtg({ totals, ts }) {
    const { pts, ast, tov, fgm, fga, tpm, ftm, fta, oreb } = totals;

    const teamOrbPct = safeDiv(
      ts.team_oreb || 0,
      (ts.team_oreb || 0) + (ts.opp_dreb || 0),
    );
    const teamScoringPoss =
      (ts.team_fgm || 0) +
      (1 - (1 - safeDiv(ts.team_ftm || 0, ts.team_fta || 0)) ** 2) *
        0.44 *
        (ts.team_fta || 0);
    const teamPlayPct = safeDiv(
      teamScoringPoss,
      (ts.team_fga || 0) + 0.44 * (ts.team_fta || 0) + (ts.team_tov || 0),
    );
    const orbWeightDenom =
      (1 - teamOrbPct) * teamPlayPct + teamOrbPct * (1 - teamPlayPct);
    const teamOrbWeight = safeDiv(
      (1 - teamOrbPct) * teamPlayPct,
      orbWeightDenom,
    );
    const qAst = clamp(0.5 * safeDiv(ts.team_ast || 0, ts.team_fgm || 0), 0, 1);

    const fgPart =
      fga > 0 ? fgm * (1 - 0.5 * safeDiv(pts - ftm, 2 * fga) * qAst) : 0;
    const astPartDenom = 2 * ((ts.team_fga || 0) - fga);
    const astPart =
      astPartDenom > 0
        ? 0.5 *
          safeDiv(
            (ts.team_pts || 0) - (ts.team_ftm || 0) - (pts - ftm),
            astPartDenom,
          ) *
          ast
        : 0;
    const ftPart =
      fta > 0 ? (1 - (1 - safeDiv(ftm, fta)) ** 2) * 0.44 * fta : 0;

    const teamScoringShare = safeDiv(ts.team_oreb || 0, teamScoringPoss);
    const scoringDecay = 1 - teamScoringShare * teamOrbWeight * teamPlayPct;
    const scPoss =
      (fgPart + astPart + ftPart) * scoringDecay +
      oreb * teamOrbWeight * teamPlayPct;
    const fgxPoss = (fga - fgm) * (1 - 1.07 * teamOrbPct);
    const ftxPoss = (1 - safeDiv(ftm * ftm, fta * fta)) * 0.44 * fta;
    const totPoss = scPoss + fgxPoss + ftxPoss + tov;
    if (totPoss <= 0) return null;

    const pprodFg =
      fga > 0
        ? 2 * (fgm + 0.5 * tpm) * (1 - 0.5 * safeDiv(pts - ftm, 2 * fga) * qAst)
        : 0;
    let pprodAst = 0;
    if ((ts.team_fgm || 0) - fgm > 0 && (ts.team_fga || 0) - fga > 0) {
      pprodAst =
        2 *
        safeDiv(
          (ts.team_fgm || 0) - fgm + 0.5 * ((ts.team_tpm || 0) - tpm),
          (ts.team_fgm || 0) - fgm,
        ) *
        0.5 *
        safeDiv(
          (ts.team_pts || 0) - (ts.team_ftm || 0) - (pts - ftm),
          2 * ((ts.team_fga || 0) - fga),
        ) *
        ast;
    }
    const pprodOrb =
      teamScoringPoss > 0
        ? oreb *
          teamOrbWeight *
          teamPlayPct *
          safeDiv(ts.team_pts || 0, teamScoringPoss)
        : 0;
    const pprod = (pprodFg + pprodAst + ftm) * scoringDecay + pprodOrb;
    if (pprod <= 0) {
      return { offRtg: 0, pprod: 0, totPoss };
    }
    return {
      offRtg: Math.round((100 * pprod * 10) / totPoss) / 10,
      pprod,
      totPoss,
    };
  }

  function computePlayerDefRtg({ totals, ts, totalMin }) {
    const strategy = ts.poss_strategy || "simple";
    const oppPoss = estimatePossessions(
      ts.opp_fga || 0,
      ts.opp_fta || 0,
      ts.opp_tov || 0,
      ts.opp_oreb || 0,
      {
        strategy,
        fgm: ts.opp_fgm,
        opp_fga: ts.team_fga,
        opp_fta: ts.team_fta,
        opp_tov: ts.team_tov,
        opp_oreb: ts.team_oreb,
        opp_fgm: ts.team_fgm,
        opp_dreb: ts.team_dreb,
        team_dreb: ts.opp_dreb,
      },
    );
    if (oppPoss <= 0) return null;

    const teamDrtg = safeDiv(ts.opp_pts || 0, oppPoss) * 100;
    const teamMin5 = safeDiv(ts.team_min || 0, 5);
    if (totalMin <= 0 || teamMin5 <= 0) return Math.round(teamDrtg * 10) / 10;

    const oppOrbPct = safeDiv(
      ts.opp_oreb || 0,
      (ts.opp_oreb || 0) + (ts.team_dreb || 0),
    );
    const stops1 =
      (totals.stl || 0) +
      0.7 * (totals.blk || 0) +
      (totals.dreb || 0) * (1 - oppOrbPct);
    const stopFt =
      (ts.team_pf || 0) > 0 && (ts.opp_fta || 0) > 0
        ? safeDiv(totals.pf || 0, ts.team_pf || 0) *
          0.4 *
          (ts.opp_fta || 0) *
          (1 - safeDiv((ts.opp_ftm || 0) ** 2, (ts.opp_fta || 0) ** 2))
        : 0;
    const playerOppPoss = oppPoss * safeDiv(totalMin, teamMin5);
    if (playerOppPoss <= 0) return Math.round(teamDrtg * 10) / 10;

    const stopPct = clamp(safeDiv(stops1 + stopFt, playerOppPoss), 0, 1);
    const defRtg = teamDrtg * (1 - 0.2 * stopPct);
    return Math.round(clamp(defRtg, 50, 150) * 10) / 10;
  }

  function computeWinShares({
    pprod,
    totPoss,
    defRtg,
    totalMin,
    teamPoss,
    oppPoss,
    ts,
    lg,
  }) {
    const lgPts = lg.lg_pts || 0;
    const lgPoss = lg.lg_poss || 0;
    const lgPace = lg.lg_pace || 0;
    const lgMin = lg.lg_min || 0;
    const teamMin5 = safeDiv(ts.team_min || 0, 5);

    if (
      pprod == null ||
      totPoss == null ||
      defRtg == null ||
      totalMin <= 0 ||
      teamPoss <= 0 ||
      oppPoss <= 0 ||
      lgPts <= 0 ||
      lgPoss <= 0 ||
      lgPace <= 0 ||
      lgMin <= 0 ||
      teamMin5 <= 0
    ) {
      return null;
    }

    const lgGp = safeDiv(lgMin, 400);
    const lgPpg = safeDiv(lgPts, lgGp);
    if (lgPpg <= 0) return null;

    const teamPace = (40 * teamPoss) / teamMin5;
    const marginalPpw = 2 * lgPpg * safeDiv(teamPace, lgPace);
    if (marginalPpw <= 0) return null;

    const lgPtsPerPoss = safeDiv(lgPts, lgPoss);
    const marginalOffense = pprod - 0.92 * lgPtsPerPoss * totPoss;
    const ows = Math.max(0, marginalOffense / marginalPpw);

    const lgDrtg = 100 * lgPtsPerPoss;
    const playerDefPoss = oppPoss * safeDiv(totalMin, teamMin5);
    const playerDefPtsSaved = ((lgDrtg - defRtg) / 100) * playerDefPoss;
    const replacementDef = 0.08 * lgPpg * safeDiv(totalMin, teamMin5);
    const dws = (playerDefPtsSaved + replacementDef) / marginalPpw;

    const ws = ows + dws;
    return {
      ows: Math.round(ows * 100) / 100,
      dws: Math.round(dws * 100) / 100,
      ws: Math.round(ws * 100) / 100,
      ws_40: Math.round(safeDiv(ws, totalMin) * 40 * 1000) / 1000,
    };
  }

  /**
   * Compute PER using Hollinger formula (normalized to league avg = 15).
   */
  function computePER(d, gp, minAvg, ts, lg) {
    const totalMin = minAvg * gp;
    if (totalMin <= 0) return 0;

    const totalFgm = d.total_fgm || 0;
    const totalFga = d.total_fga || 0;
    const totalTpm = d.total_tpm || 0;
    const totalFtm = d.total_ftm || 0;
    const totalFta = d.total_fta || 0;

    const astTotal = (d.ast || 0) * gp;
    const stlTotal = (d.stl || 0) * gp;
    const blkTotal = (d.blk || 0) * gp;
    const tovTotal = (d.tov || 0) * gp;
    const pfTotal = totalFromRow(d, "total_pf", "avg_pf");
    const orebTotal = totalFromRow(d, "total_off_reb", "avg_off_reb");
    const drebTotal = totalFromRow(d, "total_def_reb", "avg_def_reb");

    const lgMin = lg.lg_min || 1;
    const lgPts = lg.lg_pts || 1;
    const lgFga = lg.lg_fga || 1;
    const lgFta = lg.lg_fta || 1;
    const lgFtm = lg.lg_ftm || 0;
    const lgOreb = lg.lg_oreb || 0;
    const lgReb = lg.lg_reb || 1;
    const lgAst = lg.lg_ast || 0;
    const lgFgm = lg.lg_fgm || 0;
    const lgTov = lg.lg_tov || 0;
    const lgPf = lg.lg_pf || 1;

    const factor =
      lgFtm > 0 && lgFgm > 0 && lgFga > 0
        ? 2 / 3 - (0.5 * (lgAst / lgFgm)) / (2 * (lgFgm / lgFtm))
        : 0.44;
    const lgPossDenom = lgFga - lgOreb + lgTov + 0.44 * lgFta;
    const vop = lgPossDenom > 0 ? lgPts / lgPossDenom : 1;
    const drbPct = lgReb > 0 ? (lgReb - lgOreb) / lgReb : 0.7;
    const teamAstRatio =
      (ts.team_fgm || 0) > 0 ? (ts.team_ast || 0) / (ts.team_fgm || 0) : 0;
    const pfPenalty =
      lgPf > 0 ? pfTotal * (lgFtm / lgPf - 0.44 * (lgFta / lgPf) * vop) : 0;

    const uPer =
      (1 / totalMin) *
      (totalTpm +
        (2 / 3) * astTotal +
        (2 - factor * teamAstRatio) * totalFgm +
        totalFtm * 0.5 * (1 + (1 - teamAstRatio) + (2 / 3) * teamAstRatio) -
        vop * tovTotal -
        vop * drbPct * (totalFga - totalFgm) -
        vop * 0.44 * (0.44 + 0.56 * drbPct) * (totalFta - totalFtm) +
        vop * (1 - drbPct) * (drebTotal || 0) +
        vop * drbPct * (orebTotal || 0) +
        vop * stlTotal +
        vop * drbPct * blkTotal -
        pfPenalty);

    const lgAper =
      lg.lg_aper != null && lg.lg_aper > 0
        ? lg.lg_aper
        : lgMin > 0
          ? lgPts / lgMin
          : 1;
    const strategy = ts.poss_strategy || "simple";
    const teamMin5 = ts.team_min > 0 ? ts.team_min / 5 : 1;
    const teamPoss = estimatePossessions(
      ts.team_fga || 0,
      ts.team_fta || 0,
      ts.team_tov || 0,
      ts.team_oreb || 0,
      {
        strategy,
        fgm: ts.team_fgm,
        opp_fga: ts.opp_fga,
        opp_fta: ts.opp_fta,
        opp_tov: ts.opp_tov,
        opp_oreb: ts.opp_oreb,
        opp_fgm: ts.opp_fgm,
        opp_dreb: ts.opp_dreb,
        team_dreb: ts.team_dreb,
      },
    );
    const teamPace = teamMin5 > 0 ? (40 * teamPoss) / teamMin5 : 1;
    const lgPace = lg.lg_pace || 1;
    const paceAdj = teamPace > 0 ? lgPace / teamPace : 1;
    const per = Math.round(paceAdj * uPer * (15 / lgAper) * 10) / 10;
    return isFinite(per) ? per : 0;
  }

  /**
   * Calculate advanced stats for a player row.
   * teamStats: entry from getTeamSeasonStats() for the player's team.
   * leagueStats: result from getLeagueSeasonStats().
   */
  function calculateAdvancedStats(d, teamStats = null, leagueStats = null) {
    const pts = d.pts * d.gp;
    const fga = d.total_fga || 0;
    const fta = d.total_fta || 0;
    const fgm = d.total_fgm || 0;
    const tpm = d.total_tpm || 0;
    const ftm = d.total_ftm || 0;
    const totalAst = totalFromRow(d, "total_ast", "ast");
    const totalStl = totalFromRow(d, "total_stl", "stl");
    const totalBlk = totalFromRow(d, "total_blk", "blk");
    const totalTov = totalFromRow(d, "total_tov", "tov");
    const totalOreb = totalFromRow(d, "total_off_reb", "avg_off_reb");
    const totalDreb = totalFromRow(d, "total_def_reb", "avg_def_reb");
    const totalPf = totalFromRow(d, "total_pf", "avg_pf");

    // TS% = PTS / (2 x (FGA + 0.44 x FTA))
    const tsa = 2 * (fga + 0.44 * fta);
    d.ts_pct = tsa > 0 ? Math.round((pts / tsa) * 1000) / 1000 : 0;

    // eFG% = (FGM + 0.5 x 3PM) / FGA
    d.efg_pct =
      fga > 0 ? Math.round(((fgm + 0.5 * tpm) / fga) * 1000) / 1000 : 0;
    d.tpar = fga > 0 ? Math.round(((d.total_tpa || 0) / fga) * 1000) / 1000 : 0;
    d.ftr = fga > 0 ? Math.round(((d.total_fta || 0) / fga) * 1000) / 1000 : 0;

    // PIR = (PTS + REB + AST + STL + BLK - TO - (FGA-FGM) - (FTA-FTM)) / GP
    const reb = d.reb * d.gp;
    const ast = d.ast * d.gp;
    const stl = d.stl * d.gp;
    const blk = d.blk * d.gp;
    const tov = d.tov * d.gp;
    const pirTotal =
      pts + reb + ast + stl + blk - tov - (fga - fgm) - (fta - ftm);
    d.pir = d.gp > 0 ? Math.round((pirTotal / d.gp) * 10) / 10 : 0;

    // AST/TO ratio
    d.ast_to = d.tov > 0 ? Math.round((d.ast / d.tov) * 100) / 100 : 0;

    // TOV% = TOV / (FGA + 0.44*FTA + TOV) * 100
    const fgaAvg = d.gp > 0 ? fga / d.gp : 0;
    const ftaAvg = d.gp > 0 ? fta / d.gp : 0;
    const tovDenom = fgaAvg + 0.44 * ftaAvg + d.tov;
    d.tov_pct = tovDenom > 0 ? Math.round((d.tov / tovDenom) * 1000) / 10 : 0;

    // Game Score (Hollinger) — requires avg off_reb, def_reb, pf from SQL
    const orebAvg = d.avg_off_reb || 0;
    const drebAvg = d.avg_def_reb || 0;
    const pfAvg = d.avg_pf || 0;
    const fgmAvg = d.gp > 0 ? fgm / d.gp : 0;
    const ftmAvg = d.gp > 0 ? ftm / d.gp : 0;
    d.game_score =
      Math.round(
        (d.pts +
          0.4 * fgmAvg -
          0.7 * fgaAvg -
          0.4 * (ftaAvg - ftmAvg) +
          0.7 * orebAvg +
          0.3 * drebAvg +
          d.stl +
          0.7 * d.ast +
          0.7 * d.blk -
          0.4 * pfAvg -
          d.tov) *
          10,
      ) / 10;

    // Per 36 minutes stats
    const minAvg = d.min > 0 ? d.min : 1;
    d.pts36 = Math.round(((d.pts * 36) / minAvg) * 10) / 10;
    d.reb36 = Math.round(((d.reb * 36) / minAvg) * 10) / 10;
    d.ast36 = Math.round(((d.ast * 36) / minAvg) * 10) / 10;

    // --- Team-context stats (require teamStats) ---
    if (teamStats && d.min > 0 && d.gp > 0) {
      const ts = teamStats;
      const teamMin5 = ts.team_min / 5; // team minutes per "slot"

      const fgaAvg2 = d.gp > 0 ? fga / d.gp : 0;
      const ftaAvg2 = d.gp > 0 ? fta / d.gp : 0;

      const { teamPoss, oppPoss } = estimateTeamAndOppPossessions(ts);

      // USG% = 100 * (FGA + 0.44*FTA + TOV) * (TmMIN/5) / (MIN * (TmFGA + 0.44*TmFTA + TmTOV))
      const playerUsage = (fgaAvg2 + 0.44 * ftaAvg2 + d.tov) * d.gp;
      const teamUsage = ts.team_fga + 0.44 * ts.team_fta + ts.team_tov;
      const totalPlayerMin = d.min * d.gp;
      if (teamUsage > 0 && totalPlayerMin > 0) {
        d.usg_pct =
          Math.round(
            ((100 * playerUsage * teamMin5) / (totalPlayerMin * teamUsage)) *
              10,
          ) / 10;
      }

      const offRtgData = computePlayerOffRtg({
        totals: {
          pts,
          ast: totalAst,
          tov: totalTov,
          fgm,
          fga,
          tpm,
          ftm,
          fta,
          oreb: totalOreb,
        },
        ts,
      });
      if (offRtgData !== null) d.off_rtg = offRtgData.offRtg;

      const defRtg = computePlayerDefRtg({
        totals: { stl: totalStl, blk: totalBlk, dreb: totalDreb, pf: totalPf },
        ts,
        totalMin: totalPlayerMin,
      });
      if (defRtg !== null) d.def_rtg = defRtg;

      // NetRtg = ORtg - DRtg
      if (d.off_rtg != null && d.def_rtg != null) {
        d.net_rtg = Math.round((d.off_rtg - d.def_rtg) * 10) / 10;
      }

      if (
        leagueStats &&
        offRtgData &&
        d.def_rtg != null &&
        ts.team_wins !== undefined &&
        ts.team_losses !== undefined
      ) {
        const ws = computeWinShares({
          pprod: offRtgData.pprod,
          totPoss: offRtgData.totPoss,
          defRtg: d.def_rtg,
          totalMin: totalPlayerMin,
          teamPoss,
          oppPoss,
          ts,
          lg: leagueStats,
        });
        if (ws) {
          d.ows = ws.ows;
          d.dws = ws.dws;
          d.ws = ws.ws;
          d.ws_40 = ws.ws_40;
        }
      }

      // Rate stats
      const orebAvg2 = d.avg_off_reb || 0;
      const drebAvg2 = d.avg_def_reb || 0;
      const rebAvg2 = d.reb || 0;
      const fgmAvg2 = d.gp > 0 ? fgm / d.gp : 0;

      // OREB% = 100 * OREB * (TmMIN/5) / (MIN * (TmOREB + OppDREB))
      const orebDenom = d.min * (ts.team_oreb + ts.opp_dreb);
      if (orebDenom > 0) {
        d.oreb_pct =
          Math.round(((100 * orebAvg2 * teamMin5) / orebDenom) * 10) / 10;
      }

      // DREB% = 100 * DREB * (TmMIN/5) / (MIN * (TmDREB + OppOREB))
      const drebDenom = d.min * (ts.team_dreb + ts.opp_oreb);
      if (drebDenom > 0) {
        d.dreb_pct =
          Math.round(((100 * drebAvg2 * teamMin5) / drebDenom) * 10) / 10;
      }

      // REB% = 100 * REB * (TmMIN/5) / (MIN * (TmREB + OppREB))
      const rebDenom = d.min * (ts.team_reb + ts.opp_reb);
      if (rebDenom > 0) {
        d.reb_pct =
          Math.round(((100 * rebAvg2 * teamMin5) / rebDenom) * 10) / 10;
      }

      // AST% = 100 * AST / ((MIN/(TmMIN/5)) * TmFGM - FGM)
      if (teamMin5 > 0) {
        const minFrac = d.min / teamMin5;
        const astDenom = minFrac * ts.team_fgm - fgmAvg2;
        if (astDenom > 0) {
          d.ast_pct = Math.round(((100 * d.ast) / astDenom) * 10) / 10;
        }
      }

      // STL% = 100 * STL * (TmMIN/5) / (MIN * OppPoss)
      const stlDenom = d.min * oppPoss;
      if (stlDenom > 0) {
        d.stl_pct = Math.round(((100 * d.stl * teamMin5) / stlDenom) * 10) / 10;
      }

      // BLK% = 100 * BLK * (TmMIN/5) / (MIN * (OppFGA - Opp3PA))
      const opp2pa = ts.opp_fga - ts.opp_tpa;
      const blkDenom = d.min * opp2pa;
      if (blkDenom > 0) {
        d.blk_pct = Math.round(((100 * d.blk * teamMin5) / blkDenom) * 10) / 10;
      }
    }

    // --- PER (require teamStats + leagueStats) ---
    if (teamStats && leagueStats && d.min > 0 && d.gp > 0) {
      d.per = computePER(d, d.gp, d.min, teamStats, leagueStats);
    }

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
   * Includes players with gp=0 (active but no games this season)
   */
  function getPlayers(
    seasonId,
    teamId = null,
    activeOnly = true,
    includeNoGames = true,
  ) {
    // First, get players with game records
    let sql = `
      SELECT
        p.id,
        p.name,
        p.position as pos,
        p.height,
        p.birth_date,
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
        SUM(pg.fta) as total_fta,
        AVG(pg.off_reb) as avg_off_reb,
        AVG(pg.def_reb) as avg_def_reb,
        AVG(pg.pf) as avg_pf,
        SUM(CASE WHEN g.home_team_id = pg.team_id
              THEN g.home_score - g.away_score
              ELSE g.away_score - g.home_score END) as plus_minus_total
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE g.home_score IS NOT NULL
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

    // Pre-fetch team and league stats for advanced stat computation
    const teamSeasonStats = getTeamSeasonStats(seasonId);
    const leagueStats = getLeagueSeasonStats(seasonId);

    const playerPlusMinusMap = getSeasonPlayerPlusMinusMap(seasonId);

    const players = rows.map((d) => {
      // Calculate percentages
      d.fgp = d.total_fga
        ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000
        : 0;
      d.tpp = d.total_tpa
        ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000
        : 0;
      d.ftp = d.total_fta
        ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000
        : 0;

      roundStats(d);
      const teamStats = teamSeasonStats.get(d.team_id) || null;
      calculateAdvancedStats(d, teamStats, leagueStats);

      const pm = playerPlusMinusMap.get(d.id);
      if (pm) {
        d.plus_minus_total = pm.total_pm;
        d.plus_minus_per_game = pm.pm_per_game;
        d.plus_minus_per100 = computePlusMinusPer100(pm, teamSeasonStats);
        if (d.plus_minus_per100 == null) {
          d.plus_minus_per100 = computeFallbackPlusMinusPer100(
            d.plus_minus_total,
            d.team_id,
            (d.min || 0) * (d.gp || 0),
            teamSeasonStats,
          );
        }
      } else {
        // Fallback for missing lineup data: normalize team margin by games played.
        const totalPm = d.plus_minus_total || 0;
        d.plus_minus_total = totalPm;
        d.plus_minus_per_game =
          d.gp > 0 ? Math.round((totalPm / d.gp) * 10) / 10 : 0;
        d.plus_minus_per100 = computeFallbackPlusMinusPer100(
          totalPm,
          d.team_id,
          (d.min || 0) * (d.gp || 0),
          teamSeasonStats,
        );
      }

      return d;
    });

    // Add players with no games in selected season (gp=0)
    if (includeNoGames && seasonId && seasonId !== "all") {
      const playerIds = new Set(players.map((p) => p.id));
      let noGamesRows = [];

      {
        const latestSeasonRow = queryOne(
          "SELECT MAX(season_id) AS max_season FROM games",
        );
        const isLatestSeason = latestSeasonRow?.max_season === seasonId;

        let rosterSql = `
          SELECT
            p.id,
            p.name,
            p.position as pos,
            p.height,
            p.birth_date,
            p.is_active,
            t.name as team,
            t.id as team_id
          FROM players p
          JOIN (
            SELECT pg.player_id, pg.team_id
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            WHERE g.season_id = (
              SELECT MAX(g2.season_id)
              FROM player_games pg2
              JOIN games g2 ON pg2.game_id = g2.id
              WHERE pg2.player_id = pg.player_id
                AND g2.season_id <= ?
            )
            GROUP BY pg.player_id
          ) last_team ON last_team.player_id = p.id
          JOIN teams t ON last_team.team_id = t.id
          WHERE p.id NOT IN (
            SELECT pg.player_id
            FROM player_games pg
            JOIN games g ON pg.game_id = g.id
            WHERE g.season_id = ?
          )
        `;
        const rosterParams = [seasonId, seasonId];

        if (activeOnly) {
          rosterSql += " AND p.is_active = 1";
        }

        if (teamId && teamId !== "all") {
          rosterSql += " AND last_team.team_id = ?";
          rosterParams.push(teamId);
        }

        noGamesRows = query(rosterSql, rosterParams);

        if (isLatestSeason) {
          // For current season only: include active roster players with no career games yet.
          let fallbackSql = `
            SELECT
              p.id,
              p.name,
              p.position as pos,
              p.height,
              p.birth_date,
              p.is_active,
              t.name as team,
              t.id as team_id
            FROM players p
            LEFT JOIN teams t ON p.team_id = t.id
            WHERE p.is_active = 1
              AND p.team_id IS NOT NULL
              AND p.id NOT IN (
                SELECT pg.player_id
                FROM player_games pg
                JOIN games g ON pg.game_id = g.id
                WHERE g.season_id <= ?
              )
          `;
          const fallbackParams = [seasonId];

          if (teamId && teamId !== "all") {
            fallbackSql += " AND p.team_id = ?";
            fallbackParams.push(teamId);
          }

          noGamesRows = noGamesRows.concat(query(fallbackSql, fallbackParams));
        }
      }

      for (const p of noGamesRows) {
        if (!playerIds.has(p.id)) {
          players.push({
            ...p,
            birth_date: p.birth_date || null,
            gp: 0,
            min: 0,
            pts: 0,
            reb: 0,
            ast: 0,
            stl: 0,
            blk: 0,
            tov: 0,
            fgp: 0,
            tpp: 0,
            ftp: 0,
            ts_pct: 0,
            efg_pct: 0,
            pir: 0,
            ast_to: 0,
            pts36: 0,
            reb36: 0,
            ast36: 0,
            plus_minus_total: 0,
            plus_minus_per_game: 0,
            plus_minus_per100: null,
          });
        }
      }
    }

    return players;
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
      [playerId],
    );

    if (!player) return null;

    // Season-by-season stats
    const seasons = query(
      `SELECT
        g.season_id,
        s.label as season_label,
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
        SUM(pg.fta) as total_fta,
        AVG(pg.off_reb) as avg_off_reb,
        AVG(pg.def_reb) as avg_def_reb,
        AVG(pg.pf) as avg_pf,
        SUM(CASE WHEN g.home_team_id = pg.team_id
              THEN g.home_score - g.away_score
              ELSE g.away_score - g.home_score END) as plus_minus_total
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN seasons s ON g.season_id = s.id
      JOIN teams t ON pg.team_id = t.id
      WHERE pg.player_id = ?
      GROUP BY g.season_id
      ORDER BY g.season_id DESC`,
      [playerId],
    );

    const seasonTeamStats = new Map();
    const seasonLeagueStats = new Map();
    const seasonPlusMinusMaps = new Map();
    for (const seasonRow of seasons) {
      const sid = seasonRow.season_id;
      if (!seasonTeamStats.has(sid)) {
        seasonTeamStats.set(sid, getTeamSeasonStats(sid));
      }
      if (!seasonLeagueStats.has(sid)) {
        seasonLeagueStats.set(sid, getLeagueSeasonStats(sid));
      }
      if (!seasonPlusMinusMaps.has(sid)) {
        seasonPlusMinusMaps.set(sid, getSeasonPlayerPlusMinusMap(sid));
      }
    }

    player.seasons = {};
    for (const d of seasons) {
      d.fgp = d.total_fga
        ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000
        : 0;
      d.tpp = d.total_tpa
        ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000
        : 0;
      d.ftp = d.total_fta
        ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000
        : 0;

      roundStats(d);
      const teamMap = seasonTeamStats.get(d.season_id);
      const teamStats = teamMap?.get(d.team_id) || null;
      const leagueStats = seasonLeagueStats.get(d.season_id) || null;
      calculateAdvancedStats(d, teamStats, leagueStats);

      const pm = seasonPlusMinusMaps.get(d.season_id)?.get(playerId);
      if (pm) {
        d.plus_minus_total = pm.total_pm;
        d.plus_minus_per_game = pm.pm_per_game;
        d.plus_minus_per100 = computePlusMinusPer100(pm, teamMap);
        if (d.plus_minus_per100 == null) {
          d.plus_minus_per100 = computeFallbackPlusMinusPer100(
            d.plus_minus_total,
            d.team_id,
            (d.min || 0) * (d.gp || 0),
            teamMap,
          );
        }
      } else {
        const totalPm = d.plus_minus_total || 0;
        d.plus_minus_total = totalPm;
        d.plus_minus_per_game =
          d.gp > 0 ? Math.round((totalPm / d.gp) * 10) / 10 : 0;
        d.plus_minus_per100 = computeFallbackPlusMinusPer100(
          totalPm,
          d.team_id,
          (d.min || 0) * (d.gp || 0),
          teamMap,
        );
      }

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
      [playerId],
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
        t.id as team_id, t.name as team,
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
        SUM(pg.fta) as total_fta,
        SUM(pg.off_reb) as total_off_reb,
        SUM(pg.def_reb) as total_def_reb,
        SUM(pg.pf) as total_pf,
        SUM(CASE WHEN g.home_team_id = pg.team_id
              THEN g.home_score - g.away_score
              ELSE g.away_score - g.home_score END) as plus_minus_total
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE pg.player_id IN (${placeholders}) AND g.season_id = ?
      GROUP BY pg.player_id
    `;

    const rows = query(sql, [...playerIds, seasonId]);
    const playerPlusMinusMap = getSeasonPlayerPlusMinusMap(seasonId);
    const teamSeasonStats = getTeamSeasonStats(seasonId);
    const leagueStats = getLeagueSeasonStats(seasonId);

    return rows.map((d) => {
      d.fgp = d.total_fga
        ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000
        : 0;
      d.tpp = d.total_tpa
        ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000
        : 0;
      d.ftp = d.total_fta
        ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000
        : 0;

      roundStats(d);
      const teamStats = teamSeasonStats.get(d.team_id) || null;
      calculateAdvancedStats(d, teamStats, leagueStats);

      const pm = playerPlusMinusMap.get(d.id);
      if (pm) {
        d.plus_minus_total = pm.total_pm;
        d.plus_minus_per_game = pm.pm_per_game;
        d.plus_minus_per100 = computePlusMinusPer100(pm, teamSeasonStats);
        if (d.plus_minus_per100 == null) {
          d.plus_minus_per100 = computeFallbackPlusMinusPer100(
            d.plus_minus_total,
            d.team_id,
            (d.min || 0) * (d.gp || 0),
            teamSeasonStats,
          );
        }
      } else {
        const totalPm = d.plus_minus_total || 0;
        d.plus_minus_total = totalPm;
        d.plus_minus_per_game =
          d.gp > 0 ? Math.round((totalPm / d.gp) * 10) / 10 : 0;
        d.plus_minus_per100 = computeFallbackPlusMinusPer100(
          totalPm,
          d.team_id,
          (d.min || 0) * (d.gp || 0),
          teamSeasonStats,
        );
      }

      // Clean up internal fields
      delete d.total_fgm;
      delete d.total_fga;
      delete d.total_tpm;
      delete d.total_tpa;
      delete d.total_ftm;
      delete d.total_fta;
      delete d.total_off_reb;
      delete d.total_def_reb;
      delete d.total_pf;

      return d;
    });
  }

  /**
   * Get all teams
   * Replaces: GET /api/teams
   */
  function getTeams() {
    return query(
      "SELECT id, name, short_name, founded_year FROM teams ORDER BY name",
    );
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
      [teamId, seasonId],
    );
    team.roster = roster;

    // Standings
    const standing = queryOne(
      `SELECT * FROM team_standings WHERE team_id = ? AND season_id = ?`,
      [teamId, seasonId],
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
        last5: standing.last5,
      };
    }

    // Recent games (completed only)
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
        AND g.home_score IS NOT NULL
        AND g.away_score IS NOT NULL
      ORDER BY g.game_date DESC
      LIMIT 10`,
      [seasonId, teamId, teamId],
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

    // Compute team advanced stats (ORtg, DRtg, NetRtg, Pace)
    const teamTotals = queryOne(
      `SELECT COUNT(DISTINCT pg.game_id) as gp,
        SUM(pg.pts) as pts, SUM(pg.fga) as fga, SUM(pg.fta) as fta,
        SUM(pg.off_reb) as off_reb, SUM(pg.tov) as tov
       FROM player_games pg
       JOIN games g ON pg.game_id = g.id
       WHERE pg.team_id = ? AND g.season_id = ? AND g.home_score IS NOT NULL`,
      [teamId, seasonId],
    );
    const oppTotals = queryOne(
      `SELECT SUM(pg.pts) as opp_pts, SUM(pg.fga) as opp_fga,
        SUM(pg.fta) as opp_fta, SUM(pg.off_reb) as opp_off_reb,
        SUM(pg.tov) as opp_tov
       FROM player_games pg
       JOIN games g ON pg.game_id = g.id
       WHERE (g.home_team_id = ? OR g.away_team_id = ?)
         AND g.season_id = ? AND pg.team_id != ? AND g.home_score IS NOT NULL`,
      [teamId, teamId, seasonId, teamId],
    );
    if (teamTotals && teamTotals.gp > 0) {
      const tp =
        (teamTotals.fga || 0) -
        (teamTotals.off_reb || 0) +
        (teamTotals.tov || 0) +
        0.44 * (teamTotals.fta || 0);
      const op =
        (oppTotals?.opp_fga || 0) -
        (oppTotals?.opp_off_reb || 0) +
        (oppTotals?.opp_tov || 0) +
        0.44 * (oppTotals?.opp_fta || 0);
      const off_rtg =
        tp > 0 ? Math.round((teamTotals.pts / tp) * 1000) / 10 : null;
      const def_rtg =
        op > 0 ? Math.round((oppTotals.opp_pts / op) * 1000) / 10 : null;
      const net_rtg =
        off_rtg !== null && def_rtg !== null
          ? Math.round((off_rtg - def_rtg) * 10) / 10
          : null;
      const pace = Math.round((tp / teamTotals.gp) * 10) / 10;
      team.team_stats = {
        off_rtg,
        def_rtg,
        net_rtg,
        pace,
        gp: teamTotals.gp,
      };
    }

    return team;
  }

  /**
   * Get team roster with player stats for main page lineup
   */
  function getTeamRoster(teamId, seasonId) {
    const rows = query(
      `SELECT
        p.id, p.name, p.position as pos, p.height,
        COUNT(pg.game_id) as gp,
        ROUND(AVG(pg.minutes), 1) as min,
        ROUND(AVG(pg.pts), 1) as pts,
        ROUND(AVG(pg.reb), 1) as reb,
        ROUND(AVG(pg.ast), 1) as ast,
        ROUND(AVG(pg.stl), 1) as stl,
        ROUND(AVG(pg.blk), 1) as blk,
        ROUND(AVG(pg.tov), 1) as tov,
        SUM(pg.fgm) as total_fgm, SUM(pg.fga) as total_fga,
        SUM(pg.tpm) as total_tpm, SUM(pg.tpa) as total_tpa,
        SUM(pg.ftm) as total_ftm, SUM(pg.fta) as total_fta,
        ROUND(AVG(pg.pts + pg.reb + pg.ast + pg.stl + pg.blk + (pg.fgm - pg.fga) + (pg.ftm - pg.fta) - pg.tov), 1) as pir
      FROM players p
      JOIN player_games pg ON p.id = pg.player_id
      JOIN games g ON pg.game_id = g.id
      WHERE pg.team_id = ? AND g.season_id = ?
      GROUP BY p.id
      ORDER BY pir DESC`,
      [teamId, seasonId],
    );

    return rows.map((d) => {
      d.fgp = d.total_fga
        ? Math.round((d.total_fgm / d.total_fga) * 1000) / 1000
        : 0;
      d.tpp = d.total_tpa
        ? Math.round((d.total_tpm / d.total_tpa) * 1000) / 1000
        : 0;
      d.ftp = d.total_fta
        ? Math.round((d.total_ftm / d.total_fta) * 1000) / 1000
        : 0;

      // Clean up
      delete d.total_fgm;
      delete d.total_fga;
      delete d.total_tpm;
      delete d.total_tpa;
      delete d.total_ftm;
      delete d.total_fta;

      return d;
    });
  }

  function getSeasonTeamAdvancedMap(seasonId) {
    const rows = query(
      `
      WITH team_game AS (
        SELECT
          pg.game_id,
          pg.team_id,
          SUM(pg.pts) as pts,
          SUM(pg.fga) as fga,
          SUM(pg.fta) as fta,
          SUM(pg.off_reb) as oreb,
          SUM(pg.tov) as tov
        FROM player_games pg
        JOIN games g ON pg.game_id = g.id
        WHERE g.season_id = ?
          AND g.home_score IS NOT NULL
          AND g.away_score IS NOT NULL
        GROUP BY pg.game_id, pg.team_id
      )
      SELECT
        t.team_id,
        COUNT(*) as gp,
        SUM(t.pts) as team_pts,
        SUM(t.fga) as team_fga,
        SUM(t.fta) as team_fta,
        SUM(t.oreb) as team_oreb,
        SUM(t.tov) as team_tov,
        SUM(o.pts) as opp_pts,
        SUM(o.fga) as opp_fga,
        SUM(o.fta) as opp_fta,
        SUM(o.oreb) as opp_oreb,
        SUM(o.tov) as opp_tov
      FROM team_game t
      JOIN team_game o ON o.game_id = t.game_id AND o.team_id != t.team_id
      GROUP BY t.team_id
      `,
      [seasonId],
    );

    const map = new Map();
    for (const row of rows) {
      const gp = row.gp || 0;
      const teamPoss = estimatePossessions(
        row.team_fga || 0,
        row.team_fta || 0,
        row.team_tov || 0,
        row.team_oreb || 0,
      );
      const oppPoss = estimatePossessions(
        row.opp_fga || 0,
        row.opp_fta || 0,
        row.opp_tov || 0,
        row.opp_oreb || 0,
      );

      const off_rtg =
        teamPoss > 0
          ? Math.round(((row.team_pts || 0) / teamPoss) * 1000) / 10
          : null;
      const def_rtg =
        oppPoss > 0
          ? Math.round(((row.opp_pts || 0) / oppPoss) * 1000) / 10
          : null;
      const net_rtg =
        off_rtg !== null && def_rtg !== null
          ? Math.round((off_rtg - def_rtg) * 10) / 10
          : null;
      const pace = gp > 0 ? Math.round((teamPoss / gp) * 10) / 10 : null;

      map.set(row.team_id, { off_rtg, def_rtg, net_rtg, pace });
    }
    return map;
  }

  function getSeasonPlayerPlusMinusMap(seasonId) {
    const map = new Map();
    if (!seasonId || seasonId === "all") return map;

    try {
      // Get season game IDs from core DB, then query lineup_stints from detail DB
      const seasonGames = query("SELECT id FROM games WHERE season_id = ?", [
        seasonId,
      ]);
      if (seasonGames.length === 0) return map;
      const gameIds = seasonGames.map((g) => g.id);
      const ph = gameIds.map(() => "?").join(",");
      const rows = detailQuery(
        `
        WITH stint_diff AS (
          SELECT
            ls.game_id,
            ls.team_id,
            ls.player1_id AS player_id,
            (COALESCE(ls.end_score_for, 0) - COALESCE(ls.start_score_for, 0))
              - (COALESCE(ls.end_score_against, 0) - COALESCE(ls.start_score_against, 0)) AS diff,
            COALESCE(ls.duration_seconds, 0) AS duration_seconds
          FROM lineup_stints ls
          WHERE ls.game_id IN (${ph})
          UNION ALL
          SELECT
            ls.game_id,
            ls.team_id,
            ls.player2_id AS player_id,
            (COALESCE(ls.end_score_for, 0) - COALESCE(ls.start_score_for, 0))
              - (COALESCE(ls.end_score_against, 0) - COALESCE(ls.start_score_against, 0)) AS diff,
            COALESCE(ls.duration_seconds, 0) AS duration_seconds
          FROM lineup_stints ls
          WHERE ls.game_id IN (${ph})
          UNION ALL
          SELECT
            ls.game_id,
            ls.team_id,
            ls.player3_id AS player_id,
            (COALESCE(ls.end_score_for, 0) - COALESCE(ls.start_score_for, 0))
              - (COALESCE(ls.end_score_against, 0) - COALESCE(ls.start_score_against, 0)) AS diff,
            COALESCE(ls.duration_seconds, 0) AS duration_seconds
          FROM lineup_stints ls
          WHERE ls.game_id IN (${ph})
          UNION ALL
          SELECT
            ls.game_id,
            ls.team_id,
            ls.player4_id AS player_id,
            (COALESCE(ls.end_score_for, 0) - COALESCE(ls.start_score_for, 0))
              - (COALESCE(ls.end_score_against, 0) - COALESCE(ls.start_score_against, 0)) AS diff,
            COALESCE(ls.duration_seconds, 0) AS duration_seconds
          FROM lineup_stints ls
          WHERE ls.game_id IN (${ph})
          UNION ALL
          SELECT
            ls.game_id,
            ls.team_id,
            ls.player5_id AS player_id,
            (COALESCE(ls.end_score_for, 0) - COALESCE(ls.start_score_for, 0))
              - (COALESCE(ls.end_score_against, 0) - COALESCE(ls.start_score_against, 0)) AS diff,
            COALESCE(ls.duration_seconds, 0) AS duration_seconds
          FROM lineup_stints ls
          WHERE ls.game_id IN (${ph})
        ),
        grouped AS (
          SELECT
            player_id,
            team_id,
            SUM(diff) AS total_pm_team,
            SUM(duration_seconds) AS on_court_seconds_team,
            COUNT(DISTINCT game_id) AS gp_team
          FROM stint_diff
          WHERE player_id IS NOT NULL
          GROUP BY player_id, team_id
        )
        SELECT
          player_id,
          team_id,
          total_pm_team,
          on_court_seconds_team,
          gp_team
        FROM grouped
        `,
        [...gameIds, ...gameIds, ...gameIds, ...gameIds, ...gameIds],
      );

      for (const row of rows) {
        const pid = row.player_id;
        const existing = map.get(pid) || {
          total_pm: 0,
          gp: 0,
          on_court_seconds: 0,
          segments: [],
        };
        existing.total_pm += row.total_pm_team || 0;
        existing.gp += row.gp_team || 0;
        existing.on_court_seconds += row.on_court_seconds_team || 0;
        existing.segments.push({
          team_id: row.team_id,
          total_pm: row.total_pm_team || 0,
          on_court_seconds: row.on_court_seconds_team || 0,
        });
        map.set(pid, existing);
      }

      for (const [pid, agg] of map.entries()) {
        map.set(pid, {
          ...agg,
          pm_per_game:
            agg.gp > 0 ? Math.round((agg.total_pm / agg.gp) * 10) / 10 : 0,
        });
      }
    } catch (_err) {
      return map;
    }

    return map;
  }

  function computePlusMinusPer100(pmAgg, teamStatsMap) {
    if (
      !pmAgg ||
      !Array.isArray(pmAgg.segments) ||
      pmAgg.segments.length === 0
    ) {
      return null;
    }

    let onCourtPoss = 0;
    for (const seg of pmAgg.segments) {
      const ts = teamStatsMap?.get(seg.team_id);
      if (!ts) continue;
      const teamPoss = estimatePossessions(
        ts.team_fga || 0,
        ts.team_fta || 0,
        ts.team_tov || 0,
        ts.team_oreb || 0,
      );
      const teamSeconds = safeDiv(ts.team_min || 0, 5) * 60;
      if (teamPoss <= 0 || teamSeconds <= 0) continue;
      onCourtPoss += teamPoss * safeDiv(seg.on_court_seconds || 0, teamSeconds);
    }

    if (onCourtPoss <= 0) return null;
    return Math.round(((100 * (pmAgg.total_pm || 0)) / onCourtPoss) * 10) / 10;
  }

  function computeFallbackPlusMinusPer100(
    totalPm,
    teamId,
    playerTotalMinutes,
    teamStatsMap,
  ) {
    if (
      !teamId ||
      !teamStatsMap ||
      !playerTotalMinutes ||
      playerTotalMinutes <= 0
    ) {
      return null;
    }

    const ts = teamStatsMap.get(teamId);
    if (!ts) return null;

    const teamPoss = estimatePossessions(
      ts.team_fga || 0,
      ts.team_fta || 0,
      ts.team_tov || 0,
      ts.team_oreb || 0,
    );
    const teamMinutes = safeDiv(ts.team_min || 0, 5);
    if (teamPoss <= 0 || teamMinutes <= 0) return null;

    const onCourtPoss = teamPoss * safeDiv(playerTotalMinutes, teamMinutes);
    if (onCourtPoss <= 0) return null;

    return Math.round(((100 * (totalPm || 0)) / onCourtPoss) * 10) / 10;
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
      [seasonId],
    );

    const advancedMap = getSeasonTeamAdvancedMap(seasonId);

    return rows.map((d) => ({
      rank: d.rank,
      team_id: d.team_id,
      team_name: d.team_name,
      short_name: d.short_name,
      wins: d.wins,
      losses: d.losses,
      games_played: (d.wins || 0) + (d.losses || 0),
      win_pct: d.win_pct,
      off_rtg: advancedMap.get(d.team_id)?.off_rtg ?? null,
      def_rtg: advancedMap.get(d.team_id)?.def_rtg ?? null,
      net_rtg: advancedMap.get(d.team_id)?.net_rtg ?? null,
      pace: advancedMap.get(d.team_id)?.pace ?? null,
      games_behind: d.games_behind,
      home_record: `${d.home_wins}-${d.home_losses}`,
      away_record: `${d.away_wins}-${d.away_losses}`,
      streak: d.streak,
      last5: d.last5,
    }));
  }

  /**
   * Get games list
   * Replaces: GET /api/games
   */
  function getGames(
    seasonId,
    teamId = null,
    gameType = null,
    limit = 50,
    offset = 0,
    excludeFuture = false,
  ) {
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

    if (excludeFuture) {
      sql += " AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL";
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
      [gameId],
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
      [gameId],
    );

    game.home_team_stats = [];
    game.away_team_stats = [];

    const gameStints = detailQuery(
      `SELECT *
       FROM lineup_stints
       WHERE game_id = ?
       ORDER BY stint_order`,
      [gameId],
    );
    const plusMinusGameMap = new Map();
    for (const s of gameStints) {
      const diff =
        (s.end_score_for || 0) -
        (s.start_score_for || 0) -
        ((s.end_score_against || 0) - (s.start_score_against || 0));
      for (const pid of [
        s.player1_id,
        s.player2_id,
        s.player3_id,
        s.player4_id,
        s.player5_id,
      ]) {
        if (!pid) continue;
        plusMinusGameMap.set(pid, (plusMinusGameMap.get(pid) || 0) + diff);
      }
    }

    for (const d of players) {
      // Calculate advanced stats for this game
      const pts = d.pts || 0;
      const fga = d.fga || 0;
      const fta = d.fta || 0;
      const fgm = d.fgm || 0;
      const ftm = d.ftm || 0;

      // TS% = PTS / (2 x (FGA + 0.44 x FTA))
      const tsa = 2 * (fga + 0.44 * fta);
      const ts_pct = tsa > 0 ? Math.round((pts / tsa) * 1000) / 1000 : 0;

      // PIR = PTS + REB + AST + STL + BLK - TO - (FGA-FGM) - (FTA-FTM)
      const reb = d.reb || 0;
      const ast = d.ast || 0;
      const stl = d.stl || 0;
      const blk = d.blk || 0;
      const tov = d.tov || 0;
      const pir = pts + reb + ast + stl + blk - tov - (fga - fgm) - (fta - ftm);

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
        ts_pct: ts_pct,
        pir: pir,
        plus_minus_game: plusMinusGameMap.has(d.player_id)
          ? plusMinusGameMap.get(d.player_id)
          : Math.round(
              ((d.team_id === game.home_team_id
                ? (game.home_score || 0) - (game.away_score || 0)
                : (game.away_score || 0) - (game.home_score || 0)) *
                Math.min((d.minutes || 0) / 40, 1) *
                10) /
                10,
            ),
      };

      if (d.team_id === game.home_team_id) {
        game.home_team_stats.push(stat);
      } else {
        game.away_team_stats.push(stat);
      }
    }

    // Get team game stats if available
    const teamStats = query("SELECT * FROM team_games WHERE game_id = ?", [
      gameId,
    ]);
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
    return query(
      "SELECT id, label, start_date, end_date FROM seasons ORDER BY id DESC",
    );
  }

  /**
   * Get PER leaders — requires team/league aggregation + JS computation.
   */
  function getLeadersByPER(seasonId, limit = 10) {
    const minGames = 5;
    const sql = `
      SELECT
        p.id as player_id, p.name as player_name,
        t.name as team_name, t.id as team_id,
        COUNT(*) as gp,
        AVG(pg.minutes) as min,
        AVG(pg.pts) as pts,
        AVG(pg.reb) as reb,
        AVG(pg.ast) as ast,
        AVG(pg.stl) as stl,
        AVG(pg.blk) as blk,
        AVG(pg.tov) as tov,
        SUM(pg.fgm) as total_fgm, SUM(pg.fga) as total_fga,
        SUM(pg.tpm) as total_tpm, SUM(pg.tpa) as total_tpa,
        SUM(pg.ftm) as total_ftm, SUM(pg.fta) as total_fta,
        AVG(pg.off_reb) as avg_off_reb,
        AVG(pg.def_reb) as avg_def_reb,
        AVG(pg.pf) as avg_pf
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      JOIN players p ON pg.player_id = p.id
      JOIN teams t ON pg.team_id = t.id
      WHERE g.season_id = ? AND p.is_active = 1
      GROUP BY pg.player_id
      HAVING COUNT(*) >= ?
    `;

    const rows = query(sql, [seasonId, minGames]);
    const teamSeasonStats = getTeamSeasonStats(seasonId);
    const leagueStats = getLeagueSeasonStats(seasonId);

    const results = rows
      .map((d) => {
        const teamStats = teamSeasonStats.get(d.team_id) || null;
        const per =
          teamStats && leagueStats
            ? computePER(d, d.gp, d.min, teamStats, leagueStats)
            : 0;
        return {
          rank: 0,
          player_id: d.player_id,
          player_name: d.player_name,
          team_name: d.team_name,
          team_id: d.team_id,
          gp: d.gp,
          value: per,
        };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit)
      .map((d, i) => ({ ...d, rank: i + 1 }));

    return results;
  }

  function getLeadersByWSMetric(seasonId, metric = "ws", limit = 10) {
    const digits = metric === "ws_40" ? 3 : 2;
    const rows = getPlayers(seasonId, null, true, false);
    return rows
      .filter((p) => p.gp >= 1 && p[metric] != null)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0))
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        player_id: p.id,
        player_name: p.name,
        team_name: p.team,
        team_id: p.team_id,
        gp: p.gp,
        value: Math.round((p[metric] || 0) * 10 ** digits) / 10 ** digits,
      }));
  }

  function getLeadersByPlusMinusPerGame(seasonId, limit = 10) {
    const minGames = 5;
    return getPlayers(seasonId, null, true, false)
      .filter((p) => p.gp >= minGames && p.plus_minus_per_game != null)
      .sort(
        (a, b) => (b.plus_minus_per_game || 0) - (a.plus_minus_per_game || 0),
      )
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        player_id: p.id,
        player_name: p.name,
        team_name: p.team,
        team_id: p.team_id,
        gp: p.gp,
        value: Math.round((p.plus_minus_per_game || 0) * 10) / 10,
      }));
  }

  function getLeadersByPlusMinusPer100(seasonId, limit = 10) {
    const minGames = 5;
    const minTotalMinutes = 100;
    return getPlayers(seasonId, null, true, false)
      .filter(
        (p) =>
          p.gp >= minGames &&
          (p.min || 0) * (p.gp || 0) >= minTotalMinutes &&
          p.plus_minus_per100 != null,
      )
      .sort((a, b) => (b.plus_minus_per100 || 0) - (a.plus_minus_per100 || 0))
      .slice(0, limit)
      .map((p, i) => ({
        rank: i + 1,
        player_id: p.id,
        player_name: p.name,
        team_name: p.team,
        team_id: p.team_id,
        gp: p.gp,
        value: Math.round((p.plus_minus_per100 || 0) * 10) / 10,
      }));
  }

  /**
   * Get statistical leaders for a category
   * Replaces: GET /api/leaders
   */
  function getLeaders(seasonId, category = "pts", limit = 10) {
    const validCategories = [
      "pts",
      "reb",
      "ast",
      "stl",
      "blk",
      "min",
      "fgp",
      "tpp",
      "ftp",
      "game_score",
      "ts_pct",
      "pir",
      "tpar",
      "ftr",
      "per",
      "ows",
      "dws",
      "ws",
      "ws_40",
      "plus_minus_per_game",
      "plus_minus_per100",
    ];
    if (!validCategories.includes(category)) {
      category = "pts";
    }

    // PER requires team/league context — handled separately
    if (category === "per") {
      return getLeadersByPER(seasonId, limit);
    }
    if (["ows", "dws", "ws", "ws_40"].includes(category)) {
      return getLeadersByWSMetric(seasonId, category, limit);
    }
    if (category === "plus_minus_per_game") {
      return getLeadersByPlusMinusPerGame(seasonId, limit);
    }
    if (category === "plus_minus_per100") {
      return getLeadersByPlusMinusPer100(seasonId, limit);
    }

    // Minimum games threshold for percentage categories
    const minGames = ["fgp", "tpp", "ftp", "ts_pct", "tpar", "ftr"].includes(
      category,
    )
      ? 10
      : 1;

    let valueExpr;
    switch (category) {
      case "fgp":
        valueExpr =
          "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.fgm) * 1.0 / SUM(pg.fga) ELSE 0 END";
        break;
      case "tpp":
        valueExpr =
          "CASE WHEN SUM(pg.tpa) > 0 THEN SUM(pg.tpm) * 1.0 / SUM(pg.tpa) ELSE 0 END";
        break;
      case "ftp":
        valueExpr =
          "CASE WHEN SUM(pg.fta) > 0 THEN SUM(pg.ftm) * 1.0 / SUM(pg.fta) ELSE 0 END";
        break;
      case "min":
        valueExpr = "AVG(pg.minutes)";
        break;
      case "game_score":
        valueExpr =
          "AVG(pg.pts + 0.4*pg.fgm - 0.7*pg.fga - 0.4*(pg.fta-pg.ftm)" +
          " + 0.7*pg.off_reb + 0.3*pg.def_reb + pg.stl + 0.7*pg.ast" +
          " + 0.7*pg.blk - 0.4*pg.pf - pg.tov)";
        break;
      case "ts_pct":
        valueExpr =
          "CASE WHEN SUM(pg.fga + 0.44*pg.fta) > 0" +
          " THEN SUM(pg.pts)*0.5/(SUM(pg.fga)+0.44*SUM(pg.fta)) ELSE 0 END";
        break;
      case "tpar":
        valueExpr =
          "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.tpa) * 1.0 / SUM(pg.fga) ELSE 0 END";
        break;
      case "ftr":
        valueExpr =
          "CASE WHEN SUM(pg.fga) > 0 THEN SUM(pg.fta) * 1.0 / SUM(pg.fga) ELSE 0 END";
        break;
      case "pir":
        valueExpr =
          "AVG(pg.pts+pg.reb+pg.ast+pg.stl+pg.blk-pg.tov" +
          "-(pg.fga-pg.fgm)-(pg.fta-pg.ftm))";
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
    const isPct = ["fgp", "tpp", "ftp", "ts_pct", "tpar", "ftr"].includes(
      category,
    );

    return rows.map((d, i) => ({
      rank: i + 1,
      player_id: d.player_id,
      player_name: d.player_name,
      team_name: d.team_name,
      team_id: d.team_id,
      gp: d.gp,
      value: isPct
        ? Math.round(d.value * 1000) / 1000
        : Math.round(d.value * 10) / 10,
    }));
  }

  /**
   * Get leaders for all major categories
   * Replaces: GET /api/leaders/all
   */
  function getLeadersAll(seasonId, limit = 5) {
    const categories = [
      "pts",
      "reb",
      "ast",
      "stl",
      "blk",
      "game_score",
      "ts_pct",
      "pir",
      "tpar",
      "ftr",
      "per",
      "ows",
      "dws",
      "ws",
      "ws_40",
    ];
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
      [pattern, limit],
    );

    const teams = query(
      `SELECT id, name, short_name FROM teams
       WHERE name LIKE ? OR short_name LIKE ? LIMIT ?`,
      [pattern, pattern, limit],
    );

    return { players, teams };
  }

  // =============================================================================
  // Schedule Functions
  // =============================================================================

  /**
   * Get upcoming games (games with NULL scores or future dates)
   */
  function getUpcomingGames(seasonId, teamId = null, limit = 20) {
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
        AND (g.home_score IS NULL OR g.away_score IS NULL)
    `;
    const params = [seasonId];

    if (teamId) {
      sql += " AND (g.home_team_id = ? OR g.away_team_id = ?)";
      params.push(teamId, teamId);
    }

    sql += " ORDER BY g.game_date ASC LIMIT ?";
    params.push(limit);

    return query(sql, params);
  }

  /**
   * Get recent completed games
   */
  function getRecentGames(seasonId, teamId = null, limit = 10) {
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
        AND g.home_score IS NOT NULL
        AND g.away_score IS NOT NULL
    `;
    const params = [seasonId];

    if (teamId) {
      sql += " AND (g.home_team_id = ? OR g.away_team_id = ?)";
      params.push(teamId, teamId);
    }

    sql += " ORDER BY g.game_date DESC LIMIT ?";
    params.push(limit);

    return query(sql, params);
  }

  /**
   * Get next game (closest upcoming game)
   */
  function getNextGame(seasonId, teamId = null) {
    const games = getUpcomingGames(seasonId, teamId, 1);
    return games.length > 0 ? games[0] : null;
  }

  // =============================================================================
  // Court Margin Calculation
  // =============================================================================

  /**
   * Calculate court margin for a player
   * Court margin = weighted score differential based on playing time
   * Formula: (teamScore - oppScore) * (minutes / 40) per game, averaged
   */
  function getPlayerCourtMargin(playerId, seasonId = null) {
    let sql = `
      SELECT
        pg.minutes,
        g.home_team_id,
        g.away_team_id,
        g.home_score,
        g.away_score,
        pg.team_id
      FROM player_games pg
      JOIN games g ON pg.game_id = g.id
      WHERE pg.player_id = ?
        AND g.home_score IS NOT NULL
        AND g.away_score IS NOT NULL
    `;
    const params = [playerId];

    if (seasonId) {
      sql += " AND g.season_id = ?";
      params.push(seasonId);
    }

    const rows = query(sql, params);

    if (rows.length === 0) return null;

    let totalMargin = 0;
    for (const row of rows) {
      const isHome = row.team_id === row.home_team_id;
      const teamScore = isHome ? row.home_score : row.away_score;
      const oppScore = isHome ? row.away_score : row.home_score;
      const playTimeRatio = Math.min(row.minutes / 40, 1); // cap at 1
      const gameMargin = (teamScore - oppScore) * playTimeRatio;
      totalMargin += gameMargin;
    }

    return Math.round((totalMargin / rows.length) * 10) / 10;
  }

  /**
   * Get court margin for multiple players (for comparison)
   */
  function getPlayersCourtMargin(playerIds, seasonId) {
    const result = {};
    for (const id of playerIds) {
      result[id] = getPlayerCourtMargin(id, seasonId);
    }
    return result;
  }

  // =============================================================================
  // Game Predictions (read from database - saved during ingest)
  // =============================================================================

  /**
   * Get predictions for a game from database
   * @param {string} gameId - Game ID
   * @returns {Object} - { players: [...], team: {...} }
   */
  function getGamePredictions(gameId) {
    // Get player predictions
    const players = query(
      `SELECT gp.*, p.name as player_name, t.name as team_name, t.short_name
       FROM game_predictions gp
       JOIN players p ON gp.player_id = p.id
       JOIN teams t ON gp.team_id = t.id
       WHERE gp.game_id = ?
       ORDER BY gp.is_starter DESC, gp.predicted_pts DESC`,
      [gameId],
    );

    // Get team prediction
    const teamRows = query(
      "SELECT * FROM game_team_predictions WHERE game_id = ?",
      [gameId],
    );

    return {
      players: players,
      team: teamRows.length > 0 ? teamRows[0] : null,
    };
  }

  /**
   * Check if predictions exist for a game
   * @param {string} gameId - Game ID
   * @returns {boolean}
   */
  function hasGamePredictions(gameId) {
    const rows = query(
      "SELECT COUNT(*) as cnt FROM game_predictions WHERE game_id = ?",
      [gameId],
    );
    return rows.length > 0 && rows[0].cnt > 0;
  }

  // =============================================================================
  // Additional data query functions
  // =============================================================================

  /**
   * Get play-by-play events for a game
   * @param {string} gameId - Game ID
   * @returns {Array} List of PBP events ordered by event_order
   */
  function getPlayByPlay(gameId) {
    return detailQuery(
      "SELECT * FROM play_by_play WHERE game_id = ? ORDER BY event_order",
      [gameId],
    );
  }

  /**
   * Get shot chart data for a game
   * @param {string} gameId - Game ID
   * @param {string} [playerId] - Optional player filter
   * @returns {Array} List of shot records
   */
  function getShotChart(gameId, playerId) {
    if (playerId) {
      return detailQuery(
        `SELECT * FROM shot_charts
         WHERE game_id = ? AND player_id = ?
         ORDER BY quarter, game_minute, game_second`,
        [gameId, playerId],
      );
    }
    return detailQuery(
      `SELECT * FROM shot_charts
       WHERE game_id = ?
       ORDER BY quarter, game_minute, game_second`,
      [gameId],
    );
  }

  /**
   * Get shot chart data for a player (optionally by season)
   * @param {string} playerId - Player ID
   * @param {string|null} [seasonId] - Optional season filter
   * @returns {Array} List of shot records with game context
   */
  function getPlayerShotChart(playerId, seasonId = null) {
    // Get raw shots from detail DB, enrich from core
    // Note: detail DB has no games table, so season filter uses core DB game IDs
    let rawShots;
    if (seasonId) {
      const seasonGames = query("SELECT id FROM games WHERE season_id = ?", [
        seasonId,
      ]);
      if (seasonGames.length === 0) return [];
      const ids = seasonGames.map((g) => g.id);
      const ph = ids.map(() => "?").join(",");
      rawShots = detailQuery(
        `SELECT * FROM shot_charts WHERE player_id = ? AND game_id IN (${ph})`,
        [playerId, ...ids],
      );
    } else {
      rawShots = detailQuery("SELECT * FROM shot_charts WHERE player_id = ?", [
        playerId,
      ]);
    }
    if (rawShots.length === 0) return rawShots;

    // Build game info lookup from core DB
    const gameIds = [...new Set(rawShots.map((s) => s.game_id))];
    const placeholders = gameIds.map(() => "?").join(",");
    const gameRows = query(
      `SELECT g.id, g.game_date, g.home_team_id, g.away_team_id,
              ht.name as home_name, at.name as away_name
       FROM games g
       LEFT JOIN teams ht ON ht.id = g.home_team_id
       LEFT JOIN teams at ON at.id = g.away_team_id
       WHERE g.id IN (${placeholders})`,
      gameIds,
    );
    const gameMap = {};
    for (const g of gameRows) gameMap[g.id] = g;

    return rawShots.map((sc) => {
      const g = gameMap[sc.game_id] || {};
      return {
        ...sc,
        game_date: g.game_date || null,
        opponent_name:
          sc.team_id === g.home_team_id ? g.away_name : g.home_name || null,
      };
    });
  }

  /**
   * Get team category stats for a season
   * @param {string} seasonId - Season code
   * @param {string} [category] - Optional category filter
   * @returns {Array} List of team category stats
   */
  function getTeamCategoryStats(seasonId, category) {
    if (category) {
      return query(
        `SELECT tcs.*, t.name as team_name, t.short_name
         FROM team_category_stats tcs
         JOIN teams t ON tcs.team_id = t.id
         WHERE tcs.season_id = ? AND tcs.category = ?
         ORDER BY tcs.rank`,
        [seasonId, category],
      );
    }
    return query(
      `SELECT tcs.*, t.name as team_name, t.short_name
       FROM team_category_stats tcs
       JOIN teams t ON tcs.team_id = t.id
       WHERE tcs.season_id = ?
       ORDER BY tcs.category, tcs.rank`,
      [seasonId],
    );
  }

  /**
   * Get head-to-head records for a season
   * @param {string} seasonId - Season code
   * @param {string} [team1Id] - Optional team1 filter
   * @param {string} [team2Id] - Optional team2 filter
   * @returns {Array} List of H2H records
   */
  function getHeadToHead(seasonId, team1Id, team2Id) {
    if (team1Id && team2Id) {
      return query(
        `SELECT * FROM head_to_head
         WHERE season_id = ? AND (
           (team1_id = ? AND team2_id = ?) OR
           (team1_id = ? AND team2_id = ?)
         )
         ORDER BY game_date`,
        [seasonId, team1Id, team2Id, team2Id, team1Id],
      );
    }
    return query(
      `SELECT * FROM head_to_head
       WHERE season_id = ?
       ORDER BY team1_id, team2_id, game_date`,
      [seasonId],
    );
  }

  /**
   * Get game MVP records for a season
   * @param {string} seasonId - Season code
   * @returns {Array} List of MVP records with player info
   */
  function getGameMVP(seasonId) {
    return query(
      `SELECT gm.*, p.name as player_name, t.name as team_name
       FROM game_mvp gm
       LEFT JOIN players p ON gm.player_id = p.id
       LEFT JOIN teams t ON gm.team_id = t.id
       WHERE gm.season_id = ?
       ORDER BY gm.game_date DESC, gm.rank`,
      [seasonId],
    );
  }

  /**
   * Get quarter scores and venue for a game
   * @param {string} gameId - Game ID
   * @returns {Object|null} Quarter scores and venue, or null if not found
   */
  function getGameQuarterScores(gameId) {
    const rows = query(
      `SELECT home_q1, home_q2, home_q3, home_q4, home_ot,
              away_q1, away_q2, away_q3, away_q4, away_ot, venue
       FROM games WHERE id = ?`,
      [gameId],
    );
    return rows.length > 0 ? rows[0] : null;
  }

  // =============================================================================
  // Public API
  // =============================================================================

  return {
    // Initialization
    initDatabase,
    initDetailDatabase,
    isReady,
    isDetailReady,

    // Constants
    SEASON_CODES,

    // API replacement functions
    getPlayers,
    getPlayerDetail,
    getPlayerGamelog,
    getPlayerComparison,
    getTeams,
    getTeamDetail,
    getTeamRoster,
    getStandings,
    getGames,
    getGameBoxscore,
    getSeasons,
    getLeaders,
    getLeadersAll,
    search,
    getPlayerCourtMargin,
    getPlayersCourtMargin,
    getUpcomingGames,
    getRecentGames,
    getNextGame,
    getGamePredictions,
    hasGamePredictions,

    // Additional data
    getPlayByPlay,
    getShotChart,
    getPlayerShotChart,
    getTeamCategoryStats,
    getHeadToHead,
    getGameMVP,
    getGameQuarterScores,

    // Prediction helpers
    getTeamSeasonStats,

    // Test hooks (pure helpers only)
    __test: {
      estimatePossessions,
      computePER,
      calculateAdvancedStats,
      computeWinShares,
    },
  };
})();

// Export for module systems
if (typeof module !== "undefined" && module.exports) {
  module.exports = WKBLDatabase;
}
