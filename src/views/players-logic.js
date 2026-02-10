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
  return [...players].sort((a, b) => {
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    return dir === "asc" ? aVal - bVal : bVal - aVal;
  });
}
