import { describe, expect, it } from "vitest";

import { getDayCountdownLabel } from "./schedule-logic.js";

describe("schedule countdown logic", () => {
  it("returns D-Day when target is today", () => {
    const now = new Date("2026-02-09T09:00:00");
    expect(getDayCountdownLabel("2026-02-09", now)).toBe("D-Day");
  });

  it("returns D-N for future date", () => {
    const now = new Date("2026-02-09T09:00:00");
    expect(getDayCountdownLabel("2026-02-11", now)).toBe("D-2");
  });

  it("returns D+N for past date", () => {
    const now = new Date("2026-02-09T09:00:00");
    expect(getDayCountdownLabel("2026-02-07", now)).toBe("D+2");
  });
});
