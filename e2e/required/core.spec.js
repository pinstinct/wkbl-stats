import { test, expect } from "playwright/test";

import {
  gotoRoute,
  waitForAppReady,
  waitForViewVisible,
} from "../helpers/waiters.js";

test("[E2E-CORE-001] @required @smoke app boot renders main view", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await waitForViewVisible(page, "main");
  await expect(page.locator("#mainPredictionTitle")).toBeVisible();
});

test("[E2E-CORE-002] @required skeleton is hidden after app init", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await waitForAppReady(page);
});

test("[E2E-NAV-001] @required nav route players", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/players']").click();
  await waitForViewVisible(page, "players");
});

test("[E2E-NAV-002] @required nav route teams", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/teams']").click();
  await waitForViewVisible(page, "teams");
});

test("[E2E-NAV-003] @required nav route games", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/games']").click();
  await waitForViewVisible(page, "games");
});

test("[E2E-NAV-004] @required nav route schedule", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/schedule']").click();
  await waitForViewVisible(page, "schedule");
});

test("[E2E-NAV-005] @required nav route leaders", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/leaders']").click();
  await waitForViewVisible(page, "leaders");
});

test("[E2E-NAV-006] @required nav route compare", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/compare']").click();
  await waitForViewVisible(page, "compare");
});

test("[E2E-NAV-007] @required nav route predict", async ({ page }) => {
  await gotoRoute(page, "#/");
  await page.locator("a.nav-link[href='#/predict']").click();
  await waitForViewVisible(page, "predict");
});

test("[E2E-ROUTE-001] @required unknown route falls back to main", async ({
  page,
}) => {
  await gotoRoute(page, "#/not-existing-route");
  await waitForViewVisible(page, "main");
});
