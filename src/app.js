(function () {
  "use strict";

  // =============================================================================
  // Configuration
  // =============================================================================

  const CONFIG = {
    apiBase: "/api",
    dataPath: "./data/wkbl-active.json",
    fallbackPath: "./data/sample.json",
    debounceDelay: 150,
    defaultSeason: "046",
  };

  const SEASONS = {
    "046": "2025-26",
    "045": "2024-25",
    "044": "2023-24",
    "043": "2022-23",
    "042": "2021-22",
    "041": "2020-21",
  };

  const LEADER_CATEGORIES = [
    { key: "pts", label: "득점", unit: "PPG" },
    { key: "reb", label: "리바운드", unit: "RPG" },
    { key: "ast", label: "어시스트", unit: "APG" },
    { key: "stl", label: "스틸", unit: "SPG" },
    { key: "blk", label: "블록", unit: "BPG" },
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
    useApi: true, // Try API first, fallback to local DB, then JSON
    useLocalDb: false, // Use sql.js local database
    dbInitialized: false,
    // Compare page state
    compareSelectedPlayers: [],
    compareSearchResults: [],
  };

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
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
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
      state.useLocalDb = true;
      console.log("[app.js] Local database initialized");
      return true;
    } catch (e) {
      console.warn("[app.js] Local database init failed:", e.message);
      return false;
    }
  }

  async function apiGet(endpoint) {
    const res = await fetch(`${CONFIG.apiBase}${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async function fetchPlayers(season) {
    // Try local database first (for GitHub Pages)
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          const activeOnly = season !== "all";
          const seasonId = season === "all" ? null : season;
          return WKBLDatabase.getPlayers(seasonId, null, activeOnly);
        }
      } catch (e) {
        console.warn("Local DB failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const activeOnly = season !== "all";
        const data = await apiGet(`/players?season=${season}&active_only=${activeOnly}`);
        return data.players;
      } catch (e) {
        console.warn("API failed, trying local DB:", e.message);
        state.useApi = false;

        // Try local database as fallback
        try {
          await initLocalDb();
          if (state.dbInitialized) {
            const activeOnly = season !== "all";
            const seasonId = season === "all" ? null : season;
            return WKBLDatabase.getPlayers(seasonId, null, activeOnly);
          }
        } catch (dbError) {
          console.warn("Local DB fallback failed:", dbError.message);
        }
      }
    }

    // Final fallback to JSON file
    const res = await fetch(CONFIG.dataPath);
    if (!res.ok) throw new Error("Data not found");
    const data = await res.json();
    return data.players;
  }

  async function fetchPlayerDetail(playerId) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          const player = WKBLDatabase.getPlayerDetail(playerId);
          if (player) return player;
        }
      } catch (e) {
        console.warn("Local DB fetchPlayerDetail failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        return await apiGet(`/players/${playerId}`);
      } catch (e) {
        console.warn("API fetchPlayerDetail failed:", e.message);
        state.useApi = false;
        // Try local DB as fallback
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getPlayerDetail(playerId);
        }
      }
    }

    throw new Error("Player not found");
  }

  async function fetchPlayerGamelog(playerId) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getPlayerGamelog(playerId);
        }
      } catch (e) {
        console.warn("Local DB fetchPlayerGamelog failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const data = await apiGet(`/players/${playerId}/gamelog`);
        return data.games;
      } catch (e) {
        console.warn("API fetchPlayerGamelog failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getPlayerGamelog(playerId);
        }
      }
    }

    return [];
  }

  async function fetchTeams() {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return { teams: WKBLDatabase.getTeams() };
        }
      } catch (e) {
        console.warn("Local DB fetchTeams failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        return await apiGet("/teams");
      } catch (e) {
        console.warn("API fetchTeams failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return { teams: WKBLDatabase.getTeams() };
        }
      }
    }

    return { teams: [] };
  }

  async function fetchStandings(season) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          const standings = WKBLDatabase.getStandings(season);
          return {
            season: season,
            season_label: SEASONS[season] || season,
            standings: standings,
          };
        }
      } catch (e) {
        console.warn("Local DB fetchStandings failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        return await apiGet(`/seasons/${season}/standings`);
      } catch (e) {
        console.warn("API fetchStandings failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          const standings = WKBLDatabase.getStandings(season);
          return {
            season: season,
            season_label: SEASONS[season] || season,
            standings: standings,
          };
        }
      }
    }

    return { standings: [] };
  }

  async function fetchTeamDetail(teamId, season) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          const team = WKBLDatabase.getTeamDetail(teamId, season);
          if (team) return { season: season, ...team };
        }
      } catch (e) {
        console.warn("Local DB fetchTeamDetail failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        return await apiGet(`/teams/${teamId}?season=${season}`);
      } catch (e) {
        console.warn("API fetchTeamDetail failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          const team = WKBLDatabase.getTeamDetail(teamId, season);
          if (team) return { season: season, ...team };
        }
      }
    }

    throw new Error("Team not found");
  }

  async function fetchGames(season) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getGames(season, null, null, 50, 0);
        }
      } catch (e) {
        console.warn("Local DB fetchGames failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const data = await apiGet(`/games?season=${season}&limit=50`);
        return data.games;
      } catch (e) {
        console.warn("API fetchGames failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getGames(season, null, null, 50, 0);
        }
      }
    }

    return [];
  }

  async function fetchGameBoxscore(gameId) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          const boxscore = WKBLDatabase.getGameBoxscore(gameId);
          if (boxscore) return boxscore;
        }
      } catch (e) {
        console.warn("Local DB fetchGameBoxscore failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        return await apiGet(`/games/${gameId}`);
      } catch (e) {
        console.warn("API fetchGameBoxscore failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getGameBoxscore(gameId);
        }
      }
    }

    throw new Error("Game not found");
  }

  async function fetchLeaders(season, category, limit = 10) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getLeaders(season, category, limit);
        }
      } catch (e) {
        console.warn("Local DB fetchLeaders failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const data = await apiGet(`/leaders?season=${season}&category=${category}&limit=${limit}`);
        return data.leaders;
      } catch (e) {
        console.warn("API fetchLeaders failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getLeaders(season, category, limit);
        }
      }
    }

    return [];
  }

  async function fetchAllLeaders(season) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getLeadersAll(season, 5);
        }
      } catch (e) {
        console.warn("Local DB fetchAllLeaders failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const data = await apiGet(`/leaders/all?season=${season}&limit=5`);
        return data.categories;
      } catch (e) {
        console.warn("API fetchAllLeaders failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getLeadersAll(season, 5);
        }
      }
    }

    return {};
  }

  async function fetchSearch(query, limit = 10) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.search(query, limit);
        }
      } catch (e) {
        console.warn("Local DB fetchSearch failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const data = await apiGet(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        return data;
      } catch (e) {
        console.warn("API fetchSearch failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.search(query, limit);
        }
      }
    }

    return { players: [], teams: [] };
  }

  async function fetchComparePlayers(playerIds, season) {
    // Try local database first
    if (state.useLocalDb || !state.useApi) {
      try {
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getPlayerComparison(playerIds, season);
        }
      } catch (e) {
        console.warn("Local DB fetchComparePlayers failed:", e.message);
      }
    }

    // Try API
    if (state.useApi) {
      try {
        const ids = playerIds.join(",");
        const data = await apiGet(`/players/compare?ids=${ids}&season=${season}`);
        return data.players;
      } catch (e) {
        console.warn("API fetchComparePlayers failed:", e.message);
        state.useApi = false;
        await initLocalDb();
        if (state.dbInitialized) {
          return WKBLDatabase.getPlayerComparison(playerIds, season);
        }
      }
    }

    return [];
  }

  // =============================================================================
  // Router
  // =============================================================================

  function getRoute() {
    const hash = window.location.hash.slice(1) || "/";
    const parts = hash.split("/").filter(Boolean);
    return { path: parts[0] || "", id: parts[1] || null };
  }

  function navigate(path) {
    window.location.hash = path;
  }

  function updateNavLinks() {
    const { path } = getRoute();
    document.querySelectorAll(".nav-link").forEach((link) => {
      const href = link.getAttribute("href").slice(1);
      const linkPath = href.split("/")[1] || "";
      link.classList.toggle("active", linkPath === path || (linkPath === "" && path === ""));
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
    updateNavLinks();

    try {
      switch (path) {
        case "":
          showView("main");
          await loadMainPage();
          break;
        case "players":
          if (id) {
            showView("player");
            await loadPlayerPage(id);
          } else {
            showView("players");
            await loadPlayersPage();
          }
          break;
        case "teams":
          if (id) {
            showView("team");
            await loadTeamPage(id);
          } else {
            showView("teams");
            await loadTeamsPage();
          }
          break;
        case "games":
          if (id) {
            showView("game");
            await loadGamePage(id);
          } else {
            showView("games");
            await loadGamesPage();
          }
          break;
        case "leaders":
          showView("leaders");
          await loadLeadersPage();
          break;
        case "compare":
          showView("compare");
          await loadComparePage();
          break;
        case "schedule":
          showView("schedule");
          await loadSchedulePage();
          break;
        case "predict":
          showView("predict");
          await loadPredictPage();
          break;
        default:
          showView("main");
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

    let nextGame = state.dbInitialized && typeof WKBLDatabase !== "undefined"
      ? WKBLDatabase.getNextGame(state.currentSeason)
      : null;

    const mainGameCard = $("mainGameCard");
    const mainNoGame = $("mainNoGame");
    const mainLineupGrid = $("mainLineupGrid");

    // If no upcoming game, get most recent game and show as "recent matchup preview"
    let isRecentGame = false;
    if (!nextGame && state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      const recentGames = WKBLDatabase.getRecentGames(state.currentSeason, null, 1);
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
    const standings = state.dbInitialized && typeof WKBLDatabase !== "undefined"
      ? WKBLDatabase.getStandings(state.currentSeason)
      : [];
    const standingsMap = new Map(standings.map(s => [s.team_id, s]));

    // Populate game card
    const homeStanding = standingsMap.get(nextGame.home_team_id);
    const awayStanding = standingsMap.get(nextGame.away_team_id);

    $("mainHomeTeam").querySelector(".team-name").textContent = nextGame.home_team_short || nextGame.home_team_name;
    $("mainHomeTeam").querySelector(".team-record").textContent = homeStanding
      ? `${homeStanding.wins}승 ${homeStanding.losses}패`
      : "-";

    $("mainAwayTeam").querySelector(".team-name").textContent = nextGame.away_team_short || nextGame.away_team_name;
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
      $("mainPredictionDate").textContent = formatFullDate(nextGame.game_date) + " 경기 결과";
    } else {
      $("mainCountdown").textContent = diffDays === 0 ? "TODAY" : `D-${diffDays}`;
      $("mainPredictionTitle").textContent = "다음 경기 예측";
      $("mainPredictionDate").textContent = formatFullDate(nextGame.game_date) + " 경기";
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
      const homePredictions = await Promise.all(homeLineup.map(p => getPlayerPrediction(p, true)));
      const awayPredictions = await Promise.all(awayLineup.map(p => getPlayerPrediction(p, false)));

      // Calculate win probability
      const homeStrength = calculateTeamStrength(homePredictions, homeStanding, true);
      const awayStrength = calculateTeamStrength(awayPredictions, awayStanding, false);
      const totalStrength = homeStrength + awayStrength;
      const homeWinProb = totalStrength > 0 ? (homeStrength / totalStrength * 100).toFixed(0) : 50;
      const awayWinProb = 100 - homeWinProb;

      // Render lineups
      $("homeLineupTitle").textContent = `${nextGame.home_team_short || nextGame.home_team_name} 추천 라인업 (홈)`;
      $("awayLineupTitle").textContent = `${nextGame.away_team_short || nextGame.away_team_name} 추천 라인업 (원정)`;

      $("homeWinProb").textContent = homeWinProb + "%";
      $("awayWinProb").textContent = awayWinProb + "%";
      $("homeWinProb").className = `prob-value ${homeWinProb >= 50 ? "prob-high" : "prob-low"}`;
      $("awayWinProb").className = `prob-value ${awayWinProb >= 50 ? "prob-high" : "prob-low"}`;

      renderLineupPlayers($("homeLineupPlayers"), homeLineup, homePredictions);
      renderLineupPlayers($("awayLineupPlayers"), awayLineup, awayPredictions);

      // Render total stats
      renderTotalStats($("homeTotalStats"), homePredictions);
      renderTotalStats($("awayTotalStats"), awayPredictions);

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
      return players.filter(p => p.gp > 0); // Only players with game time
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
      if (!lineup.find(p => p.id === player.id)) {
        lineup.push(player);
      }
    }

    return lineup.slice(0, 5);
  }

  async function getPlayerPrediction(player, isHome) {
    // Get recent games for prediction
    let recentGames = [];
    if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
      recentGames = WKBLDatabase.getPlayerGamelog(player.id, state.currentSeason, 10);
    }

    const prediction = {
      player: player,
      pts: { pred: 0, low: 0, high: 0 },
      reb: { pred: 0, low: 0, high: 0 },
      ast: { pred: 0, low: 0, high: 0 }
    };

    if (recentGames.length === 0) {
      // Use season averages if no game log
      prediction.pts.pred = player.pts || 0;
      prediction.reb.pred = player.reb || 0;
      prediction.ast.pred = player.ast || 0;
      return prediction;
    }

    // Calculate predictions for each stat
    ["pts", "reb", "ast"].forEach(stat => {
      const values = recentGames.map(g => g[stat] || 0);
      const recent5 = values.slice(0, 5);
      const recent10 = values.slice(0, 10);

      const avg5 = recent5.length > 0 ? recent5.reduce((a, b) => a + b, 0) / recent5.length : 0;
      const avg10 = recent10.length > 0 ? recent10.reduce((a, b) => a + b, 0) / recent10.length : 0;

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
      const stdDev = Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avg10, 2), 0) / values.length) || basePred * 0.15;

      prediction[stat] = {
        pred: basePred,
        low: Math.max(0, basePred - stdDev),
        high: basePred + stdDev
      };
    });

    return prediction;
  }

  function calculateTeamStrength(predictions, standing, isHome) {
    // Base strength from predicted stats
    let strength = predictions.reduce((acc, p) => {
      return acc + (p.pts.pred || 0) + (p.reb.pred || 0) * 0.5 + (p.ast.pred || 0) * 0.7;
    }, 0);

    // Factor in team record
    if (standing) {
      const winPct = standing.win_pct || 0.5;
      strength *= (0.5 + winPct);

      // Home/away specific performance
      if (isHome && standing.home_wins !== undefined) {
        const homeWinPct = standing.home_total > 0
          ? standing.home_wins / standing.home_total
          : 0.5;
        strength *= (0.8 + homeWinPct * 0.4);
      } else if (!isHome && standing.away_wins !== undefined) {
        const awayWinPct = standing.away_total > 0
          ? standing.away_wins / standing.away_total
          : 0.5;
        strength *= (0.8 + awayWinPct * 0.4);
      }
    }

    // Home advantage
    if (isHome) {
      strength *= 1.05;
    }

    return strength;
  }

  function renderLineupPlayers(container, lineup, predictions) {
    if (!container) return;

    container.innerHTML = lineup.map((player, i) => {
      const pred = predictions[i];
      return `
        <div class="lineup-player-card">
          <div class="lineup-player-info">
            <span class="lineup-player-pos">${player.pos || "-"}</span>
            <a href="#/players/${player.id}" class="lineup-player-name">${player.name}</a>
          </div>
          <div class="lineup-player-stats">
            <div class="lineup-stat">
              <span class="stat-label">PTS</span>
              <span class="stat-value">${formatNumber(pred.pts.pred)}</span>
              <span class="stat-range">${formatNumber(pred.pts.low)}-${formatNumber(pred.pts.high)}</span>
            </div>
            <div class="lineup-stat">
              <span class="stat-label">REB</span>
              <span class="stat-value">${formatNumber(pred.reb.pred)}</span>
              <span class="stat-range">${formatNumber(pred.reb.low)}-${formatNumber(pred.reb.high)}</span>
            </div>
            <div class="lineup-stat">
              <span class="stat-label">AST</span>
              <span class="stat-value">${formatNumber(pred.ast.pred)}</span>
              <span class="stat-range">${formatNumber(pred.ast.low)}-${formatNumber(pred.ast.high)}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderTotalStats(container, predictions) {
    if (!container) return;

    const totals = predictions.reduce((acc, p) => {
      acc.pts += p.pts.pred;
      acc.reb += p.reb.pred;
      acc.ast += p.ast.pred;
      return acc;
    }, { pts: 0, reb: 0, ast: 0 });

    container.innerHTML = `
      <div class="total-stat">
        <span class="stat-label">총 득점</span>
        <span class="stat-value">${formatNumber(totals.pts)}</span>
      </div>
      <div class="total-stat">
        <span class="stat-label">총 리바운드</span>
        <span class="stat-value">${formatNumber(totals.reb)}</span>
      </div>
      <div class="total-stat">
        <span class="stat-label">총 어시스트</span>
        <span class="stat-value">${formatNumber(totals.ast)}</span>
      </div>
    `;
  }

  // =============================================================================
  // Players Page (Player List)
  // =============================================================================

  const primaryStats = [
    { key: "pts", label: "PTS", desc: "Points - 경기당 평균 득점" },
    { key: "reb", label: "REB", desc: "Rebounds - 경기당 평균 리바운드" },
    { key: "ast", label: "AST", desc: "Assists - 경기당 평균 어시스트" },
    { key: "stl", label: "STL", desc: "Steals - 경기당 평균 스틸" },
    { key: "blk", label: "BLK", desc: "Blocks - 경기당 평균 블록" },
    { key: "tov", label: "TOV", desc: "Turnovers - 경기당 평균 턴오버" },
    { key: "fgp", label: "FG%", format: "pct", desc: "Field Goal % - 야투 성공률" },
    { key: "tpp", label: "3P%", format: "pct", desc: "3-Point % - 3점슛 성공률" },
    { key: "ftp", label: "FT%", format: "pct", desc: "Free Throw % - 자유투 성공률" },
  ];

  const advancedStats = [
    { key: "ts_pct", label: "TS%", format: "pct", desc: "True Shooting %" },
    { key: "efg_pct", label: "eFG%", format: "pct", desc: "Effective FG%" },
    { key: "ast_to", label: "AST/TO", format: "ratio", desc: "Assist to Turnover Ratio" },
    { key: "pir", label: "PIR", format: "number", desc: "Performance Index Rating" },
    { key: "pts36", label: "PTS/36", format: "number", desc: "Points per 36 min" },
    { key: "reb36", label: "REB/36", format: "number", desc: "Rebounds per 36 min" },
    { key: "ast36", label: "AST/36", format: "number", desc: "Assists per 36 min" },
  ];

  async function loadPlayersPage() {
    populateSeasonSelect($("seasonSelect"), true);

    try {
      state.players = await fetchPlayers(state.currentSeason);
      populateTeamSelect(state.players);
      applyFilters();
    } catch (error) {
      console.error("Failed to load players:", error);
      $("statsBody").innerHTML = `<tr><td colspan="17" style="text-align:center;color:#c00;">데이터를 불러올 수 없습니다.</td></tr>`;
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
      Object.entries(SEASONS).sort((a, b) => b[0].localeCompare(a[0])).forEach(([code, label]) => {
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

    state.filtered = state.players.filter((player) => {
      const matchTeam = team === "all" || player.team === team;
      const matchPos = pos === "all" || player.pos === pos;
      const matchSearch = !search || player.name.toLowerCase().includes(search);
      return matchTeam && matchPos && matchSearch;
    });

    sortAndRender();
  }

  function sortAndRender() {
    const { key, dir } = state.sort;
    const sorted = [...state.filtered].sort((a, b) => {
      const aVal = a[key] ?? 0;
      const bVal = b[key] ?? 0;
      return dir === "asc" ? aVal - bVal : bVal - aVal;
    });

    renderTable(sorted);
    if (sorted[0]) renderPlayerCard(sorted[0]);
  }

  function renderTable(players) {
    const tbody = $("statsBody");
    if (!tbody) return;

    tbody.innerHTML = players.map((player, index) => `
      <tr data-player-id="${player.id}" data-index="${index}">
        <td><a href="#/players/${player.id}">${player.name}</a></td>
        <td class="hide-mobile">${player.team}</td>
        <td class="hide-mobile">${player.pos || "-"}</td>
        <td class="hide-tablet">${player.gp}</td>
        <td class="hide-tablet">${formatNumber(player.min)}</td>
        <td>${formatNumber(player.pts)}</td>
        <td>${formatNumber(player.reb)}</td>
        <td>${formatNumber(player.ast)}</td>
        <td class="hide-mobile">${formatNumber(player.stl)}</td>
        <td class="hide-mobile">${formatNumber(player.blk)}</td>
        <td class="hide-tablet">${formatNumber(player.tov)}</td>
        <td class="hide-tablet">${formatPct(player.fgp)}</td>
        <td class="hide-tablet">${formatPct(player.tpp)}</td>
        <td class="hide-tablet">${formatPct(player.ftp)}</td>
        <td class="hide-mobile">${formatPct(player.ts_pct)}</td>
        <td class="hide-mobile">${formatPct(player.efg_pct)}</td>
        <td class="hide-tablet">${formatNumber(player.ast_to)}</td>
        <td class="hide-tablet">${formatNumber(player.pir)}</td>
        <td class="hide-tablet">${formatNumber(player.pts36)}</td>
        <td class="hide-tablet">${formatNumber(player.reb36)}</td>
        <td class="hide-tablet">${formatNumber(player.ast36)}</td>
      </tr>
    `).join("");

    state.currentSortedPlayers = players;
  }

  function renderPlayerCard(player) {
    $("playerName").textContent = player.name;
    $("playerTeam").textContent = player.team;
    $("playerPos").textContent = player.pos || "-";
    $("playerHeight").textContent = player.height || "-";
    $("playerGp").textContent = `${player.gp}경기 출전`;

    const grid = $("playerStatGrid");
    grid.innerHTML = "";

    // Primary stats
    const primarySection = document.createElement("div");
    primarySection.className = "stat-section";
    primarySection.innerHTML = `<div class="stat-section-title">기본 스탯</div><div class="stat-grid-inner"></div>`;
    const primaryGrid = primarySection.querySelector(".stat-grid-inner");
    primaryStats.forEach((stat) => {
      const value = stat.format === "pct" ? formatPct(player[stat.key]) : formatNumber(player[stat.key]);
      primaryGrid.innerHTML += `<div class="stat-card" title="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
    });

    // Advanced stats
    const advancedSection = document.createElement("div");
    advancedSection.className = "stat-section";
    advancedSection.innerHTML = `<div class="stat-section-title">2차 지표</div><div class="stat-grid-inner"></div>`;
    const advancedGrid = advancedSection.querySelector(".stat-grid-inner");
    advancedStats.forEach((stat) => {
      const value = stat.format === "pct" ? formatPct(player[stat.key]) : formatNumber(player[stat.key]);
      advancedGrid.innerHTML += `<div class="stat-card stat-card--advanced" title="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
    });

    grid.append(primarySection, advancedSection);
  }

  // =============================================================================
  // Player Detail Page
  // =============================================================================

  async function loadPlayerPage(playerId) {
    try {
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

      // Career summary
      const summary = $("playerCareerSummary");
      const seasons = Object.values(player.seasons || {});
      if (seasons.length > 0) {
        const totalGames = seasons.reduce((sum, s) => sum + s.gp, 0);
        const avgPts = seasons.reduce((sum, s) => sum + s.pts * s.gp, 0) / totalGames;
        const avgReb = seasons.reduce((sum, s) => sum + s.reb * s.gp, 0) / totalGames;
        const avgAst = seasons.reduce((sum, s) => sum + s.ast * s.gp, 0) / totalGames;

        // Get court margin
        let courtMarginHtml = "";
        if (state.dbInitialized && typeof WKBLDatabase !== "undefined") {
          const courtMargin = WKBLDatabase.getPlayerCourtMargin(playerId);
          if (courtMargin !== null) {
            const marginClass = courtMargin >= 0 ? "positive" : "negative";
            const marginSign = courtMargin >= 0 ? "+" : "";
            courtMarginHtml = `<div class="career-stat career-stat--${marginClass}"><div class="career-stat-label">코트마진</div><div class="career-stat-value">${marginSign}${courtMargin.toFixed(1)}</div></div>`;
          }
        }

        summary.innerHTML = `
          <div class="career-stat"><div class="career-stat-label">시즌</div><div class="career-stat-value">${seasons.length}</div></div>
          <div class="career-stat"><div class="career-stat-label">총 경기</div><div class="career-stat-value">${totalGames}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 득점</div><div class="career-stat-value">${avgPts.toFixed(1)}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 리바운드</div><div class="career-stat-value">${avgReb.toFixed(1)}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 어시스트</div><div class="career-stat-value">${avgAst.toFixed(1)}</div></div>
          ${courtMarginHtml}
        `;
      }

      // Season stats table
      const sortedSeasons = seasons.sort((a, b) => a.season_id?.localeCompare(b.season_id));
      const seasonBody = $("playerSeasonBody");
      seasonBody.innerHTML = [...sortedSeasons].reverse().map((s) => `
        <tr>
          <td>${s.season_label || "-"}</td>
          <td>${s.team || "-"}</td>
          <td>${s.gp}</td>
          <td>${formatNumber(s.min)}</td>
          <td>${formatNumber(s.pts)}</td>
          <td>${formatNumber(s.reb)}</td>
          <td>${formatNumber(s.ast)}</td>
          <td>${formatNumber(s.stl)}</td>
          <td>${formatNumber(s.blk)}</td>
          <td>${formatPct(s.fgp)}</td>
          <td>${formatPct(s.tpp)}</td>
          <td>${formatPct(s.ftp)}</td>
          <td>${formatPct(s.ts_pct)}</td>
          <td>${formatPct(s.efg_pct)}</td>
          <td>${formatNumber(s.ast_to)}</td>
          <td>${formatNumber(s.pir)}</td>
          <td>${formatNumber(s.pts36)}</td>
          <td>${formatNumber(s.reb36)}</td>
          <td>${formatNumber(s.ast36)}</td>
        </tr>
      `).join("");

      // Trend charts
      renderPlayerTrendChart(sortedSeasons);
      renderShootingEfficiencyChart(sortedSeasons);

      // Radar chart - need current season stats and all players for comparison
      const currentSeasonStats = sortedSeasons.length > 0 ? sortedSeasons[sortedSeasons.length - 1] : null;
      if (currentSeasonStats) {
        try {
          const allPlayers = await fetchPlayers(currentSeasonStats.season_id || state.currentSeason);
          renderPlayerRadarChart(currentSeasonStats, allPlayers);
        } catch (e) {
          console.warn("Failed to load players for radar chart:", e);
        }
      }

      // Recent game log chart
      const games = player.recent_games || [];
      renderGameLogChart(games);

      // Recent game log table
      const gameLogBody = $("playerGameLogBody");
      gameLogBody.innerHTML = games.map((g) => `
        <tr>
          <td>${formatDate(g.game_date)}</td>
          <td>vs ${g.opponent}</td>
          <td>${g.result}</td>
          <td>${formatNumber(g.minutes, 0)}</td>
          <td>${g.pts}</td>
          <td>${g.reb}</td>
          <td>${g.ast}</td>
          <td>${g.stl}</td>
          <td>${g.blk}</td>
          <td>${g.fgm}/${g.fga}</td>
          <td>${g.tpm}/${g.tpa}</td>
          <td>${g.ftm}/${g.fta}</td>
        </tr>
      `).join("");

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
      canvas.parentElement.innerHTML = '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">시즌 데이터가 부족합니다</div>';
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
      canvas.parentElement.innerHTML = '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">시즌 데이터가 부족합니다</div>';
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
              label: function(context) {
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
              callback: function(value) {
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
              label: function(context) {
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
      canvas.parentElement.innerHTML = '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">경기 기록이 없습니다</div>';
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
              title: function(context) {
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
      canvas.parentElement.innerHTML = '<div style="text-align:center;color:rgba(27,28,31,0.5);padding:40px;">데이터가 없습니다</div>';
      return;
    }

    // Sort by rank
    const sorted = [...standings].sort((a, b) => a.rank - b.rank);
    const labels = sorted.map((t) => t.short_name || t.team_name);
    const ctx = canvas.getContext("2d");

    // Parse home/away records
    const homeWins = sorted.map((t) => {
      const parts = (t.home_record || "0-0").split("-");
      return parseInt(parts[0]) || 0;
    });
    const homeLosses = sorted.map((t) => {
      const parts = (t.home_record || "0-0").split("-");
      return parseInt(parts[1]) || 0;
    });
    const awayWins = sorted.map((t) => {
      const parts = (t.away_record || "0-0").split("-");
      return parseInt(parts[0]) || 0;
    });
    const awayLosses = sorted.map((t) => {
      const parts = (t.away_record || "0-0").split("-");
      return parseInt(parts[1]) || 0;
    });

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
              afterBody: function(context) {
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
      const standings = data.standings;

      // Render standings chart
      renderStandingsChart(standings);

      const tbody = $("standingsBody");
      tbody.innerHTML = standings.map((t) => `
        <tr>
          <td>${t.rank}</td>
          <td><a href="#/teams/${t.team_id}">${t.team_name}</a></td>
          <td>${t.wins + t.losses}</td>
          <td>${t.wins}</td>
          <td>${t.losses}</td>
          <td>${(t.win_pct * 100).toFixed(1)}%</td>
          <td>${t.games_behind || "-"}</td>
          <td class="hide-mobile">${t.home_record}</td>
          <td class="hide-mobile">${t.away_record}</td>
          <td class="hide-tablet">${t.streak || "-"}</td>
          <td class="hide-tablet">${t.last5 || "-"}</td>
        </tr>
      `).join("");

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
        $("teamDetailStanding").textContent = `${s.rank}위 | ${s.wins}승 ${s.losses}패 (${(s.win_pct * 100).toFixed(1)}%)`;
      }

      // Roster
      const rosterBody = $("teamRosterBody");
      rosterBody.innerHTML = (team.roster || []).map((p) => `
        <tr>
          <td><a href="#/players/${p.id}">${p.name}</a></td>
          <td>${p.position || "-"}</td>
          <td>${p.height || "-"}</td>
        </tr>
      `).join("");

      // Recent games
      const gamesBody = $("teamGamesBody");
      gamesBody.innerHTML = (team.recent_games || []).map((g) => `
        <tr>
          <td><a href="#/games/${g.game_id}">${formatDate(g.date)}</a></td>
          <td>${g.opponent}</td>
          <td>${g.is_home ? "홈" : "원정"}</td>
          <td>${g.result}</td>
          <td>${g.score}</td>
        </tr>
      `).join("");

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

      const container = $("gamesList");
      container.innerHTML = games.map((g) => `
        <a href="#/games/${g.id}" class="game-card">
          <div class="game-card-date">${formatDate(g.game_date)}</div>
          <div class="game-card-matchup">
            <div class="game-card-team away">
              <span>${g.away_team_short || g.away_team_name}</span>
              <span class="game-card-score">${g.away_score || "-"}</span>
            </div>
            <span>vs</span>
            <div class="game-card-team home">
              <span class="game-card-score">${g.home_score || "-"}</span>
              <span>${g.home_team_short || g.home_team_name}</span>
            </div>
          </div>
          <div class="game-card-result">
            <span class="final">Final</span>
          </div>
        </a>
      `).join("");

    } catch (error) {
      console.error("Failed to load games:", error);
    }
  }

  // =============================================================================
  // Game Detail Page (Boxscore)
  // =============================================================================

  async function loadGamePage(gameId) {
    try {
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

        predictionSection.innerHTML = `
          <div class="prediction-summary">
            <h3>예측 vs 실제</h3>
            <div class="prediction-comparison">
              <div class="pred-team">
                <span class="pred-label">${game.away_team_name}</span>
                <div class="pred-values">
                  <span class="pred-expected">예측: ${predictions.team.away_win_prob.toFixed(0)}%</span>
                  <span class="pred-actual ${!homeActualWin ? 'winner' : ''}">${!homeActualWin ? '승리' : '패배'}</span>
                </div>
              </div>
              <div class="pred-vs">VS</div>
              <div class="pred-team">
                <span class="pred-label">${game.home_team_name}</span>
                <div class="pred-values">
                  <span class="pred-expected">예측: ${predictions.team.home_win_prob.toFixed(0)}%</span>
                  <span class="pred-actual ${homeActualWin ? 'winner' : ''}">${homeActualWin ? '승리' : '패배'}</span>
                </div>
              </div>
            </div>
            <div class="pred-result ${predictionCorrect ? 'correct' : 'incorrect'}">
              ${predictionCorrect ? '✓ 예측 적중' : '✗ 예측 실패'}
            </div>
            <div class="pred-score-comparison">
              <div class="pred-score-item">
                <span>예상 점수</span>
                <span>${predictions.team.away_predicted_pts?.toFixed(0) || '-'} - ${predictions.team.home_predicted_pts?.toFixed(0) || '-'}</span>
              </div>
              <div class="pred-score-item">
                <span>실제 점수</span>
                <span>${game.away_score} - ${game.home_score}</span>
              </div>
            </div>
          </div>
        `;
        predictionSection.style.display = "block";
      } else if (predictions.team) {
        // Game not played yet - show prediction only
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
          </div>
        `;
        predictionSection.style.display = "block";
      } else {
        predictionSection.style.display = "none";
      }

      // Helper function to render player row with prediction
      function renderPlayerRow(p, isHome) {
        const pred = predictionMap[p.player_id];
        const cmSign = p.court_margin !== null ? (p.court_margin >= 0 ? "+" : "") : "";
        const cmClass = p.court_margin !== null ? (p.court_margin >= 0 ? "stat-positive" : "stat-negative") : "";

        // Calculate prediction accuracy for PTS
        let predClass = "";
        let predInfo = "";
        if (pred && game.home_score !== null) {
          const diff = p.pts - pred.predicted_pts;
          const withinRange = p.pts >= pred.predicted_pts_low && p.pts <= pred.predicted_pts_high;
          predClass = withinRange ? "pred-hit" : (diff > 0 ? "pred-over" : "pred-under");
          predInfo = `예측: ${pred.predicted_pts.toFixed(1)} (${pred.predicted_pts_low.toFixed(1)}~${pred.predicted_pts_high.toFixed(1)})`;
        }

        return `
          <tr class="${pred?.is_starter ? 'starter-row' : ''}">
            <td>
              <a href="#/players/${p.player_id}">${p.player_name}</a>
              ${pred?.is_starter ? '<span class="starter-badge">선발</span>' : ''}
            </td>
            <td>${formatNumber(p.minutes, 0)}</td>
            <td class="${predClass}" title="${predInfo}">${p.pts}</td>
            <td>${p.reb}</td>
            <td>${p.ast}</td>
            <td>${p.stl}</td>
            <td>${p.blk}</td>
            <td class="hide-mobile">${p.tov}</td>
            <td class="hide-mobile">${p.fgm}/${p.fga}</td>
            <td class="hide-tablet">${p.tpm}/${p.tpa}</td>
            <td class="hide-tablet">${p.ftm}/${p.fta}</td>
            <td class="hide-tablet">${formatPct(p.ts_pct)}</td>
            <td class="hide-tablet">${p.pir}</td>
            <td class="hide-tablet ${cmClass}">${p.court_margin !== null ? cmSign + p.court_margin : "-"}</td>
          </tr>
        `;
      }

      // Away team stats
      const awayBody = $("boxscoreAwayBody");
      awayBody.innerHTML = (game.away_team_stats || []).map(p => renderPlayerRow(p, false)).join("");

      // Home team stats
      const homeBody = $("boxscoreHomeBody");
      homeBody.innerHTML = (game.home_team_stats || []).map(p => renderPlayerRow(p, true)).join("");

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

      const grid = $("leadersGrid");
      grid.innerHTML = LEADER_CATEGORIES.map((cat) => {
        const leaders = categories[cat.key] || [];
        return `
          <div class="leader-card">
            <h3>${cat.label}</h3>
            <ul class="leader-list">
              ${leaders.map((l) => `
                <li class="leader-item">
                  <span class="leader-rank">${l.rank}</span>
                  <div class="leader-info">
                    <div class="leader-name"><a href="#/players/${l.player_id}">${l.player_name}</a></div>
                    <div class="leader-team">${l.team_name}</div>
                  </div>
                  <div class="leader-value">${l.value}</div>
                </li>
              `).join("")}
            </ul>
          </div>
        `;
      }).join("");

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
    const maxValues = stats.map((stat) => Math.max(...players.map((p) => p[stat] || 0)));

    const datasets = players.map((p, i) => ({
      label: p.name,
      data: stats.map((stat, j) => maxValues[j] > 0 ? ((p[stat] || 0) / maxValues[j]) * 100 : 0),
      borderColor: COMPARE_COLORS[i % COMPARE_COLORS.length],
      backgroundColor: COMPARE_COLORS[i % COMPARE_COLORS.length].replace(")", ", 0.2)").replace("rgb", "rgba"),
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
              label: function(context) {
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
    if (state.compareSelectedPlayers.length === 0) {
      container.innerHTML = '<span class="compare-hint">최대 4명까지 선수를 선택할 수 있습니다</span>';
    } else {
      container.innerHTML = state.compareSelectedPlayers.map((p) => `
        <div class="compare-tag" data-id="${p.id}">
          <span>${p.name}</span>
          <button class="compare-tag-remove" data-id="${p.id}">&times;</button>
        </div>
      `).join("");
    }

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

      if (state.compareSearchResults.length === 0) {
        suggestions.innerHTML = '<div class="compare-suggestion-item">검색 결과 없음</div>';
      } else {
        suggestions.innerHTML = state.compareSearchResults.map((p) => `
          <div class="compare-suggestion-item" data-id="${p.id}" data-name="${p.name}" data-team="${p.team}">
            <span class="compare-suggestion-name">${p.name}</span>
            <span class="compare-suggestion-team">${p.team}</span>
          </div>
        `).join("");
      }
      suggestions.classList.add("active");
    } catch (error) {
      console.error("Search failed:", error);
      suggestions.innerHTML = '<div class="compare-suggestion-item">검색 오류</div>';
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
    state.compareSelectedPlayers = state.compareSelectedPlayers.filter((p) => p.id !== playerId);
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
        const margins = WKBLDatabase.getPlayersCourtMargin(playerIds, state.currentSeason);
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
    const cardsContainer = $("compareCards");
    cardsContainer.innerHTML = players.map((p) => `
      <div class="compare-player-card">
        <div class="compare-player-info">
          <span class="compare-player-team">${p.team}</span>
          <h3 class="compare-player-name"><a href="#/players/${p.id}">${p.name}</a></h3>
          <div class="compare-player-meta">
            <span>${p.position || "-"}</span>
            <span>${p.height || "-"}</span>
          </div>
        </div>
        <div class="compare-player-stats">
          <div class="compare-stat-item">
            <span class="compare-stat-label">GP</span>
            <span class="compare-stat-value">${p.gp}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">PTS</span>
            <span class="compare-stat-value">${formatNumber(p.pts)}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">REB</span>
            <span class="compare-stat-value">${formatNumber(p.reb)}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">AST</span>
            <span class="compare-stat-value">${formatNumber(p.ast)}</span>
          </div>
        </div>
      </div>
    `).join("");

    // Bar chart comparison
    const barsContainer = $("compareBars");
    const colors = ["#6366f1", "#10b981", "#f59e0b", "#ef4444"];

    barsContainer.innerHTML = COMPARE_BAR_STATS.map((stat) => {
      const maxValue = Math.max(...players.map((p) => p[stat.key] || 0));
      return `
        <div class="compare-bar-row">
          <div class="compare-bar-label">${stat.label}</div>
          <div class="compare-bar-container">
            ${players.map((p, i) => {
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
            }).join("")}
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
      const maxIdx = stat.key !== "tov" && validValues.length > 0
        ? values.indexOf(Math.max(...validValues))
        : -1;

      return `
        <tr>
          <td>${stat.label}</td>
          ${players.map((p, i) => {
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
          }).join("")}
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
      upcomingGames = WKBLDatabase.getUpcomingGames(state.currentSeason, teamId, 10);
      recentGames = WKBLDatabase.getRecentGames(state.currentSeason, teamId, 10);
    }

    // Render next game highlight
    const nextGameCard = $("nextGameCard");
    if (upcomingGames.length > 0) {
      const next = upcomingGames[0];
      nextGameCard.style.display = "block";
      $("nextGameMatchup").textContent = `${next.away_team_short || next.away_team_name} vs ${next.home_team_short || next.home_team_name}`;
      $("nextGameDate").textContent = formatFullDate(next.game_date);

      // Calculate D-day
      const gameDate = new Date(next.game_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      gameDate.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((gameDate - today) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        $("nextGameCountdown").textContent = "D-Day";
      } else if (diffDays > 0) {
        $("nextGameCountdown").textContent = `D-${diffDays}`;
      } else {
        $("nextGameCountdown").textContent = `D+${Math.abs(diffDays)}`;
      }
    } else {
      nextGameCard.style.display = "none";
    }

    // Render upcoming games list
    const upcomingList = $("upcomingGamesList");
    if (upcomingGames.length > 0) {
      upcomingList.innerHTML = upcomingGames.map((g) => `
        <div class="schedule-item upcoming">
          <div class="schedule-item-date">${formatFullDate(g.game_date)}</div>
          <div class="schedule-item-matchup">
            <span class="schedule-team away">${g.away_team_short || g.away_team_name}</span>
            <span class="schedule-vs">@</span>
            <span class="schedule-team home">${g.home_team_short || g.home_team_name}</span>
          </div>
        </div>
      `).join("");
    } else {
      upcomingList.innerHTML = '<div class="schedule-empty">예정된 경기가 없습니다</div>';
    }

    // Render recent results
    const recentList = $("recentResultsList");
    if (recentGames.length > 0) {
      recentList.innerHTML = recentGames.map((g) => {
        const homeWin = g.home_score > g.away_score;
        return `
          <a href="#/games/${g.id}" class="schedule-item result">
            <div class="schedule-item-date">${formatFullDate(g.game_date)}</div>
            <div class="schedule-item-matchup">
              <span class="schedule-team away ${!homeWin ? 'winner' : ''}">${g.away_team_short || g.away_team_name}</span>
              <span class="schedule-score">${g.away_score} - ${g.home_score}</span>
              <span class="schedule-team home ${homeWin ? 'winner' : ''}">${g.home_team_short || g.home_team_name}</span>
            </div>
          </a>
        `;
      }).join("");
    } else {
      recentList.innerHTML = '<div class="schedule-empty">최근 경기 결과가 없습니다</div>';
    }
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

      if (players.length === 0) {
        suggestions.innerHTML = '<div class="predict-suggestion-item">검색 결과 없음</div>';
      } else {
        suggestions.innerHTML = players.map((p) => `
          <div class="predict-suggestion-item" data-id="${p.id}" data-name="${p.name}" data-team="${p.team}">
            <span class="predict-suggestion-name">${p.name}</span>
            <span class="predict-suggestion-team">${p.team}</span>
          </div>
        `).join("");
      }
      suggestions.classList.add("active");
    } catch (error) {
      console.error("Predict search failed:", error);
      suggestions.innerHTML = '<div class="predict-suggestion-item">검색 오류</div>';
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
        $("predictPlayerInfo").innerHTML = `<div class="predict-error">충분한 경기 데이터가 없습니다 (최소 3경기 필요)</div>`;
        $("predictCards").innerHTML = "";
        $("predictFactors").innerHTML = "";
        return;
      }

      // Calculate predictions
      const prediction = calculatePrediction(gamelog, player);

      // Render player info
      $("predictPlayerInfo").innerHTML = `
        <div class="predict-player-card">
          <span class="predict-player-team">${player.team || "-"}</span>
          <h3 class="predict-player-name">${player.name}</h3>
          <div class="predict-player-meta">
            <span>${player.position || "-"}</span>
            <span>${player.height || "-"}</span>
          </div>
        </div>
      `;

      // Render prediction cards
      const stats = [
        { key: "pts", label: "득점", unit: "PTS" },
        { key: "reb", label: "리바운드", unit: "REB" },
        { key: "ast", label: "어시스트", unit: "AST" },
      ];

      $("predictCards").innerHTML = stats.map((stat) => {
        const pred = prediction[stat.key];
        return `
          <div class="predict-stat-card">
            <div class="predict-stat-label">${stat.label}</div>
            <div class="predict-stat-value">${pred.predicted.toFixed(1)}</div>
            <div class="predict-stat-range">${pred.low.toFixed(1)} - ${pred.high.toFixed(1)}</div>
            <div class="predict-stat-trend ${pred.trend}">${pred.trendLabel}</div>
          </div>
        `;
      }).join("");

      // Render factors
      $("predictFactors").innerHTML = `
        <div class="predict-factors-card">
          <h4>예측 근거</h4>
          <ul class="predict-factors-list">
            <li>최근 5경기 평균: ${prediction.recent5Avg.pts.toFixed(1)}점 / ${prediction.recent5Avg.reb.toFixed(1)}리바 / ${prediction.recent5Avg.ast.toFixed(1)}어시</li>
            <li>최근 10경기 평균: ${prediction.recent10Avg.pts.toFixed(1)}점 / ${prediction.recent10Avg.reb.toFixed(1)}리바 / ${prediction.recent10Avg.ast.toFixed(1)}어시</li>
            <li>시즌 평균: ${prediction.seasonAvg.pts.toFixed(1)}점 / ${prediction.seasonAvg.reb.toFixed(1)}리바 / ${prediction.seasonAvg.ast.toFixed(1)}어시</li>
            <li>예측 모델: (최근 5경기 × 60%) + (최근 10경기 × 40%)</li>
          </ul>
        </div>
      `;

      // Render trend chart
      renderPredictTrendChart(gamelog, prediction);

      $("predictResult").style.display = "block";

    } catch (error) {
      console.error("Prediction failed:", error);
      $("predictResult").style.display = "block";
      $("predictPlayerInfo").innerHTML = `<div class="predict-error">예측 생성에 실패했습니다</div>`;
    }
  }

  function calculatePrediction(gamelog, player) {
    // Get recent games (sorted by date, most recent first)
    const games = gamelog.slice(0, 15);
    const recent5 = games.slice(0, 5);
    const recent10 = games.slice(0, 10);

    // Calculate averages
    const calcAvg = (arr, key) => arr.reduce((sum, g) => sum + (g[key] || 0), 0) / arr.length;

    const recent5Avg = {
      pts: calcAvg(recent5, "pts"),
      reb: calcAvg(recent5, "reb"),
      ast: calcAvg(recent5, "ast"),
    };

    const recent10Avg = {
      pts: calcAvg(recent10, "pts"),
      reb: calcAvg(recent10, "reb"),
      ast: calcAvg(recent10, "ast"),
    };

    const seasonAvg = {
      pts: calcAvg(games, "pts"),
      reb: calcAvg(games, "reb"),
      ast: calcAvg(games, "ast"),
    };

    // Calculate standard deviation
    const calcStd = (arr, key, avg) => {
      const variance = arr.reduce((sum, g) => sum + Math.pow((g[key] || 0) - avg, 2), 0) / arr.length;
      return Math.sqrt(variance);
    };

    // Prediction formula: (recent 5 × 0.6) + (recent 10 × 0.4)
    const predict = (key) => {
      const base = recent5Avg[key] * 0.6 + recent10Avg[key] * 0.4;
      const std = calcStd(games, key, seasonAvg[key]);

      // Trend analysis
      const trendDiff = recent5Avg[key] - seasonAvg[key];
      const trendPct = seasonAvg[key] > 0 ? trendDiff / seasonAvg[key] : 0;

      let trend = "stable";
      let trendLabel = "보합";
      let trendBonus = 0;

      if (trendPct > 0.1) {
        trend = "up";
        trendLabel = "상승세 ↑";
        trendBonus = base * 0.05;
      } else if (trendPct < -0.1) {
        trend = "down";
        trendLabel = "하락세 ↓";
        trendBonus = -base * 0.05;
      }

      const predicted = base + trendBonus;
      const low = Math.max(0, predicted - std);
      const high = predicted + std;

      return { predicted, low, high, trend, trendLabel };
    };

    return {
      pts: predict("pts"),
      reb: predict("reb"),
      ast: predict("ast"),
      recent5Avg,
      recent10Avg,
      seasonAvg,
    };
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
            pointRadius: (ctx) => ctx.dataIndex === games.length ? 8 : 4,
            pointBackgroundColor: (ctx) => ctx.dataIndex === games.length ? "#d94f31" : "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "리바운드",
            data: [...games.map((g) => g.reb), prediction.reb.predicted],
            borderColor: "#2a5d9f",
            backgroundColor: "rgba(42, 93, 159, 0.1)",
            tension: 0.3,
            fill: false,
            pointRadius: (ctx) => ctx.dataIndex === games.length ? 8 : 4,
            pointBackgroundColor: (ctx) => ctx.dataIndex === games.length ? "#2a5d9f" : "#fff",
            pointBorderWidth: 2,
          },
          {
            label: "어시스트",
            data: [...games.map((g) => g.ast), prediction.ast.predicted],
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            tension: 0.3,
            fill: false,
            pointRadius: (ctx) => ctx.dataIndex === games.length ? 8 : 4,
            pointBackgroundColor: (ctx) => ctx.dataIndex === games.length ? "#10b981" : "#fff",
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
        results.innerHTML = '<div class="search-no-results">검색 결과가 없습니다</div>';
        globalSearchIndex = -1;
        return;
      }

      let html = "";
      if (players.length > 0) {
        html += '<div class="search-result-group"><div class="search-result-group-title">선수</div>';
        html += players.map((p, i) => `
          <div class="search-result-item" data-type="player" data-id="${p.id}" data-index="${i}">
            <div class="search-result-icon">👤</div>
            <div class="search-result-info">
              <div class="search-result-name">${p.name}</div>
              <div class="search-result-meta">${p.team} · ${p.position || "-"}</div>
            </div>
          </div>
        `).join("");
        html += "</div>";
      }

      if (teams.length > 0) {
        html += '<div class="search-result-group"><div class="search-result-group-title">팀</div>';
        html += teams.map((t, i) => `
          <div class="search-result-item" data-type="team" data-id="${t.id}" data-index="${players.length + i}">
            <div class="search-result-icon">🏀</div>
            <div class="search-result-info">
              <div class="search-result-name">${t.name}</div>
              <div class="search-result-meta">${t.short_name}</div>
            </div>
          </div>
        `).join("");
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
    // Season selects
    ["seasonSelect", "teamsSeasonSelect", "gamesSeasonSelect", "leadersSeasonSelect", "compareSeasonSelect", "scheduleSeasonSelect", "predictSeasonSelect"].forEach((id) => {
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

    // Search
    const searchInput = $("searchInput");
    if (searchInput) {
      searchInput.addEventListener("input", debounce(applyFilters, CONFIG.debounceDelay));
    }

    // Table sorting
    const statsTable = $("statsTable");
    if (statsTable) {
      statsTable.querySelectorAll("th").forEach((th) => {
        th.addEventListener("click", () => {
          const key = th.dataset.key;
          if (!key) return;
          const isSame = state.sort.key === key;
          state.sort = { key, dir: isSame && state.sort.dir === "desc" ? "asc" : "desc" };
          sortAndRender();
        });
      });
    }

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

    // Compare page
    const compareSearchInput = $("compareSearchInput");
    if (compareSearchInput) {
      compareSearchInput.addEventListener("input", debounce((e) => {
        handleCompareSearch(e.target.value.trim());
      }, CONFIG.debounceDelay));

      compareSearchInput.addEventListener("focus", () => {
        if (state.compareSearchResults.length > 0) {
          $("compareSuggestions").classList.add("active");
        }
      });
    }

    // Compare suggestions click
    const compareSuggestions = $("compareSuggestions");
    if (compareSuggestions) {
      compareSuggestions.addEventListener("click", (e) => {
        const item = e.target.closest(".compare-suggestion-item");
        if (!item || !item.dataset.id) return;

        addComparePlayer({
          id: item.dataset.id,
          name: item.dataset.name,
          team: item.dataset.team,
        });
      });
    }

    // Compare selected remove
    const compareSelected = $("compareSelected");
    if (compareSelected) {
      compareSelected.addEventListener("click", (e) => {
        if (e.target.classList.contains("compare-tag-remove")) {
          removeComparePlayer(e.target.dataset.id);
        }
      });
    }

    // Compare button
    const compareBtn = $("compareBtn");
    if (compareBtn) {
      compareBtn.addEventListener("click", executeComparison);
    }

    // Close suggestions on click outside
    document.addEventListener("click", (e) => {
      const suggestions = $("compareSuggestions");
      const searchBox = e.target.closest(".compare-search-box");
      if (!searchBox && suggestions) {
        suggestions.classList.remove("active");
      }
    });

    // Global search
    const globalSearchBtn = $("globalSearchBtn");
    if (globalSearchBtn) {
      globalSearchBtn.addEventListener("click", openGlobalSearch);
    }

    const searchModal = $("searchModal");
    if (searchModal) {
      // Close on backdrop click
      searchModal.querySelector(".search-modal-backdrop").addEventListener("click", closeGlobalSearch);

      // Search input
      const globalSearchInput = $("globalSearchInput");
      globalSearchInput.addEventListener("input", debounce((e) => {
        handleGlobalSearch(e.target.value.trim());
      }, CONFIG.debounceDelay));

      globalSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeGlobalSearch();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          navigateGlobalSearch(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          navigateGlobalSearch(-1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          selectGlobalSearchItem();
        }
      });

      // Click on result
      $("globalSearchResults").addEventListener("click", (e) => {
        const item = e.target.closest(".search-result-item");
        if (!item) return;

        const type = item.dataset.type;
        const id = item.dataset.id;
        closeGlobalSearch();

        if (type === "player") {
          navigate(`/players/${id}`);
        } else if (type === "team") {
          navigate(`/teams/${id}`);
        }
      });
    }

    // Keyboard shortcut (Ctrl+K or Cmd+K)
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        openGlobalSearch();
      }
    });

    // Schedule page - team filter
    const scheduleTeamSelect = $("scheduleTeamSelect");
    if (scheduleTeamSelect) {
      scheduleTeamSelect.addEventListener("change", refreshSchedule);
    }

    // Predict page - search
    const predictSearchInput = $("predictSearchInput");
    if (predictSearchInput) {
      predictSearchInput.addEventListener("input", debounce((e) => {
        handlePredictSearch(e.target.value.trim());
      }, CONFIG.debounceDelay));

      predictSearchInput.addEventListener("focus", () => {
        const suggestions = $("predictSuggestions");
        if (suggestions && suggestions.innerHTML.trim()) {
          suggestions.classList.add("active");
        }
      });
    }

    // Predict suggestions click
    const predictSuggestions = $("predictSuggestions");
    if (predictSuggestions) {
      predictSuggestions.addEventListener("click", (e) => {
        const item = e.target.closest(".predict-suggestion-item");
        if (!item || !item.dataset.id) return;
        selectPredictPlayer(item.dataset.id, item.dataset.name);
      });
    }

    // Close predict suggestions on click outside
    document.addEventListener("click", (e) => {
      const suggestions = $("predictSuggestions");
      const searchBox = e.target.closest(".predict-search-box");
      if (!searchBox && suggestions) {
        suggestions.classList.remove("active");
      }
    });
  }

  // =============================================================================
  // Initialize
  // =============================================================================

  async function init() {
    // Try to initialize local database first (for GitHub Pages static hosting)
    // This will be used as fallback if API is not available
    try {
      await initLocalDb();
      if (state.dbInitialized) {
        // On GitHub Pages (static hosting), prefer local DB
        // Check if we're on a static host by trying a simple API call
        try {
          const testRes = await fetch(`${CONFIG.apiBase}/health`, { method: "HEAD" });
          if (!testRes.ok) {
            state.useApi = false;
            state.useLocalDb = true;
          }
        } catch (e) {
          state.useApi = false;
          state.useLocalDb = true;
        }
      }
    } catch (e) {
      // Local database not available, will use API or JSON fallback
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
