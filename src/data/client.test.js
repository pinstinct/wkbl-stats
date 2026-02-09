import { describe, expect, it, vi } from "vitest";

import { createDataClient, resolvePlayersQuery } from "./client.js";

describe("data client", () => {
  it("resolves players query options for current season", () => {
    const query = resolvePlayersQuery({ season: "WKBL_2025_2026", defaultSeason: "WKBL_2025_2026" });
    expect(query).toEqual({
      seasonId: "WKBL_2025_2026",
      activeOnly: true,
      includeNoGames: true,
    });
  });

  it("resolves players query options for all season", () => {
    const query = resolvePlayersQuery({ season: "all", defaultSeason: "WKBL_2025_2026" });
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

    const client = createDataClient({ initDb, getDb, getSeasonLabel: () => "시즌" });
    const rows = await client.getPlayers({ season: "WKBL_2025_2026", defaultSeason: "WKBL_2025_2026" });

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
    await expect(client.getLeaders("WKBL_2025_2026", "pts", 10)).resolves.toEqual([]);
  });

  it("throws when required detail record is missing", async () => {
    const client = createDataClient({
      initDb: async () => true,
      getDb: () => ({
        getPlayerDetail: () => null,
      }),
      getSeasonLabel: () => "시즌",
    });

    await expect(client.getPlayerDetail("missing")).rejects.toThrow("Player not found");
  });
});
