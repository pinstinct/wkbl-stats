import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildFrontendFixtureDbs,
  getSqlModule,
  mockFetchResponse,
} from "./test-utils/frontend-fixtures.js";

async function importDatabaseModule({ fetchImpl, cache }) {
  const SQL = await getSqlModule();
  const windowRef = {
    WKBLShared: {
      SEASON_CODES: { "046": "2025-26" },
    },
  };
  const moduleRef = { exports: {} };
  const context = {
    window: windowRef,
    fetch: fetchImpl,
    initSqlJs: vi.fn(async () => SQL),
    IDBCache: cache,
    module: moduleRef,
    console,
    setTimeout,
    clearTimeout,
    Uint8Array,
    ArrayBuffer,
    Math,
    Date,
  };
  vm.createContext(context);
  const dbPath = fileURLToPath(new URL("./db.js", import.meta.url));
  const source = fs.readFileSync(dbPath, "utf-8");
  new vm.Script(source, { filename: dbPath }).runInContext(context);
  return moduleRef.exports;
}

async function cloneBufferWithSql(buffer, sqlStatements) {
  const SQL = await getSqlModule();
  const db = new SQL.Database(new Uint8Array(buffer));
  db.exec(sqlStatements);
  const cloned = db.export();
  db.close();
  return cloned.buffer;
}

describe("db integration", () => {
  let fixtures;

  beforeEach(async () => {
    fixtures = await buildFrontendFixtureDbs();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads full database when core load fails and exposes read contracts", async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (options.method === "HEAD") {
        return mockFetchResponse({ etag: '"full-v1"' });
      }
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ ok: false, status: 404 });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({
          buffer: fixtures.detailBuffer,
          etag: '"d1"',
        });
      }
      if (String(url).includes("wkbl.db")) {
        return mockFetchResponse({ buffer: fixtures.fullBuffer, etag: '"f1"' });
      }
      return mockFetchResponse({ buffer: fixtures.fullBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await expect(db.initDatabase()).resolves.toBe(true);
    expect(db.isReady()).toBe(true);

    await expect(db.initDetailDatabase()).resolves.toBe(true);
    expect(db.isDetailReady()).toBe(true);

    expect(db.getSeasons()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "046" })]),
    );
    expect(db.getTeams()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "kb" })]),
    );
    expect(db.getStandings("046")).toHaveLength(2);
    expect(db.getGames("046", null, null, 50, 0, true)).toHaveLength(1);
    expect(db.getUpcomingGames("046")).toHaveLength(1);
    expect(db.getRecentGames("046")).toHaveLength(1);
    expect(db.getNextGame("046")).toEqual(
      expect.objectContaining({ id: "04601002" }),
    );
    const searchResult = db.search("김", 5);
    expect(Array.isArray(searchResult.players)).toBe(true);
    expect(Array.isArray(searchResult.teams)).toBe(true);

    const players = db.getPlayers("046", null, true, true);
    expect(players[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        plus_minus_total: expect.any(Number),
      }),
    );
    expect(db.getPlayerDetail("p1")).toEqual(
      expect.objectContaining({ id: "p1", name: "김가드" }),
    );
    expect(db.getPlayerGamelog("p1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ game_id: "04601001" }),
      ]),
    );
    expect(db.getPlayerComparison(["p1", "p2"], "046")).toHaveLength(2);
    const teamDetail = db.getTeamDetail("kb", "046");
    expect(teamDetail.id).toBe("kb");
    expect(Array.isArray(teamDetail.roster)).toBe(true);
    expect(Array.isArray(teamDetail.recent_games)).toBe(true);
    const boxscore = db.getGameBoxscore("04601001");
    expect(boxscore.id).toBe("04601001");
    expect(Array.isArray(boxscore.home_team_stats)).toBe(true);
    expect(Array.isArray(boxscore.away_team_stats)).toBe(true);
    expect(db.getLeaders("046", "pts", 3)).toHaveLength(3);
    const leadersAll = db.getLeadersAll("046", 3);
    expect(Array.isArray(leadersAll.pts)).toBe(true);

    const gamePredictions = db.getGamePredictions("04601002");
    expect(Array.isArray(gamePredictions.players)).toBe(true);
    expect(gamePredictions.team).toBeTruthy();
    expect(db.hasGamePredictions("04601002")).toBe(true);

    expect(db.getPlayByPlay("04601001")).toHaveLength(2);
    expect(db.getShotChart("04601001")).toHaveLength(2);
    expect(db.getShotChart("04601001", "p1")).toHaveLength(1);
    expect(db.getPlayerShotChart("p1", "046")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          game_id: "04601001",
          opponent_name: expect.any(String),
        }),
      ]),
    );
    expect(db.getTeamCategoryStats("046")).toHaveLength(2);
    expect(db.getHeadToHead("046")).toHaveLength(1);
    expect(db.getGameMVP("046")).toHaveLength(1);
    expect(db.getGameQuarterScores("04601001")).toEqual(
      expect.objectContaining({ home_q1: 18, away_q4: 17 }),
    );
    const seasonMap = db.getTeamSeasonStats("046");
    expect(typeof seasonMap.get).toBe("function");
    expect(seasonMap.has("kb")).toBe(true);
  });

  it("uses IndexedDB cache and updates cache when server etag changes", async () => {
    const loadFromCache = vi
      .fn()
      .mockResolvedValueOnce({
        buffer: fixtures.coreBuffer,
        etag: '"old-etag"',
      })
      .mockResolvedValue(null);
    const saveToCache = vi.fn().mockResolvedValue(undefined);
    const cache = {
      loadFromCache,
      saveToCache,
    };

    const fetchMock = vi.fn(async (url, options = {}) => {
      if (options.method === "HEAD") {
        return mockFetchResponse({ etag: '"new-etag"' });
      }
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({
          buffer: fixtures.coreBuffer,
          etag: '"new-etag"',
        });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({
          buffer: fixtures.detailBuffer,
          etag: '"detail-etag"',
        });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
    await db.initDatabase();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadFromCache).toHaveBeenCalledWith("wkbl-core");
    expect(saveToCache).toHaveBeenCalledWith(
      "wkbl-core",
      expect.any(ArrayBuffer),
      '"new-etag"',
    );
  });

  it("handles missing detail database gracefully", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({
          buffer: fixtures.coreBuffer,
          etag: '"core"',
        });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ ok: false, status: 404 });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();
    await expect(db.initDetailDatabase()).resolves.toBe(false);
    expect(db.isDetailReady()).toBe(false);

    expect(db.getPlayByPlay("04601001")).toEqual([]);
    expect(db.getShotChart("04601001")).toEqual([]);
  });

  it("returns safe defaults for edge cases", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ buffer: fixtures.detailBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();
    await db.initDetailDatabase();

    expect(db.getPlayerDetail("missing")).toBeNull();
    expect(db.getGameBoxscore("missing")).toBeNull();
    expect(db.getTeamDetail("missing", "046")).toBeNull();
    expect(Array.isArray(db.getPlayers("all", null, false, false))).toBe(true);
    expect(db.getPlayerShotChart("missing", "046")).toEqual([]);
    expect(db.hasGamePredictions("missing")).toBe(false);
    expect(db.getGameQuarterScores("missing")).toBeNull();
    const teamStats = db.getTeamSeasonStats("046");
    expect(typeof teamStats.get).toBe("function");
    expect(teamStats.has("kb")).toBe(true);
  });

  it("covers filtered query contracts and leader category branches", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ buffer: fixtures.detailBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();
    await db.initDetailDatabase();

    const kbPlayers = db.getPlayers("046", "kb", true, true);
    expect(kbPlayers.length).toBeGreaterThan(0);
    expect(kbPlayers.every((p) => p.team_id === "kb")).toBe(true);
    const roster = db.getTeamRoster("kb", "046");
    expect(roster.length).toBeGreaterThan(0);
    expect(roster[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        fgp: expect.any(Number),
      }),
    );

    const gamesByTeam = db.getGames("046", "kb", null, 20, 0, false);
    expect(
      gamesByTeam.every(
        (g) => g.home_team_id === "kb" || g.away_team_id === "kb",
      ),
    ).toBe(true);
    const regularGames = db.getGames("046", "kb", "REG", 20, 0, false);
    expect(Array.isArray(regularGames)).toBe(true);

    const upcomingByTeam = db.getUpcomingGames("046", "kb", 5);
    expect(
      upcomingByTeam.every(
        (g) => g.home_team_id === "kb" || g.away_team_id === "kb",
      ),
    ).toBe(true);
    const recentByTeam = db.getRecentGames("046", "kb", 5);
    expect(
      recentByTeam.every(
        (g) => g.home_team_id === "kb" || g.away_team_id === "kb",
      ),
    ).toBe(true);

    const margin = db.getPlayerCourtMargin("p1", "046");
    expect(typeof margin === "number" || margin === null).toBe(true);
    expect(db.getPlayersCourtMargin(["p1", "p2"], "046")).toEqual(
      expect.objectContaining({ p1: expect.any(Number) }),
    );

    expect(Array.isArray(db.getLeaders("046", "per", 5))).toBe(true);
    expect(Array.isArray(db.getLeaders("046", "ws", 5))).toBe(true);
    expect(Array.isArray(db.getLeaders("046", "plus_minus_per_game", 5))).toBe(
      true,
    );
    expect(Array.isArray(db.getLeaders("046", "plus_minus_per100", 5))).toBe(
      true,
    );

    expect(db.getTeamCategoryStats("046", "pts")).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "pts" })]),
    );
    expect(db.getHeadToHead("046", "kb", "samsung")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ team1_id: expect.any(String) }),
      ]),
    );
  });

  it("includes active no-game players and exercises cache/fallback failure paths", async () => {
    const augmentedCoreBuffer = await cloneBufferWithSql(
      fixtures.coreBuffer,
      "INSERT INTO players VALUES ('p99','신인유망주','G','169','2004-01-01',1,'kb');",
    );

    const cache = {
      loadFromCache: vi.fn(async () => {
        throw new Error("cache read broken");
      }),
      saveToCache: vi.fn(async () => {
        throw new Error("cache write broken");
      }),
    };

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({
          buffer: augmentedCoreBuffer,
          etag: '"core-v2"',
        });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ buffer: fixtures.detailBuffer });
      }
      return mockFetchResponse({ buffer: augmentedCoreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
    await db.initDatabase();

    const players = db.getPlayers("046", "kb", true, true);
    expect(players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "p99", gp: 0, pts: 0 }),
      ]),
    );
    expect(cache.loadFromCache).toHaveBeenCalled();
    expect(cache.saveToCache).toHaveBeenCalled();

    const failFetch = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ ok: false, status: 500 });
      }
      if (String(url).includes("wkbl.db")) {
        return mockFetchResponse({ ok: false, status: 500 });
      }
      return mockFetchResponse({ ok: false, status: 500 });
    });
    const brokenDb = await importDatabaseModule({ fetchImpl: failFetch });
    await expect(brokenDb.initDatabase()).rejects.toThrow();
  });
});
