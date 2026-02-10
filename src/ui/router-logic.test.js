import { describe, expect, it } from "vitest";

import {
  getRouteFromHash,
  isNavLinkActive,
  resolveRouteTarget,
} from "./router-logic.js";

describe("router logic", () => {
  it("parses hash route path and id", () => {
    expect(getRouteFromHash("#/players/095912")).toEqual({
      path: "players",
      id: "095912",
    });
    expect(getRouteFromHash("#/teams")).toEqual({ path: "teams", id: null });
    expect(getRouteFromHash("#/")).toEqual({ path: "", id: null });
    expect(getRouteFromHash("")).toEqual({ path: "", id: null });
  });

  it("determines nav link active state from current route path", () => {
    expect(isNavLinkActive("#/", "")).toBe(true);
    expect(isNavLinkActive("#/players", "players")).toBe(true);
    expect(isNavLinkActive("#/players", "teams")).toBe(false);
  });

  it("resolves route target and action key", () => {
    expect(resolveRouteTarget("", null)).toEqual({
      view: "main",
      action: "loadMainPage",
    });
    expect(resolveRouteTarget("players", null)).toEqual({
      view: "players",
      action: "loadPlayersPage",
    });
    expect(resolveRouteTarget("players", "095912")).toEqual({
      view: "player",
      action: "loadPlayerPage",
    });
    expect(resolveRouteTarget("unknown", null)).toEqual({
      view: "main",
      action: "loadMainPage",
    });
  });
});
