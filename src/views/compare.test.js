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
});
