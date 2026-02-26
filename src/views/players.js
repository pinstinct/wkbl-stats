import { encodeRouteParam, escapeAttr, escapeHtml } from "./html.js";

const BASIC_THEAD_HTML = `<tr>
  <th data-key="name">선수</th>
  <th data-key="team" class="hide-mobile">팀</th>
  <th data-key="pos" class="hide-mobile" title="포지션 (G: 가드, F: 포워드, C: 센터)">POS</th>
  <th data-key="gp" class="hide-tablet">GP</th>
  <th data-key="min" class="hide-tablet">MIN</th>
  <th data-key="pts">PTS</th>
  <th data-key="reb">REB</th>
  <th data-key="ast">AST</th>
  <th data-key="stl" class="hide-mobile">STL</th>
  <th data-key="blk" class="hide-mobile">BLK</th>
  <th data-key="tov" class="hide-tablet">TOV</th>
  <th data-key="fgp" class="hide-tablet">FG%</th>
  <th data-key="tpp" class="hide-tablet">3P%</th>
  <th data-key="ftp" class="hide-tablet">FT%</th>
  <th data-key="ts_pct" class="hide-mobile" title="True Shooting %">TS%</th>
  <th data-key="efg_pct" class="hide-mobile" title="Effective FG%">eFG%</th>
  <th data-key="tpar" class="hide-tablet" title="3PA/FGA">3PAr</th>
  <th data-key="ftr" class="hide-tablet" title="FTA/FGA">FTr</th>
  <th data-key="ast_to" class="hide-tablet" title="Assist/Turnover Ratio">AST/TO</th>
  <th data-key="pir" class="hide-tablet" title="Performance Index Rating">PIR</th>
  <th data-key="pts36" class="hide-tablet" title="Points per 36 min">PTS/36</th>
  <th data-key="reb36" class="hide-tablet" title="Rebounds per 36 min">REB/36</th>
  <th data-key="ast36" class="hide-tablet" title="Assists per 36 min">AST/36</th>
  <th data-key="court_margin" class="hide-tablet" title="코트마진 (출전시간 가중 득실차)">코트마진</th>
</tr>`;

const ADVANCED_THEAD_HTML = `<tr>
  <th data-key="name">선수</th>
  <th data-key="team" class="hide-mobile">팀</th>
  <th data-key="pos" class="hide-mobile">POS</th>
  <th data-key="per" title="Player Efficiency Rating">PER</th>
  <th data-key="game_score" title="Game Score (Hollinger)">GmSc</th>
  <th data-key="usg_pct" title="Usage Rate">USG%</th>
  <th data-key="tov_pct" title="Turnover %">TOV%</th>
  <th data-key="off_rtg" title="Offensive Rating">ORtg</th>
  <th data-key="def_rtg" title="Defensive Rating">DRtg</th>
  <th data-key="net_rtg" title="Net Rating">NetRtg</th>
  <th data-key="oreb_pct" class="hide-mobile" title="Offensive Rebound %">OREB%</th>
  <th data-key="dreb_pct" class="hide-mobile" title="Defensive Rebound %">DREB%</th>
  <th data-key="reb_pct" title="Rebound %">REB%</th>
  <th data-key="ast_pct" title="Assist %">AST%</th>
  <th data-key="stl_pct" class="hide-mobile" title="Steal %">STL%</th>
  <th data-key="blk_pct" class="hide-mobile" title="Block %">BLK%</th>
  <th data-key="ows" class="hide-mobile" title="Offensive Win Shares">OWS</th>
  <th data-key="dws" class="hide-mobile" title="Defensive Win Shares">DWS</th>
  <th data-key="ws" title="Win Shares">WS</th>
  <th data-key="ws_40" class="hide-mobile" title="Win Shares per 40 minutes">WS/40</th>
  <th data-key="plus_minus_per_game" title="Plus/Minus per Game">+/-/G</th>
  <th data-key="plus_minus_per100" title="Plus/Minus per 100 possessions">+/-/100</th>
</tr>`;

/** Render helpers for players list and stat tables. */
export function renderPlayersTable({
  tbody,
  thead,
  players,
  formatNumber,
  formatPct,
  formatSigned,
  activeTab = "basic",
}) {
  if (!tbody) return;

  if (activeTab === "advanced") {
    if (thead) thead.innerHTML = ADVANCED_THEAD_HTML;
    tbody.innerHTML = players
      .map(
        (player, index) => `
        <tr data-player-id="${escapeAttr(player.id)}" data-index="${index}">
          <td><a href="#/players/${encodeRouteParam(player.id)}">${escapeHtml(player.name)}</a></td>
          <td class="hide-mobile">${escapeHtml(player.team)}</td>
          <td class="hide-mobile">${escapeHtml(player.pos || "-")}</td>
          <td>${formatNumber(player.per)}</td>
          <td>${formatNumber(player.game_score)}</td>
          <td>${formatNumber(player.usg_pct)}</td>
          <td>${formatNumber(player.tov_pct)}</td>
          <td>${formatNumber(player.off_rtg)}</td>
          <td>${formatNumber(player.def_rtg)}</td>
          <td>${formatSigned(player.net_rtg)}</td>
          <td class="hide-mobile">${formatNumber(player.oreb_pct)}</td>
          <td class="hide-mobile">${formatNumber(player.dreb_pct)}</td>
          <td>${formatNumber(player.reb_pct)}</td>
          <td>${formatNumber(player.ast_pct)}</td>
          <td class="hide-mobile">${formatNumber(player.stl_pct)}</td>
          <td class="hide-mobile">${formatNumber(player.blk_pct)}</td>
          <td class="hide-mobile">${formatNumber(player.ows, 2)}</td>
          <td class="hide-mobile">${formatNumber(player.dws, 2)}</td>
          <td>${formatNumber(player.ws, 2)}</td>
          <td class="hide-mobile">${formatNumber(player.ws_40, 3)}</td>
          <td>${formatSigned(player.plus_minus_per_game)}</td>
          <td>${formatSigned(player.plus_minus_per100)}</td>
        </tr>
      `,
      )
      .join("");
  } else {
    if (thead) thead.innerHTML = BASIC_THEAD_HTML;
    tbody.innerHTML = players
      .map(
        (player, index) => `
        <tr data-player-id="${escapeAttr(player.id)}" data-index="${index}">
          <td><a href="#/players/${encodeRouteParam(player.id)}">${escapeHtml(player.name)}</a></td>
          <td class="hide-mobile">${escapeHtml(player.team)}</td>
          <td class="hide-mobile">${escapeHtml(player.pos || "-")}</td>
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
          <td class="hide-tablet">${formatPct(player.tpar)}</td>
          <td class="hide-tablet">${formatPct(player.ftr)}</td>
          <td class="hide-tablet">${formatNumber(player.ast_to, 2)}</td>
          <td class="hide-tablet">${formatNumber(player.pir)}</td>
          <td class="hide-tablet">${formatNumber(player.pts36)}</td>
          <td class="hide-tablet">${formatNumber(player.reb36)}</td>
          <td class="hide-tablet">${formatNumber(player.ast36)}</td>
          <td class="hide-tablet ${player.court_margin === null || player.court_margin === undefined ? "" : player.court_margin >= 0 ? "stat-positive" : "stat-negative"}">${formatSigned(player.court_margin)}</td>
        </tr>
      `,
      )
      .join("");
  }
}

export function renderPlayerSummaryCard({
  player,
  getById,
  primaryStats,
  advancedStats,
  tier2Stats,
  formatNumber,
  formatPct,
  formatSigned,
  calculateAge,
}) {
  getById("playerName").textContent = player.name;
  getById("playerTeam").textContent = player.team;
  getById("playerPos").textContent = player.pos || "-";
  getById("playerHeight").textContent = player.height || "-";

  const birthEl = getById("playerBirth");
  if (birthEl) {
    if (player.birth_date) {
      const age = calculateAge(player.birth_date);
      birthEl.textContent =
        age !== null ? `${player.birth_date} (만 ${age}세)` : player.birth_date;
    } else {
      birthEl.textContent = "-";
    }
  }

  getById("playerGp").textContent = `${player.gp}경기`;

  const grid = getById("playerStatGrid");
  grid.innerHTML = "";

  const primarySection = document.createElement("div");
  primarySection.className = "stat-section";
  primarySection.innerHTML =
    '<div class="stat-section-title">기본 스탯</div><div class="stat-grid-inner"></div>';
  const primaryGrid = primarySection.querySelector(".stat-grid-inner");
  primaryStats.forEach((stat) => {
    const value =
      stat.format === "pct"
        ? formatPct(player[stat.key])
        : formatNumber(player[stat.key]);
    primaryGrid.innerHTML += `<div class="stat-card" title="${escapeAttr(stat.desc)}" data-tooltip="${escapeAttr(stat.desc)}"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  });

  const advancedSection = document.createElement("div");
  advancedSection.className = "stat-section";
  advancedSection.innerHTML =
    '<div class="stat-section-title">2차 지표</div><div class="stat-grid-inner"></div>';
  const advancedGrid = advancedSection.querySelector(".stat-grid-inner");
  advancedStats.forEach((stat) => {
    const rawValue = player[stat.key];
    let value;
    if (stat.format === "pct") {
      value = formatPct(rawValue);
    } else if (stat.format === "signed") {
      value = formatSigned(rawValue);
    } else if (stat.key === "ast_to") {
      value = formatNumber(rawValue, 2);
    } else {
      value = formatNumber(rawValue);
    }
    advancedGrid.innerHTML += `<div class="stat-card stat-card--advanced" title="${escapeAttr(stat.desc)}" data-tooltip="${escapeAttr(stat.desc)}"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  });

  if (tier2Stats && tier2Stats.length > 0) {
    const tier2Section = document.createElement("div");
    tier2Section.className = "stat-section";
    tier2Section.innerHTML =
      '<div class="stat-section-title">고급 지표</div><div class="stat-grid-inner"></div>';
    const tier2Grid = tier2Section.querySelector(".stat-grid-inner");
    tier2Stats.forEach((stat) => {
      const rawValue = player[stat.key];
      let value;
      if (rawValue === null || rawValue === undefined) {
        value = "-";
      } else if (stat.format === "signed") {
        value = formatSigned(rawValue);
      } else if (stat.key === "ws_40") {
        value = formatNumber(rawValue, 3);
      } else if (["ws", "ows", "dws"].includes(stat.key)) {
        value = formatNumber(rawValue, 2);
      } else {
        value = formatNumber(rawValue);
      }
      tier2Grid.innerHTML += `<div class="stat-card stat-card--advanced" title="${escapeAttr(stat.desc)}" data-tooltip="${escapeAttr(stat.desc)}"><span>${escapeHtml(stat.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    });
    grid.append(primarySection, advancedSection, tier2Section);
  } else {
    grid.append(primarySection, advancedSection);
  }
}
