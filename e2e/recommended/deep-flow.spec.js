import { test, expect } from "playwright/test";

import { gotoRoute, waitForViewVisible } from "../helpers/waiters.js";

async function getTwoPlayerNames(page) {
  await gotoRoute(page, "#/players");
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();
  const names = await page
    .locator("#statsTable tbody tr td:first-child a")
    .evaluateAll((els) =>
      els
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, 2),
    );
  if (names.length < 2) {
    throw new Error("Expected at least two players in players table");
  }
  return names;
}

test("[E2E-PLAYERS-004] @recommended players advanced tab renders advanced headers and rows", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();
  await page.locator(".tab-btn[data-tab='advanced']").click();

  await expect(
    page.locator("#statsTable thead th[data-key='per']"),
  ).toBeVisible();
  await expect(
    page.locator("#statsTable thead th[data-key='ws']"),
  ).toBeVisible();
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();
});

test("[E2E-PLAYERS-005] @recommended players row click updates summary card", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  const firstName = (
    await page
      .locator("#statsTable tbody tr td:first-child a")
      .first()
      .textContent()
  )?.trim();
  expect(firstName).toBeTruthy();

  await page.locator("#statsTable tbody tr").first().click();
  await expect(page.locator("#playerName")).toHaveText(firstName || "");
});

test("[E2E-TEAMS-002] @recommended standings team link opens team detail with roster", async ({
  page,
}) => {
  await gotoRoute(page, "#/teams");
  await expect(page.locator("#standingsBody tr").first()).toBeVisible();

  await page.locator("#standingsBody tr td a").first().click();
  await waitForViewVisible(page, "team");
  await expect(page.locator("#teamDetailName")).not.toHaveText("-");
  await expect(page.locator("#teamRosterBody tr").first()).toBeVisible();
});

test("[E2E-GAMES-001] @recommended games list card opens game detail route", async ({
  page,
}) => {
  await gotoRoute(page, "#/games");
  await expect(page.locator("#gamesList a.game-card").first()).toBeVisible();

  await page.locator("#gamesList a.game-card").first().click();
  await waitForViewVisible(page, "game");
  await expect(page.locator("#boxscoreDate")).toBeVisible();
});

test("[E2E-SCHEDULE-003] @recommended schedule team filter updates list region without crash", async ({
  page,
}) => {
  await gotoRoute(page, "#/schedule");
  await waitForViewVisible(page, "schedule");

  const optionCount = await page.locator("#scheduleTeamSelect option").count();
  expect(optionCount).toBeGreaterThan(0);
  if (optionCount > 1) {
    await page.locator("#scheduleTeamSelect").selectOption({ index: 1 });
  }

  await expect(page.locator("#upcomingGamesList")).toBeVisible();
  await expect(page.locator("#recentResultsList")).toBeVisible();
});

test("[E2E-COMPARE-004] @recommended compare execution renders table and cards for selected players", async ({
  page,
}) => {
  const [nameA, nameB] = await getTwoPlayerNames(page);

  await gotoRoute(page, "#/compare");
  for (const name of [nameA, nameB]) {
    await page.locator("#compareSearchInput").fill(name);
    const item = page.locator(
      "#compareSuggestions .compare-suggestion-item[data-id]",
    );
    await expect(item.first()).toBeVisible();
    await item.first().click();
  }

  await expect(page.locator("#compareBtn")).toBeEnabled();
  await page.locator("#compareBtn").click();
  await expect(page.locator("#compareResult")).toBeVisible();
  await expect(page.locator("#compareCards .compare-player-card")).toHaveCount(
    2,
  );
  const rowCount = await page.locator("#compareTableBody tr").count();
  expect(rowCount).toBeGreaterThan(10);
});

test("[E2E-PREDICT-003] @recommended predict selection renders player info and result panel", async ({
  page,
}) => {
  const [name] = await getTwoPlayerNames(page);

  await gotoRoute(page, "#/predict");
  await page.locator("#predictSearchInput").fill(name);
  const suggestion = page.locator(
    "#predictSuggestions .predict-suggestion-item[data-id]",
  );
  await expect(suggestion.first()).toBeVisible();
  await suggestion.first().click();

  await expect(page.locator("#predictResult")).toBeVisible();
  await expect(page.locator("#predictPlayerInfo")).toContainText(name);
});

test("[E2E-SEARCH-004] @recommended global search keyboard selection navigates to detail route", async ({
  page,
}) => {
  const [name] = await getTwoPlayerNames(page);

  await gotoRoute(page, "#/");
  await page.locator("#globalSearchBtn").click();
  await expect(page.locator("#searchModal")).toBeVisible();

  await page.locator("#globalSearchInput").fill(name);
  await expect(page.locator(".search-result-item").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(page.locator("#searchModal")).toBeHidden();
  await expect(page).toHaveURL(/#\/(players|teams)\//);
});
