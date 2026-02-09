import { describe, expect, it } from "vitest";

import {
  renderCareerSummary,
  renderPlayerGameLogTable,
  renderPlayerSeasonTable,
} from "./player-detail.js";

describe("player detail view", () => {
  it("renders career summary with court margin", () => {
    const summaryEl = { innerHTML: "" };
    renderCareerSummary({
      summaryEl,
      seasons: [{ gp: 10, pts: 12, reb: 5, ast: 4 }, { gp: 20, pts: 8, reb: 3, ast: 2 }],
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
      seasons: [{ season_label: "2025-26", team: "하나", gp: 1, min: 20, pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, fgp: 0.5, tpp: 0.4, ftp: 0.8, ts_pct: 0.58, efg_pct: 0.53, ast_to: 2, pir: 12, pts36: 18, reb36: 9, ast36: 5 }],
      formatNumber: (v) => String(v),
      formatPct: (v) => `${Math.round(v * 100)}%`,
    });

    renderPlayerGameLogTable({
      tbody: gameBody,
      games: [{ game_date: "2025-10-01", opponent: "BNK", result: "W", minutes: 20, pts: 10, reb: 5, ast: 3, stl: 1, blk: 0, fgm: 4, fga: 9, tpm: 1, tpa: 3, ftm: 1, fta: 2 }],
      formatDate: () => "10/1",
      formatNumber: (v) => String(v),
    });

    expect(seasonBody.innerHTML).toContain("2025-26");
    expect(gameBody.innerHTML).toContain("vs BNK");
  });
});
