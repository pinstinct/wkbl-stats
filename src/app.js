(function () {
  "use strict";

  const CONFIG = {
    dataPath: "./data/wkbl-active.json",
    fallbackPath: "./data/sample.json",
    debounceDelay: 150,
  };

  // Primary stats for player card with tooltips
  const primaryStats = [
    { key: "pts", label: "PTS", desc: "Points - 경기당 평균 득점" },
    { key: "reb", label: "REB", desc: "Rebounds - 경기당 평균 리바운드" },
    { key: "ast", label: "AST", desc: "Assists - 경기당 평균 어시스트" },
    { key: "stl", label: "STL", desc: "Steals - 경기당 평균 스틸" },
    { key: "blk", label: "BLK", desc: "Blocks - 경기당 평균 블록" },
    { key: "tov", label: "TOV", desc: "Turnovers - 경기당 평균 턴오버" },
    { key: "fgp", label: "FG%", format: "pct", desc: "Field Goal % - 야투 성공률 (2점+3점)" },
    { key: "tpp", label: "3P%", format: "pct", desc: "3-Point % - 3점슛 성공률" },
    { key: "ftp", label: "FT%", format: "pct", desc: "Free Throw % - 자유투 성공률" },
  ];

  // Advanced stats for player card with tooltips
  const advancedStats = [
    { key: "ts_pct", label: "TS%", format: "pct", desc: "True Shooting % - 모든 슛 시도를 고려한 실제 슈팅 효율. 계산: PTS / (2 × (FGA + 0.44 × FTA))" },
    { key: "efg_pct", label: "eFG%", format: "pct", desc: "Effective FG% - 3점슛의 추가 가치(1.5배)를 반영한 야투율. 계산: (FGM + 0.5 × 3PM) / FGA" },
    { key: "ast_to", label: "AST/TO", format: "ratio", desc: "Assist to Turnover Ratio - 어시스트/턴오버 비율. 높을수록 실수 대비 기여도가 높음" },
    { key: "pir", label: "PIR", format: "number", desc: "Performance Index Rating - 유럽식 종합 효율 지표. 긍정적 스탯에서 부정적 스탯을 뺀 값" },
    { key: "pts36", label: "PTS/36", format: "number", desc: "Points per 36 min - 36분당 환산 득점. 출전 시간이 다른 선수들을 비교할 때 유용" },
    { key: "reb36", label: "REB/36", format: "number", desc: "Rebounds per 36 min - 36분당 환산 리바운드" },
    { key: "ast36", label: "AST/36", format: "number", desc: "Assists per 36 min - 36분당 환산 어시스트" },
  ];

  const state = {
    players: [],
    filtered: [],
    sort: { key: "pts", dir: "desc" },
  };

  let elements = {};

  function cacheElements() {
    const ids = [
      "seasonSelect",
      "teamSelect",
      "posSelect",
      "searchInput",
      "statsBody",
      "statsTable",
      "playerName",
      "playerTeam",
      "playerPos",
      "playerHeight",
      "playerStatGrid",
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) {
        console.error(`Required element not found: #${id}`);
        return false;
      }
      elements[id] = el;
    }
    return true;
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatPct(value) {
    if (value === null || value === undefined) return "-";
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined) return "-";
    return value.toFixed(decimals);
  }

  function formatRatio(value) {
    if (value === null || value === undefined || value === 0) return "-";
    return value.toFixed(2);
  }

  function formatStat(value, format) {
    switch (format) {
      case "pct":
        return formatPct(value);
      case "ratio":
        return formatRatio(value);
      default:
        return formatNumber(value);
    }
  }

  function populateControls(players) {
    const seasons = [...new Set(players.map((p) => p.season))].sort().reverse();
    seasons.forEach((season) => {
      const option = document.createElement("option");
      option.value = season;
      option.textContent = season;
      elements.seasonSelect.append(option);
    });

    const teams = [...new Set(players.map((p) => p.team))].sort();
    teams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      elements.teamSelect.append(option);
    });
  }

  function applyFilters() {
    const season = elements.seasonSelect.value;
    const team = elements.teamSelect.value;
    const pos = elements.posSelect.value;
    const search = elements.searchInput.value.trim();

    state.filtered = state.players.filter((player) => {
      const matchSeason = season === "all" || player.season === season;
      const matchTeam = team === "all" || player.team === team;
      const matchPos = pos === "all" || player.pos === pos;
      const matchSearch =
        search.length === 0 ||
        player.name.toLowerCase().includes(search.toLowerCase());
      return matchSeason && matchTeam && matchPos && matchSearch;
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
    if (sorted[0]) {
      renderPlayer(sorted[0]);
    }
  }

  function createStatCard(stat, player, isAdvanced = false) {
    const card = document.createElement("div");
    card.className = isAdvanced ? "stat-card stat-card--advanced" : "stat-card";
    if (stat.desc) {
      card.title = stat.desc;
      card.setAttribute("data-tooltip", stat.desc);
    }

    const label = document.createElement("span");
    label.textContent = stat.label;

    const value = document.createElement("strong");
    value.textContent = formatStat(player[stat.key], stat.format);

    card.append(label, value);
    return card;
  }

  function getDoubleCategoriesText(player) {
    const categories = [];
    if (player.pts >= 10) categories.push("PTS");
    if (player.reb >= 10) categories.push("REB");
    if (player.ast >= 10) categories.push("AST");
    return categories;
  }

  function renderPlayer(player) {
    elements.playerName.textContent = player.name;
    elements.playerTeam.textContent = player.team;
    elements.playerPos.textContent = player.pos;
    elements.playerHeight.textContent = player.height;

    elements.playerStatGrid.innerHTML = "";

    // Primary stats section
    const primarySection = document.createElement("div");
    primarySection.className = "stat-section";
    const primaryTitle = document.createElement("div");
    primaryTitle.className = "stat-section-title";
    primaryTitle.textContent = "기본 스탯";
    primarySection.append(primaryTitle);

    const primaryGrid = document.createElement("div");
    primaryGrid.className = "stat-grid-inner";
    primaryStats.forEach((stat) => {
      primaryGrid.append(createStatCard(stat, player, false));
    });
    primarySection.append(primaryGrid);

    // Advanced stats section
    const advancedSection = document.createElement("div");
    advancedSection.className = "stat-section";
    const advancedTitle = document.createElement("div");
    advancedTitle.className = "stat-section-title";
    advancedTitle.textContent = "2차 지표";
    advancedSection.append(advancedTitle);

    const advancedGrid = document.createElement("div");
    advancedGrid.className = "stat-grid-inner";
    advancedStats.forEach((stat) => {
      advancedGrid.append(createStatCard(stat, player, true));
    });
    advancedSection.append(advancedGrid);

    // Double-double indicator with categories
    if (player.dd_cats >= 2) {
      const categories = getDoubleCategoriesText(player);
      const ddBadge = document.createElement("div");
      ddBadge.className = "dd-badge";

      if (player.dd_cats === 3) {
        ddBadge.textContent = `평균 Triple-Double (${categories.join(" + ")})`;
        ddBadge.setAttribute("data-tooltip", "PTS, REB, AST 세 부문에서 경기당 평균 10 이상 기록");
      } else {
        ddBadge.textContent = `평균 Double-Double (${categories.join(" + ")})`;
        ddBadge.setAttribute("data-tooltip", "PTS, REB, AST 중 두 부문에서 경기당 평균 10 이상 기록");
      }
      advancedSection.append(ddBadge);
    }

    elements.playerStatGrid.append(primarySection, advancedSection);
  }

  function renderTable(players) {
    elements.statsBody.innerHTML = "";
    players.forEach((player, index) => {
      const row = document.createElement("tr");
      row.dataset.playerIndex = index;
      row.innerHTML = `
        <td>${player.name}</td>
        <td class="hide-mobile">${player.team}</td>
        <td class="hide-mobile">${player.pos}</td>
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
        <td class="hide-tablet">${formatNumber(player.pir)}</td>
      `;
      elements.statsBody.append(row);
    });

    state.currentSortedPlayers = players;
  }

  function handleTableClick(event) {
    const row = event.target.closest("tr");
    if (!row || !row.dataset.playerIndex) return;

    const index = parseInt(row.dataset.playerIndex, 10);
    const player = state.currentSortedPlayers[index];
    if (player) {
      renderPlayer(player);
    }
  }

  function initSorting() {
    elements.statsTable.querySelectorAll("th").forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (!key) return;
        const isSame = state.sort.key === key;
        state.sort = {
          key,
          dir: isSame && state.sort.dir === "desc" ? "asc" : "desc",
        };
        sortAndRender();
      });
    });
  }

  function showError(message) {
    elements.statsBody.innerHTML = `<tr><td colspan="17" style="text-align:center;color:#c00;">${message}</td></tr>`;
  }

  async function loadData() {
    let data;
    try {
      const res = await fetch(CONFIG.dataPath);
      if (!res.ok) throw new Error("active data not found");
      data = await res.json();
    } catch (err) {
      console.warn("Primary data fetch failed, trying fallback:", err.message);
      try {
        const fallback = await fetch(CONFIG.fallbackPath);
        if (!fallback.ok) throw new Error("fallback data not found");
        data = await fallback.json();
      } catch (fallbackErr) {
        console.error("Fallback fetch also failed:", fallbackErr.message);
        showError("데이터를 불러올 수 없습니다. 새로고침 해주세요.");
        return;
      }
    }

    state.players = data.players;
    populateControls(state.players);

    elements.seasonSelect.insertAdjacentHTML(
      "afterbegin",
      `<option value="all">전체</option>`
    );
    elements.seasonSelect.value = data.defaultSeason ?? "all";
    applyFilters();
  }

  function initListeners() {
    [elements.seasonSelect, elements.teamSelect, elements.posSelect].forEach(
      (el) => el.addEventListener("change", applyFilters)
    );

    const debouncedFilter = debounce(applyFilters, CONFIG.debounceDelay);
    elements.searchInput.addEventListener("input", debouncedFilter);

    elements.statsBody.addEventListener("click", handleTableClick);
  }

  function init() {
    if (!cacheElements()) {
      console.error("Failed to initialize: missing DOM elements");
      return;
    }

    initSorting();
    initListeners();
    loadData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
