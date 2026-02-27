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

  it("returns early when containers are null", () => {
    expect(() =>
      renderNextGameHighlight({
        nextGameCard: null,
        next: { game_date: "2025-01-01" },
        formatFullDate: () => "1/1",
        getById: () => ({}),
      }),
    ).not.toThrow();

    expect(() =>
      renderUpcomingGames({
        container: null,
        upcomingGames: [{ id: "g1", game_date: "2025-01-01" }],
        formatFullDate: () => "1/1",
        getPredictionHtml: () => "",
      }),
    ).not.toThrow();

    expect(() =>
      renderRecentResults({
        container: null,
        recentGames: [{ id: "g1" }],
        formatFullDate: () => "1/1",
        getPredictionCompareHtml: () => "",
      }),
    ).not.toThrow();
  });

  it("uses short_name with fallback to team_name", () => {
    const upcoming = { innerHTML: "" };
    renderUpcomingGames({
      container: upcoming,
      upcomingGames: [
        {
          id: "g1",
          game_date: "2025-01-01",
          away_team_short: "KB",
          away_team_name: "KB스타즈",
          home_team_short: null,
          home_team_name: "삼성생명",
        },
      ],
      formatFullDate: () => "1/1",
      getPredictionHtml: () => "",
    });
    expect(upcoming.innerHTML).toContain("KB");
    expect(upcoming.innerHTML).toContain("삼성생명");

    const recent = { innerHTML: "" };
    renderRecentResults({
      container: recent,
      recentGames: [
        {
          id: "g2",
          game_date: "2025-01-02",
          away_team_short: "KB",
          away_team_name: "KB스타즈",
          home_team_short: null,
          home_team_name: "삼성생명",
          away_score: 80,
          home_score: 75,
        },
      ],
      formatFullDate: () => "1/2",
      getPredictionCompareHtml: () => "",
    });
    expect(recent.innerHTML).toContain("KB");
    expect(recent.innerHTML).toContain("삼성생명");
    expect(recent.innerHTML).toContain("winner");
  });

  it("renders empty states for schedule lists and hides missing next game", () => {
    const upcoming = { innerHTML: "" };
    const recent = { innerHTML: "" };
    const card = { style: { display: "block" } };

    renderUpcomingGames({
      container: upcoming,
      upcomingGames: [],
      formatFullDate: () => "1/1",
      getPredictionHtml: () => "",
    });
    expect(upcoming.innerHTML).toContain("예정된 경기가 없습니다");

    renderRecentResults({
      container: recent,
      recentGames: [],
      formatFullDate: () => "1/2",
      getPredictionCompareHtml: () => "",
    });
    expect(recent.innerHTML).toContain("최근 경기 결과가 없습니다");

    renderNextGameHighlight({
      nextGameCard: card,
      next: null,
      formatFullDate: () => "1/1",
      getById: () => ({ textContent: "" }),
    });
    expect(card.style.display).toBe("none");
  });
});
