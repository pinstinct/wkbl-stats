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
    const p1Detail = db.getPlayerDetail("p1");
    expect(p1Detail).toEqual(
      expect.objectContaining({ id: "p1", name: "김가드" }),
    );
    // p1 has lineup stint data → plus_minus from stints
    expect(p1Detail.seasons?.["046"]?.plus_minus_total).toBeDefined();
    // recent_games mapping (covers gamelog/team detection lines)
    expect(Array.isArray(p1Detail.recent_games)).toBe(true);
    if (p1Detail.recent_games.length > 0) {
      expect(p1Detail.recent_games[0]).toEqual(
        expect.objectContaining({
          game_id: "04601001",
          is_home: expect.any(Boolean),
          opponent: expect.any(String),
          result: expect.stringMatching(/^[WL-]$/),
        }),
      );
    }

    // p6 (samsung) has NO lineup stint in detail DB → falls back to else branch
    const p6Detail = db.getPlayerDetail("p6");
    expect(p6Detail).toEqual(
      expect.objectContaining({ id: "p6", name: "윤빅" }),
    );
    expect(p6Detail.seasons?.["046"]?.plus_minus_total).toBeDefined();
    expect(p6Detail.seasons?.["046"]?.plus_minus_per_game).toBeDefined();

    expect(db.getPlayerGamelog("p1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ game_id: "04601001" }),
      ]),
    );
    // gamelog with season filter — p1 is kb (home team in game)
    const filteredLog = db.getPlayerGamelog("p1", "046");
    expect(filteredLog.length).toBeGreaterThan(0);
    expect(filteredLog[0]).toEqual(
      expect.objectContaining({
        season_id: "046",
        is_home: true,
        opponent: "삼성생명",
        result: "W",
      }),
    );
    // p2 is samsung (away team in game) — covers isHome=false path
    const awayLog = db.getPlayerGamelog("p2", "046");
    expect(awayLog.length).toBeGreaterThan(0);
    expect(awayLog[0]).toEqual(
      expect.objectContaining({
        is_home: false,
        opponent: "KB스타즈",
        result: "L",
      }),
    );

    const compareRows = db.getPlayerComparison(["p1", "p2", "p6"], "046");
    expect(compareRows).toHaveLength(3);
    // p6 has no lineup data → else branch for plus_minus
    const p6Compare = compareRows.find((r) => r.id === "p6");
    expect(p6Compare.plus_minus_total).toBeDefined();
    expect(p6Compare.plus_minus_per_game).toBeDefined();
    expect(compareRows[0]).toEqual(
      expect.objectContaining({
        ows: expect.any(Number),
        dws: expect.any(Number),
        ws: expect.any(Number),
        ws_40: expect.any(Number),
      }),
    );
    const teamDetail = db.getTeamDetail("kb", "046");
    expect(teamDetail.id).toBe("kb");
    expect(Array.isArray(teamDetail.roster)).toBe(true);
    expect(Array.isArray(teamDetail.recent_games)).toBe(true);
    if (teamDetail.recent_games.length > 0) {
      expect(teamDetail.recent_games[0]).toEqual(
        expect.objectContaining({
          game_id: expect.any(String),
          is_home: true,
          opponent: expect.any(String),
          result: "W",
        }),
      );
    }
    // Test away team to cover isHome=false branch
    const samsungDetail = db.getTeamDetail("samsung", "046");
    expect(samsungDetail.id).toBe("samsung");
    if (samsungDetail.recent_games.length > 0) {
      expect(samsungDetail.recent_games[0]).toEqual(
        expect.objectContaining({
          is_home: false,
          opponent: expect.any(String),
          result: "L",
        }),
      );
    }
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

    const pregameOnly = db.getGamePredictions("04601001", {
      pregameOnly: true,
      asOfDate: "2025-11-01",
    });
    expect(pregameOnly.team).toBeTruthy();
    expect(pregameOnly.team.prediction_kind).toBe("pregame");
    expect(pregameOnly.team.home_win_prob).toBe(54);

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

  it("keeps PER/3PAr/FTr deterministic for shared fixture inputs", async () => {
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
    const row = {
      gp: 10,
      min: 30.0,
      pts: 18.0,
      reb: 5.0,
      ast: 4.0,
      stl: 2.0,
      blk: 1.0,
      tov: 3.0,
      avg_off_reb: 1.0,
      avg_def_reb: 4.0,
      avg_pf: 2.0,
      total_fgm: 70,
      total_fga: 140,
      total_tpm: 20,
      total_tpa: 50,
      total_ftm: 20,
      total_fta: 30,
    };
    const teamStats = {
      team_fga: 800,
      team_fta: 200,
      team_tov: 150,
      team_oreb: 120,
      team_dreb: 300,
      team_fgm: 350,
      team_ast: 200,
      team_pts: 900,
      team_min: 2000,
      team_pf: 180,
      team_ftm: 100,
      team_tpm: 80,
      team_tpa: 250,
      team_reb: 420,
      opp_fga: 780,
      opp_fta: 190,
      opp_ftm: 130,
      opp_tov: 140,
      opp_oreb: 110,
      opp_dreb: 280,
      opp_pts: 850,
      opp_tpa: 230,
      opp_tpm: 70,
      opp_fgm: 330,
      opp_reb: 390,
      team_wins: 18,
      team_losses: 12,
    };
    const leagueStats = {
      lg_pts: 5400,
      lg_fga: 4800,
      lg_fta: 1200,
      lg_ftm: 600,
      lg_oreb: 660,
      lg_reb: 2520,
      lg_ast: 1200,
      lg_fgm: 2100,
      lg_tov: 900,
      lg_pf: 1080,
      lg_min: 12000,
      lg_pace: 90.0,
      lg_poss: 5400,
    };

    const computed = db.__test.calculateAdvancedStats(
      row,
      teamStats,
      leagueStats,
    );
    expect(computed.tpar).toBe(0.357);
    expect(computed.ftr).toBe(0.214);
    expect(computed.per).toBe(15.2);
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

  it("falls back to legacy team predictions when pregame timestamp is unavailable", async () => {
    const legacyCoreBuffer = await cloneBufferWithSql(
      fixtures.coreBuffer,
      `
      DROP TABLE game_team_prediction_runs;
      ALTER TABLE game_team_predictions ADD COLUMN created_at TEXT;
      UPDATE game_team_predictions
      SET pregame_generated_at = NULL, created_at = '2025-11-07 08:00:00'
      WHERE game_id = '04601002';
      INSERT OR REPLACE INTO game_team_predictions
      (game_id, home_win_prob, away_win_prob, home_predicted_pts, away_predicted_pts, model_version, pregame_generated_at, created_at)
      VALUES ('04601001', 54.0, 46.0, 74.0, 70.0, 'v1', NULL, '2025-10-31 08:00:00');
      `,
    );

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: legacyCoreBuffer });
      }
      return mockFetchResponse({ buffer: legacyCoreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();

    const upcomingLegacy = db.getGamePredictions("04601002", {
      pregameOnly: true,
    });
    expect(upcomingLegacy.team).toBeTruthy();
    expect(upcomingLegacy.team.prediction_kind).toBe("legacy");
    expect(upcomingLegacy.team.home_win_prob).toBe(56);

    const recentLegacy = db.getGamePredictions("04601001", {
      pregameOnly: true,
      asOfDate: "20251101",
    });
    expect(recentLegacy.team).toBeTruthy();
    expect(recentLegacy.team.home_win_prob).toBe(54);
  });

  it("covers additional leader categories and SQL expression branches", async () => {
    // Add enough games (gp >= 10) for percentage category thresholds
    const gameInserts = [];
    for (let i = 2; i <= 10; i++) {
      const gid = `046010${String(i).padStart(2, "0")}`;
      gameInserts.push(
        `INSERT OR IGNORE INTO games VALUES ('${gid}','046','2025-11-${String(i).padStart(2, "0")}','regular','kb','samsung',70,68,18,18,16,18,0,17,16,18,17,0,'청주');`,
      );
      gameInserts.push(
        `INSERT INTO player_games VALUES ('${gid}','p1','kb',30,18,5,6,2,0,3,2,7,14,2,5,2,3,1,4);`,
      );
      gameInserts.push(
        `INSERT INTO player_games VALUES ('${gid}','p2','samsung',28,16,7,4,1,1,2,2,6,13,2,6,2,2,2,5);`,
      );
    }
    const augmentedBuffer = await cloneBufferWithSql(
      fixtures.coreBuffer,
      gameInserts.join("\n"),
    );

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: augmentedBuffer });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ buffer: fixtures.detailBuffer });
      }
      return mockFetchResponse({ buffer: augmentedBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();
    await db.initDetailDatabase();

    // Percentage categories (require minGames=10)
    for (const cat of ["fgp", "tpp", "ftp", "ts_pct", "tpar", "ftr"]) {
      const leaders = db.getLeaders("046", cat, 5);
      expect(Array.isArray(leaders)).toBe(true);
      if (leaders.length > 0) {
        expect(leaders[0]).toEqual(
          expect.objectContaining({ rank: 1, value: expect.any(Number) }),
        );
      }
    }

    // Other categories
    for (const cat of ["min", "game_score", "pir"]) {
      const leaders = db.getLeaders("046", cat, 5);
      expect(Array.isArray(leaders)).toBe(true);
      expect(leaders.length).toBeGreaterThan(0);
    }

    // Invalid category falls back to pts
    const fallback = db.getLeaders("046", "invalid_stat", 5);
    expect(Array.isArray(fallback)).toBe(true);
    expect(fallback.length).toBeGreaterThan(0);

    // PER leaders (requires gp >= 5, team/league context)
    const perLeaders = db.getLeaders("046", "per", 5);
    expect(Array.isArray(perLeaders)).toBe(true);

    // Plus/minus per game leaders (requires gp >= 5)
    const pmPerGame = db.getLeaders("046", "plus_minus_per_game", 5);
    expect(Array.isArray(pmPerGame)).toBe(true);

    // Plus/minus per 100 possessions leaders (requires gp >= 5, min*gp >= 100)
    const pmPer100 = db.getLeaders("046", "plus_minus_per100", 5);
    expect(Array.isArray(pmPer100)).toBe(true);

    // WS metric leaders (ws_40 uses 3 decimal digits)
    const ws40Leaders = db.getLeaders("046", "ws_40", 5);
    expect(Array.isArray(ws40Leaders)).toBe(true);
  });

  it("covers gamelog with season filter and player shot chart without season", async () => {
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

    // Gamelog with season filter (covers lines 1524-1527)
    const seasonLog = db.getPlayerGamelog("p1", "046");
    expect(seasonLog.length).toBeGreaterThan(0);
    expect(seasonLog[0]).toEqual(
      expect.objectContaining({ game_id: expect.any(String) }),
    );

    // Gamelog with non-existent season returns empty
    const emptyLog = db.getPlayerGamelog("p1", "999");
    expect(emptyLog).toEqual([]);

    // Player shot chart without season filter (covers lines 2955-2957)
    const allShots = db.getPlayerShotChart("p1");
    expect(allShots.length).toBeGreaterThan(0);
    expect(allShots[0]).toEqual(
      expect.objectContaining({ game_id: "04601001" }),
    );
  });

  it("covers boxscore team game stats mapping", async () => {
    // Add is_home and breakdown columns to team_games
    const augmentedBuffer = await cloneBufferWithSql(
      fixtures.coreBuffer,
      `ALTER TABLE team_games ADD COLUMN is_home INTEGER;
       ALTER TABLE team_games ADD COLUMN fast_break_pts REAL;
       ALTER TABLE team_games ADD COLUMN paint_pts REAL;
       ALTER TABLE team_games ADD COLUMN two_pts REAL;
       ALTER TABLE team_games ADD COLUMN three_pts REAL;
       UPDATE team_games SET is_home = 1, fast_break_pts = 8, paint_pts = 24, two_pts = 30, three_pts = 18 WHERE team_id = 'kb';
       UPDATE team_games SET is_home = 0, fast_break_pts = 6, paint_pts = 20, two_pts = 28, three_pts = 21 WHERE team_id = 'samsung';`,
    );

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: augmentedBuffer });
      }
      if (String(url).includes("wkbl-detail.db")) {
        return mockFetchResponse({ buffer: fixtures.detailBuffer });
      }
      return mockFetchResponse({ buffer: augmentedBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();
    await db.initDetailDatabase();

    const boxscore = db.getGameBoxscore("04601001");
    expect(boxscore.home_team_totals).toEqual({
      fast_break_pts: 8,
      paint_pts: 24,
      two_pts: 30,
      three_pts: 18,
    });
    expect(boxscore.away_team_totals).toEqual({
      fast_break_pts: 6,
      paint_pts: 20,
      two_pts: 28,
      three_pts: 21,
    });
  });

  it("covers game_team_prediction_runs fallback without game_team_predictions", async () => {
    // Remove game_team_predictions row but keep prediction_runs
    const augmentedBuffer = await cloneBufferWithSql(
      fixtures.coreBuffer,
      `DELETE FROM game_team_predictions WHERE game_id = '04601002';`,
    );

    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: augmentedBuffer });
      }
      return mockFetchResponse({ buffer: augmentedBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });
    await db.initDatabase();

    // Non-pregame path falls back to game_team_prediction_runs
    const preds = db.getGamePredictions("04601002");
    expect(preds.team).toBeTruthy();
    expect(preds.team.pregame_generated_at).toBe("2025-11-07 08:00:00");
  });

  it("covers estimatePossessions with bbr_standard strategy", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    // Test the bbr_standard strategy directly via __test
    const result = db.__test.estimatePossessions(60, 20, 12, 8, {
      strategy: "bbr_standard",
      fgm: 25,
      opp_fga: 58,
      opp_fta: 18,
      opp_tov: 11,
      opp_oreb: 9,
      opp_fgm: 24,
      opp_dreb: 28,
      team_dreb: 30,
    });
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
  });

  it("covers computePlusMinusPer100 and fallback variants", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    // computePlusMinusPer100 with valid data
    const teamStatsMap = new Map([
      [
        "kb",
        {
          team_fga: 800,
          team_fta: 200,
          team_tov: 150,
          team_oreb: 120,
          team_min: 2000,
        },
      ],
    ]);
    const pmAgg = {
      total_pm: 15,
      segments: [{ team_id: "kb", on_court_seconds: 6000 }],
    };
    const result = db.__test.computePlusMinusPer100(pmAgg, teamStatsMap);
    expect(typeof result).toBe("number");

    // null when pmAgg is null
    expect(db.__test.computePlusMinusPer100(null, teamStatsMap)).toBeNull();

    // null when segments empty
    expect(
      db.__test.computePlusMinusPer100(
        { total_pm: 5, segments: [] },
        teamStatsMap,
      ),
    ).toBeNull();

    // null when team not in map
    expect(
      db.__test.computePlusMinusPer100(
        {
          total_pm: 5,
          segments: [{ team_id: "missing", on_court_seconds: 100 }],
        },
        teamStatsMap,
      ),
    ).toBeNull();

    // computeFallbackPlusMinusPer100 with valid data
    const fallback = db.__test.computeFallbackPlusMinusPer100(
      10,
      "kb",
      300,
      teamStatsMap,
    );
    expect(typeof fallback).toBe("number");

    // null when team not in map
    expect(
      db.__test.computeFallbackPlusMinusPer100(
        10,
        "missing",
        300,
        teamStatsMap,
      ),
    ).toBeNull();

    // null when playerTotalMinutes is 0
    expect(
      db.__test.computeFallbackPlusMinusPer100(10, "kb", 0, teamStatsMap),
    ).toBeNull();
  });

  it("covers computePlayerOffRtg and computePlayerDefRtg edge cases", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    const totals = {
      pts: 180,
      ast: 50,
      tov: 20,
      fgm: 70,
      fga: 140,
      tpm: 20,
      ftm: 20,
      fta: 30,
      oreb: 15,
    };
    const ts = {
      team_fga: 800,
      team_fta: 200,
      team_tov: 150,
      team_oreb: 120,
      team_dreb: 300,
      team_fgm: 350,
      team_ast: 200,
      team_pts: 900,
      team_min: 2000,
      team_pf: 180,
      team_ftm: 100,
      team_tpm: 80,
      team_tpa: 250,
      team_reb: 420,
      opp_fga: 780,
      opp_fta: 190,
      opp_ftm: 130,
      opp_tov: 140,
      opp_oreb: 110,
      opp_dreb: 280,
      opp_pts: 850,
      opp_tpa: 230,
      opp_tpm: 70,
      opp_fgm: 330,
      opp_reb: 390,
    };
    const defTotals = { stl: 15, blk: 5, dreb: 40, pf: 20 };

    // computePlayerOffRtg returns { offRtg, pprod, totPoss }
    const offResult = db.__test.computePlayerOffRtg({ totals, ts });
    expect(offResult.offRtg).toBeGreaterThan(0);
    expect(offResult.pprod).toBeGreaterThan(0);

    // computePlayerDefRtg returns a number
    const defRtg = db.__test.computePlayerDefRtg({
      totals: defTotals,
      ts,
      totalMin: 300,
    });
    expect(typeof defRtg).toBe("number");
    expect(defRtg).toBeGreaterThan(0);

    // Edge case: totPoss <= 0 returns null
    const zeroTotals = {
      pts: 0,
      ast: 0,
      tov: 0,
      fgm: 0,
      fga: 0,
      tpm: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
    };
    const zeroResult = db.__test.computePlayerOffRtg({
      totals: zeroTotals,
      ts,
    });
    expect(zeroResult).toBeNull();

    // Edge case: pprod <= 0 but totPoss > 0 (turnovers only)
    const tovOnlyTotals = {
      pts: 0,
      ast: 0,
      tov: 5,
      fgm: 0,
      fga: 0,
      tpm: 0,
      ftm: 0,
      fta: 0,
      oreb: 0,
    };
    const tovResult = db.__test.computePlayerOffRtg({
      totals: tovOnlyTotals,
      ts,
    });
    expect(tovResult).not.toBeNull();
    expect(tovResult.pprod).toBe(0);
    expect(tovResult.offRtg).toBe(0);
    expect(tovResult.totPoss).toBeGreaterThan(0);

    // Edge case: zero totalMin returns teamDrtg fallback
    const defFallback = db.__test.computePlayerDefRtg({
      totals: defTotals,
      ts,
      totalMin: 0,
    });
    expect(typeof defFallback).toBe("number");

    // Edge case: oppPoss <= 0 in computePlayerDefRtg returns null
    const zeroTs = { ...ts, opp_fga: 0, opp_fta: 0, opp_tov: 0, opp_oreb: 0 };
    const defNull = db.__test.computePlayerDefRtg({
      totals: defTotals,
      ts: zeroTs,
      totalMin: 300,
    });
    expect(defNull).toBeNull();
  });

  it("covers computePER and calculateAdvancedStats directly", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    // computePER with valid league stats
    const player = {
      pts: 15,
      ast: 3,
      stl: 1.5,
      blk: 0.3,
      tov: 2.1,
      total_fgm: 60,
      total_fga: 130,
      total_tpm: 15,
      total_ftm: 25,
      total_fta: 30,
      total_off_reb: 10,
      total_def_reb: 40,
      total_pf: 20,
      min: 28,
      gp: 10,
    };
    const ts = {
      team_fga: 800,
      team_fta: 200,
      team_tov: 150,
      team_oreb: 120,
      team_dreb: 300,
      team_fgm: 350,
      team_ast: 200,
      team_pts: 900,
      team_min: 2000,
      team_pf: 180,
      team_ftm: 100,
      team_tpm: 80,
      team_reb: 420,
      opp_fga: 780,
      opp_fta: 190,
      opp_ftm: 130,
      opp_tov: 140,
      opp_oreb: 100,
      opp_dreb: 280,
      opp_pts: 870,
    };
    const lg = {
      lg_min: 10000,
      lg_pts: 4000,
      lg_fgm: 1500,
      lg_fga: 3500,
      lg_ftm: 500,
      lg_fta: 650,
      lg_oreb: 400,
      lg_dreb: 1200,
      lg_reb: 1600,
      lg_ast: 800,
      lg_tov: 600,
      lg_pf: 700,
      lg_stl: 300,
      lg_blk: 150,
      lg_poss: 4000,
    };

    const per = db.__test.computePER(player, 10, 28, ts, lg);
    expect(typeof per).toBe("number");
    expect(per).not.toBe(0);

    // computePER with zero totalMin returns 0
    expect(db.__test.computePER(player, 0, 0, ts, lg)).toBe(0);

    // computePER with empty league stats (triggers || fallbacks)
    const emptyLg = {};
    const perEmpty = db.__test.computePER(player, 10, 28, ts, emptyLg);
    expect(typeof perEmpty).toBe("number");

    // computePER with null/zero ast, stl, blk, tov (triggers || 0 fallbacks)
    const sparsePlayer = {
      pts: 10,
      total_fgm: 40,
      total_fga: 100,
      total_tpm: 5,
      total_ftm: 10,
      total_fta: 15,
      min: 20,
      gp: 5,
    };
    const perSparse = db.__test.computePER(sparsePlayer, 5, 20, ts, lg);
    expect(typeof perSparse).toBe("number");

    // calculateAdvancedStats with both team and league stats
    const d = {
      ...player,
      id: "p1",
      team_id: "kb",
    };
    db.__test.calculateAdvancedStats(d, ts, lg);
    expect(d.ts_pct).toBeDefined();
    expect(d.per).toBeDefined();
    expect(typeof d.per).toBe("number");

    // calculateAdvancedStats without league stats (no PER computed)
    const d2 = { ...player, id: "p2", team_id: "kb" };
    db.__test.calculateAdvancedStats(d2, ts, null);
    expect(d2.ts_pct).toBeDefined();
    expect(d2.per).toBeUndefined();

    // calculateAdvancedStats without team stats (no USG%, ORtg, etc.)
    const d3 = { ...player, id: "p3", team_id: "kb" };
    db.__test.calculateAdvancedStats(d3, null, null);
    expect(d3.ts_pct).toBeDefined();

    // calculateAdvancedStats with zero/null shooting totals (triggers || 0 fallbacks)
    const d4 = {
      id: "p4",
      team_id: "kb",
      pts: 0,
      gp: 1,
      min: 10,
      total_fgm: null,
      total_fga: null,
      total_tpm: null,
      total_ftm: null,
      total_fta: null,
    };
    db.__test.calculateAdvancedStats(d4, ts, lg);
    expect(d4.ts_pct).toBe(0);
    expect(d4.efg_pct).toBe(0);
  });

  it("covers computeWinShares with valid inputs", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    const ws = db.__test.computeWinShares({
      pprod: 150,
      totPoss: 200,
      defRtg: 95,
      totalMin: 280,
      teamPoss: 4500,
      oppPoss: 4400,
      ts: {
        team_pts: 900,
        team_fga: 800,
        team_fta: 200,
        team_ftm: 100,
        team_min: 2000,
        opp_pts: 870,
      },
      lg: {
        lg_pts: 4000,
        lg_poss: 4000,
        lg_pace: 72,
        lg_min: 10000,
      },
    });
    expect(ws).toBeDefined();
    expect(typeof ws.ows).toBe("number");
    expect(typeof ws.dws).toBe("number");
    expect(typeof ws.ws).toBe("number");

    // computeWinShares returns null when league stats are zero
    expect(
      db.__test.computeWinShares({
        pprod: 150,
        totPoss: 200,
        defRtg: 95,
        totalMin: 280,
        teamPoss: 4500,
        oppPoss: 4400,
        ts: { team_min: 2000 },
        lg: { lg_pts: 0, lg_poss: 0, lg_pace: 0, lg_min: 0 },
      }),
    ).toBeNull();

    // computeWinShares returns null when totalMin <= 0
    expect(
      db.__test.computeWinShares({
        pprod: 150,
        totPoss: 200,
        defRtg: 95,
        totalMin: 0,
        teamPoss: 4500,
        oppPoss: 4400,
        ts: { team_min: 2000 },
        lg: { lg_pts: 4000, lg_poss: 4000, lg_pace: 72, lg_min: 10000 },
      }),
    ).toBeNull();
  });

  it("covers normalizeDateKey and isOnOrBefore edge cases", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("wkbl-core.db")) {
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      }
      return mockFetchResponse({ buffer: fixtures.coreBuffer });
    });

    const db = await importDatabaseModule({ fetchImpl: fetchMock });

    // normalizeDateKey: YYYYMMDD format
    expect(db.__test.normalizeDateKey("20251101")).toBe("2025-11-01");
    // normalizeDateKey: YYYY-MM-DD format
    expect(db.__test.normalizeDateKey("2025-11-01")).toBe("2025-11-01");
    // normalizeDateKey: null
    expect(db.__test.normalizeDateKey(null)).toBeNull();
    // normalizeDateKey: empty string
    expect(db.__test.normalizeDateKey("")).toBeNull();
    // normalizeDateKey: non-matching format fallback
    expect(db.__test.normalizeDateKey("Nov 1 2025")).toBe("Nov 1 2025");

    // isOnOrBefore: valid dates
    expect(db.__test.isOnOrBefore("2025-11-01", "2025-11-02")).toBe(true);
    expect(db.__test.isOnOrBefore("2025-11-02", "2025-11-01")).toBe(false);
    // isOnOrBefore: null rightDate returns true
    expect(db.__test.isOnOrBefore("2025-11-01", null)).toBe(true);
    // isOnOrBefore: null leftDate returns false
    expect(db.__test.isOnOrBefore(null, "2025-11-01")).toBe(false);
  });

  describe("refreshDatabase", () => {
    it("returns false when no cache is available", async () => {
      const fetchMock = vi.fn(async (url) => {
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({ buffer: fixtures.coreBuffer });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      // No cache provided — IDBCache will be undefined in the vm context
      const db = await importDatabaseModule({ fetchImpl: fetchMock });
      await db.initDatabase();
      expect(await db.refreshDatabase()).toBe(false);
    });

    it("returns false when ETag has not changed", async () => {
      const cache = {
        loadFromCache: vi.fn(async () => ({
          buffer: fixtures.coreBuffer,
          etag: '"same-etag"',
        })),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      const fetchMock = vi.fn(async (url, options = {}) => {
        if (options.method === "HEAD") {
          return mockFetchResponse({ etag: '"same-etag"' });
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"same-etag"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await new Promise((r) => setTimeout(r, 0));

      const updated = await db.refreshDatabase();
      expect(updated).toBe(false);
      // HEAD request was made to check
      expect(
        fetchMock.mock.calls.some(([, opts]) => opts && opts.method === "HEAD"),
      ).toBe(true);
      // No new data was fetched for refresh
      expect(cache.saveToCache).not.toHaveBeenCalledWith(
        "wkbl-core",
        expect.any(ArrayBuffer),
        expect.stringContaining("new"),
      );
    });

    it("returns false when cached core entry has no etag", async () => {
      const cache = {
        loadFromCache: vi.fn(async () => ({
          buffer: fixtures.coreBuffer,
          etag: null,
        })),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      const fetchMock = vi.fn(async (url) => {
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"v1"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await new Promise((r) => setTimeout(r, 0));

      expect(await db.refreshDatabase()).toBe(false);
      expect(
        fetchMock.mock.calls.some(([, opts]) => opts && opts.method === "HEAD"),
      ).toBe(false);
    });

    it("refreshes core DB when server ETag differs", async () => {
      const cache = {
        loadFromCache: vi
          .fn()
          .mockResolvedValue({ buffer: fixtures.coreBuffer, etag: '"old-v1"' }),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      let headCallCount = 0;
      const fetchMock = vi.fn(async (url, options = {}) => {
        if (options.method === "HEAD") {
          headCallCount++;
          // During init background check, return old; during refresh, return new
          return mockFetchResponse({
            etag: headCallCount <= 1 ? '"old-v1"' : '"new-v2"',
          });
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"new-v2"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await new Promise((r) => setTimeout(r, 0));

      const updated = await db.refreshDatabase();
      expect(updated).toBe(true);
      // Verify cache was updated with new etag
      expect(cache.saveToCache).toHaveBeenCalledWith(
        "wkbl-core",
        expect.any(ArrayBuffer),
        '"new-v2"',
      );
      // DB should still work after refresh
      expect(db.isReady()).toBe(true);
      expect(db.getSeasons()).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "046" })]),
      );
    });

    it("refreshes detail DB when loaded and ETag differs", async () => {
      const cache = {
        loadFromCache: vi.fn(async (key) => {
          if (key === "wkbl-core") {
            return { buffer: fixtures.coreBuffer, etag: '"core-v1"' };
          }
          if (key === "wkbl-detail") {
            return { buffer: fixtures.detailBuffer, etag: '"detail-old"' };
          }
          return null;
        }),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      let headCount = 0;
      const fetchMock = vi.fn(async (url, options = {}) => {
        if (options.method === "HEAD") {
          headCount++;
          // Background checks during init return same etag
          if (headCount <= 2) {
            if (String(url).includes("detail")) {
              return mockFetchResponse({ etag: '"detail-old"' });
            }
            return mockFetchResponse({ etag: '"core-v1"' });
          }
          // During refreshDatabase, core unchanged but detail changed
          if (String(url).includes("detail")) {
            return mockFetchResponse({ etag: '"detail-new"' });
          }
          return mockFetchResponse({ etag: '"core-v1"' });
        }
        if (String(url).includes("wkbl-detail.db")) {
          return mockFetchResponse({
            buffer: fixtures.detailBuffer,
            etag: '"detail-new"',
          });
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"core-v1"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await db.initDetailDatabase();
      await new Promise((r) => setTimeout(r, 0));

      const updated = await db.refreshDatabase();
      expect(updated).toBe(true);
      expect(cache.saveToCache).toHaveBeenCalledWith(
        "wkbl-detail",
        expect.any(ArrayBuffer),
        '"detail-new"',
      );
    });

    it("keeps detail DB unchanged when detail cache has no etag", async () => {
      const cache = {
        loadFromCache: vi.fn(async (key) => {
          if (key === "wkbl-core") {
            return { buffer: fixtures.coreBuffer, etag: '"core-v1"' };
          }
          if (key === "wkbl-detail") {
            return { buffer: fixtures.detailBuffer, etag: null };
          }
          return null;
        }),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      const fetchMock = vi.fn(async (url, options = {}) => {
        if (options.method === "HEAD") {
          return mockFetchResponse({ etag: '"core-v1"' });
        }
        if (String(url).includes("wkbl-detail.db")) {
          return mockFetchResponse({
            buffer: fixtures.detailBuffer,
            etag: '"detail-v1"',
          });
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"core-v1"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await db.initDetailDatabase();
      await new Promise((r) => setTimeout(r, 0));

      expect(await db.refreshDatabase()).toBe(false);
      expect(cache.saveToCache).not.toHaveBeenCalledWith(
        "wkbl-detail",
        expect.any(ArrayBuffer),
        expect.any(String),
      );
    });

    it("handles fetch errors silently during refresh", async () => {
      const cache = {
        loadFromCache: vi
          .fn()
          .mockResolvedValue({ buffer: fixtures.coreBuffer, etag: '"v1"' }),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      let isRefreshPhase = false;
      const fetchMock = vi.fn(async (url, options = {}) => {
        if (isRefreshPhase && options.method === "HEAD") {
          throw new Error("network down");
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"v1"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      await new Promise((r) => setTimeout(r, 0));

      isRefreshPhase = true;
      // Should not throw, just return false
      const updated = await db.refreshDatabase();
      expect(updated).toBe(false);
      expect(db.isReady()).toBe(true);
    });

    it("skips detail DB refresh when detail DB is not loaded", async () => {
      const cache = {
        loadFromCache: vi
          .fn()
          .mockResolvedValue({ buffer: fixtures.coreBuffer, etag: '"v1"' }),
        saveToCache: vi.fn().mockResolvedValue(undefined),
      };

      const fetchMock = vi.fn(async (url, options = {}) => {
        if (options.method === "HEAD") {
          return mockFetchResponse({ etag: '"v1"' });
        }
        if (String(url).includes("wkbl-core.db")) {
          return mockFetchResponse({
            buffer: fixtures.coreBuffer,
            etag: '"v1"',
          });
        }
        return mockFetchResponse({ buffer: fixtures.coreBuffer });
      });

      const db = await importDatabaseModule({ fetchImpl: fetchMock, cache });
      await db.initDatabase();
      // Don't init detail DB
      await new Promise((r) => setTimeout(r, 0));

      await db.refreshDatabase();

      // Only core-related cache loads, no detail
      const detailLoadCalls = cache.loadFromCache.mock.calls.filter(
        ([key]) => key === "wkbl-detail",
      );
      expect(detailLoadCalls).toHaveLength(0);
    });
  });
});
