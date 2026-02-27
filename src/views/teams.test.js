import { describe, expect, it } from "vitest";

import {
  renderStandingsTable,
  renderTeamRecentGames,
  renderTeamRoster,
  renderTeamStats,
  sortStandings,
} from "./teams.js";

describe("teams view", () => {
  it("returns early when render targets are missing", () => {
    expect(() =>
      renderStandingsTable({ tbody: null, standings: [] }),
    ).not.toThrow();
    expect(() => renderTeamRoster({ tbody: null, roster: [] })).not.toThrow();
    expect(() =>
      renderTeamRecentGames({ tbody: null, games: [], formatDate: () => "" }),
    ).not.toThrow();
    expect(() => renderTeamStats({ container: null, stats: {} })).not.toThrow();
    expect(() =>
      renderTeamStats({ container: { innerHTML: "" }, stats: null }),
    ).not.toThrow();
  });

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

  it("renders standings fallbacks for null numeric fields", () => {
    const tbody = { innerHTML: "" };
    renderStandingsTable({
      tbody,
      standings: [
        {
          rank: 2,
          team_id: "bnk",
          team_name: "BNK",
          wins: 1,
          losses: 1,
          win_pct: 0.5,
          home_record: "1-0",
          away_record: "0-1",
          off_rtg: null,
          def_rtg: undefined,
          net_rtg: null,
          pace: undefined,
          games_behind: "",
          streak: "",
          last5: "",
        },
      ],
    });
    expect(tbody.innerHTML).toContain(">-</td>");
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

  it("sorts with both values null", () => {
    const standings = [
      { team_id: "a", rank: null },
      { team_id: "b", rank: null },
    ];
    const sorted = sortStandings(standings, { key: "rank", dir: "asc" });
    expect(sorted).toHaveLength(2);
  });

  it("sorts with only second value null (bVal null)", () => {
    const standings = [
      { team_id: "a", rank: 1 },
      { team_id: "b", rank: null },
    ];
    const sorted = sortStandings(standings, { key: "rank", dir: "asc" });
    expect(sorted[0].team_id).toBe("a");
    expect(sorted[1].team_id).toBe("b");
  });

  it("sorts strings and nulls consistently", () => {
    const standings = [
      { team_id: "a", team_name: null, rank: 2 },
      { team_id: "b", team_name: "가", rank: 1 },
      { team_id: "c", team_name: "나", rank: 3 },
    ];
    const asc = sortStandings(standings, { key: "team_name", dir: "asc" });
    expect(asc.map((row) => row.team_id)).toEqual(["b", "c", "a"]);
    const desc = sortStandings(standings, { key: "team_name", dir: "desc" });
    expect(desc.map((row) => row.team_id)).toEqual(["c", "b", "a"]);
  });
});
