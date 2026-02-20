import { describe, expect, it } from "vitest";

import { renderBoxscoreRows } from "./game-detail.js";

describe("game-detail view", () => {
  it("renders away/home rows including dnp", () => {
    const game = {
      away_team_id: "a",
      home_team_id: "h",
      away_team_stats: [
        {
          player_id: "p1",
          player_name: "선수1",
          minutes: 20,
          pts: 10,
          reb: 5,
          ast: 3,
          stl: 1,
          blk: 0,
          tov: 1,
          fgm: 4,
          fga: 8,
          tpm: 1,
          tpa: 3,
          ftm: 1,
          fta: 2,
          ts_pct: 0.6,
          pir: 12,
          plus_minus_game: 2,
        },
      ],
      home_team_stats: [],
    };
    const predictions = {
      players: [
        {
          player_id: "p2",
          player_name: "선수2",
          team_id: "a",
          is_starter: true,
          predicted_pts: 12,
          predicted_reb: 4,
          predicted_ast: 3,
        },
      ],
    };
    const predictionMap = {};
    const { awayRows, homeRows } = renderBoxscoreRows({
      game,
      predictions,
      predictionMap,
      getPredStyle: () => ({ cls: "", title: "" }),
      formatNumber: (v) => String(v),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v, decimals = 1) =>
        `${v >= 0 ? "+" : ""}${Number(v).toFixed(decimals)}`,
    });

    expect(awayRows).toContain("선수1");
    expect(awayRows).toContain("미출장");
    expect(homeRows).toBe("");
  });
});
