import { test, expect } from "@playwright/test";
import { captureAnalytics, readAnalytics } from "./helpers/analytics.js";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ page }) => { await captureAnalytics(page); });

test("records activation once per browser and exposes a feedback mail link", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => readAnalytics(page)).toEqual([{ name: "app_activated" }]);
  const feedback = page.getByRole("link", { name: "发送问题反馈邮件至 support@shadow.wang" });
  await expect(feedback).toBeVisible();
  await expect(feedback).toHaveAttribute("href", /^mailto:support@shadow\.wang\?subject=Shadow%20Mate/);
  await page.reload();
  await expect(page.locator('[data-mod="learning"]')).toBeVisible();
  expect(await readAnalytics(page)).toEqual([]);
});

test("records first check-in once, ignoring undo and repeated check-in", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  const button = page.locator('[data-cmod="math-mental"]');
  await button.click();
  await expect.poll(() => readAnalytics(page)).toEqual([{ name: "app_activated" }, { name: "first_checkin" }]);
  await button.click();
  await button.click();
  expect(await readAnalytics(page)).toEqual([{ name: "app_activated" }, { name: "first_checkin" }]);
});

test("does not call an undo the first check-in", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T04:00:00Z") });
  await page.goto("/");
  await page.evaluate(() => window.learningDesk.replaceState({
    checkins: { "2026-09-06": { "math-mental": true } },
  }, { persist: true }));
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  await page.locator('[data-cmod="math-mental"]').click();
  expect(await readAnalytics(page)).toEqual([{ name: "app_activated" }]);
});

test("records a three-day streak without learner data in the event payload", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T04:00:00Z") });
  await page.goto("/");
  await page.evaluate(() => window.learningDesk.replaceState({
    checkins: { "2026-09-04": { "math-mental": true }, "2026-09-05": { "chinese-writing": true } },
    extra: { syntheticPrivateMarker: "must-stay-local" },
  }, { persist: true }));
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  await page.locator('[data-cmod="math-mental"]').click();
  await expect.poll(() => readAnalytics(page)).toEqual([
    { name: "app_activated" }, { name: "first_checkin" }, { name: "streak_3_days" },
  ]);
});
