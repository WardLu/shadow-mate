import { test, expect } from "@playwright/test";

test.describe("Points and reward redemption feedback animations", () => {
  test.use({ serviceWorkers: "block" });

  test("shows praise bubble and starburst when earning points, shakes on deduction", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');

    // Earn points
    const addToggle = page.locator(".pts-toggle").first();
    await expect(addToggle).toBeVisible();
    await addToggle.click();

    const praiseEl = page.locator(".big-praise").first();
    await expect(praiseEl).toBeVisible();
    await expect(praiseEl).toContainText("积分！");

    const stars = page.locator(".fxstar");
    expect(await stars.count()).toBeGreaterThanOrEqual(1);

    // Deduct points
    const subCard = page.locator(".pts-card.sub");
    if (await subCard.count() > 0) {
      const subToggle = subCard.first().locator(".pts-toggle");
      await subToggle.click();
      await expect(page.locator(".card-shake").first()).toBeAttached();
    }
  });

  test("shows celebration praise and stars when redeeming a reward", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');

    // Earn enough points first
    const toggles = page.locator(".pts-toggle");
    const count = await toggles.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await toggles.nth(i).click();
      await page.waitForTimeout(100);
    }

    // Go to grow page
    await page.click('[data-mod="grow"]');

    // Add a cheap reward to guarantee redeemability
    await page.fill('#rewardForm input[name="name"]', "小红花贴纸");
    await page.fill('#rewardForm input[name="cost"]', "1");
    await page.click('#rewardForm button[type="submit"]');

    const redeemBtn = page.locator('.reward-card .reward-redeem:not([disabled])').first();
    await expect(redeemBtn).toBeVisible();
    await redeemBtn.click();

    const praiseEl = page.locator(".big-praise").filter({ hasText: "兑换成功" });
    await expect(praiseEl).toBeVisible();

    const stars = page.locator(".fxstar");
    expect(await stars.count()).toBeGreaterThanOrEqual(1);
  });
});
