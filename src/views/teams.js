import { encodeRouteParam, escapeAttr, escapeHtml } from "./html.js";

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
          <td><a href="#/teams/${encodeRouteParam(t.team_id)}">${escapeHtml(t.team_name)}</a></td>
          <td>${t.wins + t.losses}</td>
          <td>${t.wins}</td>
          <td>${t.losses}</td>
          <td>${(t.win_pct * 100).toFixed(1)}%</td>
          <td>${t.off_rtg !== null && t.off_rtg !== undefined ? Number(t.off_rtg).toFixed(1) : "-"}</td>
          <td>${t.def_rtg !== null && t.def_rtg !== undefined ? Number(t.def_rtg).toFixed(1) : "-"}</td>
          <td>${t.net_rtg !== null && t.net_rtg !== undefined ? `${t.net_rtg >= 0 ? "+" : ""}${Number(t.net_rtg).toFixed(1)}` : "-"}</td>
          <td>${t.pace !== null && t.pace !== undefined ? Number(t.pace).toFixed(1) : "-"}</td>
          <td>${escapeHtml(t.games_behind || "-")}</td>
          <td class="hide-mobile">${escapeHtml(t.home_record)}</td>
          <td class="hide-mobile">${escapeHtml(t.away_record)}</td>
          <td class="hide-tablet">${escapeHtml(t.streak || "-")}</td>
          <td class="hide-tablet">${escapeHtml(t.last5 || "-")}</td>
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
          <td><a href="#/players/${encodeRouteParam(p.id)}">${escapeHtml(p.name)}</a></td>
          <td>${escapeHtml(p.position || "-")}</td>
          <td>${escapeHtml(p.height || "-")}</td>
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
      desc: "100포제션당 득점 지표입니다. 높을수록 팀 공격 효율이 좋습니다.",
      signed: false,
    },
    {
      key: "def_rtg",
      label: "DRtg",
      desc: "100포제션당 실점 지표입니다. 낮을수록 팀 수비 효율이 좋습니다.",
      signed: false,
    },
    {
      key: "net_rtg",
      label: "NetRtg",
      desc: "공격효율-수비효율 차이입니다. +가 클수록 팀 전력 우위가 큽니다.",
      signed: true,
    },
    {
      key: "pace",
      label: "Pace",
      desc: "40분 기준 포제션 수입니다. 높을수록 경기 템포가 빠릅니다.",
      signed: false,
    },
    {
      key: "gp",
      label: "GP",
      desc: "시즌 누적 경기 수입니다. 표본 크기 확인용입니다.",
      signed: false,
    },
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
      return `<div class="stat-card" title="${escapeAttr(item.desc)}" data-tooltip="${escapeAttr(item.desc)}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(value)}</strong></div>`;
    })
    .join("");
}

export function renderTeamRecentGames({ tbody, games, formatDate }) {
  if (!tbody) return;
  tbody.innerHTML = (games || [])
    .map(
      (g) => `
        <tr>
          <td><a href="#/games/${encodeRouteParam(g.game_id)}">${escapeHtml(formatDate(g.date))}</a></td>
          <td>${escapeHtml(g.opponent)}</td>
          <td>${escapeHtml(g.is_home ? "홈" : "원정")}</td>
          <td>${escapeHtml(g.result)}</td>
          <td>${escapeHtml(g.score)}</td>
        </tr>
      `,
    )
    .join("");
}
