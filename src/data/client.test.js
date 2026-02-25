import { describe, expect, it, vi } from "vitest";

import { createDataClient, resolvePlayersQuery } from "./client.js";

describe("data client", () => {
  it("resolves players query options for current season", () => {
    const query = resolvePlayersQuery({
      season: "WKBL_2025_2026",
      defaultSeason: "WKBL_2025_2026",
    });
    expect(query).toEqual({
      seasonId: "WKBL_2025_2026",
      activeOnly: true,
      includeNoGames: true,
    });
  });

  it("resolves players query options for all season", () => {
    const query = resolvePlayersQuery({
      season: "all",
      defaultSeason: "WKBL_2025_2026",
    });
    expect(query).toEqual({
      seasonId: null,
      activeOnly: false,
      includeNoGames: false,
    });
  });

  it("passes normalized parameters to db getPlayers", async () => {
    const initDb = vi.fn(async () => true);
    const getPlayers = vi.fn(() => [{ id: "p1" }]);
    const getDb = () => ({ getPlayers });

    const client = createDataClient({
      initDb,
      getDb,
      getSeasonLabel: () => "시즌",
    });
    const rows = await client.getPlayers({
      season: "WKBL_2025_2026",
      defaultSeason: "WKBL_2025_2026",
    });

    expect(initDb).toHaveBeenCalledTimes(1);
    expect(getPlayers).toHaveBeenCalledWith("WKBL_2025_2026", null, true, true);
    expect(rows).toEqual([{ id: "p1" }]);
  });

  it("returns empty list when db is unavailable for list endpoints", async () => {
    const client = createDataClient({
      initDb: async () => false,
      getDb: () => null,
      getSeasonLabel: () => "시즌",
    });

    await expect(client.getGames("WKBL_2025_2026")).resolves.toEqual([]);
    await expect(
      client.getLeaders("WKBL_2025_2026", "pts", 10),
    ).resolves.toEqual([]);
  });

  it("throws when required detail record is missing", async () => {
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({
        getPlayerDetail: () => null,
      }),
      getSeasonLabel: () => "시즌",
    });

    await expect(client.getPlayerDetail("missing")).rejects.toThrow(
      "Player not found",
    );
  });

  it("throws for missing team detail and game boxscore", async () => {
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({
        getTeamDetail: () => null,
        getGameBoxscore: () => null,
      }),
      getSeasonLabel: () => "시즌",
    });

    await expect(client.getTeamDetail("missing-team", "046")).rejects.toThrow(
      "Team not found",
    );
    await expect(client.getGameBoxscore("missing-game")).rejects.toThrow(
      "Game not found",
    );
  });

  it("returns normalized payload wrappers for teams and standings", async () => {
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({
        getTeams: () => [{ id: "kb" }],
        getStandings: () => [{ team_id: "kb", rank: 1 }],
      }),
      getSeasonLabel: () => "2025-26",
    });

    await expect(client.getTeams()).resolves.toEqual({ teams: [{ id: "kb" }] });
    await expect(client.getStandings("046")).resolves.toEqual({
      season: "046",
      season_label: "2025-26",
      standings: [{ team_id: "kb", rank: 1 }],
    });
  });

  it("passes through list and search endpoints when db is available", async () => {
    const db = {
      getGames: vi.fn(() => [{ id: "g1" }]),
      getLeaders: vi.fn(() => [{ id: "p1" }]),
      getLeadersAll: vi.fn(() => ({ pts: [] })),
      search: vi.fn(() => ({ players: [], teams: [] })),
      getPlayerComparison: vi.fn(() => [{ id: "p1" }, { id: "p2" }]),
    };
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => db,
      getSeasonLabel: () => "시즌",
    });

    await expect(client.getGames("046")).resolves.toEqual([{ id: "g1" }]);
    await expect(client.getLeaders("046", "pts", 5)).resolves.toEqual([
      { id: "p1" },
    ]);
    await expect(client.getLeadersAll("046")).resolves.toEqual({ pts: [] });
    await expect(client.search("kim", 10)).resolves.toEqual({
      players: [],
      teams: [],
    });
    await expect(
      client.getPlayerComparison(["p1", "p2"], "046"),
    ).resolves.toEqual([{ id: "p1" }, { id: "p2" }]);

    expect(db.getGames).toHaveBeenCalledWith("046", null, null, 50, 0, true);
    expect(db.getLeaders).toHaveBeenCalledWith("046", "pts", 5);
    expect(db.getLeadersAll).toHaveBeenCalledWith("046", 5);
    expect(db.search).toHaveBeenCalledWith("kim", 10);
    expect(db.getPlayerComparison).toHaveBeenCalledWith(["p1", "p2"], "046");
  });

  it("returns game shot chart rows via db", async () => {
    const getShotChart = vi.fn(() => [{ id: 1 }]);
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({ getShotChart }),
      getSeasonLabel: () => "시즌",
    });

    const rows = await client.getGameShotChart("g1", "p1");
    expect(getShotChart).toHaveBeenCalledWith("g1", "p1");
    expect(rows).toEqual([{ id: 1 }]);
  });

  it("returns player shot chart rows via db", async () => {
    const getPlayerShotChart = vi.fn(() => [{ id: 2 }]);
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({ getPlayerShotChart }),
      getSeasonLabel: () => "시즌",
    });

    const rows = await client.getPlayerShotChart("p1", "WKBL_2025_2026");
    expect(getPlayerShotChart).toHaveBeenCalledWith("p1", "WKBL_2025_2026");
    expect(rows).toEqual([{ id: 2 }]);
  });
});
