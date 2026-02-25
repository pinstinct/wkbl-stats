import { describe, expect, it } from "vitest";

import { renderPlayerSummaryCard, renderPlayersTable } from "./players.js";

describe("players view", () => {
  it("renders player table rows", () => {
    const tbody = { innerHTML: "" };
    const thead = { innerHTML: "" };
    renderPlayersTable({
      tbody,
      thead,
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
    expect(thead.innerHTML).toContain("코트마진");
  });

  it("renders advanced tab columns and signed advanced metrics", () => {
    const tbody = { innerHTML: "" };
    const thead = { innerHTML: "" };
    renderPlayersTable({
      tbody,
      thead,
      activeTab: "advanced",
      players: [
        {
          id: "p2",
          name: "선수2",
          team: "B",
          pos: "F",
          per: 16.2,
          game_score: 12.4,
          usg_pct: 21.1,
          tov_pct: 11.5,
          off_rtg: 109.1,
          def_rtg: 103.3,
          net_rtg: 5.8,
          oreb_pct: 6.2,
          dreb_pct: 18.4,
          reb_pct: 12.3,
          ast_pct: 15.6,
          stl_pct: 2.7,
          blk_pct: 1.3,
          ws: 3.4,
          plus_minus_per_game: -1.2,
          plus_minus_per100: 4.5,
        },
      ],
      formatNumber: (v) => String(v ?? "-"),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}`),
    });

    expect(thead.innerHTML).toContain("PER");
    expect(thead.innerHTML).toContain("GmSc");
    expect(tbody.innerHTML).toContain("+4.5");
    expect(tbody.innerHTML).toContain("-1.2");
  });

  it("renders summary card with tier2 stats and missing birth date", () => {
    const byId = new Map();
    const getById = (id) => {
      if (!byId.has(id)) byId.set(id, { textContent: "", innerHTML: "" });
      return byId.get(id);
    };
    const originalDocument = globalThis.document;
    globalThis.document = {
      createElement: () => ({
        className: "",
        innerHTML: "",
        querySelector: () => ({ innerHTML: "" }),
      }),
    };

    const statGrid = {
      innerHTML: "",
      append: (...nodes) => {
        statGrid.nodes = nodes;
      },
    };
    byId.set("playerStatGrid", statGrid);

    renderPlayerSummaryCard({
      player: {
        id: "p1",
        name: "요약선수",
        team: "A",
        pos: "G",
        height: "170",
        birth_date: null,
        gp: 10,
        pts: 12,
        reb: 4,
        ast: 5,
        net_rtg: 3.1,
      },
      getById,
      primaryStats: [{ key: "pts", label: "PTS", desc: "", format: "number" }],
      advancedStats: [
        { key: "net_rtg", label: "Net", desc: "", format: "signed" },
      ],
      tier2Stats: [{ key: "reb", label: "REB", desc: "", format: "number" }],
      formatNumber: (v) => String(v ?? "-"),
      formatPct: (v) => `${Math.round((v ?? 0) * 100)}%`,
      formatSigned: (v) => (v == null ? "-" : `${v >= 0 ? "+" : ""}${v}`),
      calculateAge: () => 25,
    });

    expect(getById("playerName").textContent).toBe("요약선수");
    expect(getById("playerBirth").textContent).toBe("-");
    expect(getById("playerGp").textContent).toContain("10");
    expect(Array.isArray(statGrid.nodes)).toBe(true);

    if (originalDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  });
});
