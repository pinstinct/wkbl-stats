/** Render helpers for games list view. */
export function renderGamesList({ container, games, formatDate }) {
  if (!container) return;
  container.innerHTML = games
    .map(
      (g) => `
        <a href="#/games/${g.id}" class="game-card">
          <div class="game-card-date">${formatDate(g.game_date)}</div>
          <div class="game-card-matchup">
            <div class="game-card-team away">
              <span>${g.away_team_short || g.away_team_name}</span>
              <span class="game-card-score">${g.away_score || "-"}</span>
            </div>
            <span>vs</span>
            <div class="game-card-team home">
              <span class="game-card-score">${g.home_score || "-"}</span>
              <span>${g.home_team_short || g.home_team_name}</span>
            </div>
          </div>
          <div class="game-card-result">
            <span class="final">Final</span>
          </div>
        </a>
      `,
    )
    .join("");
}
