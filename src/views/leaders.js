import { encodeRouteParam, escapeHtml } from "./html.js";

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
                  <span class="leader-rank">${escapeHtml(l.rank)}</span>
                  <div class="leader-info">
                    <div class="leader-name"><a href="#/players/${encodeRouteParam(l.player_id)}">${escapeHtml(l.player_name)}</a></div>
                    <div class="leader-team">${escapeHtml(l.team_name)}</div>
                  </div>
                  <div class="leader-value">${escapeHtml(l.value)}</div>
                </li>
              `,
              )
              .join("")
          : '<li class="leader-item leader-item--empty">데이터가 없습니다</li>';
      return `
          <div class="leader-card">
            <h3>${escapeHtml(cat.label)}</h3>
            <ul class="leader-list">
              ${itemsHtml}
            </ul>
          </div>
        `;
    })
    .join("");
}
