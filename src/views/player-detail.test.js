import { describe, expect, it } from "vitest";

import {
  renderCareerSummary,
  renderPlayerAdvancedStats,
  renderPlayerGameLogTable,
  renderPlayerSeasonTable,
} from "./player-detail.js";

describe("player detail view", () => {
  it("renders career summary with court margin", () => {
    const summaryEl = { innerHTML: "" };
    renderCareerSummary({
      summaryEl,
      seasons: [
        { gp: 10, pts: 12, reb: 5, ast: 4 },
        { gp: 20, pts: 8, reb: 3, ast: 2 },
      ],
      courtMargin: 1.7,
    });
    expect(summaryEl.innerHTML).toContain("코트마진");
    expect(summaryEl.innerHTML).toContain("+1.7");
  });

  it("renders season and gamelog rows", () => {
    const seasonBody = { innerHTML: "" };
    const gameBody = { innerHTML: "" };

    renderPlayerSeasonTable({
      tbody: seasonBody,
      seasons: [
        {
          season_label: "2025-26",
          team: "하나",
          gp: 1,
          min: 20,
          pts: 10,
          reb: 5,
          ast: 3,
          stl: 1,
          blk: 0,
          fgp: 0.5,
          tpp: 0.4,
          ftp: 0.8,
          ts_pct: 0.58,
          efg_pct: 0.53,
          ast_to: 2,
          pir: 12,
          pts36: 18,
          reb36: 9,
          ast36: 5,
        },
      ],
      formatNumber: (v) => String(v),
      formatPct: (v) => `${Math.round(v * 100)}%`,
    });

    renderPlayerGameLogTable({
      tbody: gameBody,
      games: [
        {
          game_date: "2025-10-01",
          opponent: "BNK",
          result: "W",
          minutes: 20,
          pts: 10,
          reb: 5,
          ast: 3,
          stl: 1,
          blk: 0,
          fgm: 4,
          fga: 9,
          tpm: 1,
          tpa: 3,
          ftm: 1,
          fta: 2,
        },
      ],
      formatDate: () => "10/1",
      formatNumber: (v) => String(v),
    });

    expect(seasonBody.innerHTML).toContain("2025-26");
    expect(gameBody.innerHTML).toContain("vs BNK");
  });

  it("renders advanced stat cards including signed values", () => {
    const container = { innerHTML: "" };

    renderPlayerAdvancedStats({
      container,
      season: {
        per: 17.1,
        game_score: 12.3,
        usg_pct: 22.5,
        tov_pct: 11.1,
        off_rtg: 108.4,
        def_rtg: 101.2,
        net_rtg: 7.2,
        oreb_pct: 6.4,
        dreb_pct: 19.3,
        reb_pct: 13.1,
        ast_pct: 16.2,
        stl_pct: 2.5,
        blk_pct: 1.2,
        plus_minus_per_game: -1.8,
        plus_minus_per100: 3.7,
        ws: 3.4,
      },
      formatNumber: (v) => String(v ?? "-"),
      formatSigned: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}`),
    });

    expect(container.innerHTML).toContain("PER");
    expect(container.innerHTML).toContain("NetRtg");
    expect(container.innerHTML).toContain("+7.2");
    expect(container.innerHTML).toContain("-1.8");
  });

  it("no-ops when required containers are missing", () => {
    // Should not throw for guard paths
    renderCareerSummary({ summaryEl: null, seasons: [], courtMargin: null });
    renderPlayerSeasonTable({
      tbody: null,
      seasons: [],
      formatNumber: (v) => String(v),
      formatPct: (v) => String(v),
    });
    renderPlayerGameLogTable({
      tbody: null,
      games: [],
      formatDate: () => "-",
      formatNumber: (v) => String(v),
    });
    renderPlayerAdvancedStats({
      container: null,
      season: null,
      formatNumber: (v) => String(v),
      formatSigned: (v) => String(v),
    });
  });
});
