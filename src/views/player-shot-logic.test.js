import { describe, expect, it } from "vitest";

import {
  buildPlayerShotZoneOptions,
  filterPlayerShots,
  normalizePlayerShots,
} from "./player-shot-logic.js";

describe("player shot logic", () => {
  const raw = [
    {
      game_id: "g1",
      game_date: "2026-01-10",
      opponent_name: "상대A",
      quarter: "Q1",
      made: 1,
      shot_zone: "three_pt",
      x: 20,
      y: 120,
      game_minute: 3,
      game_second: 12,
    },
    {
      game_id: "g2",
      game_date: "2026-01-12",
      opponent_name: "상대B",
      quarter: "OT1",
      made: 0,
      shot_zone: "paint",
      x: 144,
      y: 35,
      game_minute: 41,
      game_second: 2,
    },
  ];

  it("normalizes rows with quarter labels and numeric coordinates", () => {
    const shots = normalizePlayerShots(raw);
    expect(shots[0]).toMatchObject({
      gameId: "g1",
      opponent: "상대A",
      quarter: 1,
      quarterLabel: "Q1",
      made: true,
      shotZone: "three_pt",
      x: 20,
      y: 120,
    });
    expect(shots[1].quarter).toBe(5);
    expect(shots[1].quarterLabel).toBe("OT1");
  });

  it("filters by result, quarter, and zone", () => {
    const shots = normalizePlayerShots(raw);
    expect(filterPlayerShots(shots, { result: "made" })).toHaveLength(1);
    expect(filterPlayerShots(shots, { quarter: "5" })).toHaveLength(1);
    expect(filterPlayerShots(shots, { zone: "paint" })).toHaveLength(1);
    expect(
      filterPlayerShots(shots, {
        result: "made",
        quarter: "5",
      }),
    ).toHaveLength(0);
  });

  it("builds stable zone options", () => {
    const shots = normalizePlayerShots(raw);
    expect(buildPlayerShotZoneOptions(shots)).toEqual([
      { value: "all", label: "전체" },
      { value: "paint", label: "PAINT" },
      { value: "three_pt", label: "3PT" },
    ]);
  });
});
