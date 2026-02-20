import { parseQuarterCode } from "./game-shot-logic.js";

const ZONE_LABELS = {
  paint: "PAINT",
  mid_range: "MID",
  three_pt: "3PT",
  unknown: "UNKNOWN",
};

export function normalizePlayerShots(rows = []) {
  return rows.map((row) => {
    const q = parseQuarterCode(row.quarter);
    return {
      gameId: row.game_id,
      gameDate: row.game_date || null,
      opponent: row.opponent_name || "-",
      quarter: q.period,
      quarterLabel: q.label,
      made: Number(row.made) === 1,
      shotZone: row.shot_zone || "unknown",
      x: Number(row.x) || 0,
      y: Number(row.y) || 0,
      gameMinute:
        row.game_minute === null || row.game_minute === undefined
          ? null
          : Number(row.game_minute),
      gameSecond:
        row.game_second === null || row.game_second === undefined
          ? null
          : Number(row.game_second),
    };
  });
}

export function filterPlayerShots(
  shots,
  { result = "all", quarter = "all", zone = "all" } = {},
) {
  return (shots || []).filter((shot) => {
    if (result === "made" && !shot.made) return false;
    if (result === "miss" && shot.made) return false;
    if (quarter !== "all" && shot.quarter !== Number(quarter)) return false;
    if (zone !== "all" && shot.shotZone !== zone) return false;
    return true;
  });
}

export function buildPlayerShotZoneOptions(shots = []) {
  const zones = [...new Set(shots.map((shot) => shot.shotZone))];
  const order = ["paint", "mid_range", "three_pt", "unknown"];
  zones.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [
    { value: "all", label: "전체" },
    ...zones.map((zone) => ({
      value: zone,
      label: ZONE_LABELS[zone] || zone.toUpperCase(),
    })),
  ];
}
