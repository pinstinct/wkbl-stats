/** Render helpers for game detail and boxscore rows. */
export function renderBoxscoreRows({
  game,
  predictions,
  predictionMap,
  getPredStyle,
  formatNumber,
  formatPct,
  formatSigned,
}) {
  function renderPlayerRow(p) {
    const pred = predictionMap[p.player_id];
    const pm = p.plus_minus_game;
    const pmClass =
      pm === null || pm === undefined
        ? ""
        : pm >= 0
          ? "stat-positive"
          : "stat-negative";

    const ptsPred = getPredStyle(pred, p.pts, "pts");
    const rebPred = getPredStyle(pred, p.reb, "reb");
    const astPred = getPredStyle(pred, p.ast, "ast");
    const stlPred = getPredStyle(pred, p.stl, "stl");
    const blkPred = getPredStyle(pred, p.blk, "blk");

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
        <td class="${stlPred.cls}" title="${stlPred.title}">${p.stl}</td>
        <td class="${blkPred.cls}" title="${blkPred.title}">${p.blk}</td>
        <td class="hide-mobile">${p.tov}</td>
        <td class="hide-mobile">${p.fgm}/${p.fga}</td>
        <td class="hide-tablet">${p.tpm}/${p.tpa}</td>
        <td class="hide-tablet">${p.ftm}/${p.fta}</td>
        <td class="hide-tablet">${formatPct(p.ts_pct)}</td>
        <td class="hide-tablet">${p.pir}</td>
        <td class="hide-tablet ${pmClass}">${pm === null || pm === undefined ? "-" : formatSigned(pm, 0)}</td>
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
        <td title="예측: ${(pred.predicted_stl || 0).toFixed(1)}">-</td>
        <td title="예측: ${(pred.predicted_blk || 0).toFixed(1)}">-</td>
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
      !playedPlayerIds.has(p.player_id),
  );
  const homeDnp = predictions.players.filter(
    (p) =>
      p.is_starter &&
      p.team_id === game.home_team_id &&
      !playedPlayerIds.has(p.player_id),
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
