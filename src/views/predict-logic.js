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

function calcGameScore(g) {
  return (
    (g.pts || 0) +
    0.4 * (g.fgm || 0) -
    0.7 * (g.fga || 0) -
    0.4 * ((g.fta || 0) - (g.ftm || 0)) +
    0.7 * (g.off_reb || 0) +
    0.3 * (g.def_reb || 0) +
    (g.stl || 0) +
    0.7 * (g.ast || 0) +
    0.7 * (g.blk || 0) -
    0.4 * (g.pf || 0) -
    (g.tov || 0)
  );
}

function gsWeightedAvg(games, key) {
  if (!games.length) return 0;
  let totalW = 0,
    totalV = 0;
  for (const g of games) {
    const w = Math.max(0.1, calcGameScore(g));
    totalW += w;
    totalV += (g[key] || 0) * w;
  }
  return totalW > 0 ? totalV / totalW : 0;
}

export function calculatePrediction(gamelog) {
  const games = gamelog.slice(0, 15);
  const recent5 = games.slice(0, 5);
  const recent10 = games.slice(0, 10);

  const stats = ["pts", "reb", "ast", "stl", "blk"];

  const recent5Avg = {};
  const recent10Avg = {};
  const seasonAvg = {};
  for (const key of stats) {
    recent5Avg[key] = gsWeightedAvg(recent5, key);
    recent10Avg[key] = gsWeightedAvg(recent10, key);
    seasonAvg[key] = calcAvg(games, key);
  }

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

  const result = { recent5Avg, recent10Avg, seasonAvg };
  for (const key of stats) {
    result[key] = predict(key);
  }
  return result;
}

export function buildPredictionCompareState({ homeWin, teamPrediction }) {
  if (
    !teamPrediction ||
    teamPrediction.home_win_prob === null ||
    teamPrediction.home_win_prob === undefined
  ) {
    return {
      isAvailable: false,
      isCorrect: false,
      badgeText: "사전 예측 없음",
      resultClass: "unavailable",
      expectedScoreText: "사전 예측 없음",
    };
  }

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
    isAvailable: true,
    isCorrect,
    badgeText,
    resultClass,
    expectedScoreText: `예측: ${awayPts}-${homePts}`,
  };
}
