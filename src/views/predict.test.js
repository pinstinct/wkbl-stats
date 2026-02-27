import { describe, expect, it } from "vitest";

import {
  renderPredictCards,
  renderPredictFactors,
  renderPredictPlayerInfo,
  renderPredictSuggestions,
} from "./predict.js";

describe("predict view null guards", () => {
  it("returns early for null containers", () => {
    expect(() =>
      renderPredictSuggestions({ container: null, players: [] }),
    ).not.toThrow();
    expect(() =>
      renderPredictPlayerInfo({ container: null, player: {} }),
    ).not.toThrow();
    expect(() =>
      renderPredictCards({ container: null, prediction: {} }),
    ).not.toThrow();
    expect(() =>
      renderPredictFactors({ container: null, prediction: {} }),
    ).not.toThrow();
  });
});

describe("predict view", () => {
  it("renders suggestions", () => {
    const suggestions = { innerHTML: "" };
    renderPredictSuggestions({
      container: suggestions,
      players: [{ id: "p1", name: "선수1", team: "A" }],
    });
    expect(suggestions.innerHTML).toContain("predict-suggestion-item");
  });

  it("renders prediction result sections", () => {
    const playerInfo = { innerHTML: "" };
    const cards = { innerHTML: "" };
    const factors = { innerHTML: "" };
    const prediction = {
      pts: {
        predicted: 10.1,
        low: 8.1,
        high: 12.1,
        trend: "up",
        trendLabel: "상승",
      },
      reb: {
        predicted: 5.1,
        low: 4.1,
        high: 6.1,
        trend: "stable",
        trendLabel: "보합",
      },
      ast: {
        predicted: 3.1,
        low: 2.1,
        high: 4.1,
        trend: "down",
        trendLabel: "하락",
      },
      recent5Avg: { pts: 10, reb: 5, ast: 3 },
      recent10Avg: { pts: 9, reb: 4, ast: 2 },
      seasonAvg: { pts: 8, reb: 4, ast: 2 },
    };

    renderPredictPlayerInfo({
      container: playerInfo,
      player: { name: "선수1", team: "A", position: "G", height: "175cm" },
    });
    renderPredictCards({ container: cards, prediction });
    renderPredictFactors({ container: factors, prediction });

    expect(playerInfo.innerHTML).toContain("predict-player-card");
    expect(cards.innerHTML).toContain("predict-stat-card");
    expect(factors.innerHTML).toContain("예측 근거");
  });

  it("renders predict suggestion fallback states", () => {
    const suggestions = { innerHTML: "" };

    renderPredictSuggestions({
      container: suggestions,
      players: [],
      error: false,
    });
    expect(suggestions.innerHTML).toContain("검색 결과 없음");

    renderPredictSuggestions({
      container: suggestions,
      players: [],
      error: true,
    });
    expect(suggestions.innerHTML).toContain("검색 오류");
  });

  it("skips missing stat cards safely", () => {
    const cards = { innerHTML: "" };
    renderPredictCards({
      container: cards,
      prediction: {
        pts: {
          predicted: 10.1,
          low: 8.1,
          high: 12.1,
          trend: "up",
          trendLabel: "상승",
        },
      },
    });
    expect(cards.innerHTML).toContain("predict-stat-card");
    expect(cards.innerHTML).not.toContain("리바운드");
  });
});
