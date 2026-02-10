/** Render helpers for prediction page UI sections. */
export function renderPredictSuggestions({
  container,
  players,
  error = false,
}) {
  if (!container) return;
  if (error) {
    container.innerHTML =
      '<div class="predict-suggestion-item">검색 오류</div>';
    return;
  }
  if (players.length === 0) {
    container.innerHTML =
      '<div class="predict-suggestion-item">검색 결과 없음</div>';
    return;
  }

  container.innerHTML = players
    .map(
      (p) => `
          <div class="predict-suggestion-item" data-id="${p.id}" data-name="${p.name}" data-team="${p.team}">
            <span class="predict-suggestion-name">${p.name}</span>
            <span class="predict-suggestion-team">${p.team}</span>
          </div>
        `,
    )
    .join("");
}

export function renderPredictPlayerInfo({ container, player }) {
  if (!container) return;
  container.innerHTML = `
    <div class="predict-player-card">
      <span class="predict-player-team">${player.team || "-"}</span>
      <h3 class="predict-player-name">${player.name}</h3>
      <div class="predict-player-meta">
        <span>${player.position || "-"}</span>
        <span>${player.height || "-"}</span>
      </div>
    </div>
  `;
}

export function renderPredictCards({ container, prediction }) {
  if (!container) return;
  const stats = [
    { key: "pts", label: "득점" },
    { key: "reb", label: "리바운드" },
    { key: "ast", label: "어시스트" },
  ];
  container.innerHTML = stats
    .map((stat) => {
      const pred = prediction[stat.key];
      return `
          <div class="predict-stat-card">
            <div class="predict-stat-label">${stat.label}</div>
            <div class="predict-stat-value">${pred.predicted.toFixed(1)}</div>
            <div class="predict-stat-range">${pred.low.toFixed(1)} - ${pred.high.toFixed(1)}</div>
            <div class="predict-stat-trend ${pred.trend}">${pred.trendLabel}</div>
          </div>
        `;
    })
    .join("");
}

export function renderPredictFactors({ container, prediction }) {
  if (!container) return;
  container.innerHTML = `
    <div class="predict-factors-card">
      <h4>예측 근거</h4>
      <ul class="predict-factors-list">
        <li>최근 5경기 평균: ${prediction.recent5Avg.pts.toFixed(1)}점 / ${prediction.recent5Avg.reb.toFixed(1)}리바 / ${prediction.recent5Avg.ast.toFixed(1)}어시</li>
        <li>최근 10경기 평균: ${prediction.recent10Avg.pts.toFixed(1)}점 / ${prediction.recent10Avg.reb.toFixed(1)}리바 / ${prediction.recent10Avg.ast.toFixed(1)}어시</li>
        <li>시즌 평균: ${prediction.seasonAvg.pts.toFixed(1)}점 / ${prediction.seasonAvg.reb.toFixed(1)}리바 / ${prediction.seasonAvg.ast.toFixed(1)}어시</li>
        <li>예측 모델: (최근 5경기 × 60%) + (최근 10경기 × 40%)</li>
      </ul>
    </div>
  `;
}
