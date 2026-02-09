export function renderBoxscoreRows({
  game,
  predictions,
  predictionMap,
  getPredStyle,
  formatNumber,
  formatPct,
}) {
  function renderPlayerRow(p) {
    const pred = predictionMap[p.player_id];
    const cmSign = p.court_margin !== null ? (p.court_margin >= 0 ? "+" : "") : "";
    const cmClass =
      p.court_margin !== null
        ? p.court_margin >= 0
          ? "stat-positive"
          : "stat-negative"
        : "";

    const ptsPred = getPredStyle(pred, p.pts, "pts");
    const rebPred = getPredStyle(pred, p.reb, "reb");
    const astPred = getPredStyle(pred, p.ast, "ast");

    return `
      <tr class="${pred?.is_starter ? "starter-row" : ""}">
        <td>
          <a href="#/players/${p.player_id}">${p.player_name}</a>
          ${pred?.is_starter ? '<span class="starter-badge">선발</span>' : ""}
        </td>
        <td>${formatNumber(p.minutes, 0)}</td>
        <td class="${ptsPred.cls}" title="${ptsPred.title}">${p.pts}</td>
        <td class="${rebPred.cls}" title="${rebPred.title}">${p.reb}</td>
        <td class="${astPred.cls}" title="${astPred.title}">${p.ast}</td>
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

  function renderDnpRow(pred) {
    return `
      <tr class="starter-row dnp-row">
        <td>
          <a href="#/players/${pred.player_id}">${pred.player_name || pred.player_id}</a>
          <span class="starter-badge">선발</span>
          <span class="dnp-badge">미출장</span>
        </td>
        <td>-</td>
        <td title="예측: ${pred.predicted_pts.toFixed(1)}">-</td>
        <td title="예측: ${pred.predicted_reb.toFixed(1)}">-</td>
        <td title="예측: ${pred.predicted_ast.toFixed(1)}">-</td>
        <td>-</td><td>-</td>
        <td class="hide-mobile">-</td>
        <td class="hide-mobile">-</td>
        <td class="hide-tablet">-</td>
        <td class="hide-tablet">-</td>
        <td class="hide-tablet">-</td>
        <td class="hide-tablet">-</td>
        <td class="hide-tablet">-</td>
      </tr>
    `;
  }

  const playedPlayerIds = new Set([
    ...(game.away_team_stats || []).map((p) => p.player_id),
    ...(game.home_team_stats || []).map((p) => p.player_id),
  ]);
  const awayDnp = predictions.players.filter(
    (p) =>
      p.is_starter &&
      p.team_id === game.away_team_id &&
      !playedPlayerIds.has(p.player_id)
  );
  const homeDnp = predictions.players.filter(
    (p) =>
      p.is_starter &&
      p.team_id === game.home_team_id &&
      !playedPlayerIds.has(p.player_id)
  );

  return {
    awayRows:
      (game.away_team_stats || []).map((p) => renderPlayerRow(p)).join("") +
      awayDnp.map((p) => renderDnpRow(p)).join(""),
    homeRows:
      (game.home_team_stats || []).map((p) => renderPlayerRow(p)).join("") +
      homeDnp.map((p) => renderDnpRow(p)).join(""),
  };
}
