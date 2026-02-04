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
    useApi: true, // Try API first, fallback to JSON
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

  function $(id) {
    return document.getElementById(id);
  }

  // =============================================================================
  // API Functions
  // =============================================================================

  async function apiGet(endpoint) {
    const res = await fetch(`${CONFIG.apiBase}${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  }

  async function fetchPlayers(season) {
    if (state.useApi) {
      try {
        const activeOnly = season !== "all";
        const data = await apiGet(`/players?season=${season}&active_only=${activeOnly}`);
        return data.players;
      } catch (e) {
        console.warn("API failed, falling back to JSON:", e.message);
        state.useApi = false;
      }
    }
    // Fallback to JSON file
    const res = await fetch(CONFIG.dataPath);
    if (!res.ok) throw new Error("Data not found");
    const data = await res.json();
    return data.players;
  }

  async function fetchPlayerDetail(playerId) {
    return apiGet(`/players/${playerId}`);
  }

  async function fetchPlayerGamelog(playerId) {
    const data = await apiGet(`/players/${playerId}/gamelog`);
    return data.games;
  }

  async function fetchTeams() {
    return apiGet("/teams");
  }

  async function fetchStandings(season) {
    return apiGet(`/seasons/${season}/standings`);
  }

  async function fetchTeamDetail(teamId, season) {
    return apiGet(`/teams/${teamId}?season=${season}`);
  }

  async function fetchGames(season) {
    const data = await apiGet(`/games?season=${season}&limit=50`);
    return data.games;
  }

  async function fetchGameBoxscore(gameId) {
    return apiGet(`/games/${gameId}`);
  }

  async function fetchLeaders(season, category, limit = 10) {
    const data = await apiGet(`/leaders?season=${season}&category=${category}&limit=${limit}`);
    return data.leaders;
  }

  async function fetchAllLeaders(season) {
    const data = await apiGet(`/leaders/all?season=${season}&limit=5`);
    return data.categories;
  }

  async function fetchSearch(query, limit = 10) {
    const data = await apiGet(`/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    return data;
  }

  async function fetchComparePlayers(playerIds, season) {
    const ids = playerIds.join(",");
    const data = await apiGet(`/players/compare?ids=${ids}&season=${season}`);
    return data.players;
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
          showView("home");
          await loadHomePage();
          break;
        case "players":
          if (id) {
            showView("player");
            await loadPlayerPage(id);
          } else {
            showView("home");
            await loadHomePage();
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
        default:
          showView("home");
          await loadHomePage();
      }
    } catch (error) {
      console.error("Route error:", error);
    }
  }

  // =============================================================================
  // Home Page (Player List)
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

  async function loadHomePage() {
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
      $("detailPlayerBirth").textContent = player.birth_date || "-";

      // Career summary
      const summary = $("playerCareerSummary");
      const seasons = Object.values(player.seasons || {});
      if (seasons.length > 0) {
        const totalGames = seasons.reduce((sum, s) => sum + s.gp, 0);
        const avgPts = seasons.reduce((sum, s) => sum + s.pts * s.gp, 0) / totalGames;
        const avgReb = seasons.reduce((sum, s) => sum + s.reb * s.gp, 0) / totalGames;
        const avgAst = seasons.reduce((sum, s) => sum + s.ast * s.gp, 0) / totalGames;

        summary.innerHTML = `
          <div class="career-stat"><div class="career-stat-label">시즌</div><div class="career-stat-value">${seasons.length}</div></div>
          <div class="career-stat"><div class="career-stat-label">총 경기</div><div class="career-stat-value">${totalGames}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 득점</div><div class="career-stat-value">${avgPts.toFixed(1)}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 리바운드</div><div class="career-stat-value">${avgReb.toFixed(1)}</div></div>
          <div class="career-stat"><div class="career-stat-label">평균 어시스트</div><div class="career-stat-value">${avgAst.toFixed(1)}</div></div>
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

      // Trend chart
      renderPlayerTrendChart(sortedSeasons);

      // Recent game log
      const games = player.recent_games || [];
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

  // Player Trend Chart
  let playerTrendChart = null;

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

  // =============================================================================
  // Teams Page
  // =============================================================================

  async function loadTeamsPage() {
    populateSeasonSelect($("teamsSeasonSelect"));

    try {
      const data = await fetchStandings(state.currentSeason);
      const standings = data.standings;

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

      // Away team stats
      const awayBody = $("boxscoreAwayBody");
      awayBody.innerHTML = (game.away_team_stats || []).map((p) => `
        <tr>
          <td><a href="#/players/${p.player_id}">${p.player_name}</a></td>
          <td>${formatNumber(p.minutes, 0)}</td>
          <td>${p.pts}</td>
          <td>${p.reb}</td>
          <td>${p.ast}</td>
          <td>${p.stl}</td>
          <td>${p.blk}</td>
          <td class="hide-mobile">${p.tov}</td>
          <td class="hide-mobile">${p.fgm}/${p.fga}</td>
          <td class="hide-tablet">${p.tpm}/${p.tpa}</td>
          <td class="hide-tablet">${p.ftm}/${p.fta}</td>
        </tr>
      `).join("");

      // Home team stats
      const homeBody = $("boxscoreHomeBody");
      homeBody.innerHTML = (game.home_team_stats || []).map((p) => `
        <tr>
          <td><a href="#/players/${p.player_id}">${p.player_name}</a></td>
          <td>${formatNumber(p.minutes, 0)}</td>
          <td>${p.pts}</td>
          <td>${p.reb}</td>
          <td>${p.ast}</td>
          <td>${p.stl}</td>
          <td>${p.blk}</td>
          <td class="hide-mobile">${p.tov}</td>
          <td class="hide-mobile">${p.fgm}/${p.fga}</td>
          <td class="hide-tablet">${p.tpm}/${p.tpa}</td>
          <td class="hide-tablet">${p.ftm}/${p.fta}</td>
        </tr>
      `).join("");

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
  ];

  const COMPARE_BAR_STATS = [
    { key: "pts", label: "득점" },
    { key: "reb", label: "리바운드" },
    { key: "ast", label: "어시스트" },
    { key: "stl", label: "스틸" },
    { key: "blk", label: "블록" },
  ];

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

      renderCompareResult(players);
      $("compareResult").style.display = "block";

    } catch (error) {
      console.error("Comparison failed:", error);
      alert("비교에 실패했습니다.");
    }
  }

  function renderCompareResult(players) {
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
      const maxIdx = stat.key !== "tov" ? values.indexOf(Math.max(...values.filter((v) => v !== null))) : -1;

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
    ["seasonSelect", "teamsSeasonSelect", "gamesSeasonSelect", "leadersSeasonSelect", "compareSeasonSelect"].forEach((id) => {
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
  }

  // =============================================================================
  // Initialize
  // =============================================================================

  function init() {
    initEventListeners();
    handleRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
