/** @vitest-environment jsdom */
import fs from "node:fs";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const APP_PATH = `${process.cwd()}/src/app.js`;

const ROUTE_VIEWS = [
  "home",
  "players",
  "player",
  "teams",
  "team",
  "games",
  "game",
  "leaders",
  "compare",
  "schedule",
  "predict",
];

function parseRoute(hash) {
  const raw = String(hash || "").replace(/^#\/?/, "");
  if (!raw) return { path: "home", id: null };
  const [path, id] = raw.split("/");
  return { path, id: id || null };
}

function createFixtures() {
  const players = [
    {
      id: "p1",
      name: "김가드",
      team: "KB스타즈",
      team_id: "kb",
      position: "G",
      pos: "G",
      gp: 20,
      min: 31.2,
      pts: 18.3,
      reb: 4.8,
      ast: 6.1,
      stl: 1.4,
      blk: 0.3,
      tov: 2.2,
      fgp: 0.46,
      tpp: 0.35,
      ftp: 0.84,
      ts_pct: 0.57,
      efg_pct: 0.52,
      pir: 19.5,
      per: 20.1,
      game_score: 18.2,
      plus_minus_per_game: 3.1,
      plus_minus_per100: 5.8,
    },
    {
      id: "p2",
      name: "박포워드",
      team: "삼성생명",
      team_id: "samsung",
      position: "F",
      pos: "F",
      gp: 20,
      min: 30.1,
      pts: 17.1,
      reb: 7.2,
      ast: 3.4,
      stl: 1.0,
      blk: 0.9,
      tov: 1.9,
      fgp: 0.44,
      tpp: 0.32,
      ftp: 0.8,
      ts_pct: 0.55,
      efg_pct: 0.5,
      pir: 18.2,
      per: 18.8,
      game_score: 16.7,
      plus_minus_per_game: -0.8,
      plus_minus_per100: -1.5,
    },
    {
      id: "p3",
      name: "이센터",
      team: "KB스타즈",
      team_id: "kb",
      position: "C",
      pos: "C",
      gp: 19,
      min: 27.8,
      pts: 13.4,
      reb: 8.2,
      ast: 2.1,
      stl: 0.8,
      blk: 1.3,
      tov: 1.7,
      fgp: 0.51,
      tpp: 0.2,
      ftp: 0.73,
      ts_pct: 0.59,
      efg_pct: 0.54,
      pir: 16.2,
      per: 17.3,
      game_score: 14.8,
      plus_minus_per_game: 1.4,
      plus_minus_per100: 2.2,
    },
    {
      id: "p4",
      name: "최슈터",
      team: "KB스타즈",
      team_id: "kb",
      position: "F",
      pos: "F",
      gp: 20,
      min: 26.3,
      pts: 11.5,
      reb: 4.1,
      ast: 2.5,
      stl: 0.9,
      blk: 0.3,
      tov: 1.3,
      fgp: 0.43,
      tpp: 0.37,
      ftp: 0.82,
      ts_pct: 0.56,
      efg_pct: 0.53,
      pir: 12.8,
      per: 14.9,
      game_score: 11.6,
      plus_minus_per_game: 0.8,
      plus_minus_per100: 1.6,
    },
    {
      id: "p5",
      name: "정가드",
      team: "삼성생명",
      team_id: "samsung",
      position: "G",
      pos: "G",
      gp: 20,
      min: 28.7,
      pts: 12.8,
      reb: 3.9,
      ast: 4.7,
      stl: 1.1,
      blk: 0.2,
      tov: 2.0,
      fgp: 0.42,
      tpp: 0.33,
      ftp: 0.79,
      ts_pct: 0.53,
      efg_pct: 0.48,
      pir: 13.9,
      per: 15.3,
      game_score: 12.2,
      plus_minus_per_game: -0.4,
      plus_minus_per100: -0.9,
    },
    {
      id: "p6",
      name: "오윙",
      team: "삼성생명",
      team_id: "samsung",
      position: "F",
      pos: "F",
      gp: 18,
      min: 24.1,
      pts: 9.3,
      reb: 5.2,
      ast: 2.3,
      stl: 0.7,
      blk: 0.6,
      tov: 1.5,
      fgp: 0.41,
      tpp: 0.31,
      ftp: 0.75,
      ts_pct: 0.51,
      efg_pct: 0.47,
      pir: 11.1,
      per: 12.7,
      game_score: 10.3,
      plus_minus_per_game: -1.1,
      plus_minus_per100: -2.1,
    },
  ];

  const seasons = {
    "045": {
      season_id: "045",
      season_label: "2024-25",
      gp: 28,
      min: 29,
      pts: 15.1,
      reb: 4.4,
      ast: 5.3,
      stl: 1.2,
      blk: 0.2,
      fga: 11.8,
      fgm: 5.2,
      tpa: 4.2,
      tpm: 1.3,
      fta: 3.6,
      ftm: 3.0,
      ts_pct: 0.54,
      efg_pct: 0.49,
      per: 17.2,
      pir: 16.3,
    },
    "046": {
      season_id: "046",
      season_label: "2025-26",
      gp: 20,
      min: 31.2,
      pts: 18.3,
      reb: 4.8,
      ast: 6.1,
      stl: 1.4,
      blk: 0.3,
      fga: 13.4,
      fgm: 6.1,
      tpa: 4.8,
      tpm: 1.7,
      fta: 4.2,
      ftm: 3.5,
      ts_pct: 0.57,
      efg_pct: 0.52,
      per: 20.1,
      pir: 19.5,
      plus_minus_per_game: 3.1,
      plus_minus_per100: 5.8,
      ws: 4.2,
    },
  };

  const gamelog = [
    {
      game_id: "04601001",
      game_date: "2025-11-01",
      minutes: 33,
      pts: 20,
      reb: 5,
      ast: 7,
      stl: 2,
      blk: 0,
      fga: 15,
      fgm: 8,
      tpa: 5,
      tpm: 2,
      fta: 4,
      ftm: 2,
      off_reb: 1,
      def_reb: 4,
      pf: 2,
      tov: 2,
    },
    {
      game_id: "04600999",
      game_date: "2025-10-28",
      minutes: 31,
      pts: 18,
      reb: 4,
      ast: 6,
      stl: 1,
      blk: 1,
      fga: 14,
      fgm: 7,
      tpa: 4,
      tpm: 1,
      fta: 5,
      ftm: 3,
      off_reb: 0,
      def_reb: 4,
      pf: 1,
      tov: 2,
    },
    {
      game_id: "04600998",
      game_date: "2025-10-25",
      minutes: 29,
      pts: 16,
      reb: 5,
      ast: 5,
      stl: 1,
      blk: 0,
      fga: 13,
      fgm: 6,
      tpa: 4,
      tpm: 1,
      fta: 3,
      ftm: 3,
      off_reb: 1,
      def_reb: 4,
      pf: 2,
      tov: 3,
    },
    {
      game_id: "04600997",
      game_date: "2025-10-20",
      minutes: 34,
      pts: 22,
      reb: 6,
      ast: 6,
      stl: 2,
      blk: 1,
      fga: 17,
      fgm: 9,
      tpa: 6,
      tpm: 2,
      fta: 4,
      ftm: 2,
      off_reb: 1,
      def_reb: 5,
      pf: 2,
      tov: 2,
    },
    {
      game_id: "04600996",
      game_date: "2025-10-16",
      minutes: 30,
      pts: 17,
      reb: 4,
      ast: 6,
      stl: 1,
      blk: 0,
      fga: 12,
      fgm: 6,
      tpa: 3,
      tpm: 1,
      fta: 5,
      ftm: 4,
      off_reb: 0,
      def_reb: 4,
      pf: 1,
      tov: 1,
    },
  ];

  const game = {
    id: "04601001",
    game_id: "04601001",
    game_date: "2025-11-01",
    away_team_id: "samsung",
    home_team_id: "kb",
    away_team_name: "삼성생명",
    home_team_name: "KB스타즈",
    away_score: 68,
    home_score: 72,
    away_team_stats: [
      {
        player_id: "p2",
        player_name: "박포워드",
        min: 33,
        pts: 19,
        reb: 7,
        ast: 3,
        stl: 1,
        blk: 1,
        tov: 2,
        fgm: 7,
        fga: 15,
        ftm: 3,
        fta: 4,
        tpm: 2,
        tpa: 5,
      },
      {
        player_id: "p5",
        player_name: "정가드",
        min: 29,
        pts: 13,
        reb: 4,
        ast: 5,
        stl: 1,
        blk: 0,
        tov: 2,
        fgm: 5,
        fga: 12,
        ftm: 2,
        fta: 3,
        tpm: 1,
        tpa: 4,
      },
    ],
    home_team_stats: [
      {
        player_id: "p1",
        player_name: "김가드",
        min: 34,
        pts: 20,
        reb: 5,
        ast: 7,
        stl: 2,
        blk: 0,
        tov: 2,
        fgm: 8,
        fga: 15,
        ftm: 2,
        fta: 4,
        tpm: 2,
        tpa: 5,
      },
      {
        player_id: "p3",
        player_name: "이센터",
        min: 30,
        pts: 15,
        reb: 9,
        ast: 2,
        stl: 1,
        blk: 2,
        tov: 1,
        fgm: 6,
        fga: 10,
        ftm: 3,
        fta: 5,
        tpm: 0,
        tpa: 1,
      },
    ],
  };

  const gameShots = [
    {
      game_id: "04601001",
      player_id: "p1",
      team_id: "kb",
      x: 120,
      y: 80,
      made: true,
      result: 1,
      quarter: 1,
      zone: "paint",
    },
    {
      game_id: "04601001",
      player_id: "p2",
      team_id: "samsung",
      x: 180,
      y: 120,
      made: false,
      result: 0,
      quarter: 2,
      zone: "three",
    },
  ];

  const standings = [
    {
      team_id: "kb",
      rank: 1,
      wins: 10,
      losses: 2,
      win_pct: 0.833,
      last5: "4-1",
      home_wins: 6,
      home_losses: 1,
      away_wins: 4,
      away_losses: 1,
    },
    {
      team_id: "samsung",
      rank: 2,
      wins: 8,
      losses: 4,
      win_pct: 0.667,
      last5: "3-2",
      home_wins: 5,
      home_losses: 2,
      away_wins: 3,
      away_losses: 2,
    },
  ];

  const teamStatsMap = new Map([
    [
      "kb",
      {
        team_pts: 72,
        team_reb: 36,
        team_ast: 18,
        team_stl: 8,
        team_blk: 3,
        team_fga: 65,
        team_fta: 18,
        team_tov: 12,
        team_oreb: 8,
        opp_pts: 66,
        opp_reb: 34,
        opp_ast: 16,
        opp_stl: 6,
        opp_blk: 2,
        opp_fga: 63,
        opp_fta: 15,
        opp_tov: 13,
        opp_oreb: 7,
      },
    ],
    [
      "samsung",
      {
        team_pts: 68,
        team_reb: 34,
        team_ast: 17,
        team_stl: 7,
        team_blk: 2,
        team_fga: 62,
        team_fta: 16,
        team_tov: 11,
        team_oreb: 7,
        opp_pts: 70,
        opp_reb: 35,
        opp_ast: 18,
        opp_stl: 8,
        opp_blk: 3,
        opp_fga: 66,
        opp_fta: 19,
        opp_tov: 12,
        opp_oreb: 8,
      },
    ],
  ]);

  const predictionPlayers = [
    {
      player_id: "p1",
      team_id: "kb",
      predicted_pts: 18.5,
      predicted_pts_low: 15.2,
      predicted_pts_high: 21.3,
      predicted_reb: 4.9,
      predicted_reb_low: 3.2,
      predicted_reb_high: 6.1,
      predicted_ast: 6.3,
      predicted_ast_low: 4.8,
      predicted_ast_high: 7.8,
      predicted_stl: 1.2,
      predicted_stl_low: 0.6,
      predicted_stl_high: 1.7,
      predicted_blk: 0.3,
      predicted_blk_low: 0.0,
      predicted_blk_high: 0.8,
    },
    {
      player_id: "p2",
      team_id: "samsung",
      predicted_pts: 17.2,
      predicted_pts_low: 14.1,
      predicted_pts_high: 20.5,
      predicted_reb: 6.8,
      predicted_reb_low: 5.3,
      predicted_reb_high: 8.1,
      predicted_ast: 3.4,
      predicted_ast_low: 2.4,
      predicted_ast_high: 4.4,
      predicted_stl: 1.1,
      predicted_stl_low: 0.6,
      predicted_stl_high: 1.5,
      predicted_blk: 0.8,
      predicted_blk_low: 0.3,
      predicted_blk_high: 1.2,
    },
    {
      player_id: "p3",
      team_id: "kb",
      predicted_pts: 14.2,
      predicted_pts_low: 11.8,
      predicted_pts_high: 16.9,
      predicted_reb: 8.4,
      predicted_reb_low: 6.8,
      predicted_reb_high: 9.9,
      predicted_ast: 2.4,
      predicted_ast_low: 1.3,
      predicted_ast_high: 3.4,
      predicted_stl: 0.9,
      predicted_stl_low: 0.4,
      predicted_stl_high: 1.4,
      predicted_blk: 1.2,
      predicted_blk_low: 0.7,
      predicted_blk_high: 1.8,
    },
    {
      player_id: "p5",
      team_id: "samsung",
      predicted_pts: 12.7,
      predicted_pts_low: 10.4,
      predicted_pts_high: 15.1,
      predicted_reb: 4.1,
      predicted_reb_low: 3.1,
      predicted_reb_high: 5.0,
      predicted_ast: 4.8,
      predicted_ast_low: 3.3,
      predicted_ast_high: 6.2,
      predicted_stl: 1.0,
      predicted_stl_low: 0.4,
      predicted_stl_high: 1.6,
      predicted_blk: 0.2,
      predicted_blk_low: 0.0,
      predicted_blk_high: 0.6,
    },
  ];

  return {
    players,
    seasons,
    gamelog,
    game,
    gameShots,
    standings,
    teamStatsMap,
    predictionPlayers,
  };
}

function createWkblDb(fixtures) {
  return {
    initDatabase: vi.fn(async () => true),
    initDetailDatabase: vi.fn(async () => true),
    isDetailReady: vi.fn(() => true),
    getTeamRoster: vi.fn((teamId) =>
      fixtures.players
        .filter((p) => p.team_id === teamId)
        .map((p) => ({ ...p, gp: p.gp || 10 })),
    ),
    getNextGame: vi.fn(() => ({
      id: "04601002",
      game_date: "2026-03-20",
      home_team_id: "kb",
      away_team_id: "samsung",
      home_team_name: "KB스타즈",
      away_team_name: "삼성생명",
      home_team_short: "KB",
      away_team_short: "삼성",
    })),
    getRecentGames: vi.fn(() => [fixtures.game]),
    getStandings: vi.fn(() => fixtures.standings),
    getPlayerGamelog: vi.fn(() => fixtures.gamelog),
    getTeamSeasonStats: vi.fn(() => fixtures.teamStatsMap),
    getHeadToHead: vi.fn(() => [{ winner_id: "kb" }, { winner_id: "samsung" }]),
    getGamePredictions: vi.fn(() => ({
      players: fixtures.predictionPlayers,
      team: {
        home_win_prob: 56,
        away_win_prob: 44,
        home_predicted_pts: 71,
        away_predicted_pts: 67,
      },
    })),
    hasGamePredictions: vi.fn(() => true),
    getPlayersCourtMargin: vi.fn(() => ({
      p1: 3.3,
      p2: -1.2,
      p3: 1.8,
      p4: 0.5,
      p5: -0.9,
      p6: -1.6,
    })),
    getPlayerCourtMargin: vi.fn(() => 3.3),
    getUpcomingGames: vi.fn(() => [
      {
        id: "04601002",
        game_date: "2026-03-20",
        home_team_id: "kb",
        away_team_id: "samsung",
        home_team_name: "KB스타즈",
        away_team_name: "삼성생명",
      },
    ]),
  };
}

function createDeps(fixtures) {
  const dataClient = {
    getPlayers: vi.fn(async () => fixtures.players.map((p) => ({ ...p }))),
    getPlayerDetail: vi.fn(async (id) => {
      const player = fixtures.players.find((p) => p.id === id);
      if (!player) throw new Error("missing player");
      return {
        ...player,
        height: "175",
        birth_date: "1998-02-01",
        seasons: fixtures.seasons,
        recent_games: fixtures.gamelog,
      };
    }),
    getPlayerGamelog: vi.fn(async () =>
      fixtures.gamelog.map((g) => ({ ...g })),
    ),
    getPlayerShotChart: vi.fn(async () =>
      fixtures.gameShots.map((shot) => ({ ...shot })),
    ),
    getTeams: vi.fn(async () => ({
      teams: [
        { id: "kb", name: "KB스타즈", short_name: "KB" },
        { id: "samsung", name: "삼성생명", short_name: "삼성" },
      ],
    })),
    getStandings: vi.fn(async () => ({
      season: "046",
      standings: fixtures.standings.map((s) => ({ ...s })),
    })),
    getTeamDetail: vi.fn(async (teamId) => ({
      id: teamId,
      name: teamId === "kb" ? "KB스타즈" : "삼성생명",
      standings: fixtures.standings.find((s) => s.team_id === teamId),
      roster: fixtures.players
        .filter((p) => p.team_id === teamId)
        .map((p) => ({ id: p.id, name: p.name, gp: p.gp })),
      recent_games: [fixtures.game],
      team_stats: { off_rtg: 105.2, def_rtg: 99.1, net_rtg: 6.1, pace: 71.4 },
    })),
    getGames: vi.fn(async () => [fixtures.game]),
    getGameBoxscore: vi.fn(async () => ({ ...fixtures.game })),
    getGameShotChart: vi.fn(async () =>
      fixtures.gameShots.map((shot) => ({ ...shot })),
    ),
    getLeaders: vi.fn(async () => [
      { id: "p1", name: "김가드", value: 18.3, team: "KB스타즈" },
    ]),
    getLeadersAll: vi.fn(async () => ({
      pts: [{ id: "p1", name: "김가드", value: 18.3 }],
      reb: [{ id: "p2", name: "박포워드", value: 7.2 }],
      ast: [{ id: "p1", name: "김가드", value: 6.1 }],
    })),
    search: vi.fn(async (query) => ({
      players: fixtures.players
        .filter((p) => p.name.includes(query))
        .map((p) => ({ ...p })),
      teams: [{ id: "kb", name: "KB스타즈", short_name: "KB" }],
    })),
    getPlayerComparison: vi.fn(async (ids) =>
      fixtures.players.filter((p) => ids.includes(p.id)).map((p) => ({ ...p })),
    ),
  };

  const normalizeShot = (shot) => ({
    ...shot,
    made: Boolean(shot.made ?? shot.result === 1),
    quarter: shot.quarter || 1,
    zone: shot.zone || "paint",
  });

  const views = {
    buildThreePointGeometry: vi.fn(() => ({
      xLeft: 64,
      xRight: 227,
      yStart: 18,
      yJoin: 69,
      radius: 108,
      cx: 145.5,
      cy: 18,
      startAngle: Math.PI * 0.12,
      endAngle: Math.PI * 0.88,
    })),
    reconcileShotTeams: vi.fn((shots) => shots || []),
    buildPlayerSelectOptions: vi.fn((shots, teamId = "all") => {
      const filtered =
        teamId === "all"
          ? shots
          : shots.filter(
              (shot) => String(shot.teamId || shot.team_id) === teamId,
            );
      const ids = [
        ...new Set(filtered.map((shot) => shot.playerId || shot.player_id)),
      ];
      return [
        { value: "all", label: "전체" },
        ...ids.map((id) => ({ value: id, label: id })),
      ];
    }),
    getCourtArcRadii: vi.fn((_pxX, _pxY, unit) => ({ rx: unit, ry: unit })),
    getCourtOverlayGeometry: vi.fn(() => ({
      paint: { x1: 98, x2: 193, y1: 18, y2: 90 },
      key: { x1: 117, x2: 174, y1: 18, y2: 56 },
      freeThrow: { cx: 145.5, cy: 90, radius: 20 },
      backboard: { x1: 131, x2: 160, y: 25 },
      rim: { cx: 145.5, cy: 18, radius: 7 },
      restrictedArea: {
        cx: 145.5,
        cy: 18,
        radius: 22,
        startAngle: Math.PI * 0.12,
        endAngle: Math.PI * 0.88,
      },
    })),
    getCourtAspectRatio: vi.fn(() => 291 / 176),
    buildZoneTableRows: vi.fn((shots) => {
      if (!shots.length) return [];
      return [{ zone: "paint", made: 1, attempts: shots.length, fgPct: 100 }];
    }),
    getShotChartScaleBounds: vi.fn(() => ({
      xMin: 0,
      xMax: 291,
      yMin: 18,
      yMax: 176,
    })),
    buildShotChartExportName: vi.fn(() => "wkbl-shot-chart.png"),
    buildQuarterSelectOptions: vi.fn((shots) => {
      const quarters = [
        ...new Set((shots || []).map((shot) => shot.quarter || 1)),
      ];
      return [
        { value: "all", label: "전체" },
        ...quarters.map((q) => ({ value: String(q), label: `Q${q}` })),
      ];
    }),
    buildPlayerShotZoneOptions: vi.fn(() => [
      { value: "all", label: "전체" },
      { value: "paint", label: "페인트존" },
      { value: "three", label: "3점" },
    ]),
    buildPredictionCompareState: vi.fn(({ homeWin, teamPrediction }) => {
      if (!teamPrediction || teamPrediction.home_win_prob == null) {
        return {
          isAvailable: false,
          resultClass: "unavailable",
          badgeText: "사전 예측 없음",
          expectedScoreText: "사전 예측 없음",
        };
      }
      return {
        isAvailable: true,
        resultClass:
          homeWin === teamPrediction.home_win_prob > 50 ? "match" : "mismatch",
        badgeText:
          homeWin === teamPrediction.home_win_prob > 50 ? "적중" : "빗나감",
        expectedScoreText: `${teamPrediction.away_predicted_pts || "-"}-${teamPrediction.home_predicted_pts || "-"}`,
      };
    }),
    buildQuarterSeries: vi.fn((shots) => {
      const labels = ["Q1", "Q2", "Q3", "Q4"];
      const made = labels.map(
        (_, idx) =>
          shots.filter((s) => (s.quarter || 1) === idx + 1 && s.made).length,
      );
      const missed = labels.map(
        (_, idx) =>
          shots.filter((s) => (s.quarter || 1) === idx + 1 && !s.made).length,
      );
      return { labels, made, missed };
    }),
    buildStandingsChartSeries: vi.fn((standings) => {
      const sorted = [...standings].sort((a, b) => b.wins - a.wins);
      return {
        sorted,
        labels: sorted.map((s) => s.team_id),
        homeWins: sorted.map((s) => s.home_wins || 0),
        homeLosses: sorted.map((s) => s.home_losses || 0),
        awayWins: sorted.map((s) => s.away_wins || 0),
        awayLosses: sorted.map((s) => s.away_losses || 0),
      };
    }),
    buildZoneSeries: vi.fn((shots) => ({
      labels: ["Paint", "3PT"],
      attempts: [
        shots.filter((s) => (s.zone || "").includes("paint")).length,
        shots.filter((s) => (s.zone || "").includes("three")).length,
      ],
      fgPct: [55, 33],
    })),
    calculatePrediction: vi.fn(() => ({
      pts: { predicted: 18.2 },
      reb: { predicted: 5.1 },
      ast: { predicted: 6.0 },
      factors: [],
    })),
    filterGameShots: vi.fn((shots, filters) =>
      shots.filter((shot) => {
        if (
          filters.playerId !== "all" &&
          String(shot.playerId || shot.player_id) !== filters.playerId
        )
          return false;
        if (
          filters.teamId !== "all" &&
          String(shot.teamId || shot.team_id) !== filters.teamId
        )
          return false;
        if (filters.result === "made" && !shot.made) return false;
        if (filters.result === "missed" && shot.made) return false;
        if (
          filters.quarter !== "all" &&
          String(shot.quarter || 1) !== filters.quarter
        )
          return false;
        return true;
      }),
    ),
    filterPlayers: vi.fn((players, filters) =>
      players.filter((player) => {
        if (filters.team !== "all" && player.team !== filters.team)
          return false;
        if (
          filters.pos !== "all" &&
          (player.pos || player.position) !== filters.pos
        )
          return false;
        if (
          filters.search &&
          !player.name.toLowerCase().includes(filters.search)
        )
          return false;
        return true;
      }),
    ),
    getQuarterLabel: vi.fn((quarter) => `Q${quarter || 1}`),
    normalizeGameShots: vi.fn((shots, playerNameMap) =>
      (shots || []).map((shot) => ({
        ...normalizeShot(shot),
        playerId: shot.player_id,
        teamId: shot.team_id,
        playerName:
          playerNameMap[shot.player_id] || shot.player_name || "unknown",
      })),
    ),
    normalizePlayerShots: vi.fn((shots) => (shots || []).map(normalizeShot)),
    renderBoxscoreRows: vi.fn(({ game }) => {
      const rowHtml = (rows) =>
        (rows || [])
          .map(
            (player, idx) =>
              `<tr data-index="${idx}"><td>${player.player_name}</td><td>${player.pts}</td></tr>`,
          )
          .join("");
      return {
        awayRows: rowHtml(game.away_team_stats),
        homeRows: rowHtml(game.home_team_stats),
      };
    }),
    sortBoxscorePlayers: vi.fn((players, sort) => {
      const key = sort?.key || "pts";
      const dir = sort?.dir === "asc" ? 1 : -1;
      return [...players].sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * dir);
    }),
    renderCareerSummary: vi.fn(({ summaryEl, seasons }) => {
      summaryEl.textContent = `시즌 ${seasons.length}개`;
    }),
    renderCompareCards: vi.fn(({ container, players }) => {
      container.innerHTML = players
        .map((p) => `<article>${p.name}</article>`)
        .join("");
    }),
    renderCompareSelected: vi.fn(({ container, selectedPlayers }) => {
      container.innerHTML = selectedPlayers
        .map((p) => `<span data-id="${p.id}">${p.name}</span>`)
        .join("");
    }),
    renderCompareSuggestions: vi.fn(({ container, players, error }) => {
      if (error) {
        container.innerHTML = "<div>검색 실패</div>";
        return;
      }
      container.innerHTML = players
        .map((p) => `<button data-id="${p.id}">${p.name}</button>`)
        .join("");
    }),
    renderGamesList: vi.fn(({ container, games }) => {
      container.innerHTML = games.map((g) => `<div>${g.id}</div>`).join("");
    }),
    renderLeadersGrid: vi.fn(({ grid, categories }) => {
      grid.innerHTML = Object.keys(categories)
        .map((k) => `<section>${k}</section>`)
        .join("");
    }),
    renderLineupPlayers: vi.fn(({ container, lineup }) => {
      container.innerHTML = lineup.map((p) => `<div>${p.name}</div>`).join("");
    }),
    renderNextGameHighlight: vi.fn(({ nextGameCard, next }) => {
      nextGameCard.innerHTML = next
        ? `<strong>${next.id}</strong>`
        : "<strong>-</strong>";
    }),
    renderPlayerAdvancedStats: vi.fn(({ container, season }) => {
      container.innerHTML = `<div>${season.season_id}</div>`;
    }),
    renderPlayerGameLogTable: vi.fn(({ tbody, games }) => {
      tbody.innerHTML = games
        .map((g) => `<tr><td>${g.game_id}</td></tr>`)
        .join("");
    }),
    renderPlayerSeasonTable: vi.fn(({ tbody, seasons }) => {
      tbody.innerHTML = seasons
        .map((s) => `<tr><td>${s.season_id}</td><td>${s.pts}</td></tr>`)
        .join("");
    }),
    renderPlayerSummaryCard: vi.fn(({ player, getById }) => {
      getById("playerHighlightName").textContent = player.name;
    }),
    renderPlayersTable: vi.fn(({ tbody, players }) => {
      tbody.innerHTML = players
        .map(
          (p, idx) =>
            `<tr data-index="${idx}"><td>${p.name}</td><td>${p.pts}</td></tr>`,
        )
        .join("");
    }),
    renderPredictCards: vi.fn(({ container, prediction }) => {
      container.innerHTML = `<div>${prediction.pts.predicted}</div>`;
    }),
    renderPredictFactors: vi.fn(({ container }) => {
      container.innerHTML = "<div>factor</div>";
    }),
    renderPredictPlayerInfo: vi.fn(({ container, player }) => {
      container.innerHTML = `<div>${player.name}</div>`;
    }),
    renderPredictSuggestions: vi.fn(({ container, players, error }) => {
      if (error) {
        container.innerHTML = "<div>error</div>";
        return;
      }
      container.innerHTML = players
        .map((p) => `<button data-id="${p.id}">${p.name}</button>`)
        .join("");
    }),
    renderRecentResults: vi.fn(
      ({ container, recentGames, getPredictionCompareHtml }) => {
        container.innerHTML = recentGames
          .map(
            (g) =>
              `<article>${g.id}${getPredictionCompareHtml(g, g.home_score > g.away_score)}</article>`,
          )
          .join("");
      },
    ),
    renderStandingsTable: vi.fn(({ tbody, standings }) => {
      tbody.innerHTML = standings
        .map((s) => `<tr><td>${s.team_id}</td><td>${s.wins}</td></tr>`)
        .join("");
    }),
    renderTeamRecentGames: vi.fn(({ tbody, games }) => {
      tbody.innerHTML = games
        .map((g) => `<tr><td>${g.id || g.game_id}</td></tr>`)
        .join("");
    }),
    renderTeamRoster: vi.fn(({ tbody, roster }) => {
      tbody.innerHTML = roster
        .map((p) => `<tr><td>${p.name}</td></tr>`)
        .join("");
    }),
    renderTeamStats: vi.fn(({ container, stats }) => {
      container.innerHTML = `<div>${stats.net_rtg ?? "-"}</div>`;
    }),
    renderTotalStats: vi.fn(({ container, predictions }) => {
      const totalPts = predictions.reduce(
        (sum, p) => sum + (p.pts?.pred || 0),
        0,
      );
      container.innerHTML = `<div>${totalPts.toFixed(1)}</div>`;
    }),
    renderUpcomingGames: vi.fn(
      ({ container, upcomingGames, getPredictionHtml }) => {
        container.innerHTML = upcomingGames
          .map((g) => `<article>${g.id}${getPredictionHtml(g)}</article>`)
          .join("");
      },
    ),
    sortPlayers: vi.fn((players, sort) => {
      const key = sort?.key || "pts";
      const dir = sort?.dir === "asc" ? 1 : -1;
      return [...players].sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * dir);
    }),
    filterPlayerShots: vi.fn((shots, filters) =>
      shots.filter((shot) => {
        if (filters.result === "made" && !shot.made) return false;
        if (filters.result === "missed" && shot.made) return false;
        if (
          filters.quarter !== "all" &&
          String(shot.quarter || 1) !== filters.quarter
        )
          return false;
        if (filters.zone !== "all" && String(shot.zone || "") !== filters.zone)
          return false;
        return true;
      }),
    ),
    sortStandings: vi.fn((rows, sort) => {
      const key = sort?.key || "rank";
      const dir = sort?.dir === "asc" ? 1 : -1;
      return [...rows].sort((a, b) => ((a[key] || 0) - (b[key] || 0)) * dir);
    }),
    summarizeGameShots: vi.fn((shots) => {
      const attempts = shots.length;
      const made = shots.filter((shot) => shot.made).length;
      const missed = attempts - made;
      return {
        attempts,
        made,
        missed,
        fgPct: attempts > 0 ? (made / attempts) * 100 : 0,
      };
    }),
  };

  const ui = {
    getRouteFromHash: vi.fn(parseRoute),
    isNavLinkActive: vi.fn((href, path) =>
      String(href || "")
        .replace(/^#\/?/, "")
        .startsWith(path),
    ),
    mountCompareEvents: vi.fn(() => () => {}),
    mountGlobalSearchEvents: vi.fn(() => () => {}),
    mountPlayersTableSortEvents: vi.fn(() => () => {}),
    mountPredictEvents: vi.fn(() => () => {}),
    mountResponsiveNav: vi.fn(() => () => {}),
    resolveRouteTarget: vi.fn((path, id) => {
      switch (path) {
        case "players":
          return id
            ? { view: "player", action: "loadPlayerPage" }
            : { view: "players", action: "loadPlayersPage" };
        case "teams":
          return id
            ? { view: "team", action: "loadTeamPage" }
            : { view: "teams", action: "loadTeamsPage" };
        case "games":
          return id
            ? { view: "game", action: "loadGamePage" }
            : { view: "games", action: "loadGamesPage" };
        case "leaders":
          return { view: "leaders", action: "loadLeadersPage" };
        case "compare":
          return { view: "compare", action: "loadComparePage" };
        case "schedule":
          return { view: "schedule", action: "loadSchedulePage" };
        case "predict":
          return { view: "predict", action: "loadPredictPage" };
        default:
          return { view: "home", action: "loadMainPage" };
      }
    }),
  };

  return {
    dataClient,
    views,
    ui,
    hideSkeleton: vi.fn(),
  };
}

function buildAppSource() {
  let source = fs.readFileSync(APP_PATH, "utf-8");

  source = source.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*"\.\/views\/index\.js";/,
    "var {$1} = globalThis.__WKBL_APP_TEST_DEPS__.views;",
  );
  source = source.replace(
    /import\s*\{\s*createDataClient\s*\}\s*from\s*"\.\/data\/client\.js";/,
    "var { createDataClient } = globalThis.__WKBL_APP_TEST_DEPS__.dataClient;",
  );
  source = source.replace(
    /import\s*\{([\s\S]*?)\}\s*from\s*"\.\/ui\/index\.js";/,
    "var {$1} = globalThis.__WKBL_APP_TEST_DEPS__.ui;",
  );
  source = source.replace(
    /import\s*\{\s*hideSkeleton\s*\}\s*from\s*"\.\/ui\/skeleton\.js";/,
    "var { hideSkeleton } = globalThis.__WKBL_APP_TEST_DEPS__.skeleton;",
  );

  const fnNames = [
    ...new Set(
      [
        ...source.matchAll(/^ {2}(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm),
      ].map((m) => m[1]),
    ),
  ];

  const exposed = [
    "state",
    "CONFIG",
    "SEASONS",
    "LEADER_CATEGORIES",
    "primaryStats",
    "advancedStats",
    "tier2Stats",
    ...fnNames,
  ].join(", ");

  source = source.replace(
    /if \(document\.readyState === "loading"\) \{\n\s*document\.addEventListener\("DOMContentLoaded", init\);\n\s*\} else \{\n\s*init\(\);\n\s*\}/,
    `window.__WKBL_APP_HOOKS__ = { ${exposed} };
  if (!window.__WKBL_APP_TEST_NO_AUTO_INIT__) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }`,
  );
  return source;
}

function loadHooks(deps) {
  globalThis.__WKBL_APP_TEST_DEPS__ = {
    views: deps.views,
    dataClient: { createDataClient: vi.fn(() => deps.dataClient) },
    ui: deps.ui,
    skeleton: { hideSkeleton: deps.hideSkeleton },
  };
  window.__WKBL_APP_TEST_NO_AUTO_INIT__ = true;
  new vm.Script(buildAppSource(), { filename: APP_PATH }).runInThisContext();
  return window.__WKBL_APP_HOOKS__;
}

function createElementForId(id) {
  if (id.endsWith("Select")) return document.createElement("select");
  if (id.endsWith("Input")) return document.createElement("input");
  if (id.endsWith("Table")) {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const row = document.createElement("tr");
    ["pts", "reb"].forEach((key) => {
      const th = document.createElement("th");
      th.dataset.key = key;
      row.appendChild(th);
    });
    thead.appendChild(row);
    table.appendChild(thead);
    return table;
  }
  if (id.endsWith("Body")) return document.createElement("tbody");
  if (id.endsWith("Chart")) return document.createElement("canvas");
  return document.createElement("div");
}

function installDomHarness() {
  document.body.innerHTML = "";
  ROUTE_VIEWS.forEach((view) => {
    const section = document.createElement("section");
    section.className = "view";
    section.id = `view-${view}`;
    document.body.appendChild(section);
  });
  [
    "home",
    "players",
    "teams",
    "games",
    "leaders",
    "compare",
    "schedule",
    "predict",
  ].forEach((path) => {
    const link = document.createElement("a");
    link.className = "nav-link";
    link.setAttribute("href", `#/${path}`);
    document.body.appendChild(link);
  });

  const mainNav = document.createElement("nav");
  mainNav.id = "mainNav";
  const navToggle = document.createElement("button");
  navToggle.id = "navToggle";
  const navMenu = document.createElement("div");
  navMenu.id = "navMenu";
  document.body.append(mainNav, navToggle, navMenu);

  ["mainHomeTeam", "mainAwayTeam"].forEach((id) => {
    const wrapper = document.createElement("div");
    wrapper.id = id;
    const teamName = document.createElement("span");
    teamName.className = "team-name";
    const teamRecord = document.createElement("span");
    teamRecord.className = "team-record";
    wrapper.append(teamName, teamRecord);
    document.body.appendChild(wrapper);
  });

  const viewGame = document.getElementById("view-game");
  const awayTable = createElementForId("boxscoreAwayTable");
  awayTable.id = "boxscoreAwayTable";
  awayTable.className = "boxscore-table";
  const homeTable = createElementForId("boxscoreHomeTable");
  homeTable.id = "boxscoreHomeTable";
  homeTable.className = "boxscore-table";
  viewGame.append(awayTable, homeTable);

  const origGetById = document.getElementById.bind(document);
  vi.spyOn(document, "getElementById").mockImplementation((id) => {
    const found = origGetById(id);
    if (found) return found;
    const el = createElementForId(id);
    el.id = id;
    document.body.appendChild(el);
    return el;
  });

  const nativeElQuery = Element.prototype.querySelector;
  vi.spyOn(Element.prototype, "querySelector").mockImplementation(
    function (selector) {
      const found = nativeElQuery.call(this, selector);
      if (found) return found;
      const fallback = String(selector).includes("canvas")
        ? document.createElement("canvas")
        : document.createElement("div");
      if (String(selector).startsWith("."))
        fallback.className = selector.slice(1);
      if (String(selector).startsWith("#")) fallback.id = selector.slice(1);
      this.appendChild(fallback);
      return fallback;
    },
  );

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => ({}),
  );
}

function installChartStub() {
  const instances = [];
  class FakeChart {
    static plugins = [];
    static register(plugin) {
      FakeChart.plugins.push(plugin);
    }

    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.destroy = vi.fn();
      this.toBase64Image = vi.fn(() => "data:image/png;base64,AAAA");
      instances.push(this);
    }
  }
  window.Chart = FakeChart;
  globalThis.Chart = FakeChart;
  return { FakeChart, instances };
}

function createHarness() {
  const fixtures = createFixtures();
  const deps = createDeps(fixtures);
  const wkblDb = createWkblDb(fixtures);
  window.WKBLShared = {
    SEASON_CODES: { "046": "2025-26", "045": "2024-25" },
    DEFAULT_SEASON: "046",
  };
  window.WKBLDatabase = wkblDb;
  globalThis.WKBLDatabase = wkblDb;
  const { FakeChart, instances } = installChartStub();
  const hooks = loadHooks(deps);
  return {
    hooks,
    deps,
    wkblDb,
    fixtures,
    ChartRef: FakeChart,
    chartInstances: instances,
  };
}

function runChartOptionCallbacks(chart) {
  const options = chart?.config?.options || {};
  const tooltip = options.plugins?.tooltip;
  const callbacks = tooltip?.callbacks || {};
  if (typeof callbacks.label === "function") {
    try {
      callbacks.label({
        raw: {
          shot: {
            opponent: "삼성",
            quarter: 1,
            made: true,
            playerName: "김가드",
          },
        },
        dataIndex: 0,
        datasetIndex: 0,
        dataset: { label: "득점" },
        parsed: { y: 10 },
        chart: { data: { labels: ["1"] } },
      });
    } catch (_e) {
      // Callback contract differs by chart type; ignore in shared probe.
    }
  }
  if (typeof callbacks.afterBody === "function") {
    try {
      callbacks.afterBody([{ dataIndex: 0 }]);
    } catch (_e) {
      // Callback contract differs by chart type; ignore in shared probe.
    }
  }
  const datasets = chart?.config?.data?.datasets || [];
  datasets.forEach((dataset) => {
    if (typeof dataset.pointRadius === "function") {
      dataset.pointRadius({ dataIndex: 0 });
      dataset.pointRadius({ dataIndex: 999 });
    }
    if (typeof dataset.pointBackgroundColor === "function") {
      dataset.pointBackgroundColor({ dataIndex: 0 });
      dataset.pointBackgroundColor({ dataIndex: 999 });
    }
  });
}

describe("app behavior integration", () => {
  beforeEach(() => {
    installDomHarness();
    window.alert = vi.fn();
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (fn, _delay, ...args) => {
        if (typeof fn === "function") fn(...args);
        return 0;
      },
    );
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete window.WKBLShared;
    delete window.WKBLDatabase;
    delete window.__WKBL_APP_HOOKS__;
    delete window.__WKBL_APP_TEST_NO_AUTO_INIT__;
    delete globalThis.__WKBL_APP_TEST_DEPS__;
    delete globalThis.WKBLDatabase;
    delete globalThis.Chart;
  });

  it("covers route-level flows with observable UI contracts", async () => {
    const { hooks, deps } = createHarness();

    await hooks.initLocalDb();
    await hooks.loadMainPage();
    expect(document.getElementById("mainGameCard").style.display).toBe("block");
    expect(
      document.getElementById("mainHomeTeam").querySelector(".team-name")
        .textContent,
    ).toContain("KB");
    expect(document.getElementById("homeWinProb").textContent).toContain("%");

    await hooks.loadPlayersPage();
    expect(hooks.state.players.length).toBeGreaterThan(2);
    expect(document.getElementById("statsBody").innerHTML).toContain("김가드");

    await hooks.loadPlayerPage("p1");
    expect(document.getElementById("detailPlayerName").textContent).toBe(
      "김가드",
    );
    expect(document.getElementById("playerShotSection").style.display).toBe(
      "block",
    );
    document.getElementById("playerShotResultSelect").value = "made";
    document
      .getElementById("playerShotResultSelect")
      .dispatchEvent(new Event("change"));
    expect(
      Number(document.getElementById("playerShotAttempts").textContent),
    ).toBeGreaterThan(0);

    await hooks.loadTeamsPage();
    expect(document.getElementById("standingsBody").innerHTML).toContain("kb");
    await hooks.loadTeamPage("kb");
    expect(document.getElementById("teamDetailName").textContent).toContain(
      "KB",
    );

    await hooks.loadGamesPage();
    expect(document.getElementById("gamesList").innerHTML).toContain(
      "04601001",
    );

    await hooks.loadGamePage("04601001");
    expect(document.getElementById("boxscoreHomeTeam").textContent).toContain(
      "KB",
    );
    expect(document.getElementById("boxscorePrediction").style.display).toBe(
      "block",
    );
    expect(document.getElementById("gameShotSection").style.display).toBe(
      "block",
    );
    document.getElementById("gameShotResultSelect").value = "made";
    document
      .getElementById("gameShotResultSelect")
      .dispatchEvent(new Event("change"));
    expect(
      Number(document.getElementById("gameShotAttempts").textContent),
    ).toBeGreaterThan(0);

    await hooks.loadLeadersPage();
    expect(document.getElementById("leadersGrid").innerHTML).toContain("pts");

    await hooks.loadComparePage();
    await hooks.handleCompareSearch("김");
    hooks.addComparePlayer({ id: "p1", name: "김가드" });
    hooks.addComparePlayer({ id: "p2", name: "박포워드" });
    await hooks.executeComparison();
    expect(document.getElementById("compareResult").style.display).toBe(
      "block",
    );
    expect(document.getElementById("compareTableHead").innerHTML).toContain(
      "김가드",
    );

    await hooks.loadSchedulePage();
    expect(document.getElementById("upcomingGamesList").innerHTML).toContain(
      "04601002",
    );
    expect(document.getElementById("recentResultsList").innerHTML).toContain(
      "04601001",
    );

    await hooks.loadPredictPage("p1");
    expect(document.getElementById("predictResult").style.display).toBe(
      "block",
    );
    expect(document.getElementById("predictPlayerInfo").textContent).toContain(
      "김가드",
    );

    hooks.openGlobalSearch();
    await hooks.handleGlobalSearch("김");
    hooks.navigateGlobalSearch(1);
    hooks.selectGlobalSearchItem();
    expect(window.location.hash).toContain("/predict/");

    window.location.hash = "#/games/04601001";
    await hooks.handleRoute();
    expect(deps.ui.resolveRouteTarget).toHaveBeenCalled();
  });

  it("excludes WS/40 from leaders categories and renders WS-family compare values", async () => {
    const { hooks, deps } = createHarness();
    await hooks.initLocalDb();

    // Leaders page should no longer expose WS/40 as a card category.
    expect(hooks.LEADER_CATEGORIES.some((cat) => cat.key === "ws_40")).toBe(
      false,
    );

    // Compare table should render OWS/DWS/WS/WS40 as numeric values (not '-').
    deps.dataClient.getPlayerComparison.mockResolvedValueOnce([
      {
        id: "p1",
        name: "김가드",
        pts: 18.3,
        reb: 4.8,
        ast: 6.1,
        stl: 1.4,
        blk: 0.3,
        tov: 2.2,
        min: 31.2,
        gp: 20,
        fgp: 0.46,
        tpp: 0.35,
        ftp: 0.84,
        ts_pct: 0.57,
        efg_pct: 0.52,
        tpar: 0.31,
        ftr: 0.24,
        pir: 19.5,
        court_margin: 2.4,
        plus_minus_per_game: 3.1,
        plus_minus_per100: 5.8,
        ows: 1.23,
        dws: 0.98,
        ws: 2.21,
        ws_40: 0.087,
      },
      {
        id: "p2",
        name: "박포워드",
        pts: 17.1,
        reb: 7.2,
        ast: 3.4,
        stl: 1.0,
        blk: 0.9,
        tov: 1.9,
        min: 30.1,
        gp: 20,
        fgp: 0.44,
        tpp: 0.32,
        ftp: 0.8,
        ts_pct: 0.55,
        efg_pct: 0.5,
        tpar: 0.29,
        ftr: 0.22,
        pir: 18.2,
        court_margin: -0.4,
        plus_minus_per_game: -0.8,
        plus_minus_per100: -1.5,
        ows: 0.77,
        dws: 0.65,
        ws: 1.42,
        ws_40: 0.063,
      },
    ]);

    await hooks.loadComparePage();
    hooks.addComparePlayer({ id: "p1", name: "김가드" });
    hooks.addComparePlayer({ id: "p2", name: "박포워드" });
    await hooks.executeComparison();

    const bodyHtml = document.getElementById("compareTableBody").innerHTML;
    expect(bodyHtml).toContain("OWS");
    expect(bodyHtml).toContain("DWS");
    expect(bodyHtml).toContain("WS/40");
    expect(bodyHtml).toContain("1.23");
    expect(bodyHtml).toContain("0.98");
    expect(bodyHtml).toContain("2.21");
    expect(bodyHtml).toContain("0.087");
  });

  it("covers fallback/error branches without crashing the app shell", async () => {
    const { hooks, deps, wkblDb } = createHarness();
    await hooks.initLocalDb();

    wkblDb.getNextGame.mockReturnValueOnce(null);
    wkblDb.getRecentGames.mockReturnValueOnce([]);
    await hooks.loadMainPage();
    expect(document.getElementById("mainNoGame").style.display).toBe("block");
    expect(document.getElementById("predictionExplanation").style.display).toBe(
      "none",
    );

    deps.dataClient.getPlayerDetail.mockRejectedValueOnce(
      new Error("not found"),
    );
    await hooks.loadPlayerPage("missing-player");
    expect(document.getElementById("detailPlayerName").textContent).toContain(
      "선수를 찾을 수 없습니다",
    );

    deps.dataClient.getGameBoxscore.mockRejectedValueOnce(
      new Error("broken game"),
    );
    await hooks.loadGamePage("bad");

    await hooks.loadComparePage();
    deps.dataClient.search.mockRejectedValueOnce(new Error("search failed"));
    await hooks.handleCompareSearch("김");
    expect(
      document
        .getElementById("compareSuggestions")
        .classList.contains("active"),
    ).toBe(true);

    deps.dataClient.getPlayerGamelog.mockResolvedValueOnce([
      { game_id: "x", game_date: "2025-11-01", pts: 10, reb: 3, ast: 2 },
    ]);
    await hooks.selectPredictPlayer("p1", "김가드");
    expect(document.getElementById("predictPlayerInfo").textContent).toContain(
      "최소 3경기",
    );

    deps.dataClient.search.mockRejectedValueOnce(
      new Error("global search error"),
    );
    await hooks.handleGlobalSearch("오류");
    expect(
      document.getElementById("globalSearchResults").textContent,
    ).toContain("검색 오류");

    hooks.executeComparison();
    hooks.removeComparePlayer("not-exists");
  });

  it("covers game and schedule branches including pending/empty scenarios", async () => {
    const { hooks, wkblDb, deps, chartInstances } = createHarness();
    await hooks.initLocalDb();

    wkblDb.getNextGame.mockReturnValueOnce(null);
    wkblDb.getRecentGames.mockReturnValueOnce([
      {
        id: "recent",
        game_date: "2025-11-02",
        home_team_id: "kb",
        away_team_id: "samsung",
        home_team_name: "KB스타즈",
        away_team_name: "삼성생명",
        home_score: 71,
        away_score: 66,
      },
    ]);
    await hooks.loadMainPage();
    expect(
      document.getElementById("mainPredictionTitle").textContent,
    ).toContain("최근");

    const pendingGame = {
      ...(await deps.dataClient.getGameBoxscore("04601001")),
      home_score: null,
      away_score: null,
      id: "04601002",
    };
    deps.dataClient.getGameBoxscore.mockResolvedValueOnce(pendingGame);
    await hooks.loadGamePage("04601002");
    expect(document.getElementById("boxscorePrediction").innerHTML).toContain(
      "경기 예측",
    );

    wkblDb.getGamePredictions.mockReturnValueOnce({ players: [], team: null });
    await hooks.loadGamePage("04601001");
    expect(document.getElementById("boxscorePrediction").style.display).toBe(
      "none",
    );

    document
      .querySelectorAll("#view-game .boxscore-table th[data-key]")
      .forEach((th) =>
        th.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );

    document.getElementById("gameShotTeamSelect").value = "kb";
    document
      .getElementById("gameShotTeamSelect")
      .dispatchEvent(new Event("change"));
    document.getElementById("gameShotPlayerSelect").value = "p1";
    document
      .getElementById("gameShotPlayerSelect")
      .dispatchEvent(new Event("change"));
    document.getElementById("gameShotQuarterSelect").value = "1";
    document
      .getElementById("gameShotQuarterSelect")
      .dispatchEvent(new Event("change"));
    document
      .getElementById("gameShotTabZones")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document
      .getElementById("gameShotTabCharts")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await hooks.loadSchedulePage();
    document.getElementById("scheduleTeamSelect").value = "kb";
    await hooks.refreshSchedule();
    expect(document.getElementById("nextGameCard").innerHTML).toContain(
      "04601002",
    );

    chartInstances.forEach((chart) => runChartOptionCallbacks(chart));
  });

  it("shows no-pregame badge for recent results when pregame run is missing", async () => {
    const { hooks, wkblDb } = createHarness();
    await hooks.initLocalDb();

    wkblDb.getGamePredictions.mockReturnValue({
      players: [],
      team: null,
    });

    await hooks.loadSchedulePage();
    expect(document.getElementById("recentResultsList").innerHTML).toContain(
      "사전 예측 없음",
    );
  });

  it("covers search/compare/predict control branches and table interactions", async () => {
    const { hooks, deps, wkblDb, chartInstances } = createHarness();
    await hooks.initLocalDb();

    await hooks.loadComparePage();
    await hooks.handleCompareSearch("");
    expect(document.getElementById("compareSuggestions").innerHTML).toBe("");
    await hooks.handleCompareSearch("김");
    hooks.addComparePlayer({ id: "p1", name: "김가드" });
    hooks.addComparePlayer({ id: "p2", name: "박포워드" });
    hooks.addComparePlayer({ id: "p3", name: "이센터" });
    hooks.addComparePlayer({ id: "p4", name: "최슈터" });
    hooks.addComparePlayer({ id: "p5", name: "정가드" });
    expect(hooks.state.compareSelectedPlayers).toHaveLength(4);
    hooks.addComparePlayer({ id: "p1", name: "김가드" });
    expect(hooks.state.compareSelectedPlayers).toHaveLength(4);
    await hooks.executeComparison();
    expect(document.getElementById("compareTableBody").innerHTML).toContain(
      "코트마진",
    );

    deps.dataClient.getPlayerComparison.mockResolvedValueOnce([]);
    await hooks.executeComparison();
    expect(window.alert).toHaveBeenCalled();

    deps.dataClient.getPlayerComparison.mockRejectedValueOnce(
      new Error("compare fail"),
    );
    await hooks.executeComparison();
    expect(window.alert).toHaveBeenCalledTimes(2);

    await hooks.loadPredictPage();
    await hooks.handlePredictSearch("");
    expect(
      document
        .getElementById("predictSuggestions")
        .classList.contains("active"),
    ).toBe(false);
    await hooks.handlePredictSearch("김");
    expect(
      document
        .getElementById("predictSuggestions")
        .classList.contains("active"),
    ).toBe(true);
    deps.dataClient.search.mockRejectedValueOnce(
      new Error("predict search fail"),
    );
    await hooks.handlePredictSearch("에러");
    expect(document.getElementById("predictSuggestions").innerHTML).toContain(
      "error",
    );

    deps.dataClient.getPlayerDetail.mockRejectedValueOnce(
      new Error("deeplink fail"),
    );
    await hooks.loadPredictPage("p1");
    expect(document.getElementById("predictPlayerInfo").innerHTML).toContain(
      "불러오지 못",
    );

    deps.dataClient.getPlayerGamelog.mockRejectedValueOnce(
      new Error("prediction fail"),
    );
    await hooks.generatePrediction("p1");
    expect(document.getElementById("predictPlayerInfo").innerHTML).toContain(
      "실패",
    );

    hooks.openGlobalSearch();
    await hooks.handleGlobalSearch("");
    deps.dataClient.search.mockResolvedValueOnce({ players: [], teams: [] });
    await hooks.handleGlobalSearch("없는선수");
    expect(
      document.getElementById("globalSearchResults").textContent,
    ).toContain("검색 결과");
    hooks.closeGlobalSearch();

    const standingsTable = document.getElementById("standingsTable");
    standingsTable.innerHTML = `<thead><tr><th data-key="wins">W</th></tr></thead>`;
    hooks.state.standings = wkblDb.getStandings("046");
    hooks.initEventListeners();
    standingsTable
      .querySelector("th[data-key='wins']")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.getElementById("standingsBody").innerHTML).toContain("kb");

    chartInstances.forEach((chart) => runChartOptionCallbacks(chart));
  });

  it("covers utility, charts, plugin draw path, and init wiring", async () => {
    const { hooks, deps, fixtures, ChartRef, chartInstances } = createHarness();

    expect(hooks.formatPct(0.553)).toBe("55.3%");
    expect(hooks.formatNumber(12.345, 2)).toBe("12.35");
    expect(hooks.formatSigned(-2.2)).toBe("-2.2");
    expect(hooks.formatDate("2025-11-01")).toBe("11/1");
    expect(hooks.calculateAge("2000-01-01")).toBeGreaterThan(10);
    expect(hooks._estimatePossessions(60, 20, 12, 8)).toBeCloseTo(72.8);

    const lineup = hooks.generateOptimalLineup(fixtures.players, {
      p1: fixtures.gamelog,
      p2: fixtures.gamelog,
    });
    expect(lineup.length).toBeGreaterThan(0);
    const pred = await hooks.getPlayerPrediction(fixtures.players[0], true, {
      pts_factor: 1.1,
    });
    expect(pred.pts.pred).toBeGreaterThan(0);
    const winProb = hooks.calculateWinProbability(
      [pred],
      [pred],
      fixtures.standings[0],
      fixtures.standings[1],
      {
        homeNetRtg: 4,
        awayNetRtg: -2,
        h2hFactor: 0.6,
      },
    );
    expect(winProb.home + winProb.away).toBe(100);

    hooks.renderPlayerTrendChart([
      fixtures.seasons["045"],
      fixtures.seasons["046"],
    ]);
    hooks.renderShootingEfficiencyChart([
      fixtures.seasons["045"],
      fixtures.seasons["046"],
    ]);
    hooks.renderPlayerRadarChart(fixtures.players[0], fixtures.players);
    hooks.renderGameLogChart(fixtures.gamelog);
    hooks.renderStandingsChart(fixtures.standings);
    hooks.renderCompareRadarChart(fixtures.players);
    hooks.renderCompareBarChart(fixtures.players);
    hooks.renderPredictTrendChart(fixtures.gamelog, {
      pts: { predicted: 19 },
      reb: { predicted: 5 },
      ast: { predicted: 6 },
    });
    chartInstances.forEach((chart) => runChartOptionCallbacks(chart));

    hooks.ensureShotCourtOverlayPlugin();
    expect(ChartRef.plugins.length).toBeGreaterThan(0);
    const plugin = ChartRef.plugins[0];
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      ellipse: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      strokeStyle: "",
      lineWidth: 0,
      lineJoin: "",
      lineCap: "",
    };
    plugin.beforeDatasetsDraw(
      {
        config: { type: "scatter" },
        ctx,
        scales: {
          x: { getPixelForValue: (v) => v },
          y: { getPixelForValue: (v) => v },
        },
      },
      {},
      { lineColor: "#111", lineWidth: 2 },
    );
    expect(ctx.stroke).toHaveBeenCalled();

    window.location.hash = "#/home";
    await hooks.init();
    expect(deps.hideSkeleton).toHaveBeenCalled();
    expect(deps.ui.mountGlobalSearchEvents).toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 60));
  });
});
