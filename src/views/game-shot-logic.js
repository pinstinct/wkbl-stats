/**
 * Normalize raw shot rows into frontend-friendly records.
 */
export function parseQuarterCode(rawQuarter) {
  if (rawQuarter === null || rawQuarter === undefined) {
    return { code: "Q0", period: 0, label: "Q0" };
  }

  if (typeof rawQuarter === "number" && Number.isFinite(rawQuarter)) {
    const period = Math.max(0, Math.trunc(rawQuarter));
    if (period <= 4) return { code: `Q${period}`, period, label: `Q${period}` };
    return { code: `OT${period - 4}`, period, label: `OT${period - 4}` };
  }

  const quarter = String(rawQuarter).trim().toUpperCase();
  const qMatch = quarter.match(/^Q(\d+)$/);
  if (qMatch) {
    const period = Number(qMatch[1]);
    return { code: `Q${period}`, period, label: `Q${period}` };
  }
  const otMatch = quarter.match(/^OT(\d*)$/);
  if (otMatch) {
    const otIndex = otMatch[1] ? Number(otMatch[1]) : 1;
    const period = 4 + otIndex;
    return { code: `OT${otIndex}`, period, label: `OT${otIndex}` };
  }

  const num = Number(quarter);
  if (Number.isFinite(num)) {
    return parseQuarterCode(num);
  }
  return { code: "Q0", period: 0, label: "Q0" };
}

export function normalizeGameShots(shots, playerNameMap = {}) {
  return (shots || []).map((shot) => {
    const q = parseQuarterCode(shot.quarter);
    return {
      playerId: shot.player_id,
      playerName: playerNameMap[shot.player_id] || shot.player_id || "Unknown",
      teamId: shot.team_id || "",
      quarter: q.period,
      quarterCode: q.code,
      quarterLabel: q.label,
      made: Number(shot.made) === 1,
      shotZone: shot.shot_zone || "unknown",
      x: Number(shot.x) || 0,
      y: Number(shot.y) || 0,
      gameMinute:
        shot.game_minute === null || shot.game_minute === undefined
          ? null
          : Number(shot.game_minute),
      gameSecond:
        shot.game_second === null || shot.game_second === undefined
          ? null
          : Number(shot.game_second),
    };
  });
}

/**
 * Apply shot chart filters.
 */
export function filterGameShots(
  shots,
  { playerId = "all", teamId = "all", result = "all", quarter = "all" } = {},
) {
  return (shots || []).filter((shot) => {
    if (playerId !== "all" && shot.playerId !== playerId) return false;
    if (teamId !== "all" && shot.teamId !== teamId) return false;
    if (result === "made" && !shot.made) return false;
    if (result === "miss" && shot.made) return false;
    if (quarter !== "all" && shot.quarter !== Number(quarter)) return false;
    return true;
  });
}

export function getQuarterLabel(quarter) {
  if (quarter <= 4) return `Q${quarter}`;
  return `OT${quarter - 4}`;
}

export function buildQuarterSelectOptions(shots) {
  const quarters = [
    ...new Set((shots || []).map((shot) => Number(shot.quarter))),
  ]
    .filter((quarter) => Number.isFinite(quarter) && quarter > 0)
    .sort((a, b) => a - b);

  return [
    { value: "all", label: "전체" },
    ...quarters.map((quarter) => ({
      value: String(quarter),
      label: quarter <= 4 ? `${quarter}Q` : getQuarterLabel(quarter),
    })),
  ];
}

/**
 * Compute aggregate summary for cards.
 */
export function summarizeGameShots(shots) {
  const attempts = (shots || []).length;
  const made = (shots || []).filter((shot) => shot.made).length;
  const missed = attempts - made;
  const fgPct = attempts > 0 ? Math.round((made / attempts) * 1000) / 10 : 0;
  return { attempts, made, missed, fgPct };
}

/**
 * Build shot zone series for bar chart.
 */
export function buildZoneSeries(shots) {
  const zoneDefs = [
    { key: "paint", label: "PAINT" },
    { key: "mid_range", label: "MID" },
    { key: "three_pt", label: "3PT" },
  ];

  const attemptsByZone = new Map();
  const madeByZone = new Map();

  for (const shot of shots || []) {
    const key = shot.shotZone;
    attemptsByZone.set(key, (attemptsByZone.get(key) || 0) + 1);
    if (shot.made) {
      madeByZone.set(key, (madeByZone.get(key) || 0) + 1);
    }
  }

  const labels = [];
  const attempts = [];
  const fgPct = [];

  for (const zone of zoneDefs) {
    const att = attemptsByZone.get(zone.key) || 0;
    const made = madeByZone.get(zone.key) || 0;
    labels.push(zone.label);
    attempts.push(att);
    fgPct.push(att > 0 ? Math.round((made / att) * 1000) / 10 : 0);
  }

  return { labels, attempts, fgPct };
}

export function buildZoneTableRows(shots) {
  const series = buildZoneSeries(shots);
  return series.labels.map((zone, idx) => {
    const attempts = series.attempts[idx] || 0;
    const pct = series.fgPct[idx] || 0;
    const made = Math.round((attempts * pct) / 100);
    return {
      zone,
      made,
      attempts,
      fgPct: pct,
    };
  });
}

/**
 * Build quarter series for stacked made/missed chart.
 */
export function buildQuarterSeries(shots) {
  const quarterMap = new Map();

  for (const shot of shots || []) {
    const q = Number(shot.quarter) || 0;
    if (!quarterMap.has(q)) {
      quarterMap.set(q, { made: 0, missed: 0 });
    }
    const bucket = quarterMap.get(q);
    if (shot.made) bucket.made += 1;
    else bucket.missed += 1;
  }

  const quarters = [...quarterMap.keys()].sort((a, b) => a - b);
  const labels = quarters.map((q) => getQuarterLabel(q));
  const made = quarters.map((q) => quarterMap.get(q).made);
  const missed = quarters.map((q) => quarterMap.get(q).missed);

  return { labels, made, missed };
}

function sanitizeFileToken(value) {
  return String(value || "all")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

export function buildShotChartExportName({
  gameId,
  filters = { teamId: "all", playerId: "all", result: "all", quarter: "all" },
}) {
  const team = sanitizeFileToken(filters.teamId || "all");
  const player = sanitizeFileToken(filters.playerId || "all");
  const result = sanitizeFileToken(filters.result || "all");
  const quarter =
    filters.quarter && filters.quarter !== "all"
      ? `q${sanitizeFileToken(filters.quarter)}`
      : "qall";
  return `shotchart_${sanitizeFileToken(gameId)}_${team}_${player}_${result}_${quarter}.png`;
}
