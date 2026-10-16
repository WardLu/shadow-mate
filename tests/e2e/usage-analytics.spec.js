import { test, expect } from "@playwright/test";
import { captureAnalytics } from "./helpers/analytics.js";
import { openParentArea } from "./helpers/parent-gate.js";
import { openSection } from "./helpers/sections.js";

test.use({ serviceWorkers: "block" });

async function mockCollector(page, { fail = false } = {}) {
  const events = [];
  await captureAnalytics(page);
  // Override only the served test module's configuration, never production config.
  await page.route("**/src/usage-analytics.js*", async route => {
    const response = await route.fetch();
    const source = (await response.text())
      .replace(/dsn = [^\n]+,/, 'dsn = ["https://00000000000000000000000000000000", "o0.ingest.us.sentry.io/999"].join("@"),')
      .replace("origin = globalThis.location?.origin", 'origin = "https://sm.shadow.wang"');
    await route.fulfill({ response, body: source });
  });
  await page.route("https://o0.ingest.us.sentry.io/**", async route => {
    const lines = route.request().postData().trim().split("\n").map(line => JSON.parse(line));
    const log = lines[2].items[0];
    events.push({ event: log.body, distinct_id: log.attributes["usage.browser_id"].value, properties: Object.fromEntries(Object.entries(log.attributes).map(([key, attr]) => [key, attr.value])), ingest_settings: lines[2].ingest_settings });
    await route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify({ status: fail ? 0 : 1 }) });
  });
  return events;
}

async function allowUsage(page) {
  await openParentArea(page, '[data-mod="settings"]');
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await page.getByRole("switch", { name: "使用统计", exact: true }).check();
}

test("new browsers collect by default and switching off stops collection", async ({ page }, testInfo) => {
  const events = await mockCollector(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.cloudSync?.getUsageMode?.())).toBe("local");
  await expect.poll(() => events.some(e => e.event.endsWith("_open"))).toBe(true);
  await allowUsage(page);
  await expect(page.getByRole("switch", { name: "使用统计", exact: true })).toBeChecked();
  const privacyTab = await page.getByRole("tab", { name: "隐私", exact: true }).boundingBox();
  expect(privacyTab.x + privacyTab.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("usage-enabled-mobile.png") });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: testInfo.outputPath("usage-enabled-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  const button = page.locator('[data-cmod="math-mental"]');
  await button.click();
  await expect.poll(() => events.some(e => e.event === "sm_local_active_day")).toBe(true);
  await button.click(); // undo
  await button.click(); // repeated success, daily category already counted
  expect(events.filter(e => e.event === "sm_local_checkin")).toHaveLength(1);
  const id = events[0].distinct_id;
  expect(events.every(e => e.distinct_id === id)).toBe(true);
  expect(events.every(e => Object.keys(e.properties).sort().join() === "product,sentry.environment,sentry.sdk.name,sentry.sdk.version,usage.browser_id,usage.day,usage.event,usage.mode")).toBe(true);
  await openParentArea(page, '[data-mod="settings"]');
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await page.getByRole("switch", { name: "使用统计", exact: true }).uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("shadow_mate_usage_v1"))).toBeNull();
  const count = events.length;
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="english"]');
  expect(events).toHaveLength(count);
});

test("failed reporting leaves a successful local check-in usable", async ({ page }) => {
  const events = await mockCollector(page, { fail: true });
  await page.goto("/");
  await allowUsage(page);
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  const button = page.locator('[data-cmod="math-mental"]');
  await button.click();
  await expect.poll(() => events.some(e => e.event === "sm_local_checkin")).toBe(true);
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  await expect(page.locator('[data-cmod="math-mental"]')).toHaveAttribute("aria-pressed", "true");
});

test("unconfigured settings disclose disabled collection", async ({ page }, testInfo) => {
  await captureAnalytics(page);
  await page.goto("/");
  await openParentArea(page, '[data-mod="settings"]');
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await expect(page.getByRole("switch", { name: "使用统计", exact: true })).toBeDisabled();
  await expect(page.getByText("收集使用数据，帮助改进产品体验。", { exact: true })).toBeVisible();
  await expect(page.locator("[data-usage-hint]")).toContainText("仅在正式站点 sm.shadow.wang 启用");
  await expect(page.getByRole("link", { name: "隐私政策", exact: true }).first()).toHaveAttribute("href", "/privacy");
  await page.screenshot({ path: testInfo.outputPath("usage-privacy-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("usage-privacy-mobile.png") });
});

test("ordinary points, local redemption and fulfillment emit separate categories", async ({ page }) => {
  const events = await mockCollector(page);
  await page.goto("/");
  await allowUsage(page);
  await page.click('[data-mod="points"]');
  await openParentArea(page, '[data-go-settings="points"]');
  await page.fill('#pointItemForm input[name="name"]', "合成积分项目");
  await page.fill('#pointItemForm input[name="points"]', "2");
  await page.click('#pointItemForm button[type="submit"]');
  await page.click('[data-mod="points"]');
  const item = page.locator(".pts-card").filter({ hasText: "合成积分项目" });
  await item.locator(".pts-toggle").click();
  await expect(item).toHaveClass(/done/);
  await expect.poll(() => events.some(e => e.event === "sm_local_point_recorded")).toBe(true);
  await page.click('[data-mod="grow"]');
  await openParentArea(page, '[data-go-settings="growth"]');
  await page.fill('#rewardForm input[name="name"]', "合成奖励");
  await page.fill('#rewardForm input[name="cost"]', "2");
  await page.click('#rewardForm button[type="submit"]');
  await page.click('[data-mod="grow"]');
  await openSection(page, "section-grow-rewards");
  const reward = page.locator(".reward-card").filter({ hasText: "合成奖励" });
  await reward.locator(".reward-redeem").click();
  await expect.poll(() => events.some(e => e.event === "sm_local_reward_redeemed")).toBe(true);
  await reward.locator(".reward-fulfill").click();
  await expect.poll(() => events.some(e => e.event === "sm_local_reward_fulfilled")).toBe(true);
  expect(events.filter(e => e.event === "sm_local_active_day")).toHaveLength(1);
  expect(JSON.stringify(events)).not.toMatch(/合成|profile_id|household_id/);
});


test("a previous opt-out stays off after reload", async ({ page }) => {
  const events = await mockCollector(page);
  await page.addInitScript(() => localStorage.setItem("shadow_mate_usage_consent_v1", "0"));
  await page.goto("/");
  await openParentArea(page, '[data-mod="settings"]');
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await expect(page.getByRole("switch", { name: "使用统计", exact: true })).not.toBeChecked();
  await page.reload();
  await page.click('[data-mod="learning"]');
  await page.click('[data-go="math"]');
  await page.locator('[data-cmod="math-mental"]').click();
  expect(events).toEqual([]);
});

test("unhandled errors reach a mock Sentry with sensitive data stripped and opt-out respected", async ({ page }) => {
  await captureAnalytics(page);
  const errors = [];
  const itemTypes = [];
  await page.route("**/src/usage-analytics.js*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/dsn = [^\n]+,/, 'dsn = ["https://00000000000000000000000000000000", "o0.ingest.us.sentry.io/999"].join("@"),').replace("origin = globalThis.location?.origin", 'origin = "https://sm.shadow.wang"') });
  });
  await page.route("**/src/error-monitoring.js*", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace("dsn = usageDsn", 'dsn = ["https://00000000000000000000000000000000", "o0.ingest.us.sentry.io/999"].join("@")').replace("origin = globalThis.location?.origin", 'origin = "https://sm.shadow.wang"') });
  });
  await page.route("https://o0.ingest.us.sentry.io/**", async route => {
    const body = route.request().postData();
    const lines = body.trim().split("\n").map(line => JSON.parse(line));
    itemTypes.push(lines[1].type);
    if (lines[1].type === "event") errors.push(lines[2]);
    await route.fulfill({ status: 200, body: "{}", contentType: "application/json" });
  });
  await page.goto("/");
  const dispatch = () => page.evaluate(() => {
    const error = new TypeError("synthetic-private@example.com child name");
    error.stack = "TypeError: synthetic-private@example.com child name\n at synthetic (https://sm.shadow.wang/assets/app-ABC.js?token=private:7:9)";
    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message, filename: "https://sm.shadow.wang/assets/app-ABC.js", lineno: 7, colno: 9 }));
  });
  await dispatch();
  await expect.poll(() => errors.length).toBe(1);
  expect(errors[0].exception.values[0].type).toBe("TypeError");
  expect(errors[0].sdk.settings.infer_ip).toBe("never");
  expect(JSON.stringify(errors)).not.toMatch(/synthetic-private|child name|token=|breadcrumbs|request|usage.browser_id/);
  await openParentArea(page, '[data-mod="settings"]');
  await page.getByRole("tab", { name: "隐私", exact: true }).click();
  await page.getByRole("switch", { name: "使用统计", exact: true }).uncheck();
  await dispatch();
  // Flush asynchronously scheduled SDK processing before asserting no transmission.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  expect(errors).toHaveLength(1);
  expect(itemTypes.every(type => ["log", "event"].includes(type))).toBe(true);
});
