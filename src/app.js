import {
  buildThreePointGeometry,
  reconcileShotTeams,
  buildPlayerSelectOptions,
  getCourtArcRadii,
  getCourtAspectRatio,
  buildZoneTableRows,
  getShotChartScaleBounds,
  buildShotChartExportName,
  buildQuarterSelectOptions,
  buildPlayerShotZoneOptions,
  buildPredictionCompareState,
  buildQuarterSeries,
  buildStandingsChartSeries,
  buildZoneSeries,
  calculatePrediction,
  filterGameShots,
  filterPlayers,
  getQuarterLabel,
  normalizeGameShots,
  normalizePlayerShots,
  renderBoxscoreRows,
  sortBoxscorePlayers,
  renderCareerSummary,
  renderCompareCards,
  renderCompareSelected,
  renderCompareSuggestions,
  renderGamesList,
  renderLeadersGrid,
  renderLineupPlayers,
  renderNextGameHighlight,
  renderPlayerAdvancedStats,
  renderPlayerGameLogTable,
  renderPlayerSeasonTable,
  renderPlayerSummaryCard,
  renderPlayersTable,
  renderPredictCards,
  renderPredictFactors,
  renderPredictPlayerInfo,
  renderPredictSuggestions,
  renderRecentResults,
  renderStandingsTable,
  renderTeamRecentGames,
  renderTeamRoster,
  renderTeamStats,
  renderTotalStats,
  renderUpcomingGames,
  sortPlayers,
  filterPlayerShots,
  sortStandings,
  summarizeGameShots,
} from "./views/index.js";
import { createDataClient } from "./data/client.js";
import {
  getRouteFromHash,
  isNavLinkActive,
  mountCompareEvents,
  mountGlobalSearchEvents,
  mountPlayersTableSortEvents,
  mountPredictEvents,
  mountResponsiveNav,
  resolveRouteTarget,
} from "./ui/index.js";
import { hideSkeleton } from "./ui/skeleton.js";

(function () {
  "use strict";

  // =============================================================================
  // Configuration
  // =============================================================================

  const SHARED = window.WKBLShared;
  if (!SHARED || !SHARED.SEASON_CODES || !SHARED.DEFAULT_SEASON) {
    throw new Error("WKBLShared season config is required");
  }

  const CONFIG = {
    dataPath: "./data/wkbl-active.json",
    debounceDelay: 150,
    defaultSeason: SHARED.DEFAULT_SEASON,
  };

  const SEASONS = SHARED.SEASON_CODES;

  const LEADER_CATEGORIES = [
    { key: "pts", label: "득점", unit: "PPG" },
    { key: "reb", label: "리바운드", unit: "RPG" },
    { key: "ast", label: "어시스트", unit: "APG" },
    { key: "stl", label: "스틸", unit: "SPG" },
    { key: "blk", label: "블록", unit: "BPG" },
    { key: "game_score", label: "GmSc", unit: "per game" },
    { key: "ts_pct", label: "TS%", unit: "" },
    { key: "pir", label: "PIR", unit: "per game" },
    { key: "per", label: "PER", unit: "" },
    { key: "ws", label: "WS", unit: "" },
  ];

  // =============================================================================
  // State
  // =============================================================================

  const state = {
    currentView: "home",
    currentSeason: CONFIG.defaultSeason,
    players: [],
    filtered: [],
    sort: { key: "pts", dir: "desc" },
    dbInitialized: false,
    playersTab: "basic",
    currentSortedPlayers: [],
    // Compare page state
    compareSelectedPlayers: [],
    compareSearchResults: [],
    standings: [],
    standingsSort: { key: "rank", dir: "asc" },
  };

  let unmountResponsiveNav = null;
  let unmountCompareEvents = null;
  let unmountPredictEvents = null;
  let unmountGlobalSearchEvents = null;
  let unmountPlayersSortEvents = null;
  let unmountBoxscoreSortEvents = null;
  let unmountPlayerShotFilters = null;

  // =============================================================================
  // Utility Functions
  // =============================================================================

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatPct(value) {
    if (value === null || value === undefined) return "-";
    const pct = value < 1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }

  function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined) return "-";
    return Number(value).toFixed(decimals);
  }

  function formatSigned(value, decimals = 1) {
    if (value === null || value === undefined) return "-";
    const sign = value >= 0 ? "+" : "";
    return sign + Number(value).toFixed(decimals);
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function calculateAge(birthDateStr) {
    if (!birthDateStr) return null;
    const birth = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      age--;
    }
    return age;
  }

  function $(id) {
    return document.getElementById(id);
  }

  // =============================================================================
  // API Functions
  // =============================================================================

  /**
   * Initialize the local database (sql.js)
   */
  async function initLocalDb() {
    if (state.dbInitialized) return true;
    if (typeof WKBLDatabase === "undefined") {
      console.warn("WKBLDatabase not available");
      return false;
    }
    try {
      await WKBLDatabase.initDatabase();
      state.dbInitialized = true;
      console.log("[app.js] Local database initialized");
      return true;
    } catch (e) {
      console.warn("[app.js] Local database init failed:", e.message);
      return false;
    }
  }

  const dataClient = createDataClient({
    initDb: initLocalDb,
    getDb: () =>
      state.dbInitialized && typeof WKBLDatabase !== "undefined"
        ? WKBLDatabase
        : null,
    getSeasonLabel: (season) => SEASONS[season] || season,
  });

  async function fetchPlayers(season) {
    const dbRows = await dataClient.getPlayers({
      season,
      defaultSeason: CONFIG.defaultSeason,
    });
    if (dbRows.length > 0 || state.dbInitialized) return dbRows;

    const res = await fetch(CONFIG.dataPath);
    if (!res.ok) throw new Error("Data not found");
    const data = await res.json();
    return data.players;
  }

  async function fetchPlayerDetail(playerId) {
    return dataClient.getPlayerDetail(playerId);
  }

  async function fetchPlayerGamelog(playerId) {
    return dataClient.getPlayerGamelog(playerId);
  }

  async function fetchPlayerShotChart(playerId, seasonId = null) {
    return dataClient.getPlayerShotChart(playerId, seasonId);
  }

  async function fetchTeams() {
    return dataClient.getTeams();
  }

  async function fetchStandings(season) {
    return dataClient.getStandings(season);
  }

  async function fetchTeamDetail(teamId, season) {
    return dataClient.getTeamDetail(teamId, season);
  }

  async function fetchGames(season) {
    return dataClient.getGames(season);
  }

  async function fetchGameBoxscore(gameId) {
    return dataClient.getGameBoxscore(gameId);
  }

  async function fetchGameShotChart(gameId, playerId = null) {
    return dataClient.getGameShotChart(gameId, playerId);
  }

  async function fetchLeaders(season, category, limit = 10) {
    return dataClient.getLeaders(season, category, limit);
  }

  async function fetchAllLeaders(season) {
    return dataClient.getLeadersAll(season);
  }

  async function fetchSearch(query, limit = 10) {
    return dataClient.search(query, limit);
  }

  async function fetchComparePlayers(playerIds, season) {
    return dataClient.getPlayerComparison(playerIds, season);
  }

  // =============================================================================
  // Router
  // =============================================================================

  function getRoute() {
    return getRouteFromHash(window.location.hash);
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function updateNavLinks() {
    const { path } = getRoute();
    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href");
      link.classList.toggle("active", isNavLinkActive(href, path));
    });
  }

  function showView(viewId) {
    document.querySelectorAll(".view").forEach((view) => {
      view.style.display = view.id === `view-${viewId}` ? "block" : "none";
    });
    state.currentView = viewId;
  }

  async function handleRoute() {
    const { path, id } = getRoute();
    // Route decision is delegated to pure logic for testability.
    const target = resolveRouteTarget(path, id);
    updateNavLinks();
    const mainNav = $("mainNav");
    const navToggle = $("navToggle");
    if (mainNav && mainNav.classList.contains("open")) {
      mainNav.classList.remove("open");
      if (navToggle) navToggle.setAttribute("aria-expanded", "false");
    }

    try {
      showView(target.view);
      switch (target.action) {
        case "loadMainPage":
          await loadMainPage();
          break;
        case "loadPlayersPage":
          await loadPlayersPage();
          break;
        case "loadPlayerPage":
          await loadPlayerPage(id);
          break;
        case "loadTeamsPage":
          await loadTeamsPage();
          break;
        case "loadTeamPage":
          await loadTeamPage(id);
          break;
        case "loadGamesPage":
          await loadGamesPage();
          break;
        case "loadGamePage":
          await loadGamePage(id);
          break;
        case "loadLeadersPage":
          await loadLeadersPage();
          break;
        case "loadComparePage":
          await loadComparePage();
          break;
        case "loadSchedulePage":
          await loadSchedulePage();
          break;
        case "loadPredictPage":
          await loadPredictPage();
          break;
        default:
          await loadMainPage();
      }
    } catch (error) {
      console.error("Route error:", error);
    }
  }

  // =============================================================================
  // Main Home Page (Game Prediction)
  // =============================================================================

  async function loadMainPage() {
    // Initialize database first
    await initLocalDb();

    let nextGame =
      state.dbInitialized && typeof WKBLDatabase !== "undefined"
        ? WKBLDatabase.getNextGame(state.currentSeason)
        : null;

    const mainGameCard = $("mainGameCard");
    const mainNoGame = $("mainNoGame");
    const mainLineupGrid = $("mainLineupGrid");

    // If no upcoming game, get most recent game and show as "recent matchup preview"
    let isRecentGame = false;
    if (
      !nextGame &&
      state.dbInitialized &&
      typeof WKBLDatabase !== "undefined"
    ) {
      const recentGames = WKBLDatabase.getRecentGames(
        state.currentSeason,
        null,
        1,
      );
      if (recentGames.length > 0) {
        nextGame = recentGames[0];
        isRecentGame = true;
      }
    }

    if (!nextGame) {
      mainGameCard.style.display = "none";
      mainLineupGrid.style.display = "none";
      mainNoGame.style.display = "block";
      $("predictionExplanation").style.display = "none";
      $("mainPredictionDate").textContent = "";
      return;
    }

    // Show game card
    mainNoGame.style.display = "none";
    mainGameCard.style.display = "block";
    mainLineupGrid.style.display = "grid";
    $("predictionExplanation").style.display = "block";

    // Get team standings for records
    const standings =
      state.dbInitialized && typeof WKBLDatabase !== "undefined"
        ? WKBLDatabase.getStandings(state.currentSeason)
        : [];
    const standingsMap = new Map(standings.map((s) => [s.team_id, s]));

    // Populate game card
    const homeStanding = standingsMap.get(nextGame.home_team_id);
    const awayStanding = standingsMap.get(nextGame.away_team_id);

    $("mainHomeTeam").querySelector(".team-name").textContent =
      nextGame.home_team_short || nextGame.home_team_name;
    $("mainHomeTeam").querySelector(".team-record").textContent = homeStanding
      ? `${homeStanding.wins}승 ${homeStanding.losses}패`
      : "-";

    $("mainAwayTeam").querySelector(".team-name").textContent =
      nextGame.away_team_short || nextGame.away_team_name;
    $("mainAwayTeam").querySelector(".team-record").textContent = awayStanding
      ? `${awayStanding.wins}승 ${awayStanding.losses}패`
      : "-";

    // Calculate D-day or show result for recent game
    const gameDate = new Date(nextGame.game_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    gameDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((gameDate - today) / (1000 * 60 * 60 * 24));

    if (isRecentGame) {
      // Show score for recent game
      const score = `${nextGame.away_score || 0} - ${nextGame.home_score || 0}`;
      $("mainCountdown").textContent = score;
      $("mainPredictionTitle").textContent = "최근 경기 분석";
      $("mainPredictionDate").textContent =
        formatFullDate(nextGame.game_date) + " 경기 결과";
    } else {
      $("mainCountdown").textContent =
        diffDays === 0 ? "TODAY" : `D-${diffDays}`;
      $("mainPredictionTitle").textContent = "다음 경기 예측";
      $("mainPredictionDate").textContent =
        formatFullDate(nextGame.game_date) + " 경기";
    }

    // Format game time
    $("mainGameTime").textContent = formatFullDate(nextGame.game_date);

    // Get rosters and generate lineups
    try {
      const homeRoster = await getTeamRoster(nextGame.home_team_id);
      const awayRoster = await getTeamRoster(nextGame.away_team_id);

      console.log("Home roster:", homeRoster.length, "players");
      console.log("Away roster:", awayRoster.length, "players");

      // Build recent games map for lineup minutes filtering
      const homeRecentMap = {};
      const awayRecentMap = {};
      if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
        for (const p of homeRoster.slice(0, 10)) {
          homeRecentMap[p.id] = WKBLDatabase.getPlayerGamelog(
            p.id,
            state.currentSeason,
            10,
          );
        }
        for (const p of awayRoster.slice(0, 10)) {
          awayRecentMap[p.id] = WKBLDatabase.getPlayerGamelog(
            p.id,
            state.currentSeason,
            10,
          );
        }
      }

      const homeLineup = generateOptimalLineup(homeRoster, homeRecentMap);
      const awayLineup = generateOptimalLineup(awayRoster, awayRecentMap);

      console.log("Home lineup:", homeLineup.length, "players");
      console.log("Away lineup:", awayLineup.length, "players");

      if (homeLineup.length === 0 && awayLineup.length === 0) {
        console.warn("No lineup data available");
        mainLineupGrid.style.display = "none";
        $("predictionExplanation").style.display = "none";
        return;
      }

      // Build opponent context for defensive adjustments
      let homeOppCtx = null;
      let awayOppCtx = null;
      let winCtx = {};
      if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
        const teamStats = WKBLDatabase.getTeamSeasonStats(state.currentSeason);
        // Build opponent defense factors
        const buildOppCtx = (oppTeamId) => {
          const oppStats = teamStats.get(oppTeamId);
          if (!oppStats) return null;
          // Use opponent's allowed stats vs league avg
          const allTeams = [...teamStats.values()];
          const ctx = {};
          for (const stat of ["pts", "reb", "ast", "stl", "blk"]) {
            const oppKey = "opp_" + stat;
            const teamKey = "team_" + stat;
            const oppVal = oppStats[oppKey] || oppStats[teamKey] || 0;
            const lgTotal = allTeams.reduce(
              (s, t) => s + (t[oppKey] || t[teamKey] || 0),
              0,
            );
            const lgAvg = lgTotal / allTeams.length;
            ctx[stat + "_factor"] = lgAvg > 0 ? oppVal / lgAvg : 1.0;
          }
          return ctx;
        };
        homeOppCtx = buildOppCtx(nextGame.away_team_id);
        awayOppCtx = buildOppCtx(nextGame.home_team_id);

        // Build win probability context
        const homeTs = teamStats.get(nextGame.home_team_id);
        const awayTs = teamStats.get(nextGame.away_team_id);
        if (homeTs && awayTs) {
          const calcNetRtg = (ts) => {
            const tPoss = _estimatePossessions(
              ts.team_fga || 0,
              ts.team_fta || 0,
              ts.team_tov || 0,
              ts.team_oreb || 0,
            );
            const oPoss = _estimatePossessions(
              ts.opp_fga || 0,
              ts.opp_fta || 0,
              ts.opp_tov || 0,
              ts.opp_oreb || 0,
            );
            if (tPoss > 0 && oPoss > 0) {
              return (
                ((ts.team_pts || 0) / tPoss) * 100 -
                ((ts.opp_pts || 0) / oPoss) * 100
              );
            }
            return undefined;
          };
          winCtx.homeNetRtg = calcNetRtg(homeTs);
          winCtx.awayNetRtg = calcNetRtg(awayTs);
        }

        // H2H
        const h2h = WKBLDatabase.getHeadToHead(
          state.currentSeason,
          nextGame.home_team_id,
          nextGame.away_team_id,
        );
        if (h2h && h2h.length > 0) {
          const homeWins = h2h.filter(
            (g) => g.winner_id === nextGame.home_team_id,
          ).length;
          winCtx.h2hFactor = homeWins / h2h.length;
        }
      }

      // Calculate predictions for each player
      const homePredictions = await Promise.all(
        homeLineup.map((p) => getPlayerPrediction(p, true, homeOppCtx)),
      );
      const awayPredictions = await Promise.all(
        awayLineup.map((p) => getPlayerPrediction(p, false, awayOppCtx)),
      );

      // Calculate win probability
      const winProb = calculateWinProbability(
        homePredictions,
        awayPredictions,
        homeStanding,
        awayStanding,
        winCtx,
      );
      const homeWinProb = winProb.home;
      const awayWinProb = winProb.away;

      // Render lineups
      $("homeLineupTitle").textContent =
        `${nextGame.home_team_short || nextGame.home_team_name} 추천 라인업 (홈)`;
      $("awayLineupTitle").textContent =
        `${nextGame.away_team_short || nextGame.away_team_name} 추천 라인업 (원정)`;

      $("homeWinProb").textContent = homeWinProb + "%";
      $("awayWinProb").textContent = awayWinProb + "%";
      $("homeWinProb").className =
        `prob-value ${homeWinProb >= 50 ? "prob-high" : "prob-low"}`;
      $("awayWinProb").className =
        `prob-value ${awayWinProb >= 50 ? "prob-high" : "prob-low"}`;

      renderLineupPlayers({
        container: $("homeLineupPlayers"),
        lineup: homeLineup,
        predictions: homePredictions,
        formatNumber,
      });
      renderLineupPlayers({
        container: $("awayLineupPlayers"),
        lineup: awayLineup,
        predictions: awayPredictions,
        formatNumber,
      });

      // Render total stats
      renderTotalStats({
        container: $("homeTotalStats"),
        predictions: homePredictions,
        formatNumber,
      });
      renderTotalStats({
        container: $("awayTotalStats"),
        predictions: awayPredictions,
        formatNumber,
      });

      // Note: Predictions are saved to DB during ingest (tools/ingest_wkbl.py)
      // and read from DB in loadGamePage for comparison with actual results
    } catch (error) {
      console.error("Error generating lineup predictions:", error);
      mainLineupGrid.style.display = "none";
      $("predictionExplanation").style.display = "none";
    }
  }

  async function getTeamRoster(teamId) {
    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      const players = WKBLDatabase.getTeamRoster(teamId, state.currentSeason);
      return players.filter((p) => p.gp > 0); // Only players with game time
    }
    return [];
  }

  function generateOptimalLineup(roster, recentGamesMap) {
    if (!roster || roster.length === 0) return [];

    // Filter by recent minutes: exclude players averaging < 15 min
    let eligible = roster;
    if (recentGamesMap) {
      const filtered = roster.filter((p) => {
        const recent = recentGamesMap[p.id];
        if (!recent || recent.length === 0) return true; // No data → include
        const games = recent.slice(0, 5);
        const avgMin =
          games.reduce((sum, g) => sum + (g.minutes || 0), 0) / games.length;
        return avgMin >= 15;
      });
      if (filtered.length >= 5) eligible = filtered;
    }

    // Sort by Game Score (fall back to PIR)
    const sorted = [...eligible].sort((a, b) => {
      const aScore = a.game_score != null ? a.game_score : a.pir || 0;
      const bScore = b.game_score != null ? b.game_score : b.pir || 0;
      return bScore - aScore;
    });

    // Select optimal 5: try to get position diversity
    const lineup = [];
    const positions = { G: 0, F: 0, C: 0 };
    const positionLimits = { G: 2, F: 2, C: 1 };

    // First pass: select by position
    for (const player of sorted) {
      if (lineup.length >= 5) break;
      const pos = player.pos || "F";
      const mainPos = pos.charAt(0);

      if (positions[mainPos] < positionLimits[mainPos]) {
        lineup.push(player);
        positions[mainPos]++;
      }
    }

    // Second pass: fill remaining spots with best available
    for (const player of sorted) {
      if (lineup.length >= 5) break;
      if (!lineup.find((p) => p.id === player.id)) {
        lineup.push(player);
      }
    }

    return lineup.slice(0, 5);
  }

  function _calcGameScore(g) {
    return (
      (g.pts || 0) +
      0.4 * (g.fgm || 0) -
      0.7 * (g.fga || 0) -
      0.4 * ((g.fta || 0) - (g.ftm || 0)) +
      0.7 * (g.off_reb || 0) +
      0.3 * (g.def_reb || 0) +
      (g.stl || 0) +
      0.7 * (g.ast || 0) +
      0.7 * (g.blk || 0) -
      0.4 * (g.pf || 0) -
      (g.tov || 0)
    );
  }

  function _gsWeightedAvg(games, stat) {
    if (!games.length) return 0;
    let totalW = 0,
      totalV = 0;
    for (const g of games) {
      const w = Math.max(0.1, _calcGameScore(g));
      totalW += w;
      totalV += (g[stat] || 0) * w;
    }
    return totalW > 0 ? totalV / totalW : 0;
  }

  async function getPlayerPrediction(player, isHome, oppContext) {
    // Get recent games for prediction
    let recentGames = [];
    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      recentGames = WKBLDatabase.getPlayerGamelog(
        player.id,
        state.currentSeason,
        10,
      );
    }

    const stats = ["pts", "reb", "ast", "stl", "blk"];
    const prediction = { player };
    for (const s of stats) {
      prediction[s] = { pred: 0, low: 0, high: 0 };
    }

    if (recentGames.length === 0) {
      for (const s of stats) {
        prediction[s].pred = player[s] || 0;
      }
      return prediction;
    }

    // Minutes stability (CV)
    const minVals = recentGames.slice(0, 5).map((g) => g.minutes || 0);
    const minAvg = minVals.reduce((a, b) => a + b, 0) / minVals.length;
    let cv = 0;
    if (minAvg > 0 && minVals.length > 1) {
      const minVar =
        minVals.reduce((acc, v) => acc + Math.pow(v - minAvg, 2), 0) /
        minVals.length;
      cv = Math.sqrt(minVar) / minAvg;
    }

    stats.forEach((stat) => {
      const recent5 = recentGames.slice(0, 5);
      const recent10 = recentGames.slice(0, 10);

      // Game Score weighted averages
      const avg5 = _gsWeightedAvg(recent5, stat);
      const avg10 = _gsWeightedAvg(recent10, stat);

      let basePred = avg5 * 0.6 + avg10 * 0.4;

      // Home/away
      if (isHome) basePred *= 1.05;
      else basePred *= 0.97;

      // Trend bonus
      const seasonAvg = player[stat] || 0;
      if (seasonAvg > 0) {
        if (avg5 > seasonAvg * 1.1) basePred *= 1.05;
        else if (avg5 < seasonAvg * 0.9) basePred *= 0.95;
      }

      // Opponent defensive adjustment
      if (oppContext) {
        const factor = oppContext[stat + "_factor"] || 1.0;
        basePred *= 1.0 + (factor - 1.0) * 0.15;
      }

      // Standard deviation
      const values = recentGames.map((g) => g[stat] || 0);
      const plainAvg = values.reduce((a, b) => a + b, 0) / values.length;
      let stdDev =
        values.length > 1
          ? Math.sqrt(
              values.reduce((acc, v) => acc + Math.pow(v - plainAvg, 2), 0) /
                values.length,
            ) || basePred * 0.15
          : basePred * 0.15;

      // Widen for unstable minutes
      if (cv > 0.3) stdDev *= 1.0 + (cv - 0.3);

      prediction[stat] = {
        pred: basePred,
        low: Math.max(0, basePred - stdDev),
        high: basePred + stdDev,
      };
    });

    return prediction;
  }

  function _normalizeRating(rating, center = 0, scale = 10) {
    return 1 / (1 + Math.exp(-(rating - center) / scale));
  }

  function _parseLast5(last5Str) {
    if (!last5Str || !last5Str.includes("-")) return 0.5;
    const parts = last5Str.split("-");
    const total = parseInt(parts[0]) + parseInt(parts[1]);
    return total > 0 ? parseInt(parts[0]) / total : 0.5;
  }

  function _estimatePossessions(fga, fta, tov, oreb) {
    return fga + 0.44 * fta + tov - oreb;
  }

  function calculateWinProbability(
    homePreds,
    awayPreds,
    homeStanding,
    awayStanding,
    winCtx,
  ) {
    const ctx = winCtx || {};

    // 1. Predicted stats strength (25%)
    const statStr = (preds) =>
      preds.reduce(
        (acc, p) =>
          acc +
          (p.pts.pred || 0) +
          (p.reb.pred || 0) * 0.5 +
          (p.ast.pred || 0) * 0.7,
        0,
      );
    const homeStr = statStr(homePreds);
    const awayStr = statStr(awayPreds);
    const totalStr = homeStr + awayStr;
    const homeStatScore = totalStr > 0 ? homeStr / totalStr : 0.5;
    const awayStatScore = totalStr > 0 ? awayStr / totalStr : 0.5;

    // 2. Net Rating (35%)
    const hasNetRtg =
      ctx.homeNetRtg !== undefined && ctx.awayNetRtg !== undefined;
    const homeRtgScore = hasNetRtg ? _normalizeRating(ctx.homeNetRtg) : 0.5;
    const awayRtgScore = hasNetRtg ? _normalizeRating(ctx.awayNetRtg) : 0.5;

    // 3. Win percentage (15%)
    const homeWinPct = homeStanding ? homeStanding.win_pct || 0.5 : 0.5;
    const awayWinPct = awayStanding ? awayStanding.win_pct || 0.5 : 0.5;

    // 4. H2H (10%)
    const h2hFactor = ctx.h2hFactor !== undefined ? ctx.h2hFactor : 0.5;

    // 5. Momentum (10%)
    const homeMom = _parseLast5(
      ctx.homeLast5 || (homeStanding && homeStanding.last5),
    );
    const awayMom = _parseLast5(
      ctx.awayLast5 || (awayStanding && awayStanding.last5),
    );

    // 6. Home court (5%)
    let homeCourtPct = 0.5;
    if (homeStanding) {
      const hw = homeStanding.home_wins || 0;
      const hl = homeStanding.home_losses || 0;
      homeCourtPct = hw + hl > 0 ? hw / (hw + hl) : 0.5;
    }
    let awayCourtPct = 0.5;
    if (awayStanding) {
      const aw = awayStanding.away_wins || 0;
      const al = awayStanding.away_losses || 0;
      awayCourtPct = aw + al > 0 ? aw / (aw + al) : 0.5;
    }

    // Weight allocation
    const wRtg = hasNetRtg ? 0.35 : 0.0;
    const wStat = hasNetRtg ? 0.25 : 0.45;
    const wWp = hasNetRtg ? 0.15 : 0.25;
    const wH2h = 0.1;
    const wMom = 0.1;
    const wCourt = hasNetRtg ? 0.05 : 0.1;

    const homeScore =
      wRtg * homeRtgScore +
      wStat * homeStatScore +
      wWp * homeWinPct +
      wH2h * h2hFactor +
      wMom * homeMom +
      wCourt * homeCourtPct;
    const awayScore =
      wRtg * awayRtgScore +
      wStat * awayStatScore +
      wWp * awayWinPct +
      wH2h * (1 - h2hFactor) +
      wMom * awayMom +
      wCourt * awayCourtPct;

    const total = homeScore + awayScore;
    if (total > 0) {
      return {
        home: Math.round((homeScore / total) * 100),
        away: Math.round(100 - (homeScore / total) * 100),
      };
    }
    return { home: 50, away: 50 };
  }

  // =============================================================================
  // Players Page (Player List)
  // =============================================================================

  const primaryStats = [
    {
      key: "pts",
      label: "PTS",
      desc: "경기당 평균 득점. 높을수록 공격 생산성이 높습니다.",
    },
    {
      key: "reb",
      label: "REB",
      desc: "경기당 평균 리바운드. 높을수록 볼 점유 기여가 큽니다.",
    },
    {
      key: "ast",
      label: "AST",
      desc: "경기당 평균 어시스트. 높을수록 동료 득점 기여가 큽니다.",
    },
    {
      key: "stl",
      label: "STL",
      desc: "경기당 평균 스틸. 높을수록 수비 압박/턴오버 유도가 좋습니다.",
    },
    {
      key: "blk",
      label: "BLK",
      desc: "경기당 평균 블록. 높을수록 림 보호 기여가 큽니다.",
    },
    {
      key: "tov",
      label: "TOV",
      desc: "경기당 평균 턴오버. 낮을수록 안정적인 공격 운영입니다.",
    },
    {
      key: "fgp",
      label: "FG%",
      format: "pct",
      desc: "야투 성공률(2+3점). 높을수록 슛 효율이 좋습니다.",
    },
    {
      key: "tpp",
      label: "3P%",
      format: "pct",
      desc: "3점슛 성공률. 높을수록 외곽 효율이 좋습니다.",
    },
    {
      key: "ftp",
      label: "FT%",
      format: "pct",
      desc: "자유투 성공률. 높을수록 확실한 마무리 능력을 의미합니다.",
    },
  ];

  const advancedStats = [
    {
      key: "ts_pct",
      label: "TS%",
      format: "pct",
      desc: "2점·3점·자유투를 모두 반영한 종합 슈팅 효율. 높을수록 좋습니다.",
    },
    {
      key: "efg_pct",
      label: "eFG%",
      format: "pct",
      desc: "3점 가치를 반영한 야투 효율. 높을수록 좋습니다.",
    },
    {
      key: "ast_to",
      label: "AST/TO",
      format: "ratio",
      desc: "어시스트/턴오버 비율. 높을수록 실수 대비 플레이메이킹이 좋습니다.",
    },
    {
      key: "pir",
      label: "PIR",
      format: "number",
      desc: "득점·리바운드·어시스트·수비 기여를 합산한 종합 기여도. 높을수록 좋습니다.",
    },
    {
      key: "pts36",
      label: "PTS/36",
      format: "number",
      desc: "36분 기준 득점 환산값. 높을수록 득점 생산성이 높습니다.",
    },
    {
      key: "reb36",
      label: "REB/36",
      format: "number",
      desc: "36분 기준 리바운드 환산값. 높을수록 리바운드 기여가 큽니다.",
    },
    {
      key: "ast36",
      label: "AST/36",
      format: "number",
      desc: "36분 기준 어시스트 환산값. 높을수록 플레이메이킹 기여가 큽니다.",
    },
    {
      key: "court_margin",
      label: "코트마진",
      format: "signed",
      desc: "코트마진(출전 시간 가중 득실차). 시즌/커리어 맥락에서 흐름을 보는 보조 지표입니다.",
    },
  ];

  const tier2Stats = [
    {
      key: "per",
      label: "PER",
      format: "number",
      desc: "공격·수비를 종합한 효율 지표(리그 평균 약 15). 높을수록 종합 퍼포먼스가 좋습니다.",
    },
    {
      key: "game_score",
      label: "GmSc",
      format: "number",
      desc: "한 경기 영향력을 한 수치로 요약한 값. 높을수록 경기 기여가 컸습니다.",
    },
    {
      key: "usg_pct",
      label: "USG%",
      format: "number",
      desc: "공격 마무리 점유율(FGA/FTA/TOV 관여). 높을수록 공격 역할 비중이 큽니다.",
    },
    {
      key: "tov_pct",
      label: "TOV%",
      format: "number",
      desc: "공격 점유 대비 턴오버 비율. 낮을수록 좋습니다.",
    },
    {
      key: "off_rtg",
      label: "ORtg",
      format: "number",
      desc: "100포제션당 팀 득점 기여 지표. 높을수록 공격 효율이 좋습니다.",
    },
    {
      key: "def_rtg",
      label: "DRtg",
      format: "number",
      desc: "100포제션당 실점 지표. 낮을수록 수비 효율이 좋습니다.",
    },
    {
      key: "net_rtg",
      label: "NetRtg",
      format: "signed",
      desc: "공격효율-수비효율 차이. +가 클수록 팀에 유리한 영향입니다.",
    },
    {
      key: "reb_pct",
      label: "REB%",
      format: "number",
      desc: "코트 위 리바운드 점유율. 높을수록 리바운드 장악력이 좋습니다.",
    },
    {
      key: "ast_pct",
      label: "AST%",
      format: "number",
      desc: "팀 득점 슛 중 어시스트 관여 비율. 높을수록 연계 기여가 큽니다.",
    },
    {
      key: "stl_pct",
      label: "STL%",
      format: "number",
      desc: "상대 포제션에서 스틸을 만들어내는 비율. 높을수록 좋습니다.",
    },
    {
      key: "blk_pct",
      label: "BLK%",
      format: "number",
      desc: "상대 2점 시도 대비 블록 비율. 높을수록 림 보호가 좋습니다.",
    },
    {
      key: "plus_minus_per_game",
      label: "+/-/G",
      format: "signed",
      desc: "출전 시간 기준 경기당 평균 득실점 차. +일수록 팀에 유리한 결과입니다.",
    },
    {
      key: "plus_minus_per100",
      label: "+/-/100",
      format: "signed",
      desc: "100포제션당 온코트 득실점 차. 팀 템포 차이를 보정한 비교 지표입니다.",
    },
    {
      key: "ws",
      label: "WS",
      format: "number",
      desc: "팀 승리에 대한 선수 기여도를 승수 단위로 환산한 지표입니다.",
    },
  ];

  async function loadPlayersPage() {
    populateSeasonSelect($("seasonSelect"), true);

    // Set up tab click handlers
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        document
          .querySelectorAll(".tab-btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        state.playersTab = this.dataset.tab;
        renderTable(
          state.currentSortedPlayers.length > 0
            ? state.currentSortedPlayers
            : state.filtered,
        );
      });
    });

    try {
      state.players = await fetchPlayers(state.currentSeason);
      if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
        const seasonId =
          state.currentSeason === "all" ? null : state.currentSeason;
        const playerIds = state.players.map((p) => p.id);
        const margins = WKBLDatabase.getPlayersCourtMargin(playerIds, seasonId);
        state.players.forEach((p) => {
          p.court_margin = margins[p.id] ?? null;
        });
      }
      populateTeamSelect(state.players);
      applyFilters();
    } catch (error) {
      console.error("Failed to load players:", error);
      $("statsBody").innerHTML =
        `<tr><td colspan="22" style="text-align:center;color:#c00;">데이터를 불러올 수 없습니다.</td></tr>`;
    }
  }

  function populateSeasonSelect(select, includeAll = false) {
    if (!select) return;
    // Only populate options once
    if (select.options.length <= 1) {
      select.innerHTML = "";
      if (includeAll) {
        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "전체";
        select.appendChild(allOption);
      }
      Object.entries(SEASONS)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .forEach(([code, label]) => {
          const option = document.createElement("option");
          option.value = code;
          option.textContent = label;
          select.appendChild(option);
        });
      // Set default to current season (not "all")
      select.value = state.currentSeason;
    }
  }

  function populateTeamSelect(players) {
    const select = $("teamSelect");
    if (!select) return;
    const teams = [...new Set(players.map((p) => p.team))].sort();
    select.innerHTML = '<option value="all">전체</option>';
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      select.appendChild(option);
    });
  }

  function applyFilters() {
    const season = $("seasonSelect")?.value || state.currentSeason;
    const team = $("teamSelect")?.value || "all";
    const pos = $("posSelect")?.value || "all";
    const search = $("searchInput")?.value.trim().toLowerCase() || "";
    state.filtered = filterPlayers(state.players, { team, pos, search });

    sortAndRender();
  }

  function sortAndRender() {
    const { key, dir } = state.sort;
    const sorted = sortPlayers(state.filtered, { key, dir });

    renderTable(sorted);
    if (sorted[0]) renderPlayerCard(sorted[0]);
  }

  function renderTable(players) {
    const tbody = $("statsBody");
    const thead = $("statsTable")?.querySelector("thead");
    renderPlayersTable({
      tbody,
      thead,
      players,
      formatNumber,
      formatPct,
      formatSigned,
      activeTab: state.playersTab || "basic",
    });

    state.currentSortedPlayers = players;
  }

  function renderPlayerCard(player) {
    renderPlayerSummaryCard({
      player,
      getById: $,
      primaryStats,
      advancedStats,
      tier2Stats,
      formatNumber,
      formatPct,
      formatSigned,
      calculateAge,
    });
  }

  // =============================================================================
  // Player Detail Page
  // =============================================================================

  async function loadPlayerPage(playerId) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });

      // Trigger detail DB loading for player shot charts
      if (
        state.dbInitialized &&
        typeof WKBLDatabase !== "undefined" &&
        !WKBLDatabase.isDetailReady()
      ) {
        WKBLDatabase.initDetailDatabase().catch(() => {});
      }

      const player = await fetchPlayerDetail(playerId);

      $("detailPlayerName").textContent = player.name;
      $("detailPlayerTeam").textContent = player.team || "-";
      $("detailPlayerPos").textContent = player.position || "-";
      $("detailPlayerHeight").textContent = player.height || "-";

      // Birth date with age
      const birthDate = player.birth_date;
      const age = calculateAge(birthDate);
      $("detailPlayerBirth").textContent = birthDate
        ? `${birthDate}${age !== null ? ` (만 ${age}세)` : ""}`
        : "-";

      const summary = $("playerCareerSummary");
      const seasons = Object.values(player.seasons || {});
      const courtMargin =
        state.dbInitialized && typeof WKBLDatabase !== "undefined"
          ? WKBLDatabase.getPlayerCourtMargin(playerId)
          : null;
      renderCareerSummary({ summaryEl: summary, seasons, courtMargin });

      // Season stats table
      const sortedSeasons = seasons.sort((a, b) =>
        a.season_id?.localeCompare(b.season_id),
      );
      renderPlayerSeasonTable({
        tbody: $("playerSeasonBody"),
        seasons: sortedSeasons,
        formatNumber,
        formatPct,
      });

      // Trend charts
      renderPlayerTrendChart(sortedSeasons);
      renderShootingEfficiencyChart(sortedSeasons);

      // Radar chart - need current season stats and all players for comparison
      const currentSeasonStats =
        sortedSeasons.length > 0
          ? sortedSeasons[sortedSeasons.length - 1]
          : null;
      if (currentSeasonStats) {
        try {
          const allPlayers = await fetchPlayers(
            currentSeasonStats.season_id || state.currentSeason,
          );
          renderPlayerRadarChart(currentSeasonStats, allPlayers);
        } catch (e) {
          console.warn("Failed to load players for radar chart:", e);
        }
      }

      // Advanced stats section (latest season)
      const latestSeason = sortedSeasons[sortedSeasons.length - 1];
      const advSection = $("playerAdvancedSection");
      const advGrid = $("playerAdvancedGrid");
      const advTitle = $("advancedStatsTitle");
      if (latestSeason && advGrid) {
        if (advTitle) {
          const seasonLabel =
            latestSeason.season_label || latestSeason.season_id || "";
          advTitle.textContent = `${seasonLabel} 고급지표`;
        }
        renderPlayerAdvancedStats({
          container: advGrid,
          season: latestSeason,
          formatNumber,
          formatSigned,
        });
        if (advSection) advSection.style.display = "block";
      } else if (advSection) {
        advSection.style.display = "none";
      }

      // Recent game log chart
      const games = player.recent_games || [];
      renderGameLogChart(games);

      // Recent game log table
      renderPlayerGameLogTable({
        tbody: $("playerGameLogBody"),
        games,
        formatDate,
        formatNumber,
      });

      await renderPlayerShotSection(playerId, sortedSeasons);
    } catch (error) {
      console.error("Failed to load player:", error);
      $("detailPlayerName").textContent = "선수를 찾을 수 없습니다";
    }
  }

  // Player Charts
  let playerTrendChart = null;
  let playerShootingChart = null;
  let playerRadarChart = null;
  let playerGameLogChart = null;
  let playerShotScatterChart = null;
  let playerShotZoneChart = null;
  let playerShotQuarterChart = null;

  function destroyPlayerShotCharts() {
    if (playerShotScatterChart) playerShotScatterChart.destroy();
    if (playerShotZoneChart) playerShotZoneChart.destroy();
    if (playerShotQuarterChart) playerShotQuarterChart.destroy();
    playerShotScatterChart = null;
    playerShotZoneChart = null;
    playerShotQuarterChart = null;
  }

  function renderPlayerShotScatterChart(shots) {
    const canvas = $("playerShotScatterChart");
    if (!canvas || !window.Chart) return;
    if (playerShotScatterChart) playerShotScatterChart.destroy();
    ensureShotCourtOverlayPlugin();

    const made = shots.filter((shot) => shot.made);
    const missed = shots.filter((shot) => !shot.made);
    const bounds = getShotChartScaleBounds(shots);

    playerShotScatterChart = new Chart(canvas.getContext("2d"), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "성공",
            data: made.map((shot) => ({ x: shot.x, y: shot.y, shot })),
            pointRadius: 4,
            pointBackgroundColor: "rgba(16, 185, 129, 0.85)",
          },
          {
            label: "실패",
            data: missed.map((shot) => ({ x: shot.x, y: shot.y, shot })),
            pointRadius: 4,
            pointStyle: "crossRot",
            pointBackgroundColor: "rgba(239, 68, 68, 0.85)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: getCourtAspectRatio(),
        scales: {
          x: {
            min: bounds.xMin,
            max: bounds.xMax,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
          y: {
            min: bounds.yMin,
            max: bounds.yMax,
            reverse: true,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
        },
        plugins: {
          shotCourtOverlay: {
            lineColor: "rgba(27, 28, 31, 0.24)",
            lineWidth: 1.2,
          },
          tooltip: {
            callbacks: {
              label(context) {
                const shot = context.raw.shot;
                return `${shot.opponent} ${getQuarterLabel(shot.quarter)} ${shot.made ? "성공" : "실패"}`;
              },
            },
          },
        },
      },
    });
  }

  function renderPlayerShotZoneChart(shots) {
    const canvas = $("playerShotZoneChart");
    if (!canvas || !window.Chart) return;
    if (playerShotZoneChart) playerShotZoneChart.destroy();
    const zone = buildZoneSeries(shots);

    playerShotZoneChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: zone.labels,
        datasets: [
          {
            label: "시도",
            data: zone.attempts,
            backgroundColor: "rgba(59, 130, 246, 0.5)",
            yAxisID: "y",
          },
          {
            label: "FG%",
            data: zone.fgPct,
            type: "line",
            borderColor: "rgba(16, 185, 129, 0.9)",
            backgroundColor: "rgba(16, 185, 129, 0.9)",
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Attempts" } },
          y1: {
            beginAtZero: true,
            max: 100,
            position: "right",
            grid: { drawOnChartArea: false },
            title: { display: true, text: "FG%" },
          },
        },
      },
    });
  }

  function renderPlayerShotQuarterChart(shots) {
    const canvas = $("playerShotQuarterChart");
    if (!canvas || !window.Chart) return;
    if (playerShotQuarterChart) playerShotQuarterChart.destroy();
    const quarter = buildQuarterSeries(shots);
    playerShotQuarterChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: quarter.labels,
        datasets: [
          {
            label: "성공",
            data: quarter.made,
            backgroundColor: "rgba(16, 185, 129, 0.7)",
            stack: "shots",
          },
          {
            label: "실패",
            data: quarter.missed,
            backgroundColor: "rgba(239, 68, 68, 0.65)",
            stack: "shots",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  async function renderPlayerShotSection(playerId, seasons = []) {
    const section = $("playerShotSection");
    if (!section) return;

    if (unmountPlayerShotFilters) {
      unmountPlayerShotFilters();
      unmountPlayerShotFilters = null;
    }
    destroyPlayerShotCharts();

    const seasonSelect = $("playerShotSeasonSelect");
    const resultSelect = $("playerShotResultSelect");
    const quarterSelect = $("playerShotQuarterSelect");
    const zoneSelect = $("playerShotZoneSelect");
    const emptyMsg = $("playerShotEmptyMsg");
    if (
      !seasonSelect ||
      !resultSelect ||
      !quarterSelect ||
      !zoneSelect ||
      !emptyMsg
    ) {
      section.style.display = "none";
      return;
    }

    const latestSeasonId =
      seasons.length > 0 ? seasons[seasons.length - 1].season_id : null;
    seasonSelect.innerHTML = [
      '<option value="all">전체</option>',
      ...[...seasons]
        .reverse()
        .map(
          (season) =>
            `<option value="${season.season_id}">${season.season_label || season.season_id}</option>`,
        ),
    ].join("");
    seasonSelect.value = latestSeasonId || "all";

    let normalized = [];
    const filters = {
      result: "all",
      quarter: "all",
      zone: "all",
    };

    const updateSummary = (summary) => {
      $("playerShotAttempts").textContent = String(summary.attempts);
      $("playerShotMade").textContent = String(summary.made);
      $("playerShotMissed").textContent = String(summary.missed);
      $("playerShotFgPct").textContent = `${summary.fgPct.toFixed(1)}%`;
    };

    const updateFilterOptions = () => {
      quarterSelect.innerHTML = buildQuarterSelectOptions(normalized)
        .map(
          (option) =>
            `<option value="${option.value}">${option.label}</option>`,
        )
        .join("");
      zoneSelect.innerHTML = buildPlayerShotZoneOptions(normalized)
        .map(
          (option) =>
            `<option value="${option.value}">${option.label}</option>`,
        )
        .join("");
      filters.quarter = "all";
      filters.zone = "all";
      quarterSelect.value = "all";
      zoneSelect.value = "all";
    };

    const applyFilters = () => {
      const filtered = filterPlayerShots(normalized, filters);
      const summary = summarizeGameShots(filtered);
      updateSummary(summary);
      const hasData = filtered.length > 0;
      emptyMsg.style.display = hasData ? "none" : "block";
      if (!hasData) {
        destroyPlayerShotCharts();
        return;
      }
      renderPlayerShotScatterChart(filtered);
      renderPlayerShotZoneChart(filtered);
      renderPlayerShotQuarterChart(filtered);
    };

    const loadShotData = async () => {
      const seasonId =
        seasonSelect.value && seasonSelect.value !== "all"
          ? seasonSelect.value
          : null;
      const rows = await fetchPlayerShotChart(playerId, seasonId);
      normalized = normalizePlayerShots(rows);
      updateFilterOptions();
      applyFilters();
      section.style.display = normalized.length > 0 ? "block" : "none";
    };

    const onSeasonChange = () => {
      loadShotData();
    };
    const onResultChange = (event) => {
      filters.result = event.target.value;
      applyFilters();
    };
    const onQuarterChange = (event) => {
      filters.quarter = event.target.value;
      applyFilters();
    };
    const onZoneChange = (event) => {
      filters.zone = event.target.value;
      applyFilters();
    };

    seasonSelect.addEventListener("change", onSeasonChange);
    resultSelect.addEventListener("change", onResultChange);
    quarterSelect.addEventListener("change", onQuarterChange);
    zoneSelect.addEventListener("change", onZoneChange);
    unmountPlayerShotFilters = () => {
      seasonSelect.removeEventListener("change", onSeasonChange);
      resultSelect.removeEventListener("change", onResultChange);
      quarterSelect.removeEventListener("change", onQuarterChange);
      zoneSelect.removeEventListener("change", onZoneChange);
    };

    await loadShotData();
  }

  function renderPlayerTrendChart(seasons) {
    const canvas = $("playerTrendChart");
    if (!canvas || !window.Chart) return;

    // Destroy existing chart
    if (playerTrendChart) {
      playerTrendChart.destroy();
    }

    if (seasons.length < 2) {
      canvas.parentElement.innerHTML =
        '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">시즌 데이터가 부족합니다</div>';
      return;
    }

    const labels = seasons.map((s) => s.season_label || s.season_id);
    const ctx = canvas.getContext("2d");

    playerTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "득점",
            data: seasons.map((s) => s.pts),
            borderColor: "#d94f31",
            backgroundColor: "rgba(217, 79, 49, 0.1)",
            tension: 0.3,
            fill: true,
          },
          {
            label: "리바운드",
            data: seasons.map((s) => s.reb),
            borderColor: "#2a5d9f",
            backgroundColor: "rgba(42, 93, 159, 0.1)",
            tension: 0.3,
            fill: true,
          },
          {
            label: "어시스트",
            data: seasons.map((s) => s.ast),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 20,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(27, 28, 31, 0.08)",
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // Shooting Efficiency Chart
  function renderShootingEfficiencyChart(seasons) {
    const canvas = $("playerShootingChart");
    if (!canvas || !window.Chart) return;

    if (playerShootingChart) {
      playerShootingChart.destroy();
    }

    if (seasons.length < 2) {
      canvas.parentElement.innerHTML =
        '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">시즌 데이터가 부족합니다</div>';
      return;
    }

    const labels = seasons.map((s) => s.season_label || s.season_id);
    const ctx = canvas.getContext("2d");

    playerShootingChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "FG%",
            data: seasons.map((s) => (s.fgp || 0) * 100),
            borderColor: "#6366f1",
            backgroundColor: "rgba(99, 102, 241, 0.1)",
            tension: 0.3,
            fill: false,
          },
          {
            label: "3P%",
            data: seasons.map((s) => (s.tpp || 0) * 100),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            tension: 0.3,
            fill: false,
          },
          {
            label: "FT%",
            data: seasons.map((s) => (s.ftp || 0) * 100),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            tension: 0.3,
            fill: false,
          },
          {
            label: "TS%",
            data: seasons.map((s) => (s.ts_pct || 0) * 100),
            borderColor: "#ef4444",
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            tension: 0.3,
            borderDash: [5, 5],
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 20,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                return `${context.dataset.label}: ${context.parsed.y.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            min: 0,
            max: 100,
            grid: {
              color: "rgba(27, 28, 31, 0.08)",
            },
            ticks: {
              callback: function (value) {
                return value + "%";
              },
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // Player Radar Chart (League Percentile)
  function renderPlayerRadarChart(player, allPlayers) {
    const canvas = $("playerRadarChart");
    if (!canvas || !window.Chart) return;

    if (playerRadarChart) {
      playerRadarChart.destroy();
    }

    // Calculate percentiles based on all players
    const stats = ["pts", "reb", "ast", "stl", "blk", "pir"];
    const labels = ["득점", "리바운드", "어시스트", "스틸", "블록", "PIR"];

    const percentiles = stats.map((stat) => {
      const values = allPlayers.map((p) => p[stat] || 0).sort((a, b) => a - b);
      const playerValue = player[stat] || 0;
      const rank = values.filter((v) => v < playerValue).length;
      return Math.round((rank / values.length) * 100);
    });

    const ctx = canvas.getContext("2d");

    playerRadarChart = new Chart(ctx, {
      type: "radar",
      data: {
        labels,
        datasets: [
          {
            label: player.name,
            data: percentiles,
            borderColor: "#d94f31",
            backgroundColor: "rgba(217, 79, 49, 0.2)",
            borderWidth: 2,
            pointBackgroundColor: "#d94f31",
            pointBorderColor: "#fff",
            pointHoverBackgroundColor: "#fff",
            pointHoverBorderColor: "#d94f31",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                return `리그 상위 ${100 - context.parsed.r}%`;
              },
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              stepSize: 20,
              display: false,
            },
            pointLabels: {
              font: {
                size: 12,
                weight: "500",
              },
              color: "rgba(27, 28, 31, 0.7)",
            },
            grid: {
              color: "rgba(27, 28, 31, 0.1)",
            },
            angleLines: {
              color: "rgba(27, 28, 31, 0.1)",
            },
          },
        },
      },
    });
  }

  // Recent Games Bar Chart
  function renderGameLogChart(games) {
    const canvas = $("playerGameLogChart");
    if (!canvas || !window.Chart) return;

    if (playerGameLogChart) {
      playerGameLogChart.destroy();
    }

    if (!games || games.length === 0) {
      canvas.parentElement.innerHTML =
        '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">경기 기록이 없습니다</div>';
      return;
    }

    // Take last 10 games, reversed for chronological order
    const recentGames = games.slice(0, 10).reverse();
    const labels = recentGames.map((g) => formatDate(g.game_date));
    const ctx = canvas.getContext("2d");

    playerGameLogChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "득점",
            data: recentGames.map((g) => g.pts),
            backgroundColor: "rgba(217, 79, 49, 0.8)",
            borderRadius: 4,
          },
          {
            label: "리바운드",
            data: recentGames.map((g) => g.reb),
            backgroundColor: "rgba(42, 93, 159, 0.8)",
            borderRadius: 4,
          },
          {
            label: "어시스트",
            data: recentGames.map((g) => g.ast),
            backgroundColor: "rgba(16, 185, 129, 0.8)",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              title: function (context) {
                const idx = context[0].dataIndex;
                const game = recentGames[idx];
                return `${formatDate(game.game_date)} vs ${game.opponent}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(27, 28, 31, 0.08)",
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // =============================================================================
  // Teams Page
  // =============================================================================

  let standingsChart = null;

  function renderStandingsChart(standings) {
    const canvas = $("standingsChart");
    if (!canvas || !window.Chart) return;

    if (standingsChart) {
      standingsChart.destroy();
    }

    if (!standings || standings.length === 0) {
      canvas.parentElement.innerHTML =
        '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">데이터가 없습니다</div>';
      return;
    }

    const { sorted, labels, homeWins, homeLosses, awayWins, awayLosses } =
      buildStandingsChartSeries(standings);
    const ctx = canvas.getContext("2d");

    standingsChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "홈 승",
            data: homeWins,
            backgroundColor: "rgba(217, 79, 49, 0.9)",
            stack: "home",
          },
          {
            label: "홈 패",
            data: homeLosses,
            backgroundColor: "rgba(217, 79, 49, 0.3)",
            stack: "home",
          },
          {
            label: "원정 승",
            data: awayWins,
            backgroundColor: "rgba(42, 93, 159, 0.9)",
            stack: "away",
          },
          {
            label: "원정 패",
            data: awayLosses,
            backgroundColor: "rgba(42, 93, 159, 0.3)",
            stack: "away",
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              afterBody: function (context) {
                const idx = context[0].dataIndex;
                const team = sorted[idx];
                return `승률: ${(team.win_pct * 100).toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: {
              color: "rgba(27, 28, 31, 0.08)",
            },
          },
          y: {
            stacked: true,
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  async function loadTeamsPage() {
    populateSeasonSelect($("teamsSeasonSelect"));

    try {
      const data = await fetchStandings(state.currentSeason);
      const standings = data.standings || [];
      state.standings = standings;

      // Render standings chart
      renderStandingsChart(standings);

      const sorted = sortStandings(standings, state.standingsSort);
      renderStandingsTable({ tbody: $("standingsBody"), standings: sorted });
    } catch (error) {
      console.error("Failed to load standings:", error);
    }
  }

  // =============================================================================
  // Team Detail Page
  // =============================================================================

  async function loadTeamPage(teamId) {
    try {
      const team = await fetchTeamDetail(teamId, state.currentSeason);

      $("teamDetailName").textContent = team.name;

      if (team.standings) {
        const s = team.standings;
        $("teamDetailStanding").textContent =
          `${s.rank}위 | ${s.wins}승 ${s.losses}패 (${(s.win_pct * 100).toFixed(1)}%)`;
      }

      renderTeamRoster({ tbody: $("teamRosterBody"), roster: team.roster });
      renderTeamRecentGames({
        tbody: $("teamGamesBody"),
        games: team.recent_games,
        formatDate,
      });

      // Team advanced stats section
      const teamStatSection = $("teamStatsSection");
      const teamStatGrid = $("teamStatGrid");
      if (team.team_stats && teamStatGrid) {
        renderTeamStats({ container: teamStatGrid, stats: team.team_stats });
        if (teamStatSection) teamStatSection.style.display = "block";
      } else if (teamStatSection) {
        teamStatSection.style.display = "none";
      }
    } catch (error) {
      console.error("Failed to load team:", error);
      $("teamDetailName").textContent = "팀을 찾을 수 없습니다";
    }
  }

  // =============================================================================
  // Games Page
  // =============================================================================

  async function loadGamesPage() {
    populateSeasonSelect($("gamesSeasonSelect"));

    try {
      const games = await fetchGames(state.currentSeason);
      renderGamesList({ container: $("gamesList"), games, formatDate });
    } catch (error) {
      console.error("Failed to load games:", error);
    }
  }

  // =============================================================================
  // Game Detail Page (Boxscore)
  // =============================================================================

  let gameShotScatterChart = null;
  let gameShotZoneChart = null;
  let gameShotQuarterChart = null;
  let unmountGameShotFilters = null;
  let shotCourtPluginRegistered = false;

  function destroyGameShotCharts() {
    if (gameShotScatterChart) gameShotScatterChart.destroy();
    if (gameShotZoneChart) gameShotZoneChart.destroy();
    if (gameShotQuarterChart) gameShotQuarterChart.destroy();
    gameShotScatterChart = null;
    gameShotZoneChart = null;
    gameShotQuarterChart = null;
  }

  function updateGameShotSummary(summary) {
    $("gameShotAttempts").textContent = String(summary.attempts);
    $("gameShotMade").textContent = String(summary.made);
    $("gameShotMissed").textContent = String(summary.missed);
    $("gameShotFgPct").textContent = `${summary.fgPct.toFixed(1)}%`;
  }

  function ensureShotCourtOverlayPlugin() {
    if (shotCourtPluginRegistered || !window.Chart) return;
    window.Chart.register({
      id: "shotCourtOverlay",
      beforeDatasetsDraw(chart, _args, options) {
        if (!options || chart.config.type !== "scatter") return;
        const { ctx, scales } = chart;
        const xScale = scales.x;
        const yScale = scales.y;
        if (!xScale || !yScale) return;

        const x = (v) => xScale.getPixelForValue(v);
        const y = (v) => yScale.getPixelForValue(v);
        const pxPerX = Math.abs(xScale.getPixelForValue(146.5) - x(145.5));
        const pxPerY = Math.abs(yScale.getPixelForValue(19) - y(18));
        const radii = (unit) => getCourtArcRadii(pxPerX, pxPerY, unit);
        const sx = (v) => Math.round(v) + 0.5;
        const sy = (v) => Math.round(v) + 0.5;
        const three = buildThreePointGeometry();

        ctx.save();
        ctx.strokeStyle = options.lineColor || "rgba(27, 28, 31, 0.25)";
        ctx.lineWidth = options.lineWidth || 1;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        // WKBL half-court guide based on shot chart px coordinates.
        // Court extents: x≈0~291, y≈18~176. Rim center around (145.5, 18).
        ctx.strokeRect(x(98), y(18), x(193) - x(98), y(90) - y(18)); // paint
        ctx.strokeRect(x(117), y(18), x(174) - x(117), y(56) - y(18)); // key

        // Free-throw circle.
        const ft = radii(20);
        ctx.beginPath();
        ctx.ellipse(x(145.5), y(90), ft.rx, ft.ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Backboard and rim.
        ctx.beginPath();
        ctx.moveTo(sx(x(131)), sy(y(25)));
        ctx.lineTo(sx(x(160)), sy(y(25)));
        ctx.stroke();
        const rim = radii(7);
        ctx.beginPath();
        ctx.ellipse(x(145.5), y(18), rim.rx, rim.ry, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Restricted area arc.
        const ra = radii(22);
        ctx.beginPath();
        ctx.ellipse(
          x(145.5),
          y(18),
          ra.rx,
          ra.ry,
          0,
          Math.PI * 0.12,
          Math.PI * 0.88,
          false,
        );
        ctx.stroke();

        // Three-point lines + arc.
        ctx.beginPath();
        ctx.moveTo(sx(x(three.xLeft)), sy(y(three.yStart)));
        ctx.lineTo(sx(x(three.xLeft)), sy(y(three.yJoin)));
        ctx.moveTo(sx(x(three.xRight)), sy(y(three.yStart)));
        ctx.lineTo(sx(x(three.xRight)), sy(y(three.yJoin)));
        ctx.stroke();
        const threeRadius = radii(three.radius);
        ctx.beginPath();
        ctx.ellipse(
          x(three.cx),
          y(three.cy),
          threeRadius.rx,
          threeRadius.ry,
          0,
          three.startAngle,
          three.endAngle,
          true,
        );
        ctx.stroke();

        ctx.restore();
      },
    });
    shotCourtPluginRegistered = true;
  }

  function renderGameShotScatterChart(shots) {
    const canvas = $("gameShotScatterChart");
    if (!canvas || !window.Chart) return;
    if (gameShotScatterChart) gameShotScatterChart.destroy();
    ensureShotCourtOverlayPlugin();

    const made = shots.filter((shot) => shot.made);
    const missed = shots.filter((shot) => !shot.made);
    const bounds = getShotChartScaleBounds(shots);

    gameShotScatterChart = new Chart(canvas.getContext("2d"), {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "성공",
            data: made.map((shot) => ({ x: shot.x, y: shot.y, shot })),
            pointRadius: 4,
            pointBackgroundColor: "rgba(16, 185, 129, 0.85)",
          },
          {
            label: "실패",
            data: missed.map((shot) => ({ x: shot.x, y: shot.y, shot })),
            pointRadius: 4,
            pointStyle: "crossRot",
            pointBackgroundColor: "rgba(239, 68, 68, 0.85)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: getCourtAspectRatio(),
        scales: {
          x: {
            min: bounds.xMin,
            max: bounds.xMax,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
          y: {
            min: bounds.yMin,
            max: bounds.yMax,
            reverse: true,
            grid: { display: false },
            ticks: { display: false },
            border: { display: false },
          },
        },
        plugins: {
          shotCourtOverlay: {
            lineColor: "rgba(27, 28, 31, 0.24)",
            lineWidth: 1.2,
          },
          tooltip: {
            callbacks: {
              label(context) {
                const shot = context.raw.shot;
                return `${shot.playerName} ${getQuarterLabel(shot.quarter)} ${shot.made ? "성공" : "실패"}`;
              },
            },
          },
        },
      },
    });
  }

  function renderGameShotZoneChart(shots) {
    const canvas = $("gameShotZoneChart");
    if (!canvas || !window.Chart) return;
    if (gameShotZoneChart) gameShotZoneChart.destroy();
    const zone = buildZoneSeries(shots);

    gameShotZoneChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: zone.labels,
        datasets: [
          {
            label: "시도",
            data: zone.attempts,
            backgroundColor: "rgba(59, 130, 246, 0.5)",
            yAxisID: "y",
          },
          {
            label: "FG%",
            data: zone.fgPct,
            type: "line",
            borderColor: "rgba(16, 185, 129, 0.9)",
            backgroundColor: "rgba(16, 185, 129, 0.9)",
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "Attempts" } },
          y1: {
            beginAtZero: true,
            max: 100,
            position: "right",
            grid: { drawOnChartArea: false },
            title: { display: true, text: "FG%" },
          },
        },
      },
    });
  }

  function renderGameShotQuarterChart(shots) {
    const canvas = $("gameShotQuarterChart");
    if (!canvas || !window.Chart) return;
    if (gameShotQuarterChart) gameShotQuarterChart.destroy();
    const quarter = buildQuarterSeries(shots);

    gameShotQuarterChart = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: quarter.labels,
        datasets: [
          {
            label: "성공",
            data: quarter.made,
            backgroundColor: "rgba(16, 185, 129, 0.7)",
            stack: "shots",
          },
          {
            label: "실패",
            data: quarter.missed,
            backgroundColor: "rgba(239, 68, 68, 0.7)",
            stack: "shots",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  function renderGameShotZoneTable(shots) {
    const body = $("gameShotZoneTableBody");
    if (!body) return;
    const rows = buildZoneTableRows(shots);
    body.innerHTML = rows
      .map(
        (row) =>
          `<tr><td>${row.zone}</td><td>${row.made}</td><td>${row.attempts}</td><td>${row.fgPct.toFixed(1)}%</td></tr>`,
      )
      .join("");
  }

  function renderGameShotSection(game, rawShots) {
    const section = $("gameShotSection");
    if (!section) return;

    if (unmountGameShotFilters) {
      unmountGameShotFilters();
      unmountGameShotFilters = null;
    }
    destroyGameShotCharts();

    const playerNameMap = {};
    [...(game.away_team_stats || []), ...(game.home_team_stats || [])].forEach(
      (player) => {
        playerNameMap[player.player_id] = player.player_name;
      },
    );
    const normalized = normalizeGameShots(rawShots, playerNameMap);
    const playerTeamMap = {};
    (game.away_team_stats || []).forEach((player) => {
      playerTeamMap[player.player_id] = game.away_team_id;
    });
    (game.home_team_stats || []).forEach((player) => {
      playerTeamMap[player.player_id] = game.home_team_id;
    });
    const correctedShots = reconcileShotTeams(normalized, playerTeamMap);
    if (!window.Chart || correctedShots.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "block";

    const playerSelect = $("gameShotPlayerSelect");
    const teamSelect = $("gameShotTeamSelect");
    const resultSelect = $("gameShotResultSelect");
    const quarterSelect = $("gameShotQuarterSelect");
    const exportBtn = $("gameShotExportBtn");
    const emptyMsg = $("gameShotEmptyMsg");
    const tabCharts = $("gameShotTabCharts");
    const tabZones = $("gameShotTabZones");
    const paneCharts = $("gameShotPaneCharts");
    const paneZones = $("gameShotPaneZones");
    if (
      !playerSelect ||
      !teamSelect ||
      !resultSelect ||
      !quarterSelect ||
      !exportBtn ||
      !emptyMsg ||
      !tabCharts ||
      !tabZones ||
      !paneCharts ||
      !paneZones
    ) {
      section.style.display = "none";
      return;
    }

    const teams = [
      { id: game.away_team_id, name: game.away_team_name || "원정팀" },
      { id: game.home_team_id, name: game.home_team_name || "홈팀" },
    ];
    teamSelect.innerHTML = [
      '<option value="all">전체</option>',
      ...teams.map(
        (team) => `<option value="${team.id}">${team.name}</option>`,
      ),
    ].join("");

    quarterSelect.innerHTML = buildQuarterSelectOptions(correctedShots)
      .map(
        (option) => `<option value="${option.value}">${option.label}</option>`,
      )
      .join("");

    resultSelect.value = "all";
    teamSelect.value = "all";
    quarterSelect.value = "all";

    const filters = {
      playerId: "all",
      teamId: "all",
      result: "all",
      quarter: "all",
    };
    let activeTab = "charts";
    const getCurrentFilters = () => ({ ...filters });

    const activateTab = (tab) => {
      activeTab = tab;
      tabCharts.classList.toggle("active", tab === "charts");
      tabZones.classList.toggle("active", tab === "zones");
      paneCharts.classList.toggle("active", tab === "charts");
      paneZones.classList.toggle("active", tab === "zones");
    };

    const exportCurrentShotChart = () => {
      if (!gameShotScatterChart) return;
      const link = document.createElement("a");
      link.download = buildShotChartExportName({
        gameId:
          game.id ||
          game.game_id ||
          game.home_team_id + "_" + game.away_team_id,
        filters: getCurrentFilters(),
      });
      link.href = gameShotScatterChart.toBase64Image("image/png", 1);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    const updatePlayerOptionsByTeam = () => {
      const options = buildPlayerSelectOptions(correctedShots, filters.teamId);
      playerSelect.innerHTML = options
        .map(
          (option) =>
            `<option value="${option.value}">${option.label}</option>`,
        )
        .join("");
      const hasCurrent = options.some(
        (option) => option.value === filters.playerId,
      );
      if (!hasCurrent) {
        filters.playerId = "all";
      }
      playerSelect.value = filters.playerId;
    };

    const applyFilters = () => {
      const filtered = filterGameShots(correctedShots, filters);
      const summary = summarizeGameShots(filtered);
      updateGameShotSummary(summary);
      const hasData = filtered.length > 0;
      emptyMsg.style.display = hasData ? "none" : "block";
      if (!hasData) {
        destroyGameShotCharts();
        exportBtn.disabled = true;
        renderGameShotZoneTable([]);
        return;
      }
      renderGameShotScatterChart(filtered);
      renderGameShotZoneChart(filtered);
      renderGameShotQuarterChart(filtered);
      renderGameShotZoneTable(filtered);
      exportBtn.disabled = false;
    };

    const onPlayerChange = (event) => {
      filters.playerId = event.target.value;
      applyFilters();
    };
    const onTeamChange = (event) => {
      filters.teamId = event.target.value;
      updatePlayerOptionsByTeam();
      applyFilters();
    };
    const onResultChange = (event) => {
      filters.result = event.target.value;
      applyFilters();
    };
    const onQuarterChange = (event) => {
      filters.quarter = event.target.value;
      applyFilters();
    };
    const onExportClick = () => {
      exportCurrentShotChart();
    };
    const onTabChartsClick = () => activateTab("charts");
    const onTabZonesClick = () => activateTab("zones");

    playerSelect.addEventListener("change", onPlayerChange);
    teamSelect.addEventListener("change", onTeamChange);
    resultSelect.addEventListener("change", onResultChange);
    quarterSelect.addEventListener("change", onQuarterChange);
    exportBtn.addEventListener("click", onExportClick);
    tabCharts.addEventListener("click", onTabChartsClick);
    tabZones.addEventListener("click", onTabZonesClick);
    unmountGameShotFilters = () => {
      playerSelect.removeEventListener("change", onPlayerChange);
      teamSelect.removeEventListener("change", onTeamChange);
      resultSelect.removeEventListener("change", onResultChange);
      quarterSelect.removeEventListener("change", onQuarterChange);
      exportBtn.removeEventListener("click", onExportClick);
      tabCharts.removeEventListener("click", onTabChartsClick);
      tabZones.removeEventListener("click", onTabZonesClick);
    };

    updatePlayerOptionsByTeam();
    activateTab(activeTab);
    applyFilters();
  }

  async function loadGamePage(gameId) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });

      // Trigger detail DB loading (PBP, shot charts, lineups) in background
      if (
        state.dbInitialized &&
        typeof WKBLDatabase !== "undefined" &&
        !WKBLDatabase.isDetailReady()
      ) {
        WKBLDatabase.initDetailDatabase().catch(() => {});
      }

      const game = await fetchGameBoxscore(gameId);
      const shotRows = await fetchGameShotChart(gameId);

      $("boxscoreDate").textContent = formatDate(game.game_date);
      $("boxscoreAwayTeam").textContent = game.away_team_name;
      $("boxscoreAwayScore").textContent = game.away_score || "-";
      $("boxscoreHomeTeam").textContent = game.home_team_name;
      $("boxscoreHomeScore").textContent = game.home_score || "-";

      $("boxscoreAwayTeamName").textContent = game.away_team_name;
      $("boxscoreHomeTeamName").textContent = game.home_team_name;

      // Get predictions if they exist
      let predictions = { players: [], team: null };
      if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
        predictions = WKBLDatabase.getGamePredictions(gameId);
      }

      // Create prediction lookup by player_id
      const predictionMap = {};
      for (const pred of predictions.players) {
        predictionMap[pred.player_id] = pred;
      }

      // Render prediction summary if exists
      const predictionSection = $("boxscorePrediction");
      if (predictions.team && game.home_score !== null) {
        const homeActualWin = game.home_score > game.away_score;
        const homePredictedWin = predictions.team.home_win_prob > 50;
        const predictionCorrect = homeActualWin === homePredictedWin;
        const diffClass = (diff) =>
          diff === null ? "" : diff >= 0 ? "stat-positive" : "stat-negative";

        // Calculate team totals from player predictions
        const sumPred = (teamId, stat) =>
          predictions.players
            .filter((p) => p.team_id === teamId)
            .reduce((s, p) => s + (p[`predicted_${stat}`] || 0), 0);
        const sumActual = (stats, stat) =>
          (stats || []).reduce((s, p) => s + (p[stat] || 0), 0);

        const stats = ["pts", "reb", "ast", "stl", "blk"];
        const statLabels = {
          pts: "득점",
          reb: "리바운드",
          ast: "어시스트",
          stl: "스틸",
          blk: "블록",
        };
        const teams = [
          {
            id: game.away_team_id,
            name: game.away_team_name,
            stats: game.away_team_stats,
            predPts: predictions.team.away_predicted_pts,
            actualPts: game.away_score,
          },
          {
            id: game.home_team_id,
            name: game.home_team_name,
            stats: game.home_team_stats,
            predPts: predictions.team.home_predicted_pts,
            actualPts: game.home_score,
          },
        ];

        const tableRows = teams
          .map((t) => {
            const cells = stats
              .map((stat) => {
                const pred = stat === "pts" ? t.predPts : sumPred(t.id, stat);
                const actual =
                  stat === "pts" ? t.actualPts : sumActual(t.stats, stat);
                const diff =
                  pred != null ? Math.round((actual - pred) * 10) / 10 : null;
                return `
              <td>${pred != null ? pred.toFixed(0) : "-"}</td>
              <td>${actual}</td>
              <td class="${diffClass(diff)}">${diff !== null ? (diff >= 0 ? "+" : "") + formatNumber(diff, 0) : "-"}</td>
            `;
              })
              .join("");
            return `<tr><td class="pred-team-label">${t.name}</td>${cells}</tr>`;
          })
          .join("");

        predictionSection.innerHTML = `
          <div class="prediction-summary">
            <h3>예측 vs 실제</h3>
            <div class="prediction-comparison">
              <div class="pred-team">
                <span class="pred-label">${game.away_team_name}</span>
                <div class="pred-values">
                  <span class="pred-expected">예측: ${predictions.team.away_win_prob.toFixed(0)}%</span>
                  <span class="pred-actual ${!homeActualWin ? "winner" : ""}">${!homeActualWin ? "승리" : "패배"}</span>
                </div>
              </div>
              <div class="pred-vs">VS</div>
              <div class="pred-team">
                <span class="pred-label">${game.home_team_name}</span>
                <div class="pred-values">
                  <span class="pred-expected">예측: ${predictions.team.home_win_prob.toFixed(0)}%</span>
                  <span class="pred-actual ${homeActualWin ? "winner" : ""}">${homeActualWin ? "승리" : "패배"}</span>
                </div>
              </div>
            </div>
            <div class="pred-result ${predictionCorrect ? "correct" : "incorrect"}">
              ${predictionCorrect ? "✓ 예측 적중" : "✗ 예측 실패"}
            </div>
            <table class="pred-stats-table">
              <thead>
                <tr>
                  <th></th>
                  ${stats.map((s) => `<th colspan="3">${statLabels[s]}</th>`).join("")}
                </tr>
                <tr>
                  <th></th>
                  ${stats.map(() => `<th>예측</th><th>실제</th><th>차이</th>`).join("")}
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        `;
        predictionSection.style.display = "block";
      } else if (predictions.team) {
        const buildTeamTotals = (players, teamId) => {
          const teamPlayers = players.filter((p) => p.team_id === teamId);
          if (teamPlayers.length === 0) return null;
          const statKeys = ["pts", "reb", "ast", "stl", "blk"];
          const totals = {};
          statKeys.forEach((s) => (totals[s] = { pred: 0, low: 0, high: 0 }));
          teamPlayers.forEach((p) => {
            statKeys.forEach((s) => {
              totals[s].pred += p[`predicted_${s}`] || 0;
              totals[s].low += p[`predicted_${s}_low`] || 0;
              totals[s].high += p[`predicted_${s}_high`] || 0;
            });
          });
          return totals;
        };

        const formatRange = (low, high) => {
          if (
            low === null ||
            low === undefined ||
            high === null ||
            high === undefined
          )
            return "-";
          return `${formatNumber(low)}~${formatNumber(high)}`;
        };

        const awayTotals = buildTeamTotals(
          predictions.players,
          game.away_team_id,
        );
        const homeTotals = buildTeamTotals(
          predictions.players,
          game.home_team_id,
        );
        const totalStatLabels = {
          pts: "총 득점",
          reb: "총 리바운드",
          ast: "총 어시스트",
          stl: "총 스틸",
          blk: "총 블록",
        };
        const renderTotalTeam = (teamName, totals) => {
          const statItems = ["pts", "reb", "ast", "stl", "blk"]
            .map(
              (s) => `
                <div class="total-stat">
                  <span class="stat-label">${totalStatLabels[s]}</span>
                  <span class="stat-value">${formatNumber(totals[s].pred)}</span>
                  <span class="stat-range">${formatRange(totals[s].low, totals[s].high)}</span>
                </div>`,
            )
            .join("");
          return `
            <div class="pred-total-team">
              <div class="pred-total-header">${teamName}</div>
              <div class="lineup-total-stats">${statItems}</div>
            </div>`;
        };
        const totalsHtml =
          awayTotals && homeTotals
            ? `
          <div class="pred-total-stats">
            ${renderTotalTeam(game.away_team_name, awayTotals)}
            ${renderTotalTeam(game.home_team_name, homeTotals)}
          </div>
        `
            : "";

        // Game not played yet - show prediction only
        const awayPredPts =
          predictions.team.away_predicted_pts?.toFixed(0) || "-";
        const homePredPts =
          predictions.team.home_predicted_pts?.toFixed(0) || "-";
        predictionSection.innerHTML = `
          <div class="prediction-summary pending">
            <h3>경기 예측</h3>
            <div class="prediction-comparison">
              <div class="pred-team">
                <span class="pred-label">${game.away_team_name}</span>
                <span class="pred-prob">${predictions.team.away_win_prob.toFixed(0)}%</span>
              </div>
              <div class="pred-vs">VS</div>
              <div class="pred-team">
                <span class="pred-label">${game.home_team_name}</span>
                <span class="pred-prob">${predictions.team.home_win_prob.toFixed(0)}%</span>
              </div>
            </div>
            <div class="pred-score-comparison">
              <div class="pred-score-item">
                <span>예상 점수</span>
                <span>${awayPredPts} - ${homePredPts}</span>
              </div>
            </div>
            ${totalsHtml}
          </div>
        `;
        predictionSection.style.display = "block";
      } else {
        predictionSection.style.display = "none";
      }

      // Helper: get prediction class and tooltip for a stat
      function getPredStyle(pred, actual, statKey) {
        if (!pred || game.home_score === null) return { cls: "", title: "" };
        const predicted = pred[`predicted_${statKey}`];
        const low = pred[`predicted_${statKey}_low`];
        const high = pred[`predicted_${statKey}_high`];
        if (predicted == null) return { cls: "", title: "" };
        const diff = actual - predicted;
        const withinRange = actual >= low && actual <= high;
        const cls = withinRange
          ? "pred-hit"
          : diff > 0
            ? "pred-over"
            : "pred-under";
        const title = `예측: ${predicted.toFixed(1)} (${low.toFixed(1)}~${high.toFixed(1)})`;
        return { cls, title };
      }

      let boxscoreSort = { key: "pts", dir: "desc" };
      const awayBaseStats = [...(game.away_team_stats || [])];
      const homeBaseStats = [...(game.home_team_stats || [])];
      const updateBoxscoreSortIndicators = () => {
        document
          .querySelectorAll("#view-game .boxscore-table th[data-key]")
          .forEach((th) => {
            const key = th.dataset.key;
            const isActive = key === boxscoreSort.key;
            th.setAttribute(
              "aria-sort",
              isActive
                ? boxscoreSort.dir === "asc"
                  ? "ascending"
                  : "descending"
                : "none",
            );
          });
      };
      const renderSortedBoxscoreRows = () => {
        const sortedGame = {
          ...game,
          away_team_stats: sortBoxscorePlayers(awayBaseStats, boxscoreSort),
          home_team_stats: sortBoxscorePlayers(homeBaseStats, boxscoreSort),
        };
        const { awayRows, homeRows } = renderBoxscoreRows({
          game: sortedGame,
          predictions,
          predictionMap,
          getPredStyle,
          formatNumber,
          formatPct,
          formatSigned,
        });
        $("boxscoreAwayBody").innerHTML = awayRows;
        $("boxscoreHomeBody").innerHTML = homeRows;
        updateBoxscoreSortIndicators();
      };
      renderSortedBoxscoreRows();

      if (unmountBoxscoreSortEvents) {
        unmountBoxscoreSortEvents();
        unmountBoxscoreSortEvents = null;
      }
      const awayTable = $("boxscoreAwayTable");
      const homeTable = $("boxscoreHomeTable");
      const tables = [awayTable, homeTable].filter(Boolean);
      const onBoxscoreSortClick = (event) => {
        const th = event.target.closest("th[data-key]");
        const key = th?.dataset?.key;
        if (!key) return;
        const isSame = boxscoreSort.key === key;
        boxscoreSort = {
          key,
          dir: isSame && boxscoreSort.dir === "desc" ? "asc" : "desc",
        };
        renderSortedBoxscoreRows();
      };
      tables.forEach((table) => {
        table.addEventListener("click", onBoxscoreSortClick);
      });
      unmountBoxscoreSortEvents = () => {
        tables.forEach((table) => {
          table.removeEventListener("click", onBoxscoreSortClick);
        });
      };

      // Show prediction legend if predictions exist
      const legendEl = $("boxscorePredictionLegend");
      if (predictions.players.length > 0 && game.home_score !== null) {
        legendEl.style.display = "block";
      } else {
        legendEl.style.display = "none";
      }

      renderGameShotSection(game, shotRows);
    } catch (error) {
      console.error("Failed to load game:", error);
    }
  }

  // =============================================================================
  // Leaders Page
  // =============================================================================

  async function loadLeadersPage() {
    populateSeasonSelect($("leadersSeasonSelect"));

    try {
      const categories = await fetchAllLeaders(state.currentSeason);
      renderLeadersGrid({
        grid: $("leadersGrid"),
        categories,
        leaderCategories: LEADER_CATEGORIES,
      });
    } catch (error) {
      console.error("Failed to load leaders:", error);
    }
  }

  // =============================================================================
  // Compare Page
  // =============================================================================

  let compareRadarChart = null;
  let compareBarChart = null;

  const COMPARE_STATS = [
    { key: "gp", label: "GP", format: "int" },
    { key: "min", label: "MIN", format: "number" },
    { key: "pts", label: "PTS", format: "number" },
    { key: "reb", label: "REB", format: "number" },
    { key: "ast", label: "AST", format: "number" },
    { key: "stl", label: "STL", format: "number" },
    { key: "blk", label: "BLK", format: "number" },
    { key: "tov", label: "TOV", format: "number" },
    { key: "fgp", label: "FG%", format: "pct" },
    { key: "tpp", label: "3P%", format: "pct" },
    { key: "ftp", label: "FT%", format: "pct" },
    { key: "ts_pct", label: "TS%", format: "pct" },
    { key: "efg_pct", label: "eFG%", format: "pct" },
    { key: "pir", label: "PIR", format: "number" },
    { key: "court_margin", label: "코트마진", format: "signed" },
    { key: "plus_minus_per_game", label: "+/-/G", format: "signed" },
    { key: "plus_minus_per100", label: "+/-/100", format: "signed" },
  ];

  const COMPARE_BAR_STATS = [
    { key: "pts", label: "득점" },
    { key: "reb", label: "리바운드" },
    { key: "ast", label: "어시스트" },
    { key: "stl", label: "스틸" },
    { key: "blk", label: "블록" },
  ];

  const COMPARE_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

  function renderCompareRadarChart(players) {
    const canvas = $("compareRadarChart");
    if (!canvas || !window.Chart) return;

    if (compareRadarChart) {
      compareRadarChart.destroy();
    }

    const stats = ["pts", "reb", "ast", "stl", "blk"];
    const labels = ["득점", "리바운드", "어시스트", "스틸", "블록"];

    // Normalize to max values among players
    const maxValues = stats.map((stat) =>
      Math.max(...players.map((p) => p[stat] || 0)),
    );

    const datasets = players.map((p, i) => ({
      label: p.name,
      data: stats.map((stat, j) =>
        maxValues[j] > 0 ? ((p[stat] || 0) / maxValues[j]) * 100 : 0,
      ),
      borderColor: COMPARE_COLORS[i % COMPARE_COLORS.length],
      backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length]
        .replace(")", ", 0.2)")
        .replace("rgb", "rgba"),
      borderWidth: 2,
      pointBackgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length],
    }));

    const ctx = canvas.getContext("2d");

    compareRadarChart = new Chart(ctx, {
      type: "radar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: function (context) {
                const idx = context.dataIndex;
                const playerIdx = context.datasetIndex;
                const stat = stats[idx];
                const player = players[playerIdx];
                return `${player.name}: ${formatNumber(player[stat])}`;
              },
            },
          },
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            pointLabels: {
              font: { size: 12, weight: "500" },
              color: "rgba(27, 28, 31, 0.7)",
            },
            grid: { color: "rgba(27, 28, 31, 0.1)" },
            angleLines: { color: "rgba(27, 28, 31, 0.1)" },
          },
        },
      },
    });
  }

  function renderCompareBarChart(players) {
    const canvas = $("compareBarChart");
    if (!canvas || !window.Chart) return;

    if (compareBarChart) {
      compareBarChart.destroy();
    }

    const stats = ["pts", "reb", "ast", "stl", "blk"];
    const labels = ["득점", "리바운드", "어시스트", "스틸", "블록"];

    const datasets = players.map((p, i) => ({
      label: p.name,
      data: stats.map((stat) => p[stat] || 0),
      backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length],
      borderRadius: 4,
    }));

    const ctx = canvas.getContext("2d");

    compareBarChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 15,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(27, 28, 31, 0.08)" },
          },
          x: {
            grid: { display: false },
          },
        },
      },
    });
  }

  async function loadComparePage() {
    populateSeasonSelect($("compareSeasonSelect"));

    // Reset state
    state.compareSelectedPlayers = [];
    state.compareSearchResults = [];

    // Update UI
    updateCompareSelected();
    $("compareResult").style.display = "none";
    $("compareSearchInput").value = "";
    $("compareSuggestions").innerHTML = "";
    $("compareBtn").disabled = true;
  }

  function updateCompareSelected() {
    const container = $("compareSelected");
    renderCompareSelected({
      container,
      selectedPlayers: state.compareSelectedPlayers,
    });

    // Update button state
    $("compareBtn").disabled = state.compareSelectedPlayers.length < 2;
  }

  async function handleCompareSearch(query) {
    const suggestions = $("compareSuggestions");

    if (!query || query.length < 1) {
      suggestions.innerHTML = "";
      suggestions.classList.remove("active");
      return;
    }

    try {
      const result = await fetchSearch(query);
      state.compareSearchResults = result.players || [];
      renderCompareSuggestions({
        container: suggestions,
        players: state.compareSearchResults,
      });
      suggestions.classList.add("active");
    } catch (error) {
      console.error("Search failed:", error);
      renderCompareSuggestions({
        container: suggestions,
        players: [],
        error: true,
      });
      suggestions.classList.add("active");
    }
  }

  function addComparePlayer(player) {
    // Check if already selected
    if (state.compareSelectedPlayers.find((p) => p.id === player.id)) {
      return;
    }
    // Max 4 players
    if (state.compareSelectedPlayers.length >= 4) {
      return;
    }

    state.compareSelectedPlayers.push(player);
    updateCompareSelected();

    // Clear search
    $("compareSearchInput").value = "";
    $("compareSuggestions").innerHTML = "";
    $("compareSuggestions").classList.remove("active");
  }

  function removeComparePlayer(playerId) {
    state.compareSelectedPlayers = state.compareSelectedPlayers.filter(
      (p) => p.id !== playerId,
    );
    updateCompareSelected();
  }

  async function executeComparison() {
    if (state.compareSelectedPlayers.length < 2) return;

    const playerIds = state.compareSelectedPlayers.map((p) => p.id);

    try {
      const players = await fetchComparePlayers(playerIds, state.currentSeason);

      if (!players || players.length === 0) {
        alert("비교 데이터를 불러올 수 없습니다.");
        return;
      }

      // Add court margin data if available
      if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
        const margins = WKBLDatabase.getPlayersCourtMargin(
          playerIds,
          state.currentSeason,
        );
        for (const p of players) {
          p.court_margin = margins[p.id] !== undefined ? margins[p.id] : null;
        }
      }

      renderCompareResult(players);
      $("compareResult").style.display = "block";
    } catch (error) {
      console.error("Comparison failed:", error);
      alert("비교에 실패했습니다.");
    }
  }

  function renderCompareResult(players) {
    // Chart.js charts
    renderCompareRadarChart(players);
    renderCompareBarChart(players);

    // Player cards
    renderCompareCards({
      container: $("compareCards"),
      players,
      formatNumber,
    });

    // Bar chart comparison
    const barsContainer = $("compareBars");
    const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

    barsContainer.innerHTML = COMPARE_BAR_STATS.map((stat) => {
      const maxValue = Math.max(...players.map((p) => p[stat.key] || 0));
      return `
        <div class="compare-bar-row">
          <div class="compare-bar-label">${stat.label}</div>
          <div class="compare-bar-container">
            ${players
              .map((p, i) => {
                const value = p[stat.key] || 0;
                const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
                return `
                <div class="compare-bar-item">
                  <span class="compare-bar-name">${p.name}</span>
                  <div class="compare-bar-track">
                    <div class="compare-bar-fill" style="width: ${width}%; background: ${colors[i % colors.length]};"></div>
                  </div>
                  <span class="compare-bar-value">${formatNumber(value)}</span>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `;
    }).join("");

    // Detail table
    const tableHead = $("compareTableHead");
    const tableBody = $("compareTableBody");

    tableHead.innerHTML = `
      <tr>
        <th>스탯</th>
        ${players.map((p) => `<th title="${p.name}">${p.name}</th>`).join("")}
      </tr>
    `;

    tableBody.innerHTML = COMPARE_STATS.map((stat) => {
      const values = players.map((p) => p[stat.key]);
      const validValues = values.filter((v) => v !== null && v !== undefined);
      const maxIdx =
        stat.key !== "tov" && validValues.length > 0
          ? values.indexOf(Math.max(...validValues))
          : -1;

      return `
        <tr>
          <td>${stat.label}</td>
          ${players
            .map((p, i) => {
              const value = p[stat.key];
              let formatted;
              if (stat.format === "pct") {
                formatted = formatPct(value);
              } else if (stat.format === "int") {
                formatted = value !== null ? Math.round(value) : "-";
              } else if (stat.format === "signed") {
                if (value === null || value === undefined) {
                  formatted = "-";
                } else {
                  const sign = value >= 0 ? "+" : "";
                  formatted = sign + formatNumber(value);
                }
              } else {
                formatted = formatNumber(value);
              }
              const isMax = i === maxIdx && maxIdx !== -1;
              return `<td class="${isMax ? "compare-best" : ""}">${formatted}</td>`;
            })
            .join("")}
        </tr>
      `;
    }).join("");
  }

  // =============================================================================
  // Schedule Page
  // =============================================================================

  async function loadSchedulePage() {
    populateSeasonSelect($("scheduleSeasonSelect"));
    await populateScheduleTeamSelect();

    await refreshSchedule();
  }

  async function populateScheduleTeamSelect() {
    const select = $("scheduleTeamSelect");
    if (!select) return;

    try {
      const { teams } = await fetchTeams();
      select.innerHTML = '<option value="">전체 팀</option>';
      teams.forEach((team) => {
        const option = document.createElement("option");
        option.value = team.id;
        option.textContent = team.name;
        select.appendChild(option);
      });
    } catch (e) {
      console.warn("Failed to load teams for schedule:", e);
    }
  }

  async function refreshSchedule() {
    const teamId = $("scheduleTeamSelect")?.value || null;

    // Get upcoming and recent games
    let upcomingGames = [];
    let recentGames = [];

    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      upcomingGames = WKBLDatabase.getUpcomingGames(
        state.currentSeason,
        teamId,
        10,
      );
      recentGames = WKBLDatabase.getRecentGames(
        state.currentSeason,
        teamId,
        10,
      );
    }

    renderNextGameHighlight({
      nextGameCard: $("nextGameCard"),
      next: upcomingGames[0],
      formatFullDate,
      getById: $,
    });

    renderUpcomingGames({
      container: $("upcomingGamesList"),
      upcomingGames,
      formatFullDate,
      getPredictionHtml: (g) => {
        if (!(state.dbInitialized && typeof WKBLDatabase !== "undefined"))
          return "";
        const pred = WKBLDatabase.getGamePredictions(g.id);
        if (!pred.team) return "";
        const awayProb = pred.team.away_win_prob?.toFixed(0) || "-";
        const homeProb = pred.team.home_win_prob?.toFixed(0) || "-";
        const awayPts = pred.team.away_predicted_pts?.toFixed(0) || "-";
        const homePts = pred.team.home_predicted_pts?.toFixed(0) || "-";
        return `
          <div class="schedule-prediction">
            <div class="schedule-pred-prob">
              <span class="pred-away">${awayProb}%</span>
              <span class="pred-label">승률</span>
              <span class="pred-home">${homeProb}%</span>
            </div>
            <div class="schedule-pred-score">
              <span class="pred-away">${awayPts}</span>
              <span class="pred-label">예상</span>
              <span class="pred-home">${homePts}</span>
            </div>
          </div>
        `;
      },
    });

    renderRecentResults({
      container: $("recentResultsList"),
      recentGames,
      formatFullDate,
      getPredictionCompareHtml: (g, homeWin) => {
        if (!(state.dbInitialized && typeof WKBLDatabase !== "undefined"))
          return "";
        const pred = WKBLDatabase.getGamePredictions(g.id);
        if (!pred.team) return "";
        const result = buildPredictionCompareState({
          homeWin,
          teamPrediction: pred.team,
        });
        return `
          <div class="schedule-pred-compare ${result.resultClass}">
            <span class="pred-result-badge">${result.badgeText}</span>
            <span class="pred-expected">${result.expectedScoreText}</span>
          </div>
        `;
      },
    });
  }

  function formatFullDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const weekday = weekdays[d.getDay()];
    return `${month}/${day} (${weekday})`;
  }

  // =============================================================================
  // Predict Page
  // =============================================================================

  let predictTrendChart = null;
  let predictSelectedPlayer = null;

  async function loadPredictPage() {
    populateSeasonSelect($("predictSeasonSelect"));

    // Reset state
    predictSelectedPlayer = null;
    $("predictResult").style.display = "none";
    $("predictSearchInput").value = "";
    $("predictSuggestions").innerHTML = "";
  }

  async function handlePredictSearch(query) {
    const suggestions = $("predictSuggestions");

    if (!query || query.length < 1) {
      suggestions.innerHTML = "";
      suggestions.classList.remove("active");
      return;
    }

    try {
      const result = await fetchSearch(query);
      const players = result.players || [];
      renderPredictSuggestions({ container: suggestions, players });
      suggestions.classList.add("active");
    } catch (error) {
      console.error("Predict search failed:", error);
      renderPredictSuggestions({
        container: suggestions,
        players: [],
        error: true,
      });
      suggestions.classList.add("active");
    }
  }

  async function selectPredictPlayer(playerId, playerName) {
    predictSelectedPlayer = { id: playerId, name: playerName };
    $("predictSearchInput").value = playerName;
    $("predictSuggestions").classList.remove("active");

    await generatePrediction(playerId);
  }

  async function generatePrediction(playerId) {
    try {
      // Get player's recent game log
      const gamelog = await fetchPlayerGamelog(playerId);
      const player = await fetchPlayerDetail(playerId);

      if (!gamelog || gamelog.length < 3) {
        $("predictResult").style.display = "block";
        $("predictPlayerInfo").innerHTML =
          `<div class="predict-error">충분한 경기 데이터가 없습니다 (최소 3경기 필요)</div>`;
        $("predictCards").innerHTML = "";
        $("predictFactors").innerHTML = "";
        return;
      }

      // Calculate predictions
      const prediction = calculatePrediction(gamelog, player);

      renderPredictPlayerInfo({ container: $("predictPlayerInfo"), player });
      renderPredictCards({ container: $("predictCards"), prediction });
      renderPredictFactors({ container: $("predictFactors"), prediction });

      // Render trend chart
      renderPredictTrendChart(gamelog, prediction);

      $("predictResult").style.display = "block";
    } catch (error) {
      console.error("Prediction failed:", error);
      $("predictResult").style.display = "block";
      $("predictPlayerInfo").innerHTML =
        `<div class="predict-error">예측 생성에 실패했습니다</div>`;
    }
  }

  function renderPredictTrendChart(gamelog, prediction) {
    const canvas = $("predictTrendChart");
    if (!canvas || !window.Chart) return;

    if (predictTrendChart) {
      predictTrendChart.destroy();
    }

    // Take last 10 games, reversed for chronological order
    const games = gamelog.slice(0, 10).reverse();
    const labels = games.map((g) => formatDate(g.game_date));

    // Add prediction point
    labels.push("예측");

    const ctx = canvas.getContext("2d");

    predictTrendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "득점",
            data: [...games.map((g) => g.pts), prediction.pts.predicted],
            borderColor: "#d94f31",
            backgroundColor: "rgba(217, 79, 49, 0.1)",
            tension: 0.3,
            fill: false,
            pointRadius: (ctx) => (ctx.dataIndex === games.length ? 8 : 4),
            pointBackgroundColor: (ctx) =>
              ctx.dataIndex === games.length ? "#d94f31" : "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "리바운드",
            data: [...games.map((g) => g.reb), prediction.reb.predicted],
            borderColor: "#2a5d9f",
            backgroundColor: "rgba(42, 93, 159, 0.1)",
            tension: 0.3,
            fill: false,
            pointRadius: (ctx) => (ctx.dataIndex === games.length ? 8 : 4),
            pointBackgroundColor: (ctx) =>
              ctx.dataIndex === games.length ? "#2a5d9f" : "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "어시스트",
            data: [...games.map((g) => g.ast), prediction.ast.predicted],
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            tension: 0.3,
            fill: false,
            pointRadius: (ctx) => (ctx.dataIndex === games.length ? 8 : 4),
            pointBackgroundColor: (ctx) =>
              ctx.dataIndex === games.length ? "#10b981" : "#fff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 20,
            },
          },
          tooltip: {
            backgroundColor: "rgba(27, 28, 31, 0.9)",
            padding: 12,
            cornerRadius: 8,
          },
          annotation: {
            annotations: {
              predictionLine: {
                type: "line",
                xMin: games.length - 0.5,
                xMax: games.length - 0.5,
                borderColor: "rgba(0, 0, 0, 0.2)",
                borderWidth: 2,
                borderDash: [5, 5],
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(27, 28, 31, 0.08)",
            },
          },
          x: {
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // =============================================================================
  // Global Search
  // =============================================================================

  let globalSearchIndex = -1;

  function openGlobalSearch() {
    const modal = $("searchModal");
    if (!modal) return;
    modal.style.display = "flex";
    $("globalSearchInput").value = "";
    $("globalSearchResults").innerHTML = "";
    globalSearchIndex = -1;
    setTimeout(() => $("globalSearchInput").focus(), 50);
  }

  function closeGlobalSearch() {
    const modal = $("searchModal");
    if (modal) modal.style.display = "none";
  }

  async function handleGlobalSearch(query) {
    const results = $("globalSearchResults");
    if (!query || query.length < 1) {
      results.innerHTML = "";
      globalSearchIndex = -1;
      return;
    }

    try {
      const data = await fetchSearch(query);
      const players = data.players || [];
      const teams = data.teams || [];

      if (players.length === 0 && teams.length === 0) {
        results.innerHTML =
          '<div class="search-no-results">검색 결과가 없습니다</div>';
        globalSearchIndex = -1;
        return;
      }

      let html = "";
      if (players.length > 0) {
        html +=
          '<div class="search-result-group"><div class="search-result-group-title">선수</div>';
        html += players
          .map(
            (p, i) => `
          <div class="search-result-item" data-type="player" data-id="${p.id}" data-index="${i}">
            <div class="search-result-icon">👤</div>
            <div class="search-result-info">
              <div class="search-result-name">${p.name}</div>
              <div class="search-result-meta">${p.team} · ${p.position || "-"}</div>
            </div>
          </div>
        `,
          )
          .join("");
        html += "</div>";
      }

      if (teams.length > 0) {
        html +=
          '<div class="search-result-group"><div class="search-result-group-title">팀</div>';
        html += teams
          .map(
            (t, i) => `
          <div class="search-result-item" data-type="team" data-id="${t.id}" data-index="${players.length + i}">
            <div class="search-result-icon">🏀</div>
            <div class="search-result-info">
              <div class="search-result-name">${t.name}</div>
              <div class="search-result-meta">${t.short_name}</div>
            </div>
          </div>
        `,
          )
          .join("");
        html += "</div>";
      }

      results.innerHTML = html;
      globalSearchIndex = -1;
    } catch (error) {
      console.error("Global search failed:", error);
      results.innerHTML = '<div class="search-no-results">검색 오류</div>';
    }
  }

  function navigateGlobalSearch(direction) {
    const items = document.querySelectorAll(".search-result-item");
    if (items.length === 0) return;

    items.forEach((item) => item.classList.remove("active"));
    globalSearchIndex += direction;

    if (globalSearchIndex < 0) globalSearchIndex = items.length - 1;
    if (globalSearchIndex >= items.length) globalSearchIndex = 0;

    items[globalSearchIndex].classList.add("active");
    items[globalSearchIndex].scrollIntoView({ block: "nearest" });
  }

  function selectGlobalSearchItem() {
    const items = document.querySelectorAll(".search-result-item");
    if (globalSearchIndex < 0 || globalSearchIndex >= items.length) return;

    const item = items[globalSearchIndex];
    const type = item.dataset.type;
    const id = item.dataset.id;

    closeGlobalSearch();

    if (type === "player") {
      navigate(`/players/${id}`);
    } else if (type === "team") {
      navigate(`/teams/${id}`);
    }
  }

  // =============================================================================
  // Event Handlers
  // =============================================================================

  function initEventListeners() {
    // Mobile nav menu
    const mainNav = $("mainNav");
    const navToggle = $("navToggle");
    const navMenu = $("navMenu");
    if (unmountResponsiveNav) {
      unmountResponsiveNav();
      unmountResponsiveNav = null;
    }
    if (mainNav && navToggle && navMenu) {
      unmountResponsiveNav = mountResponsiveNav({
        mainNav,
        navToggle,
        navMenu,
        documentRef: document,
        windowRef: window,
      });
    }

    // Season selects
    [
      "seasonSelect",
      "teamsSeasonSelect",
      "gamesSeasonSelect",
      "leadersSeasonSelect",
      "compareSeasonSelect",
      "scheduleSeasonSelect",
      "predictSeasonSelect",
    ].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener("change", (e) => {
          state.currentSeason = e.target.value;
          handleRoute();
        });
      }
    });

    // Filters
    ["teamSelect", "posSelect"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", applyFilters);
    });

    const standingsTable = $("standingsTable");
    if (standingsTable) {
      standingsTable.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        const key = th?.dataset?.key;
        if (!key) return;

        const isSame = state.standingsSort.key === key;
        state.standingsSort = {
          key,
          dir: isSame && state.standingsSort.dir === "desc" ? "asc" : "desc",
        };
        const sorted = sortStandings(state.standings, state.standingsSort);
        renderStandingsTable({ tbody: $("standingsBody"), standings: sorted });
      });
    }

    // Search
    const searchInput = $("searchInput");
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce(applyFilters, CONFIG.debounceDelay),
      );
    }

    if (unmountPlayersSortEvents) {
      unmountPlayersSortEvents();
      unmountPlayersSortEvents = null;
    }
    const statsTable = $("statsTable");
    unmountPlayersSortEvents = mountPlayersTableSortEvents({
      tableEl: statsTable,
      onSort: (key) => {
        const isSame = state.sort.key === key;
        state.sort = {
          key,
          dir: isSame && state.sort.dir === "desc" ? "asc" : "desc",
        };
        sortAndRender();
      },
    });

    // Table row click -> show in card
    const statsBody = $("statsBody");
    if (statsBody) {
      statsBody.addEventListener("click", (e) => {
        const row = e.target.closest("tr");
        if (!row) return;
        const index = parseInt(row.dataset.index, 10);
        if (!isNaN(index) && state.currentSortedPlayers[index]) {
          renderPlayerCard(state.currentSortedPlayers[index]);
        }
      });
    }

    // Hash change
    window.addEventListener("hashchange", handleRoute);

    if (unmountCompareEvents) {
      unmountCompareEvents();
      unmountCompareEvents = null;
    }
    unmountCompareEvents = mountCompareEvents({
      getById: $,
      documentRef: document,
      state,
      debounce,
      delay: CONFIG.debounceDelay,
      onSearch: handleCompareSearch,
      onAddPlayer: addComparePlayer,
      onRemovePlayer: removeComparePlayer,
      onExecute: executeComparison,
    });

    if (unmountGlobalSearchEvents) {
      unmountGlobalSearchEvents();
      unmountGlobalSearchEvents = null;
    }
    unmountGlobalSearchEvents = mountGlobalSearchEvents({
      getById: $,
      documentRef: document,
      debounce,
      delay: CONFIG.debounceDelay,
      onOpen: openGlobalSearch,
      onClose: closeGlobalSearch,
      onSearch: handleGlobalSearch,
      onNavigate: navigateGlobalSearch,
      onSelect: selectGlobalSearchItem,
      onResultSelect: (type, id) => {
        closeGlobalSearch();
        if (type === "player") navigate(`/players/${id}`);
        if (type === "team") navigate(`/teams/${id}`);
      },
    });

    // Schedule page - team filter
    const scheduleTeamSelect = $("scheduleTeamSelect");
    if (scheduleTeamSelect) {
      scheduleTeamSelect.addEventListener("change", refreshSchedule);
    }

    if (unmountPredictEvents) {
      unmountPredictEvents();
      unmountPredictEvents = null;
    }
    unmountPredictEvents = mountPredictEvents({
      getById: $,
      documentRef: document,
      debounce,
      delay: CONFIG.debounceDelay,
      onSearch: handlePredictSearch,
      onSelectPlayer: selectPredictPlayer,
    });
  }

  // =============================================================================
  // Initialize
  // =============================================================================

  async function init() {
    // Initialize local database (sql.js) for static hosting
    // This is the primary data source for GitHub Pages
    try {
      await initLocalDb();
    } catch (e) {
      console.warn(
        "[app.js] Local database not available, using JSON fallback",
      );
    }

    hideSkeleton(document.getElementById("skeletonUI"));

    // Preload detail DB in background (fire-and-forget)
    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      WKBLDatabase.initDetailDatabase().catch(() => {});
    }

    initEventListeners();
    handleRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
