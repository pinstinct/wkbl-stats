/** Render helpers for player detail page blocks. */
export function renderCareerSummary({ summaryEl, seasons, courtMargin }) {
  if (!summaryEl || !seasons || seasons.length === 0) return;
  const totalGames = seasons.reduce((sum, s) => sum + s.gp, 0);
  const avgPts = seasons.reduce((sum, s) => sum + s.pts * s.gp, 0) / totalGames;
  const avgReb = seasons.reduce((sum, s) => sum + s.reb * s.gp, 0) / totalGames;
  const avgAst = seasons.reduce((sum, s) => sum + s.ast * s.gp, 0) / totalGames;

  let courtMarginHtml = "";
  if (courtMargin !== null && courtMargin !== undefined) {
    const marginClass = courtMargin >= 0 ? "positive" : "negative";
    const marginSign = courtMargin >= 0 ? "+" : "";
    courtMarginHtml = `<div class="career-stat career-stat--${marginClass}"><div class="career-stat-label">코트마진</div><div class="career-stat-value">${marginSign}${courtMargin.toFixed(1)}</div></div>`;
  }

  summaryEl.innerHTML = `
    <div class="career-stat"><div class="career-stat-label">시즌</div><div class="career-stat-value">${seasons.length}</div></div>
    <div class="career-stat"><div class="career-stat-label">총 경기</div><div class="career-stat-value">${totalGames}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 득점</div><div class="career-stat-value">${avgPts.toFixed(1)}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 리바운드</div><div class="career-stat-value">${avgReb.toFixed(1)}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 어시스트</div><div class="career-stat-value">${avgAst.toFixed(1)}</div></div>
    ${courtMarginHtml}
  `;
}

export function renderPlayerSeasonTable({
  tbody,
  seasons,
  formatNumber,
  formatPct,
}) {
  if (!tbody) return;
  tbody.innerHTML = [...seasons]
    .reverse()
    .map(
      (s) => `
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
      `,
    )
    .join("");
}

export function renderPlayerAdvancedStats({
  container,
  season,
  formatNumber,
  formatSigned,
}) {
  if (!container || !season) return;

  const stats = [
    {
      key: "per",
      label: "PER",
      desc: "Player Efficiency Rating",
      signed: false,
    },
    {
      key: "game_score",
      label: "GmSc",
      desc: "Game Score (Hollinger)",
      signed: false,
    },
    { key: "usg_pct", label: "USG%", desc: "Usage Rate", signed: false },
    { key: "tov_pct", label: "TOV%", desc: "Turnover %", signed: false },
    { key: "off_rtg", label: "ORtg", desc: "Offensive Rating", signed: false },
    { key: "def_rtg", label: "DRtg", desc: "Defensive Rating", signed: false },
    { key: "net_rtg", label: "NetRtg", desc: "Net Rating", signed: true },
    {
      key: "oreb_pct",
      label: "OREB%",
      desc: "Offensive Rebound %",
      signed: false,
    },
    {
      key: "dreb_pct",
      label: "DREB%",
      desc: "Defensive Rebound %",
      signed: false,
    },
    { key: "reb_pct", label: "REB%", desc: "Rebound %", signed: false },
    { key: "ast_pct", label: "AST%", desc: "Assist %", signed: false },
    { key: "stl_pct", label: "STL%", desc: "Steal %", signed: false },
    { key: "blk_pct", label: "BLK%", desc: "Block %", signed: false },
    { key: "plus_minus", label: "+/-", desc: "Plus/Minus", signed: true },
  ];

  container.innerHTML = stats
    .map((stat) => {
      const raw = season[stat.key];
      const value =
        raw === null || raw === undefined
          ? "-"
          : stat.signed
            ? formatSigned(raw)
            : formatNumber(raw);
      return `<div class="stat-card stat-card--advanced" title="${stat.desc}" data-tooltip="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
    })
    .join("");
}

export function renderPlayerGameLogTable({
  tbody,
  games,
  formatDate,
  formatNumber,
}) {
  if (!tbody) return;
  tbody.innerHTML = games
    .map(
      (g) => `
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
      `,
    )
    .join("");
}
