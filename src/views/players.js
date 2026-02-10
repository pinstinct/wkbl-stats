/** Render helpers for players list and stat tables. */
export function renderPlayersTable({
  tbody,
  players,
  formatNumber,
  formatPct,
  formatSigned,
}) {
  if (!tbody) return;

  tbody.innerHTML = players
    .map(
      (player, index) => `
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
        <td class="hide-tablet ${player.court_margin === null || player.court_margin === undefined ? "" : player.court_margin >= 0 ? "stat-positive" : "stat-negative"}">${formatSigned(player.court_margin)}</td>
        <td class="hide-tablet">${formatNumber(player.pts36)}</td>
        <td class="hide-tablet">${formatNumber(player.reb36)}</td>
        <td class="hide-tablet">${formatNumber(player.ast36)}</td>
      </tr>
    `,
    )
    .join("");
}

export function renderPlayerSummaryCard({
  player,
  getById,
  primaryStats,
  advancedStats,
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
    primaryGrid.innerHTML += `<div class="stat-card" title="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
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
    } else {
      value = formatNumber(rawValue);
    }
    advancedGrid.innerHTML += `<div class="stat-card stat-card--advanced" data-tooltip="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
  });

  grid.append(primarySection, advancedSection);
}
