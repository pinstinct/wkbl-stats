import { getDayCountdownLabel } from "./schedule-logic.js";

/** Render helpers for schedule page sections. */
export function renderNextGameHighlight({
  nextGameCard,
  next,
  formatFullDate,
  getById,
}) {
  if (!nextGameCard) return;
  if (!next) {
    nextGameCard.style.display = "none";
    return;
  }

  nextGameCard.style.display = "block";
  getById("nextGameMatchup").textContent =
    `${next.away_team_short || next.away_team_name} vs ${next.home_team_short || next.home_team_name}`;
  getById("nextGameDate").textContent = formatFullDate(next.game_date);
  getById("nextGameCountdown").textContent = getDayCountdownLabel(
    next.game_date,
  );
}

export function renderUpcomingGames({
  container,
  upcomingGames,
  formatFullDate,
  getPredictionHtml,
}) {
  if (!container) return;
  if (upcomingGames.length === 0) {
    container.innerHTML =
      '<div class="schedule-empty">예정된 경기가 없습니다</div>';
    return;
  }

  container.innerHTML = upcomingGames
    .map((g) => {
      const predHtml = getPredictionHtml(g);
      return `
          <a href="#/games/${g.id}" class="schedule-item upcoming">
            <div class="schedule-item-date">${formatFullDate(g.game_date)}</div>
            <div class="schedule-item-matchup">
              <span class="schedule-team away">${g.away_team_short || g.away_team_name}</span>
              <span class="schedule-vs">vs</span>
              <span class="schedule-team home">${g.home_team_short || g.home_team_name}</span>
            </div>
            ${predHtml}
          </a>
        `;
    })
    .join("");
}

export function renderRecentResults({
  container,
  recentGames,
  formatFullDate,
  getPredictionCompareHtml,
}) {
  if (!container) return;
  if (recentGames.length === 0) {
    container.innerHTML =
      '<div class="schedule-empty">최근 경기 결과가 없습니다</div>';
    return;
  }

  container.innerHTML = recentGames
    .map((g) => {
      const homeWin = g.home_score > g.away_score;
      const predCompareHtml = getPredictionCompareHtml(g, homeWin);
      return `
          <a href="#/games/${g.id}" class="schedule-item result">
            <div class="schedule-item-date">${formatFullDate(g.game_date)}</div>
            <div class="schedule-item-matchup">
              <span class="schedule-team away ${!homeWin ? "winner" : ""}">${g.away_team_short || g.away_team_name}</span>
              <span class="schedule-score">${g.away_score} - ${g.home_score}</span>
              <span class="schedule-team home ${homeWin ? "winner" : ""}">${g.home_team_short || g.home_team_name}</span>
            </div>
            ${predCompareHtml}
          </a>
        `;
    })
    .join("");
}
