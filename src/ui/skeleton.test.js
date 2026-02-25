import { describe, expect, it } from "vitest";

import { hideSkeleton } from "./skeleton.js";

describe("hideSkeleton", () => {
  it("adds skeleton-hidden class to the element", () => {
    const el = { classList: { add: () => {}, contains: () => false } };
    const calls = [];
    el.classList.add = (cls) => calls.push(cls);

    hideSkeleton(el);

    expect(calls).toContain("skeleton-hidden");
  });

  it("does nothing when element is null", () => {
    // Should not throw
    hideSkeleton(null);
  });

  it("does nothing when element is undefined", () => {
    hideSkeleton(undefined);
  });
});
