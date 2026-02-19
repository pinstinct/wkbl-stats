/** Render helpers for leaders page category cards. */
export function renderLeadersGrid({ grid, categories, leaderCategories }) {
  if (!grid) return;
  grid.innerHTML = leaderCategories
    .map((cat) => {
      const leaders = categories[cat.key] || [];
      const itemsHtml =
        leaders.length > 0
          ? leaders
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
              `,
              )
              .join("")
          : '<li class="leader-item leader-item--empty">데이터가 없습니다</li>';
      return `
          <div class="leader-card">
            <h3>${cat.label}</h3>
            <ul class="leader-list">
              ${itemsHtml}
            </ul>
          </div>
        `;
    })
    .join("");
}
