import {
  buildPredictionCompareState,
  buildStandingsChartSeries,
  calculatePrediction,
  filterPlayers,
  renderBoxscoreRows,
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
  sortStandings,
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

      const homeLineup = generateOptimalLineup(homeRoster);
      const awayLineup = generateOptimalLineup(awayRoster);

      console.log("Home lineup:", homeLineup.length, "players");
      console.log("Away lineup:", awayLineup.length, "players");

      if (homeLineup.length === 0 && awayLineup.length === 0) {
        console.warn("No lineup data available");
        mainLineupGrid.style.display = "none";
        $("predictionExplanation").style.display = "none";
        return;
      }

      // Calculate predictions for each player
      const homePredictions = await Promise.all(
        homeLineup.map((p) => getPlayerPrediction(p, true)),
      );
      const awayPredictions = await Promise.all(
        awayLineup.map((p) => getPlayerPrediction(p, false)),
      );

      // Calculate win probability
      const homeStrength = calculateTeamStrength(
        homePredictions,
        homeStanding,
        true,
      );
      const awayStrength = calculateTeamStrength(
        awayPredictions,
        awayStanding,
        false,
      );
      const totalStrength = homeStrength + awayStrength;
      const homeWinProb =
        totalStrength > 0
          ? ((homeStrength / totalStrength) * 100).toFixed(0)
          : 50;
      const awayWinProb = 100 - homeWinProb;

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

  function generateOptimalLineup(roster) {
    if (!roster || roster.length === 0) return [];

    // Sort by PIR (Performance Index Rating) as primary metric
    const sorted = [...roster].sort((a, b) => (b.pir || 0) - (a.pir || 0));

    // Select optimal 5: try to get position diversity
    const lineup = [];
    const positions = { G: 0, F: 0, C: 0 };
    const positionLimits = { G: 2, F: 2, C: 1 }; // Typical basketball formation

    // First pass: select by position
    for (const player of sorted) {
      if (lineup.length >= 5) break;
      const pos = player.pos || "F";
      const mainPos = pos.charAt(0); // Get first character (G, F, or C)

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

  async function getPlayerPrediction(player, isHome) {
    // Get recent games for prediction
    let recentGames = [];
    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      recentGames = WKBLDatabase.getPlayerGamelog(
        player.id,
        state.currentSeason,
        10,
      );
    }

    const prediction = {
      player: player,
      pts: { pred: 0, low: 0, high: 0 },
      reb: { pred: 0, low: 0, high: 0 },
      ast: { pred: 0, low: 0, high: 0 },
    };

    if (recentGames.length === 0) {
      // Use season averages if no game log
      prediction.pts.pred = player.pts || 0;
      prediction.reb.pred = player.reb || 0;
      prediction.ast.pred = player.ast || 0;
      return prediction;
    }

    // Calculate predictions for each stat
    ["pts", "reb", "ast"].forEach((stat) => {
      const values = recentGames.map((g) => g[stat] || 0);
      const recent5 = values.slice(0, 5);
      const recent10 = values.slice(0, 10);

      const avg5 =
        recent5.length > 0
          ? recent5.reduce((a, b) => a + b, 0) / recent5.length
          : 0;
      const avg10 =
        recent10.length > 0
          ? recent10.reduce((a, b) => a + b, 0) / recent10.length
          : 0;

      // Weighted average: 60% recent 5, 40% recent 10
      let basePred = avg5 * 0.6 + avg10 * 0.4;

      // Home advantage (5%)
      if (isHome) {
        basePred *= 1.05;
      } else {
        basePred *= 0.97;
      }

      // Trend bonus
      const seasonAvg = player[stat] || 0;
      if (avg5 > seasonAvg * 1.1) {
        basePred *= 1.05; // Hot streak
      } else if (avg5 < seasonAvg * 0.9) {
        basePred *= 0.95; // Cold streak
      }

      // Standard deviation for confidence interval
      const stdDev =
        Math.sqrt(
          values.reduce((acc, v) => acc + Math.pow(v - avg10, 2), 0) /
            values.length,
        ) || basePred * 0.15;

      prediction[stat] = {
        pred: basePred,
        low: Math.max(0, basePred - stdDev),
        high: basePred + stdDev,
      };
    });

    return prediction;
  }

  function calculateTeamStrength(predictions, standing, isHome) {
    // Base strength from predicted stats
    let strength = predictions.reduce((acc, p) => {
      return (
        acc +
        (p.pts.pred || 0) +
        (p.reb.pred || 0) * 0.5 +
        (p.ast.pred || 0) * 0.7
      );
    }, 0);

    // Factor in team record
    if (standing) {
      const winPct = standing.win_pct || 0.5;
      strength *= 0.5 + winPct;

      // Home/away specific performance
      if (isHome && standing.home_wins !== undefined) {
        const homeWinPct =
          standing.home_total > 0
            ? standing.home_wins / standing.home_total
            : 0.5;
        strength *= 0.8 + homeWinPct * 0.4;
      } else if (!isHome && standing.away_wins !== undefined) {
        const awayWinPct =
          standing.away_total > 0
            ? standing.away_wins / standing.away_total
            : 0.5;
        strength *= 0.8 + awayWinPct * 0.4;
      }
    }

    // Home advantage
    if (isHome) {
      strength *= 1.05;
    }

    return strength;
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
      desc: "코트마진(출전 시간 가중 득실차). +는 팀이 이긴 시간, -는 밀린 시간을 의미합니다.",
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
      key: "plus_minus",
      label: "+/-/G",
      format: "signed",
      desc: "출전 시간 기준 경기당 평균 득실점 차. +일수록 팀에 유리한 결과입니다.",
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
      const advLabel = $("advancedSeasonLabel");
      if (latestSeason && advGrid) {
        if (advLabel) {
          advLabel.textContent =
            latestSeason.season_label || latestSeason.season_id || "";
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

  async function loadGamePage(gameId) {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      const game = await fetchGameBoxscore(gameId);

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

        const stats = ["pts", "reb", "ast"];
        const statLabels = { pts: "득점", reb: "리바운드", ast: "어시스트" };
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
                  <th colspan="3">득점</th>
                  <th colspan="3">리바운드</th>
                  <th colspan="3">어시스트</th>
                </tr>
                <tr>
                  <th></th>
                  <th>예측</th><th>실제</th><th>차이</th>
                  <th>예측</th><th>실제</th><th>차이</th>
                  <th>예측</th><th>실제</th><th>차이</th>
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
          const totals = {
            pts: { pred: 0, low: 0, high: 0 },
            reb: { pred: 0, low: 0, high: 0 },
            ast: { pred: 0, low: 0, high: 0 },
          };
          teamPlayers.forEach((p) => {
            totals.pts.pred += p.predicted_pts || 0;
            totals.pts.low += p.predicted_pts_low || 0;
            totals.pts.high += p.predicted_pts_high || 0;
            totals.reb.pred += p.predicted_reb || 0;
            totals.reb.low += p.predicted_reb_low || 0;
            totals.reb.high += p.predicted_reb_high || 0;
            totals.ast.pred += p.predicted_ast || 0;
            totals.ast.low += p.predicted_ast_low || 0;
            totals.ast.high += p.predicted_ast_high || 0;
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
        const totalsHtml =
          awayTotals && homeTotals
            ? `
          <div class="pred-total-stats">
            <div class="pred-total-team">
              <div class="pred-total-header">${game.away_team_name}</div>
              <div class="lineup-total-stats">
                <div class="total-stat">
                  <span class="stat-label">총 득점</span>
                  <span class="stat-value">${formatNumber(awayTotals.pts.pred)}</span>
                  <span class="stat-range">${formatRange(awayTotals.pts.low, awayTotals.pts.high)}</span>
                </div>
                <div class="total-stat">
                  <span class="stat-label">총 리바운드</span>
                  <span class="stat-value">${formatNumber(awayTotals.reb.pred)}</span>
                  <span class="stat-range">${formatRange(awayTotals.reb.low, awayTotals.reb.high)}</span>
                </div>
                <div class="total-stat">
                  <span class="stat-label">총 어시스트</span>
                  <span class="stat-value">${formatNumber(awayTotals.ast.pred)}</span>
                  <span class="stat-range">${formatRange(awayTotals.ast.low, awayTotals.ast.high)}</span>
                </div>
              </div>
            </div>
            <div class="pred-total-team">
              <div class="pred-total-header">${game.home_team_name}</div>
              <div class="lineup-total-stats">
                <div class="total-stat">
                  <span class="stat-label">총 득점</span>
                  <span class="stat-value">${formatNumber(homeTotals.pts.pred)}</span>
                  <span class="stat-range">${formatRange(homeTotals.pts.low, homeTotals.pts.high)}</span>
                </div>
                <div class="total-stat">
                  <span class="stat-label">총 리바운드</span>
                  <span class="stat-value">${formatNumber(homeTotals.reb.pred)}</span>
                  <span class="stat-range">${formatRange(homeTotals.reb.low, homeTotals.reb.high)}</span>
                </div>
                <div class="total-stat">
                  <span class="stat-label">총 어시스트</span>
                  <span class="stat-value">${formatNumber(homeTotals.ast.pred)}</span>
                  <span class="stat-range">${formatRange(homeTotals.ast.low, homeTotals.ast.high)}</span>
                </div>
              </div>
            </div>
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

      const { awayRows, homeRows } = renderBoxscoreRows({
        game,
        predictions,
        predictionMap,
        getPredStyle,
        formatNumber,
        formatPct,
      });
      $("boxscoreAwayBody").innerHTML = awayRows;
      $("boxscoreHomeBody").innerHTML = homeRows;

      // Show prediction legend if predictions exist
      const legendEl = $("boxscorePredictionLegend");
      if (predictions.players.length > 0 && game.home_score !== null) {
        legendEl.style.display = "block";
      } else {
        legendEl.style.display = "none";
      }
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
        ${players.map((p) => `<th>${p.name}</th>`).join("")}
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

    initEventListeners();
    handleRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
