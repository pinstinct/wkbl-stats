import { test, expect } from "playwright/test";

import { gotoRoute, waitForViewVisible } from "../helpers/waiters.js";

test("[E2E-PLAYERS-001] @recommended players search input accepts text", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  const input = page.locator("#searchInput");
  await input.fill("김");
  await expect(input).toHaveValue("김");
});

test("[E2E-PLAYERS-002] @recommended players table sort header clickable", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  await page.locator("#statsTable th[data-key='pts']").click();
  await expect(page.locator("#statsTable")).toBeVisible();
});

test("[E2E-TEAMS-001] @recommended standings sort header clickable", async ({
  page,
}) => {
  await gotoRoute(page, "#/teams");
  await page.locator("#standingsTable th[data-key='wins']").click();
  await expect(page.locator("#standingsTable")).toBeVisible();
});

test("[E2E-SCHEDULE-001] @recommended schedule team filter is available", async ({
  page,
}) => {
  await gotoRoute(page, "#/schedule");
  await expect(page.locator("#scheduleTeamSelect")).toBeVisible();
  const optionCount = await page.locator("#scheduleTeamSelect option").count();
  expect(optionCount).toBeGreaterThan(0);
});

test("[E2E-COMPARE-001] @recommended compare button is disabled initially", async ({
  page,
}) => {
  await gotoRoute(page, "#/compare");
  await expect(page.locator("#compareBtn")).toBeDisabled();
});

test("[E2E-PREDICT-001] @recommended predict search input accepts text", async ({
  page,
}) => {
  await gotoRoute(page, "#/predict");
  const input = page.locator("#predictSearchInput");
  await input.fill("가드");
  await expect(input).toHaveValue("가드");
});

test("[E2E-SEARCH-001] @recommended global search button opens modal", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await page.locator("#globalSearchBtn").click();
  await expect(page.locator("#searchModal")).toBeVisible();
});

test("[E2E-SEARCH-002] @recommended backdrop closes global search modal", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await page.locator("#globalSearchBtn").click();
  await page.locator(".search-modal-backdrop").click();
  await expect(page.locator("#searchModal")).toBeHidden();
});

test("[E2E-DETAIL-001] @recommended direct player detail hash route", async ({
  page,
}) => {
  await gotoRoute(page, "#/players/095001");
  await waitForViewVisible(page, "player");
});

test("[E2E-DETAIL-002] @recommended direct team detail hash route", async ({
  page,
}) => {
  await gotoRoute(page, "#/teams/kb");
  await waitForViewVisible(page, "team");
});
