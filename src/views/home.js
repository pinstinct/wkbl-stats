import { encodeRouteParam, escapeHtml } from "./html.js";

/** Render helpers for the home dashboard sections. */
export function renderLineupPlayers({
  container,
  lineup,
  predictions,
  formatNumber,
}) {
  if (!container) return;
  container.innerHTML = lineup
    .map((player, i) => {
      const pred = predictions[i];
      return `
        <div class="lineup-player-card">
          <div class="lineup-player-info">
            <span class="lineup-player-pos">${escapeHtml(player.pos || "-")}</span>
            <a href="#/predict/${encodeRouteParam(player.id)}" class="lineup-player-name">${escapeHtml(player.name)}</a>
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
            <div class="lineup-stat">
              <span class="stat-label">STL</span>
              <span class="stat-value">${formatNumber(pred.stl.pred)}</span>
              <span class="stat-range">${formatNumber(pred.stl.low)}-${formatNumber(pred.stl.high)}</span>
            </div>
            <div class="lineup-stat">
              <span class="stat-label">BLK</span>
              <span class="stat-value">${formatNumber(pred.blk.pred)}</span>
              <span class="stat-range">${formatNumber(pred.blk.low)}-${formatNumber(pred.blk.high)}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

export function renderTotalStats({ container, predictions, formatNumber }) {
  if (!container) return;
  const totals = predictions.reduce(
    (acc, p) => {
      acc.pts += p.pts.pred;
      acc.reb += p.reb.pred;
      acc.ast += p.ast.pred;
      acc.stl += p.stl.pred;
      acc.blk += p.blk.pred;
      return acc;
    },
    { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 },
  );

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
      <div class="total-stat">
        <span class="stat-label">총 스틸</span>
        <span class="stat-value">${formatNumber(totals.stl)}</span>
      </div>
      <div class="total-stat">
        <span class="stat-label">총 블록</span>
        <span class="stat-value">${formatNumber(totals.blk)}</span>
      </div>
    `;
}
