import { describe, expect, it } from "vitest";

import { renderBoxscoreRows, sortBoxscorePlayers } from "./game-detail.js";

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
