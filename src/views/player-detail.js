/** Render helpers for player detail page blocks. */
export function renderCareerSummary({ summaryEl, seasons, courtMargin }) {
  if (!summaryEl || !seasons || seasons.length === 0) return;
  const totalGames = seasons.reduce((sum, s) => sum + s.gp, 0);
  const avgPts = seasons.reduce((sum, s) => sum + s.pts * s.gp, 0) / totalGames;
  const avgReb = seasons.reduce((sum, s) => sum + s.reb * s.gp, 0) / totalGames;
  const avgAst = seasons.reduce((sum, s) => sum + s.ast * s.gp, 0) / totalGames;

  let courtMarginHtml = "";
  if (courtMargin !== null && courtMargin !== undefined) {
    const marginClass = courtMargin >= 0 ? "positive" : "negative";
    const marginSign = courtMargin >= 0 ? "+" : "";
    courtMarginHtml = `<div class="career-stat career-stat--${marginClass}"><div class="career-stat-label">코트마진</div><div class="career-stat-value">${marginSign}${courtMargin.toFixed(1)}</div></div>`;
  }

  summaryEl.innerHTML = `
    <div class="career-stat"><div class="career-stat-label">시즌</div><div class="career-stat-value">${seasons.length}</div></div>
    <div class="career-stat"><div class="career-stat-label">총 경기</div><div class="career-stat-value">${totalGames}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 득점</div><div class="career-stat-value">${avgPts.toFixed(1)}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 리바운드</div><div class="career-stat-value">${avgReb.toFixed(1)}</div></div>
    <div class="career-stat"><div class="career-stat-label">평균 어시스트</div><div class="career-stat-value">${avgAst.toFixed(1)}</div></div>
    ${courtMarginHtml}
  `;
}

export function renderPlayerSeasonTable({
  tbody,
  seasons,
  formatNumber,
  formatPct,
}) {
  if (!tbody) return;
  tbody.innerHTML = [...seasons]
    .reverse()
    .map(
      (s) => `
        <tr>
          <td>${s.season_label || "-"}</td>
          <td>${s.team || "-"}</td>
          <td>${s.gp}</td>
          <td>${formatNumber(s.min)}</td>
          <td>${formatNumber(s.pts)}</td>
          <td>${formatNumber(s.reb)}</td>
          <td>${formatNumber(s.ast)}</td>
          <td>${formatNumber(s.stl)}</td>
          <td>${formatNumber(s.blk)}</td>
          <td>${formatPct(s.fgp)}</td>
          <td>${formatPct(s.tpp)}</td>
          <td>${formatPct(s.ftp)}</td>
          <td>${formatPct(s.ts_pct)}</td>
          <td>${formatPct(s.efg_pct)}</td>
          <td>${formatNumber(s.ast_to)}</td>
          <td>${formatNumber(s.pir)}</td>
          <td>${formatNumber(s.pts36)}</td>
          <td>${formatNumber(s.reb36)}</td>
          <td>${formatNumber(s.ast36)}</td>
        </tr>
      `,
    )
    .join("");
}

export function renderPlayerAdvancedStats({
  container,
  season,
  formatNumber,
  formatSigned,
}) {
  if (!container || !season) return;

  const stats = [
    {
      key: "per",
      label: "PER",
      desc: "공격·수비를 종합한 효율 지표(리그 평균 약 15). 높을수록 종합 퍼포먼스가 좋습니다.",
      signed: false,
    },
    {
      key: "game_score",
      label: "GmSc",
      desc: "한 경기 영향력을 한 수치로 요약한 값. 높을수록 경기 기여가 컸습니다.",
      signed: false,
    },
    {
      key: "usg_pct",
      label: "USG%",
      desc: "공격 마무리 점유율(FGA/FTA/TOV 관여). 높을수록 공격 역할 비중이 큽니다.",
      signed: false,
    },
    {
      key: "tov_pct",
      label: "TOV%",
      desc: "공격 점유 대비 턴오버 비율. 낮을수록 좋습니다.",
      signed: false,
    },
    {
      key: "off_rtg",
      label: "ORtg",
      desc: "100포제션당 팀 득점 기여 지표. 높을수록 공격 효율이 좋습니다.",
      signed: false,
    },
    {
      key: "def_rtg",
      label: "DRtg",
      desc: "100포제션당 실점 지표. 낮을수록 수비 효율이 좋습니다.",
      signed: false,
    },
    {
      key: "net_rtg",
      label: "NetRtg",
      desc: "공격효율-수비효율 차이. +가 클수록 팀에 유리한 영향입니다.",
      signed: true,
    },
    {
      key: "oreb_pct",
      label: "OREB%",
      desc: "공격 리바운드 점유율. 높을수록 세컨드 찬스 창출에 유리합니다.",
      signed: false,
    },
    {
      key: "dreb_pct",
      label: "DREB%",
      desc: "수비 리바운드 점유율. 높을수록 상대의 추가 공격을 줄입니다.",
      signed: false,
    },
    {
      key: "reb_pct",
      label: "REB%",
      desc: "코트 위 리바운드 점유율. 높을수록 리바운드 장악력이 좋습니다.",
      signed: false,
    },
    {
      key: "ast_pct",
      label: "AST%",
      desc: "팀 득점 슛 중 어시스트 관여 비율. 높을수록 연계 기여가 큽니다.",
      signed: false,
    },
    {
      key: "stl_pct",
      label: "STL%",
      desc: "상대 포제션에서 스틸을 만들어내는 비율. 높을수록 좋습니다.",
      signed: false,
    },
    {
      key: "blk_pct",
      label: "BLK%",
      desc: "상대 2점 시도 대비 블록 비율. 높을수록 림 보호가 좋습니다.",
      signed: false,
    },
    {
      key: "plus_minus",
      label: "+/-",
      desc: "출전 시간 동안 팀 득실점 차. +일수록 팀에 유리한 결과입니다.",
      signed: true,
    },
    {
      key: "ws",
      label: "WS",
      desc: "팀 승리에 대한 선수 기여도를 승수 단위로 환산한 지표입니다.",
      signed: false,
    },
  ];

  container.innerHTML = stats
    .map((stat) => {
      const raw = season[stat.key];
      const value =
        raw === null || raw === undefined
          ? "-"
          : stat.signed
            ? formatSigned(raw)
            : formatNumber(raw);
      return `<div class="stat-card stat-card--advanced" title="${stat.desc}" data-tooltip="${stat.desc}"><span>${stat.label}</span><strong>${value}</strong></div>`;
    })
    .join("");
}

export function renderPlayerGameLogTable({
  tbody,
  games,
  formatDate,
  formatNumber,
}) {
  if (!tbody) return;
  tbody.innerHTML = games
    .map(
      (g) => `
        <tr>
          <td>${formatDate(g.game_date)}</td>
          <td>vs ${g.opponent}</td>
          <td>${g.result}</td>
          <td>${formatNumber(g.minutes, 0)}</td>
          <td>${g.pts}</td>
          <td>${g.reb}</td>
          <td>${g.ast}</td>
          <td>${g.stl}</td>
          <td>${g.blk}</td>
          <td>${g.fgm}/${g.fga}</td>
          <td>${g.tpm}/${g.tpa}</td>
          <td>${g.ftm}/${g.fta}</td>
        </tr>
      `,
    )
    .join("");
}
