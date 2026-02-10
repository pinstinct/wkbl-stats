import { describe, expect, it } from "vitest";

import {
  buildStandingsChartSeries,
  parseWinLossRecord,
} from "./teams-chart-logic.js";

describe("teams chart logic", () => {
  it("parses win-loss records safely", () => {
    expect(parseWinLossRecord("5-3")).toEqual({ wins: 5, losses: 3 });
    expect(parseWinLossRecord("bad")).toEqual({ wins: 0, losses: 0 });
    expect(parseWinLossRecord(null)).toEqual({ wins: 0, losses: 0 });
  });

  it("builds sorted standings chart series", () => {
    const standings = [
      {
        rank: 2,
        team_name: "B",
        short_name: "B",
        home_record: "3-2",
        away_record: "4-1",
      },
      {
        rank: 1,
        team_name: "A",
        short_name: "A",
        home_record: "5-0",
        away_record: "2-3",
      },
    ];

    expect(buildStandingsChartSeries(standings)).toEqual({
      sorted: [
        {
          rank: 1,
          team_name: "A",
          short_name: "A",
          home_record: "5-0",
          away_record: "2-3",
        },
        {
          rank: 2,
          team_name: "B",
          short_name: "B",
          home_record: "3-2",
          away_record: "4-1",
        },
      ],
      labels: ["A", "B"],
      homeWins: [5, 3],
      homeLosses: [0, 2],
      awayWins: [2, 4],
      awayLosses: [3, 1],
    });
  });
});
