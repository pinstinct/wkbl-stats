import { describe, expect, it } from "vitest";

import {
  buildQuarterSeries,
  buildZoneSeries,
  filterGameShots,
  normalizeGameShots,
  summarizeGameShots,
} from "./game-shot-logic.js";

describe("game shot logic", () => {
  const rawShots = [
    {
      player_id: "p1",
      quarter: 1,
      made: 1,
      shot_zone: "paint",
      x: 20,
      y: 30,
    },
    {
      player_id: "p1",
      quarter: 2,
      made: 0,
      shot_zone: "three_pt",
      x: 60,
      y: 15,
    },
    {
      player_id: "p2",
      quarter: 1,
      made: 1,
      shot_zone: "mid_range",
      x: 45,
      y: 40,
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

  it("summarizes totals and fg%", () => {
    const normalized = normalizeGameShots(rawShots, {
      p1: "선수1",
      p2: "선수2",
    });

    expect(summarizeGameShots(normalized)).toEqual({
      attempts: 3,
      made: 2,
      missed: 1,
      fgPct: 66.7,
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
    expect(zoneSeries.attempts).toEqual([1, 1, 1]);
    expect(zoneSeries.fgPct).toEqual([100, 100, 0]);

    expect(quarterSeries.labels).toEqual(["Q1", "Q2"]);
    expect(quarterSeries.made).toEqual([2, 0]);
    expect(quarterSeries.missed).toEqual([0, 1]);
  });
});
