/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("seasons bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    delete window.WKBLShared;
  });

  it("publishes frozen shared season config to window", async () => {
    await import("./seasons.js");

    expect(window.WKBLShared).toBeDefined();
    expect(Object.isFrozen(window.WKBLShared)).toBe(true);
    expect(Object.isFrozen(window.WKBLShared.SEASON_CODES)).toBe(true);
    expect(window.WKBLShared.DEFAULT_SEASON).toBe("046");
    expect(window.WKBLShared.SEASON_CODES["046"]).toBe("2025-26");
  });
});
