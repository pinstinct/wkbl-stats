import { describe, expect, it } from "vitest";

import { renderGamesList } from "./games.js";

describe("games view", () => {
  it("returns early when container is missing", () => {
    expect(() =>
      renderGamesList({ container: null, games: [], formatDate: () => "" }),
    ).not.toThrow();
  });

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

  it("prefers short names and score fallbacks", () => {
    const container = { innerHTML: "" };
    renderGamesList({
      container,
      games: [
        {
          id: "g2",
          game_date: "2025-01-02",
          away_team_name: "원정긴이름",
          away_team_short: "원정",
          home_team_name: "홈긴이름",
          home_team_short: "홈",
          away_score: null,
          home_score: undefined,
        },
      ],
      formatDate: () => "1/2",
    });

    expect(container.innerHTML).toContain("원정");
    expect(container.innerHTML).toContain("홈");
    expect(container.innerHTML).toContain('class="game-card-score">-</span>');
  });
});
