import { expect } from "playwright/test";

export async function waitForAppReady(page) {
  await expect(page.locator("#skeletonUI")).toHaveClass(/skeleton-hidden/);
}

export async function waitForViewVisible(page, viewId) {
  await expect(page.locator(`#view-${viewId}`)).toBeVisible();
}

export async function gotoRoute(page, hash) {
  await page.goto(`/${hash}`);
  await waitForAppReady(page);
}
