import { describe, expect, it } from "vitest";

import {
  renderCompareCards,
  renderCompareSelected,
  renderCompareSuggestions,
} from "./compare.js";

describe("compare view", () => {
  it("renders selected tags and suggestions", () => {
    const selected = { innerHTML: "" };
    const suggestions = { innerHTML: "" };

    renderCompareSelected({
      container: selected,
      selectedPlayers: [{ id: "p1", name: "선수1" }],
    });
    renderCompareSuggestions({
      container: suggestions,
      players: [{ id: "p1", name: "선수1", team: "A" }],
    });

    expect(selected.innerHTML).toContain("compare-tag");
    expect(suggestions.innerHTML).toContain("compare-suggestion-item");
  });

  it("escapes untrusted player fields in suggestions", () => {
    const suggestions = { innerHTML: "" };
    renderCompareSuggestions({
      container: suggestions,
      players: [
        {
          id: 'p1" onclick="x',
          name: '<img src=x onerror="x">',
          team: "<script>alert(1)</script>",
        },
      ],
    });

    expect(suggestions.innerHTML).not.toContain("<script>");
    expect(suggestions.innerHTML).toContain("&lt;img src=x onerror=");
    expect(suggestions.innerHTML).toContain(
      'data-id="p1&quot; onclick=&quot;x"',
    );
  });

  it("renders compare cards", () => {
    const cards = { innerHTML: "" };
    renderCompareCards({
      container: cards,
      players: [
        { id: "p1", name: "선수1", team: "A", gp: 1, pts: 1, reb: 2, ast: 3 },
      ],
      formatNumber: (v) => String(v),
    });
    expect(cards.innerHTML).toContain("compare-player-card");
  });

  it("renders empty selected state and suggestion fallbacks", () => {
    const selected = { innerHTML: "" };
    const suggestions = { innerHTML: "" };

    renderCompareSelected({ container: selected, selectedPlayers: [] });
    expect(selected.innerHTML).toContain("compare-hint");

    renderCompareSuggestions({
      container: suggestions,
      players: [],
      error: false,
    });
    expect(suggestions.innerHTML).toContain("검색 결과 없음");

    renderCompareSuggestions({
      container: suggestions,
      players: [],
      error: true,
    });
    expect(suggestions.innerHTML).toContain("검색 오류");
  });
});
