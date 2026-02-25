import { test, expect } from "playwright/test";

import {
  gotoRoute,
  waitForAppReady,
  waitForViewVisible,
} from "../helpers/waiters.js";

test("[E2E-MOBILE-001] @optional mobile nav toggle opens menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, "#/");
  await page.locator("#navToggle").click();
  await expect(page.locator("#mainNav")).toHaveClass(/open/);
});

test("[E2E-MOBILE-002] @optional mobile nav toggle closes menu", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoRoute(page, "#/");
  await page.locator("#navToggle").click();
  await page.locator("#navToggle").click();
  await expect(page.locator("#mainNav")).not.toHaveClass(/open/);
});

test("[E2E-DETAIL-003] @optional direct game detail hash route", async ({
  page,
}) => {
  await gotoRoute(page, "#/games/04601001");
  await waitForViewVisible(page, "game");
});

test("[E2E-PREDICT-002] @optional direct predict deep-link hash route", async ({
  page,
}) => {
  await gotoRoute(page, "#/predict/095001");
  await waitForViewVisible(page, "predict");
});

test("[E2E-SEARCH-003] @optional ctrl+k opens global search", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#searchModal")).toBeVisible();
});

test("[E2E-SCHEDULE-002] @optional schedule season selector has options", async ({
  page,
}) => {
  await gotoRoute(page, "#/schedule");
  await expect(page.locator("#scheduleSeasonSelect option")).toHaveCount(6);
});

test("[E2E-LEADERS-001] @optional leaders page shell visible", async ({
  page,
}) => {
  await gotoRoute(page, "#/leaders");
  await expect(page.locator("#leadersGrid")).toBeVisible();
});

test("[E2E-COMPARE-002] @optional compare clear input keeps button disabled", async ({
  page,
}) => {
  await gotoRoute(page, "#/compare");
  const input = page.locator("#compareSearchInput");
  await input.fill("선수");
  await input.clear();
  await expect(page.locator("#compareBtn")).toBeDisabled();
});

test("[E2E-ROUTE-002] @optional repeated hash transitions keep app responsive", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await page.goto("/#/players");
  await page.goto("/#/teams");
  await page.goto("/#/games");
  await page.goto("/#/schedule");
  await waitForViewVisible(page, "schedule");
});

test("[E2E-RESILIENCE-001] @optional reload preserves bootstrap path", async ({
  page,
}) => {
  await gotoRoute(page, "#/players");
  await page.reload();
  await waitForAppReady(page);
  await waitForViewVisible(page, "players");
});
