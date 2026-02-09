export function renderLeadersGrid({ grid, categories, leaderCategories }) {
  if (!grid) return;
  grid.innerHTML = leaderCategories
    .map((cat) => {
      const leaders = categories[cat.key] || [];
      return `
          <div class="leader-card">
            <h3>${cat.label}</h3>
            <ul class="leader-list">
              ${leaders
                .map(
                  (l) => `
                <li class="leader-item">
                  <span class="leader-rank">${l.rank}</span>
                  <div class="leader-info">
                    <div class="leader-name"><a href="#/players/${l.player_id}">${l.player_name}</a></div>
                    <div class="leader-team">${l.team_name}</div>
                  </div>
                  <div class="leader-value">${l.value}</div>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        `;
    })
    .join("");
}
