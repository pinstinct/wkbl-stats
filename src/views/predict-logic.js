/** Prediction math utilities shared by the predict page. */
function calcAvg(arr, key) {
  return arr.reduce((sum, g) => sum + (g[key] || 0), 0) / arr.length;
}

function calcStd(arr, key, avg) {
  const variance =
    arr.reduce((sum, g) => sum + Math.pow((g[key] || 0) - avg, 2), 0) /
    arr.length;
  return Math.sqrt(variance);
}

export function calculatePrediction(gamelog) {
  const games = gamelog.slice(0, 15);
  const recent5 = games.slice(0, 5);
  const recent10 = games.slice(0, 10);

  const recent5Avg = {
    pts: calcAvg(recent5, "pts"),
    reb: calcAvg(recent5, "reb"),
    ast: calcAvg(recent5, "ast"),
  };
  const recent10Avg = {
    pts: calcAvg(recent10, "pts"),
    reb: calcAvg(recent10, "reb"),
    ast: calcAvg(recent10, "ast"),
  };
  const seasonAvg = {
    pts: calcAvg(games, "pts"),
    reb: calcAvg(games, "reb"),
    ast: calcAvg(games, "ast"),
  };

  const predict = (key) => {
    const base = recent5Avg[key] * 0.6 + recent10Avg[key] * 0.4;
    const std = calcStd(games, key, seasonAvg[key]);
    const trendDiff = recent5Avg[key] - seasonAvg[key];
    const trendPct = seasonAvg[key] > 0 ? trendDiff / seasonAvg[key] : 0;

    let trend = "stable";
    let trendLabel = "보합";
    let trendBonus = 0;

    if (trendPct > 0.1) {
      trend = "up";
      trendLabel = "상승세 ↑";
      trendBonus = base * 0.05;
    } else if (trendPct < -0.1) {
      trend = "down";
      trendLabel = "하락세 ↓";
      trendBonus = -base * 0.05;
    }

    const predicted = base + trendBonus;
    const low = Math.max(0, predicted - std);
    const high = predicted + std;
    return { predicted, low, high, trend, trendLabel };
  };

  return {
    pts: predict("pts"),
    reb: predict("reb"),
    ast: predict("ast"),
    recent5Avg,
    recent10Avg,
    seasonAvg,
  };
}

export function buildPredictionCompareState({ homeWin, teamPrediction }) {
  const predictedHomeWin = teamPrediction.home_win_prob > 50;
  const isCorrect = homeWin === predictedHomeWin;
  const badgeText = isCorrect ? "적중" : "실패";
  const resultClass = isCorrect ? "correct" : "incorrect";
  const awayPts =
    teamPrediction.away_predicted_pts === null ||
    teamPrediction.away_predicted_pts === undefined
      ? "-"
      : teamPrediction.away_predicted_pts.toFixed(0);
  const homePts =
    teamPrediction.home_predicted_pts === null ||
    teamPrediction.home_predicted_pts === undefined
      ? "-"
      : teamPrediction.home_predicted_pts.toFixed(0);

  return {
    isCorrect,
    badgeText,
    resultClass,
    expectedScoreText: `예측: ${awayPts}-${homePts}`,
  };
}
