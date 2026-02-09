import { describe, expect, it } from "vitest";

import {
  renderNextGameHighlight,
  renderRecentResults,
  renderUpcomingGames,
} from "./schedule.js";

describe("schedule view", () => {
  it("renders upcoming and recent lists", () => {
    const upcoming = { innerHTML: "" };
    const recent = { innerHTML: "" };

    renderUpcomingGames({
      container: upcoming,
      upcomingGames: [
        {
          id: "g1",
          game_date: "2025-01-01",
          away_team_name: "A",
          home_team_name: "B",
        },
      ],
      formatFullDate: () => "1/1",
      getPredictionHtml: () => "",
    });
    renderRecentResults({
      container: recent,
      recentGames: [
        {
          id: "g2",
          game_date: "2025-01-02",
          away_team_name: "A",
          home_team_name: "B",
          away_score: 70,
          home_score: 75,
        },
      ],
      formatFullDate: () => "1/2",
      getPredictionCompareHtml: () => "",
    });

    expect(upcoming.innerHTML).toContain('href="#/games/g1"');
    expect(recent.innerHTML).toContain("75");
  });

  it("renders next game countdown", () => {
    const fields = new Map([
      ["nextGameMatchup", { textContent: "" }],
      ["nextGameDate", { textContent: "" }],
      ["nextGameCountdown", { textContent: "" }],
    ]);
    const card = { style: { display: "none" } };

    renderNextGameHighlight({
      nextGameCard: card,
      next: {
        game_date: "2099-01-01",
        away_team_name: "A",
        home_team_name: "B",
      },
      formatFullDate: () => "1/1",
      getById: (id) => fields.get(id),
    });

    expect(card.style.display).toBe("block");
    expect(fields.get("nextGameMatchup").textContent).toContain("A vs B");
  });
});
