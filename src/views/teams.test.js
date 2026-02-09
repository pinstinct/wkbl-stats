import { describe, expect, it } from "vitest";

import {
  renderStandingsTable,
  renderTeamRecentGames,
  renderTeamRoster,
} from "./teams.js";

describe("teams view", () => {
  it("renders standings table", () => {
    const tbody = { innerHTML: "" };
    renderStandingsTable({
      tbody,
      standings: [
        {
          rank: 1,
          team_id: "hana",
          team_name: "하나",
          wins: 10,
          losses: 2,
          win_pct: 0.833,
          home_record: "5-1",
          away_record: "5-1",
        },
      ],
    });
    expect(tbody.innerHTML).toContain("하나");
    expect(tbody.innerHTML).toContain('href="#/teams/hana"');
  });

  it("renders roster and recent games", () => {
    const rosterBody = { innerHTML: "" };
    const gamesBody = { innerHTML: "" };

    renderTeamRoster({
      tbody: rosterBody,
      roster: [{ id: "p1", name: "선수1", position: "G", height: "175cm" }],
    });
    renderTeamRecentGames({
      tbody: gamesBody,
      games: [
        {
          game_id: "g1",
          date: "2025-01-01",
          opponent: "상대",
          is_home: true,
          result: "W",
          score: "70-60",
        },
      ],
      formatDate: () => "1/1",
    });

    expect(rosterBody.innerHTML).toContain("선수1");
    expect(gamesBody.innerHTML).toContain('href="#/games/g1"');
  });
});
