import { test, expect } from "playwright/test";

import { gotoRoute } from "../helpers/waiters.js";

async function pickTwoComparePlayers(page) {
  await gotoRoute(page, "#/players");
  const names = await page
    .locator("#statsTable tbody tr td:first-child a")
    .evaluateAll((els) =>
      els.slice(0, 2).map((el) => el.textContent?.trim() || ""),
    );
  if (names.length < 2 || !names[0] || !names[1]) {
    throw new Error("Could not read two player names from players table.");
  }

  await gotoRoute(page, "#/compare");
  for (const name of names) {
    await page.locator("#compareSearchInput").fill(name);
    const items = page.locator(
      "#compareSuggestions .compare-suggestion-item[data-id]",
    );
    await expect(items.first()).toBeVisible();
    await items.first().click();
  }
}

test("[E2E-LEADERS-002] @recommended leaders excludes WS/40 card", async ({
  page,
}) => {
  await gotoRoute(page, "#/leaders");
  const cardTitles = await page
    .locator("#leadersGrid .leader-card h3")
    .allTextContents();
  expect(cardTitles).not.toContain("WS/40");
});

test("[E2E-COMPARE-003] @recommended compare shows WS-family values (not '-')", async ({
  page,
}) => {
  await pickTwoComparePlayers(page);

  await expect(page.locator("#compareBtn")).toBeEnabled();
  await page.locator("#compareBtn").click();
  await expect(page.locator("#compareResult")).toBeVisible();

  const wsRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("#compareTableBody tr"));
    const labels = ["OWS", "DWS", "WS", "WS/40"];
    const out = {};

    for (const label of labels) {
      const row = rows.find((r) => {
        const first = r.querySelector("td");
        return first && first.textContent?.trim() === label;
      });
      if (!row) {
        out[label] = { exists: false, dashCount: 99, cellCount: 0 };
        continue;
      }
      const cells = Array.from(row.querySelectorAll("td")).slice(1);
      const dashCount = cells.filter(
        (c) => c.textContent?.trim() === "-",
      ).length;
      out[label] = { exists: true, dashCount, cellCount: cells.length };
    }

    return out;
  });

  for (const label of ["OWS", "DWS", "WS", "WS/40"]) {
    expect(wsRows[label].exists, `${label} row missing`).toBe(true);
    expect(
      wsRows[label].cellCount,
      `${label} has no player cells`,
    ).toBeGreaterThan(0);
    expect(wsRows[label].dashCount, `${label} rendered as '-'`).toBe(0);
  }
});

test("[E2E-PLAYERS-003] @recommended advanced stats avoid >=90% zero collapse", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  await page.locator(".tab-btn[data-tab='advanced']").click();
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();

  const result = await page.evaluate(() => {
    const headers = Array.from(
      document.querySelectorAll("#statsTable thead th"),
    );
    const rows = Array.from(document.querySelectorAll("#statsTable tbody tr"));

    const metrics = [
      "ast_pct",
      "stl_pct",
      "blk_pct",
      "ows",
      "dws",
      "ws",
      "ws_40",
    ];
    const summary = {};

    const parseNum = (text) => {
      const cleaned = String(text || "")
        .replace(/,/g, "")
        .replace(/\+/g, "")
        .trim();
      const value = Number(cleaned);
      return Number.isFinite(value) ? value : null;
    };

    for (const key of metrics) {
      const idx = headers.findIndex((h) => h.getAttribute("data-key") === key);
      if (idx < 0) {
        summary[key] = {
          found: false,
          nonMissing: 0,
          zeroRatio: 1,
          uniqueShown: 0,
        };
        continue;
      }

      const vals = [];
      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (idx >= cells.length) continue;
        const raw = cells[idx].textContent?.trim();
        if (!raw || raw === "-") continue;
        const parsed = parseNum(raw);
        if (parsed === null) continue;
        vals.push(parsed);
      }

      const zeros = vals.filter((v) => Math.abs(v) < 1e-12).length;
      summary[key] = {
        found: true,
        nonMissing: vals.length,
        zeroRatio: vals.length ? zeros / vals.length : 1,
        uniqueShown: new Set(vals.map((v) => v.toString())).size,
      };
    }

    return summary;
  });

  for (const key of ["ows", "dws", "ws", "ws_40"]) {
    expect(result[key].found, `${key} column missing`).toBe(true);
    expect(
      result[key].nonMissing,
      `${key} has too few values`,
    ).toBeGreaterThanOrEqual(10);
    expect(result[key].zeroRatio, `${key} zero ratio is >= 90%`).toBeLessThan(
      0.9,
    );
    expect(
      result[key].uniqueShown,
      `${key} shown values are not diverse`,
    ).toBeGreaterThan(1);
  }
});
