import { describe, expect, it } from "vitest";

import { renderGamesList } from "./games.js";

describe("games view", () => {
  it("renders game cards", () => {
    const container = { innerHTML: "" };
    renderGamesList({
      container,
      games: [
        {
          id: "g1",
          game_date: "2025-01-01",
          away_team_name: "A",
          home_team_name: "B",
          away_score: 70,
          home_score: 65,
        },
      ],
      formatDate: () => "1/1",
    });

    expect(container.innerHTML).toContain('href="#/games/g1"');
    expect(container.innerHTML).toContain("game-card");
  });
});
