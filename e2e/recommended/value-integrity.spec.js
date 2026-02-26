import { test, expect } from "playwright/test";

import { gotoRoute, waitForViewVisible } from "../helpers/waiters.js";

async function pickPlayerWithPrediction(page) {
  await gotoRoute(page, "#/players");
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();
  const names = await page
    .locator("#statsTable tbody tr td:first-child a")
    .evaluateAll((els) =>
      els
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 8),
    );
  if (names.length === 0) {
    throw new Error("No players found for prediction integrity test");
  }

  await gotoRoute(page, "#/predict");
  for (const name of names) {
    await page.locator("#predictSearchInput").fill(name);
    const items = page.locator(
      "#predictSuggestions .predict-suggestion-item[data-id]",
    );
    try {
      await expect(items.first()).toBeVisible({ timeout: 1500 });
    } catch {
      continue;
    }

    const exact = page
      .locator("#predictSuggestions .predict-suggestion-item[data-id]")
      .filter({ hasText: name });
    if ((await exact.count()) > 0) {
      await exact.first().click();
    } else {
      await items.first().click();
    }
    await expect(page.locator("#predictResult")).toBeVisible();
    const errorCount = await page
      .locator("#predictPlayerInfo .predict-error")
      .count();
    const cardCount = await page
      .locator("#predictCards .predict-stat-card")
      .count();
    if (errorCount === 0 && cardCount >= 3) {
      return;
    }
  }
  throw new Error("Could not find a player with prediction cards");
}

test("[E2E-VALUE-001] @recommended players table row mirrors summary card identity", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();

  const first = page.locator("#statsTable tbody tr").first();
  const rowName = (await first.locator("td").nth(0).innerText()).trim();
  const rowTeam = (await first.locator("td").nth(1).innerText()).trim();
  const rowPos = (await first.locator("td").nth(2).innerText()).trim();

  await first.click();
  await expect(page.locator("#playerName")).toHaveText(rowName);
  await expect(page.locator("#playerTeam")).toHaveText(rowTeam);
  if (rowPos && rowPos !== "-") {
    await expect(page.locator("#playerPos")).toHaveText(rowPos);
  }
  await expect(page.locator("#playerGp")).toContainText("경기");
});

test("[E2E-VALUE-002] @recommended standings row values stay consistent on team detail header", async ({
  page,
}) => {
  await gotoRoute(page, "#/teams");
  const first = page.locator("#standingsBody tr").first();
  await expect(first).toBeVisible();

  const rank = (await first.locator("td").nth(0).innerText()).trim();
  const team = (await first.locator("td").nth(1).innerText()).trim();
  const wins = (await first.locator("td").nth(3).innerText()).trim();
  const losses = (await first.locator("td").nth(4).innerText()).trim();
  const winPct = (await first.locator("td").nth(5).innerText()).trim();

  await first.locator("td a").first().click();
  await waitForViewVisible(page, "team");
  await expect(page.locator("#teamDetailName")).toHaveText(team);
  await expect(page.locator("#teamDetailStanding")).toContainText(`${rank}위`);
  await expect(page.locator("#teamDetailStanding")).toContainText(
    `${wins}승 ${losses}패`,
  );
  await expect(page.locator("#teamDetailStanding")).toContainText(winPct);
});

test("[E2E-VALUE-003] @recommended games list card score matches boxscore header score", async ({
  page,
}) => {
  await gotoRoute(page, "#/games");
  const card = page.locator("#gamesList a.game-card").first();
  await expect(card).toBeVisible();

  const awayScore = (
    await card.locator(".game-card-team.away .game-card-score").innerText()
  ).trim();
  const homeScore = (
    await card.locator(".game-card-team.home .game-card-score").innerText()
  ).trim();

  await card.click();
  await waitForViewVisible(page, "game");
  await expect(page.locator("#boxscoreAwayScore")).toHaveText(awayScore);
  await expect(page.locator("#boxscoreHomeScore")).toHaveText(homeScore);
});

test("[E2E-VALUE-004] @recommended prediction cards keep value within displayed range", async ({
  page,
}) => {
  await pickPlayerWithPrediction(page);

  const cards = page.locator("#predictCards .predict-stat-card");
  await expect(cards.first()).toBeVisible();
  const values = await cards.evaluateAll((els) => {
    const parseNum = (text) => {
      const n = Number(String(text || "").trim());
      return Number.isFinite(n) ? n : null;
    };
    return els.map((el) => {
      const value = parseNum(
        el.querySelector(".predict-stat-value")?.textContent || "",
      );
      const rangeText = (
        el.querySelector(".predict-stat-range")?.textContent || ""
      ).replace(/\s/g, "");
      const [lowRaw, highRaw] = rangeText.split("-");
      const low = parseNum(lowRaw);
      const high = parseNum(highRaw);
      return { value, low, high };
    });
  });

  for (const row of values) {
    expect(row.value).not.toBeNull();
    expect(row.low).not.toBeNull();
    expect(row.high).not.toBeNull();
    expect(row.low).toBeLessThanOrEqual(row.value);
    expect(row.value).toBeLessThanOrEqual(row.high);
  }
});
