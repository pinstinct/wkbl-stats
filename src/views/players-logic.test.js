import { describe, expect, it } from "vitest";

import { filterPlayers, sortPlayers } from "./players-logic.js";

describe("players logic", () => {
  const players = [
    { id: "p1", name: "김가드", team: "우리은행", pos: "G", pts: 12.1 },
    { id: "p2", name: "박센터", team: "하나은행", pos: "C", pts: 8.4 },
    { id: "p3", name: "이포워드", team: "우리은행", pos: "F", pts: null },
  ];

  it("filters by team, position and case-insensitive search", () => {
    const filtered = filterPlayers(players, {
      team: "우리은행",
      pos: "G",
      search: "김",
    });
    expect(filtered.map((p) => p.id)).toEqual(["p1"]);

    const bySearchOnly = filterPlayers(players, {
      team: "all",
      pos: "all",
      search: "박센",
    });
    expect(bySearchOnly.map((p) => p.id)).toEqual(["p2"]);
  });

  it("sorts with null-safe numeric comparison and keeps input immutable", () => {
    const sortedDesc = sortPlayers(players, { key: "pts", dir: "desc" });
    expect(sortedDesc.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);

    const sortedAsc = sortPlayers(players, { key: "pts", dir: "asc" });
    expect(sortedAsc.map((p) => p.id)).toEqual(["p3", "p2", "p1"]);

    expect(players.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });
});
