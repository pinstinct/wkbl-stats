import { describe, expect, it } from "vitest";

import { encodeRouteParam, escapeAttr, escapeHtml } from "./html.js";

describe("html helpers", () => {
  it("escapes html special characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;",
    );
  });

  it("escapes attribute values", () => {
    expect(escapeAttr(`" onclick="evil()"`)).toBe(
      "&quot; onclick=&quot;evil()&quot;",
    );
  });

  it("encodes route params safely", () => {
    expect(encodeRouteParam(`p1"><script>`)).toBe("p1%22%3E%3Cscript%3E");
  });
});
