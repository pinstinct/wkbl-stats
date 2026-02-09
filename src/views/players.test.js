import { describe, expect, it } from "vitest";

import { renderPlayersTable } from "./players.js";

describe("players view", () => {
  it("renders player table rows", () => {
    const tbody = { innerHTML: "" };
    renderPlayersTable({
      tbody,
      players: [
        {
          id: "p1",
          name: "선수1",
          team: "A",
          gp: 1,
          min: 20,
          pts: 10,
          reb: 5,
          ast: 3,
          stl: 1,
          blk: 0,
          tov: 1,
          fgp: 0.5,
          tpp: 0.4,
          ftp: 0.9,
          ts_pct: 0.6,
          efg_pct: 0.55,
          ast_to: 3,
          pir: 15,
          pts36: 18,
          reb36: 9,
          ast36: 5,
        },
      ],
      formatNumber: (v) => String(v ?? "-"),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}`),
    });

    expect(tbody.innerHTML).toContain('href="#/players/p1"');
    expect(tbody.innerHTML).toContain("선수1");
  });
});
