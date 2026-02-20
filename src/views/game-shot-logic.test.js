import { describe, expect, it } from "vitest";

import {
  buildShotChartExportName,
  buildQuarterSeries,
  buildQuarterSelectOptions,
  buildZoneSeries,
  filterGameShots,
  normalizeGameShots,
  summarizeGameShots,
} from "./game-shot-logic.js";

describe("game shot logic", () => {
  const rawShots = [
    {
      player_id: "p1",
      team_id: "away",
      quarter: 1,
      made: 1,
      shot_zone: "paint",
      x: 20,
      y: 30,
    },
    {
      player_id: "p1",
      team_id: "away",
      quarter: 2,
      made: 0,
      shot_zone: "three_pt",
      x: 60,
      y: 15,
    },
    {
      player_id: "p2",
      team_id: "home",
      quarter: 1,
      made: 1,
      shot_zone: "mid_range",
      x: 45,
      y: 40,
    },
    {
      player_id: "p2",
      team_id: "home",
      quarter: 5,
      made: 0,
      shot_zone: "paint",
      x: 22,
      y: 18,
    },
  ];

  it("normalizes shots with player names", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    expect(normalized[0]).toMatchObject({
      playerId: "p1",
      playerName: "선수1",
      teamId: "away",
      quarter: 1,
      made: true,
      shotZone: "paint",
    });
  });

  it("filters by player, result, and quarter", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    const filtered = filterGameShots(normalized, {
      playerId: "p1",
      result: "miss",
      quarter: "2",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].made).toBe(false);
    expect(filtered[0].quarter).toBe(2);
  });

  it("filters by team id", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    const filtered = filterGameShots(normalized, {
      teamId: "home",
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.every((shot) => shot.teamId === "home")).toBe(true);
  });

  it("summarizes totals and fg%", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    expect(summarizeGameShots(normalized)).toEqual({
      attempts: 4,
      made: 2,
      missed: 2,
      fgPct: 50,
    });
  });

  it("builds zone and quarter series", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    const zoneSeries = buildZoneSeries(normalized);
    const quarterSeries = buildQuarterSeries(normalized);

    expect(zoneSeries.labels).toEqual(["PAINT", "MID", "3PT"]);
    expect(zoneSeries.attempts).toEqual([2, 1, 1]);
    expect(zoneSeries.fgPct).toEqual([50, 100, 0]);

    expect(quarterSeries.labels).toEqual(["Q1", "Q2", "OT1"]);
    expect(quarterSeries.made).toEqual([2, 0, 0]);
    expect(quarterSeries.missed).toEqual([0, 1, 1]);
  });

  it("builds quarter filter options with overtime labels", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    expect(buildQuarterSelectOptions(normalized)).toEqual([
      { value: "all", label: "전체" },
      { value: "1", label: "1Q" },
      { value: "2", label: "2Q" },
      { value: "5", label: "OT1" },
    ]);
  });

  it("builds stable export file name", () => {
    expect(
      buildShotChartExportName({
        gameId: "G20260220-001",
        filters: {
          teamId: "home",
          playerId: "p1",
          result: "made",
          quarter: "5",
        },
      }),
    ).toBe("shotchart_G20260220-001_home_p1_made_q5.png");
  });
});
