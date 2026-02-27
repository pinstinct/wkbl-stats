import { describe, expect, it } from "vitest";

import { renderLeadersGrid } from "./leaders.js";

describe("leaders view null guard", () => {
  it("returns early for null grid", () => {
    expect(() =>
      renderLeadersGrid({ grid: null, categories: {}, leaderCategories: [] }),
    ).not.toThrow();
  });
});

describe("leaders view", () => {
  it("renders leader cards", () => {
    const grid = { innerHTML: "" };
    renderLeadersGrid({
      grid,
      categories: {
        pts: [
          {
            rank: 1,
            player_id: "p1",
            player_name: "선수1",
            team_name: "팀",
            value: 20.1,
          },
        ],
      },
      leaderCategories: [{ key: "pts", label: "득점" }],
    });
    expect(grid.innerHTML).toContain("득점");
    expect(grid.innerHTML).toContain('href="#/players/p1"');
  });

  it("renders empty-state text when category has no leaders", () => {
    const grid = { innerHTML: "" };
    renderLeadersGrid({
      grid,
      categories: {
        per: [],
      },
      leaderCategories: [{ key: "per", label: "PER" }],
    });

    expect(grid.innerHTML).toContain("PER");
    expect(grid.innerHTML).toContain("데이터가 없습니다");
  });
});
