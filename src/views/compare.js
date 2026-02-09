export function renderCompareSelected({ container, selectedPlayers }) {
  if (!container) return;
  if (selectedPlayers.length === 0) {
    container.innerHTML =
      '<span class="compare-hint">최대 4명까지 선수를 선택할 수 있습니다</span>';
    return;
  }
  container.innerHTML = selectedPlayers
    .map(
      (p) => `
        <div class="compare-tag" data-id="${p.id}">
          <span>${p.name}</span>
          <button class="compare-tag-remove" data-id="${p.id}">&times;</button>
        </div>
      `
    )
    .join("");
}

export function renderCompareSuggestions({ container, players, error = false }) {
  if (!container) return;
  if (error) {
    container.innerHTML = '<div class="compare-suggestion-item">검색 오류</div>';
    return;
  }
  if (players.length === 0) {
    container.innerHTML = '<div class="compare-suggestion-item">검색 결과 없음</div>';
    return;
  }
  container.innerHTML = players
    .map(
      (p) => `
          <div class="compare-suggestion-item" data-id="${p.id}" data-name="${p.name}" data-team="${p.team}">
            <span class="compare-suggestion-name">${p.name}</span>
            <span class="compare-suggestion-team">${p.team}</span>
          </div>
        `
    )
    .join("");
}

export function renderCompareCards({ container, players, formatNumber }) {
  if (!container) return;
  container.innerHTML = players
    .map(
      (p) => `
      <div class="compare-player-card">
        <div class="compare-player-info">
          <span class="compare-player-team">${p.team}</span>
          <h3 class="compare-player-name"><a href="#/players/${p.id}">${p.name}</a></h3>
          <div class="compare-player-meta">
            <span>${p.position || "-"}</span>
            <span>${p.height || "-"}</span>
          </div>
        </div>
        <div class="compare-player-stats">
          <div class="compare-stat-item">
            <span class="compare-stat-label">GP</span>
            <span class="compare-stat-value">${p.gp}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">PTS</span>
            <span class="compare-stat-value">${formatNumber(p.pts)}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">REB</span>
            <span class="compare-stat-value">${formatNumber(p.reb)}</span>
          </div>
          <div class="compare-stat-item">
            <span class="compare-stat-label">AST</span>
            <span class="compare-stat-value">${formatNumber(p.ast)}</span>
          </div>
        </div>
      </div>
    `
    )
    .join("");
}
