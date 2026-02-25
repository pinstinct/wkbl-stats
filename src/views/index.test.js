import { describe, expect, it } from "vitest";

import * as views from "./index.js";

describe("views barrel exports", () => {
  it("exposes all app-facing render and logic functions", () => {
    expect(views.renderPlayersTable).toBeTypeOf("function");
    expect(views.renderPlayerSummaryCard).toBeTypeOf("function");
    expect(views.filterPlayers).toBeTypeOf("function");
    expect(views.sortPlayers).toBeTypeOf("function");
    expect(views.renderPlayerSeasonTable).toBeTypeOf("function");
    expect(views.renderTeamStats).toBeTypeOf("function");
    expect(views.renderGamesList).toBeTypeOf("function");
    expect(views.renderBoxscoreRows).toBeTypeOf("function");
    expect(views.renderLeadersGrid).toBeTypeOf("function");
    expect(views.renderCompareCards).toBeTypeOf("function");
    expect(views.calculatePrediction).toBeTypeOf("function");
    expect(views.buildPredictionCompareState).toBeTypeOf("function");
    expect(views.renderPredictCards).toBeTypeOf("function");
    expect(views.renderNextGameHighlight).toBeTypeOf("function");
  });
});
