import { describe, expect, it } from "vitest";

import { renderBoxscoreRows, sortBoxscorePlayers } from "./game-detail.js";

describe("game-detail null container and edge cases", () => {
  it("compareNullableNumbers handles null/NaN values", () => {
    const withNull = [
      { player_id: "p1", pts: null },
      { player_id: "p2", pts: 10 },
      { player_id: "p3", pts: NaN },
      { player_id: "p4", pts: 10 },
    ];
    const sorted = sortBoxscorePlayers(withNull, { key: "pts", dir: "desc" });
    // Non-null values first, nulls/NaN at end
    expect(sorted[0].player_id).toBe("p2");
    expect(sorted[1].player_id).toBe("p4");

    // Both null — returns 0 (stable sort)
    const bothNull = [
      { player_id: "a", pts: null },
      { player_id: "b", pts: undefined },
    ];
    const sortedBoth = sortBoxscorePlayers(bothNull, {
      key: "pts",
      dir: "desc",
    });
    expect(sortedBoth).toHaveLength(2);

    // First non-null, second null (bNull) — returns -1
    const secondNull = [
      { player_id: "x", pts: 5 },
      { player_id: "y", pts: null },
    ];
    const sortedSecond = sortBoxscorePlayers(secondNull, {
      key: "pts",
      dir: "desc",
    });
    expect(sortedSecond[0].player_id).toBe("x");
  });

  it("handles equal name comparison", () => {
    const sameName = [
      { player_id: "p1", player_name: "가", pts: 5 },
      { player_id: "p2", player_name: "가", pts: 10 },
    ];
    const sorted = sortBoxscorePlayers(sameName, {
      key: "player_name",
      dir: "asc",
    });
    expect(sorted).toHaveLength(2);
  });
});

describe("game-detail sort", () => {
  const players = [
    {
      player_id: "p1",
      player_name: "가드",
      minutes: 30,
      pts: 10,
      reb: 4,
      ast: 7,
      stl: 1,
      blk: 0,
      tov: 3,
      fgm: 4,
      fga: 10,
      tpm: 2,
      tpa: 6,
      ftm: 0,
      fta: 0,
      ts_pct: 0.53,
      pir: 12,
      plus_minus_game: -2,
    },
    {
      player_id: "p2",
      player_name: "센터",
      minutes: 24,
      pts: 16,
      reb: 11,
      ast: 2,
      stl: 0,
      blk: 2,
      tov: 1,
      fgm: 7,
      fga: 12,
      tpm: 0,
      tpa: 0,
      ftm: 2,
      fta: 2,
      ts_pct: 0.61,
      pir: 20,
      plus_minus_game: 6,
    },
  ];

  it("sorts by numeric stat descending", () => {
    const sorted = sortBoxscorePlayers(players, { key: "pts", dir: "desc" });
    expect(sorted.map((p) => p.player_id)).toEqual(["p2", "p1"]);
    expect(players.map((p) => p.player_id)).toEqual(["p1", "p2"]);
  });

  it("sorts by player name ascending", () => {
    const sorted = sortBoxscorePlayers(players, {
      key: "player_name",
      dir: "asc",
    });
    expect(sorted.map((p) => p.player_name)).toEqual(["가드", "센터"]);
  });

  it("sorts by all numeric stat keys", () => {
    const allKeys = [
      "minutes",
      "reb",
      "ast",
      "stl",
      "blk",
      "tov",
      "ts_pct",
      "pir",
      "plus_minus_game",
    ];
    for (const key of allKeys) {
      const sorted = sortBoxscorePlayers(players, { key, dir: "desc" });
      expect(sorted).toHaveLength(2);
    }
  });

  it("sorts by shooting efficiency keys", () => {
    expect(
      sortBoxscorePlayers(players, { key: "fg", dir: "desc" }).map(
        (p) => p.player_id,
      ),
    ).toEqual(["p2", "p1"]);
    expect(
      sortBoxscorePlayers(players, { key: "tp", dir: "desc" }).map(
        (p) => p.player_id,
      ),
    ).toEqual(["p1", "p2"]);
    expect(
      sortBoxscorePlayers(players, { key: "ft", dir: "desc" }).map(
        (p) => p.player_id,
      ),
    ).toEqual(["p2", "p1"]);
  });
});

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
    expect(awayRows).toContain('href="#/predict/p2"');
    expect(homeRows).toBe("");
  });

  it("renders home team DNP rows for predicted starters", () => {
    const game = {
      away_team_id: "a",
      home_team_id: "h",
      away_team_stats: [],
      home_team_stats: [
        {
          player_id: "h1",
          player_name: "홈선수",
          minutes: 25,
          pts: 15,
          reb: 5,
          ast: 3,
          stl: 1,
          blk: 0,
          tov: 2,
          fgm: 6,
          fga: 12,
          tpm: 1,
          tpa: 4,
          ftm: 2,
          fta: 2,
          ts_pct: 0.55,
          pir: 14,
          plus_minus_game: null,
        },
      ],
    };
    const predictions = {
      players: [
        {
          player_id: "h2",
          player_name: "홈예측",
          team_id: "h",
          is_starter: true,
          predicted_pts: 10,
          predicted_reb: 3,
          predicted_ast: 2,
          predicted_stl: 1,
          predicted_blk: 0.5,
        },
      ],
    };
    const { awayRows, homeRows } = renderBoxscoreRows({
      game,
      predictions,
      predictionMap: {},
      getPredStyle: () => ({ cls: "", title: "" }),
      formatNumber: (v) => String(v),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v, d = 1) => `${v >= 0 ? "+" : ""}${Number(v).toFixed(d)}`,
    });

    expect(homeRows).toContain("홈선수");
    expect(homeRows).toContain("홈예측");
    expect(homeRows).toContain("미출장");
    expect(awayRows).toBe("");
  });

  it("keeps player detail links for completed games", () => {
    const game = {
      away_team_id: "a",
      home_team_id: "h",
      away_score: 70,
      home_score: 75,
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
          player_id: "p1",
          team_id: "a",
          is_starter: true,
        },
      ],
    };
    const predictionMap = {
      p1: predictions.players[0],
    };

    const { awayRows } = renderBoxscoreRows({
      game,
      predictions,
      predictionMap,
      getPredStyle: () => ({ cls: "", title: "" }),
      formatNumber: (v) => String(v),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v, decimals = 1) =>
        `${v >= 0 ? "+" : ""}${Number(v).toFixed(decimals)}`,
    });

    expect(awayRows).toContain('href="#/players/p1"');
    expect(awayRows).not.toContain('href="#/predict/p1"');
  });
});
