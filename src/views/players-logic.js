/** Pure helpers for players page filtering/sorting state. */
export function filterPlayers(
  players,
  { team = "all", pos = "all", search = "" },
) {
  const keyword = search.trim().toLowerCase();
  return players.filter((player) => {
    const matchTeam = team === "all" || player.team === team;
    const matchPos = pos === "all" || player.pos === pos;
    const matchSearch = !keyword || player.name.toLowerCase().includes(keyword);
    return matchTeam && matchPos && matchSearch;
  });
}

export function sortPlayers(players, { key, dir = "desc" }) {
  const isPctKey =
    String(key || "").includes("pct") ||
    ["fgp", "tpp", "ftp", "tpar", "ftr"].includes(key);
  const normalize = (value) => {
    const numeric = Number(value ?? 0);
    if (!isPctKey) return numeric;
    return numeric > 0 && numeric < 1 ? numeric * 100 : numeric;
  };

  return [...players].sort((a, b) => {
    const aVal = normalize(a[key]);
    const bVal = normalize(b[key]);
    return dir === "asc" ? aVal - bVal : bVal - aVal;
  });
}
