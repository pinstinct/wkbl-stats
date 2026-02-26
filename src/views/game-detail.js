import { encodeRouteParam, escapeAttr, escapeHtml } from "./html.js";

/** Render helpers for game detail and boxscore rows. */
function compareNullableNumbers(a, b, dirSign) {
  const aNull = a === null || a === undefined || Number.isNaN(a);
  const bNull = b === null || b === undefined || Number.isNaN(b);
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (a === b) return 0;
  return a > b ? dirSign : -dirSign;
}

export function sortBoxscorePlayers(players = [], sort = {}) {
  const key = sort.key || "pts";
  const dir = sort.dir === "asc" ? "asc" : "desc";
  const dirSign = dir === "asc" ? 1 : -1;

  const getters = {
    player_name: (p) => String(p.player_name || ""),
    minutes: (p) => Number(p.minutes),
    pts: (p) => Number(p.pts),
    reb: (p) => Number(p.reb),
    ast: (p) => Number(p.ast),
    stl: (p) => Number(p.stl),
    blk: (p) => Number(p.blk),
    tov: (p) => Number(p.tov),
    fg: (p) =>
      Number(p.fga) > 0 ? Number(p.fgm) / Number(p.fga) : Number(p.fgm),
    tp: (p) =>
      Number(p.tpa) > 0 ? Number(p.tpm) / Number(p.tpa) : Number(p.tpm),
    ft: (p) =>
      Number(p.fta) > 0 ? Number(p.ftm) / Number(p.fta) : Number(p.ftm),
    ts_pct: (p) => Number(p.ts_pct),
    pir: (p) => Number(p.pir),
    plus_minus_game: (p) => Number(p.plus_minus_game),
  };

  const getter = getters[key] || getters.pts;
  return [...(players || [])].sort((a, b) => {
    if (key === "player_name") {
      const nameA = getter(a);
      const nameB = getter(b);
      if (nameA === nameB) return 0;
      return dir === "asc"
        ? nameA.localeCompare(nameB, "ko")
        : nameB.localeCompare(nameA, "ko");
    }
    return compareNullableNumbers(getter(a), getter(b), dirSign);
  });
}

export function renderBoxscoreRows({
  game,
  predictions,
  predictionMap,
  getPredStyle,
  formatNumber,
  formatPct,
  formatSigned,
}) {
  const isUpcomingGame = game.home_score == null || game.away_score == null;
  const getPlayerHref = (playerId, pred) => {
    if (isUpcomingGame && pred?.is_starter)
      return `#/predict/${encodeRouteParam(playerId)}`;
    return `#/players/${encodeRouteParam(playerId)}`;
  };

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
          <a href="${getPlayerHref(p.player_id, pred)}">${escapeHtml(p.player_name)}</a>
          ${pred?.is_starter ? '<span class="starter-badge">선발</span>' : ""}
        </td>
        <td>${formatNumber(p.minutes, 0)}</td>
        <td class="${escapeAttr(ptsPred.cls)}" title="${escapeAttr(ptsPred.title)}">${p.pts}</td>
        <td class="${escapeAttr(rebPred.cls)}" title="${escapeAttr(rebPred.title)}">${p.reb}</td>
        <td class="${escapeAttr(astPred.cls)}" title="${escapeAttr(astPred.title)}">${p.ast}</td>
        <td class="${escapeAttr(stlPred.cls)}" title="${escapeAttr(stlPred.title)}">${p.stl}</td>
        <td class="${escapeAttr(blkPred.cls)}" title="${escapeAttr(blkPred.title)}">${p.blk}</td>
        <td class="hide-mobile">${p.tov}</td>
        <td class="hide-mobile">${p.fgm}/${p.fga}</td>
        <td>${p.tpm}/${p.tpa}</td>
        <td>${p.ftm}/${p.fta}</td>
        <td>${formatPct(p.ts_pct)}</td>
        <td>${p.pir}</td>
        <td class="${pmClass}">${pm === null || pm === undefined ? "-" : formatSigned(pm, 0)}</td>
      </tr>
    `;
  }

  function renderDnpRow(pred) {
    return `
      <tr class="starter-row dnp-row">
        <td>
          <a href="${getPlayerHref(pred.player_id, pred)}">${escapeHtml(pred.player_name || pred.player_id)}</a>
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
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
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
