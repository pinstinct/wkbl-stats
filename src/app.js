(function () {
  "use strict";

  const CONFIG = {
    dataPath: "./data/wkbl-active.json",
    fallbackPath: "./data/sample.json",
    debounceDelay: 150,
  };

  const statConfig = [
    { key: "pts", label: "PTS" },
    { key: "reb", label: "REB" },
    { key: "ast", label: "AST" },
    { key: "stl", label: "STL" },
    { key: "blk", label: "BLK" },
    { key: "fgp", label: "FG%" },
    { key: "tpp", label: "3P%" },
    { key: "ftp", label: "FT%" },
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

  function renderPlayer(player) {
    elements.playerName.textContent = player.name;
    elements.playerTeam.textContent = player.team;
    elements.playerPos.textContent = player.pos;
    elements.playerHeight.textContent = player.height;

    elements.playerStatGrid.innerHTML = "";
    statConfig.forEach((stat) => {
      const card = document.createElement("div");
      card.className = "stat-card";
      const label = document.createElement("span");
      label.textContent = stat.label;
      const value = document.createElement("strong");

      let displayValue = player[stat.key];
      if (["fgp", "tpp", "ftp"].includes(stat.key)) {
        displayValue = formatPct(displayValue);
      } else {
        displayValue = formatNumber(displayValue);
      }

      value.textContent = displayValue;
      card.append(label, value);
      elements.playerStatGrid.append(card);
    });
  }

  function renderTable(players) {
    elements.statsBody.innerHTML = "";
    players.forEach((player, index) => {
      const row = document.createElement("tr");
      row.dataset.playerIndex = index;
      row.innerHTML = `
        <td>${player.name}</td>
        <td>${player.team}</td>
        <td>${player.pos}</td>
        <td>${player.gp}</td>
        <td>${formatNumber(player.min)}</td>
        <td>${formatNumber(player.pts)}</td>
        <td>${formatNumber(player.reb)}</td>
        <td>${formatNumber(player.ast)}</td>
        <td>${formatNumber(player.stl)}</td>
        <td>${formatNumber(player.blk)}</td>
        <td>${formatPct(player.fgp)}</td>
        <td>${formatPct(player.tpp)}</td>
        <td>${formatPct(player.ftp)}</td>
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
    elements.statsBody.innerHTML = `<tr><td colspan="13" style="text-align:center;color:#c00;">${message}</td></tr>`;
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
