/** Render helpers for teams listing and team detail tables. */
export function sortStandings(standings, { key = "rank", dir = "asc" } = {}) {
  const rows = [...(standings || [])];
  return rows.sort((a, b) => {
    const aVal = a?.[key];
    const bVal = b?.[key];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    if (typeof aVal === "string" || typeof bVal === "string") {
      const comp = String(aVal).localeCompare(String(bVal), "ko");
      return dir === "asc" ? comp : -comp;
    }

    const comp = Number(aVal) - Number(bVal);
    return dir === "asc" ? comp : -comp;
  });
}

export function renderStandingsTable({ tbody, standings }) {
  if (!tbody) return;
  tbody.innerHTML = standings
    .map(
      (t) => `
        <tr>
          <td>${t.rank}</td>
          <td><a href="#/teams/${t.team_id}">${t.team_name}</a></td>
          <td>${t.wins + t.losses}</td>
          <td>${t.wins}</td>
          <td>${t.losses}</td>
          <td>${(t.win_pct * 100).toFixed(1)}%</td>
          <td>${t.off_rtg !== null && t.off_rtg !== undefined ? Number(t.off_rtg).toFixed(1) : "-"}</td>
          <td>${t.def_rtg !== null && t.def_rtg !== undefined ? Number(t.def_rtg).toFixed(1) : "-"}</td>
          <td>${t.net_rtg !== null && t.net_rtg !== undefined ? `${t.net_rtg >= 0 ? "+" : ""}${Number(t.net_rtg).toFixed(1)}` : "-"}</td>
          <td>${t.pace !== null && t.pace !== undefined ? Number(t.pace).toFixed(1) : "-"}</td>
          <td>${t.games_behind || "-"}</td>
          <td class="hide-mobile">${t.home_record}</td>
          <td class="hide-mobile">${t.away_record}</td>
          <td class="hide-tablet">${t.streak || "-"}</td>
          <td class="hide-tablet">${t.last5 || "-"}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderTeamRoster({ tbody, roster }) {
  if (!tbody) return;
  tbody.innerHTML = (roster || [])
    .map(
      (p) => `
        <tr>
          <td><a href="#/players/${p.id}">${p.name}</a></td>
          <td>${p.position || "-"}</td>
          <td>${p.height || "-"}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderTeamStats({ container, stats }) {
  if (!container || !stats) return;

  const items = [
    {
      key: "off_rtg",
      label: "ORtg",
      desc: "Offensive Rating (100 포제션당 득점)",
      signed: false,
    },
    {
      key: "def_rtg",
      label: "DRtg",
      desc: "Defensive Rating (100 포제션당 실점)",
      signed: false,
    },
    {
      key: "net_rtg",
      label: "NetRtg",
      desc: "Net Rating (ORtg - DRtg)",
      signed: true,
    },
    { key: "pace", label: "Pace", desc: "40분당 포제션 수", signed: false },
    { key: "gp", label: "GP", desc: "경기 수", signed: false },
  ];

  container.innerHTML = items
    .map((item) => {
      const raw = stats[item.key];
      const value =
        raw === null || raw === undefined
          ? "-"
          : item.signed
            ? (raw >= 0 ? "+" : "") + Number(raw).toFixed(1)
            : item.key === "gp"
              ? String(raw)
              : Number(raw).toFixed(1);
      return `<div class="stat-card" title="${item.desc}" data-tooltip="${item.desc}"><span>${item.label}</span><strong>${value}</strong></div>`;
    })
    .join("");
}

export function renderTeamRecentGames({ tbody, games, formatDate }) {
  if (!tbody) return;
  tbody.innerHTML = (games || [])
    .map(
      (g) => `
        <tr>
          <td><a href="#/games/${g.game_id}">${formatDate(g.date)}</a></td>
          <td>${g.opponent}</td>
          <td>${g.is_home ? "홈" : "원정"}</td>
          <td>${g.result}</td>
          <td>${g.score}</td>
        </tr>
      `,
    )
    .join("");
}
