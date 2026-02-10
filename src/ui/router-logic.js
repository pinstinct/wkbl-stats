/**
 * Parse hash route to the app's normalized route object.
 * Example: "#/players/095912" -> { path: "players", id: "095912" }
 */
export function getRouteFromHash(hash) {
  const trimmed = (hash || "").replace(/^#/, "") || "/";
  const parts = trimmed.split("/").filter(Boolean);
  return { path: parts[0] || "", id: parts[1] || null };
}

/**
 * Determine whether a nav link should be active for current route path.
 */
export function isNavLinkActive(href, currentPath) {
  const normalizedHref = String(href || "").replace(/^#/, "");
  const linkPath = normalizedHref.split("/")[1] || "";
  return linkPath === currentPath || (linkPath === "" && currentPath === "");
}

/**
 * Map a route path/id to a view id and loader action.
 * This keeps route decision logic pure and testable.
 */
export function resolveRouteTarget(path, id) {
  if (path === "players") {
    return id
      ? { view: "player", action: "loadPlayerPage" }
      : { view: "players", action: "loadPlayersPage" };
  }
  if (path === "teams") {
    return id
      ? { view: "team", action: "loadTeamPage" }
      : { view: "teams", action: "loadTeamsPage" };
  }
  if (path === "games") {
    return id
      ? { view: "game", action: "loadGamePage" }
      : { view: "games", action: "loadGamesPage" };
  }
  if (path === "leaders") return { view: "leaders", action: "loadLeadersPage" };
  if (path === "compare") return { view: "compare", action: "loadComparePage" };
  if (path === "schedule")
    return { view: "schedule", action: "loadSchedulePage" };
  if (path === "predict") return { view: "predict", action: "loadPredictPage" };
  return { view: "main", action: "loadMainPage" };
}
