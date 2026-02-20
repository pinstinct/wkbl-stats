import { describe, expect, it } from "vitest";

import { renderLineupPlayers, renderTotalStats } from "./home.js";

describe("home view", () => {
  it("renders lineup cards", () => {
    const container = { innerHTML: "" };
    const lineup = [{ id: "p1", pos: "G", name: "선수1" }];
    const predictions = [
      {
        pts: { pred: 12, low: 8, high: 16 },
        reb: { pred: 5, low: 3, high: 7 },
        ast: { pred: 4, low: 2, high: 6 },
        stl: { pred: 2, low: 1, high: 3 },
        blk: { pred: 1, low: 0, high: 2 },
      },
    ];
    renderLineupPlayers({
      container,
      lineup,
      predictions,
      formatNumber: (v) => String(Number(v).toFixed(1)),
    });

    expect(container.innerHTML).toContain('href="#/players/p1"');
    expect(container.innerHTML).toContain("선수1");
  });

  it("renders total stats", () => {
    const container = { innerHTML: "" };
    renderTotalStats({
      container,
      predictions: [
        {
          pts: { pred: 10 },
          reb: { pred: 4 },
          ast: { pred: 3 },
          stl: { pred: 2 },
          blk: { pred: 1 },
        },
      ],
      formatNumber: (v) => String(Number(v).toFixed(1)),
    });
    expect(container.innerHTML).toContain("총 득점");
    expect(container.innerHTML).toContain("10.0");
  });
});
