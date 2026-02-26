import { describe, expect, it } from "vitest";

import {
  buildPredictionCompareState,
  calculatePrediction,
} from "./predict-logic.js";

describe("predict logic", () => {
  it("calculates prediction with trend label and non-negative low bound", () => {
    const gamelog = [
      { pts: 20, reb: 5, ast: 3 },
      { pts: 18, reb: 5, ast: 4 },
      { pts: 16, reb: 5, ast: 3 },
      { pts: 14, reb: 5, ast: 2 },
      { pts: 12, reb: 5, ast: 3 },
      { pts: 10, reb: 5, ast: 3 },
      { pts: 8, reb: 5, ast: 2 },
      { pts: 6, reb: 5, ast: 2 },
      { pts: 4, reb: 5, ast: 1 },
      { pts: 2, reb: 5, ast: 1 },
    ];

    const prediction = calculatePrediction(gamelog);
    expect(prediction.pts.trend).toBe("up");
    expect(prediction.pts.trendLabel).toContain("상승세");
    expect(prediction.pts.low).toBeGreaterThanOrEqual(0);
  });

  it("builds prediction result badge/class state", () => {
    const correct = buildPredictionCompareState({
      homeWin: true,
      teamPrediction: {
        home_win_prob: 62,
        away_predicted_pts: 69.8,
        home_predicted_pts: 74.2,
      },
    });
    expect(correct.isCorrect).toBe(true);
    expect(correct.badgeText).toBe("적중");
    expect(correct.resultClass).toBe("correct");
    expect(correct.expectedScoreText).toBe("예측: 70-74");

    const incorrect = buildPredictionCompareState({
      homeWin: true,
      teamPrediction: {
        home_win_prob: 50,
        away_predicted_pts: null,
        home_predicted_pts: undefined,
      },
    });
    expect(incorrect.isCorrect).toBe(false);
    expect(incorrect.badgeText).toBe("실패");
    expect(incorrect.resultClass).toBe("incorrect");
    expect(incorrect.expectedScoreText).toBe("예측: ---");
  });

  it("returns unavailable state when pregame prediction is missing", () => {
    const unavailable = buildPredictionCompareState({
      homeWin: true,
      teamPrediction: null,
    });
    expect(unavailable.isAvailable).toBe(false);
    expect(unavailable.badgeText).toBe("사전 예측 없음");
    expect(unavailable.resultClass).toBe("unavailable");
  });
});
