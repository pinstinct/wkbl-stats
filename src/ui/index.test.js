import { describe, expect, it } from "vitest";

import * as ui from "./index.js";

describe("ui barrel exports", () => {
  it("exposes routing and event helpers", () => {
    expect(ui).toEqual(
      expect.objectContaining({
        mountResponsiveNav: expect.any(Function),
        mountCompareEvents: expect.any(Function),
        mountGlobalSearchEvents: expect.any(Function),
        mountPlayersTableSortEvents: expect.any(Function),
        mountPredictEvents: expect.any(Function),
        getRouteFromHash: expect.any(Function),
        isNavLinkActive: expect.any(Function),
        resolveRouteTarget: expect.any(Function),
      }),
    );
  });
});
