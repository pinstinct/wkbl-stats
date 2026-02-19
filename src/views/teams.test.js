import { describe, expect, it } from "vitest";

import {
  renderStandingsTable,
  renderTeamRecentGames,
  renderTeamRoster,
  renderTeamStats,
  sortStandings,
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
          off_rtg: 101.2,
          def_rtg: 92.5,
          net_rtg: 8.7,
          pace: 70.1,
        },
      ],
    });
    expect(tbody.innerHTML).toContain("하나");
    expect(tbody.innerHTML).toContain('href="#/teams/hana"');
    expect(tbody.innerHTML).toContain("101.2");
    expect(tbody.innerHTML).toContain("+8.7");
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

  it("renders team stat tooltips with title and data-tooltip", () => {
    const container = { innerHTML: "" };
    renderTeamStats({
      container,
      stats: {
        off_rtg: 101.2,
        def_rtg: 95.3,
        net_rtg: 5.9,
        pace: 69.2,
        gp: 20,
      },
    });
    expect(container.innerHTML).toContain("data-tooltip=");
    expect(container.innerHTML).toContain("title=");
  });

  it("sorts standings by selected key and direction", () => {
    const standings = [
      { team_id: "a", rank: 2, net_rtg: -1.2 },
      { team_id: "b", rank: 1, net_rtg: 7.5 },
    ];
    const sorted = sortStandings(standings, { key: "net_rtg", dir: "desc" });
    expect(sorted.map((row) => row.team_id)).toEqual(["b", "a"]);
  });
});
