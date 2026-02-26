import { test, expect } from "playwright/test";

import {
  gotoRoute,
  waitForAppReady,
  waitForViewVisible,
} from "../helpers/waiters.js";

async function getPlayerNames(page, count = 5) {
  await gotoRoute(page, "#/players");
  await expect(page.locator("#statsTable tbody tr").first()).toBeVisible();
  const names = await page
    .locator("#statsTable tbody tr td:first-child a")
    .evaluateAll((els, limit) => {
      return els
        .map((el) => el.textContent?.trim() || "")
        .filter(Boolean)
        .slice(0, limit);
    }, count);
  if (names.length < count) {
    throw new Error(`Expected at least ${count} players for resilience test`);
  }
  return names;
}

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

test("[E2E-RESILIENCE-002] @optional predict invalid deep-link shows graceful error state", async ({
  page,
}) => {
  await gotoRoute(page, "#/predict/__missing_player_for_e2e__");
  await waitForViewVisible(page, "predict");
  await expect(page.locator("#predictResult")).toBeVisible();
  await expect(page.locator("#predictPlayerInfo")).toContainText(
    "선수 정보를 불러오지 못했습니다",
  );
});

test("[E2E-RESILIENCE-003] @optional global search escape closes modal and reopen resets state", async ({
  page,
}) => {
  await gotoRoute(page, "#/");
  await page.locator("#globalSearchBtn").click();
  await expect(page.locator("#searchModal")).toBeVisible();

  await page.locator("#globalSearchInput").fill("zzzzzz_no_hit_query");
  await expect(
    page.locator("#globalSearchResults .search-no-results"),
  ).toBeVisible();

  await page.locator("#globalSearchInput").press("Escape");
  await expect(page.locator("#searchModal")).toBeHidden();

  await page.locator("#globalSearchBtn").click();
  await expect(page.locator("#searchModal")).toBeVisible();
  await expect(page.locator("#globalSearchInput")).toHaveValue("");
  await expect(
    page.locator("#globalSearchResults .search-no-results"),
  ).toHaveCount(0);
});

test("[E2E-RESILIENCE-004] @optional compare enforces four-player cap and remove interaction", async ({
  page,
}) => {
  const names = await getPlayerNames(page, 5);
  await gotoRoute(page, "#/compare");

  for (const name of names.slice(0, 4)) {
    await page.locator("#compareSearchInput").fill(name);
    const item = page.locator(
      "#compareSuggestions .compare-suggestion-item[data-id]",
    );
    await expect(item.first()).toBeVisible();
    await item.first().click();
  }
  await expect(page.locator("#compareSelected .compare-tag")).toHaveCount(4);
  await expect(page.locator("#compareBtn")).toBeEnabled();

  await page.locator("#compareSearchInput").fill(names[4]);
  const overflowItem = page.locator(
    "#compareSuggestions .compare-suggestion-item[data-id]",
  );
  await expect(overflowItem.first()).toBeVisible();
  await overflowItem.first().click();
  await expect(page.locator("#compareSelected .compare-tag")).toHaveCount(4);
  await page.locator("#compareSearchInput").clear();
  await page.mouse.click(5, 5);

  await page.locator("#compareSelected .compare-tag-remove").first().click();
  await expect(page.locator("#compareSelected .compare-tag")).toHaveCount(3);
  await expect(page.locator("#compareBtn")).toBeEnabled();

  await page.locator("#compareSelected .compare-tag-remove").first().click();
  await page.locator("#compareSelected .compare-tag-remove").first().click();
  await expect(page.locator("#compareSelected .compare-tag")).toHaveCount(1);
  await expect(page.locator("#compareBtn")).toBeDisabled();
});

test("[E2E-RESILIENCE-005] @optional game boxscore sort clicks keep table rows stable", async ({
  page,
}) => {
  await gotoRoute(page, "#/games/04601001");
  await waitForViewVisible(page, "game");

  const awayPts = page.locator("#boxscoreAwayTable th[data-key='pts']").first();
  const homePts = page.locator("#boxscoreHomeTable th[data-key='pts']").first();
  await expect(awayPts).toBeVisible();
  await expect(homePts).toBeVisible();
  const awayRowsBefore = await page.locator("#boxscoreAwayBody tr").count();
  const homeRowsBefore = await page.locator("#boxscoreHomeBody tr").count();

  await awayPts.click();
  await homePts.click();
  await expect(page.locator("#boxscoreAwayBody tr")).toHaveCount(
    awayRowsBefore,
  );
  await expect(page.locator("#boxscoreHomeBody tr")).toHaveCount(
    homeRowsBefore,
  );
  await expect(page).toHaveURL(/#\/games\//);
});

test("[E2E-RESILIENCE-006] @optional schedule season switch preserves filter controls and list regions", async ({
  page,
}) => {
  await gotoRoute(page, "#/schedule");
  await waitForViewVisible(page, "schedule");

  const seasonSelect = page.locator("#scheduleSeasonSelect");
  const seasonCount = await page
    .locator("#scheduleSeasonSelect option")
    .count();
  expect(seasonCount).toBeGreaterThan(0);
  if (seasonCount > 1) {
    await seasonSelect.selectOption({ index: seasonCount - 1 });
    await waitForViewVisible(page, "schedule");
  }

  await expect(page.locator("#scheduleTeamSelect")).toBeVisible();
  const teamOptions = await page.locator("#scheduleTeamSelect option").count();
  expect(teamOptions).toBeGreaterThan(0);
  await expect(page.locator("#upcomingGamesList")).toBeVisible();
  await expect(page.locator("#recentResultsList")).toBeVisible();
});
