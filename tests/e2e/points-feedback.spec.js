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

      // Undo the deduction
      await subToggle.click();
      await page.click('[data-mod="grow"]');
      const historyList = page.locator(".growth-history-list");
      await expect(historyList).toBeVisible();
      await expect(historyList).toContainText("（撤销）");
    }
  });

  test("shows celebration praise and stars when redeeming a reward, streamlined 确认兑现 button", async ({ page }) => {
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
    await page.click('[data-go-settings="growth"]');

    // Add a cheap reward to guarantee redeemability
    await page.fill('#rewardForm input[name="name"]', "小红花贴纸");
    await page.fill('#rewardForm input[name="cost"]', "1");
    await page.click('#rewardForm button[type="submit"]');
    await page.click('[data-mod="grow"]');

    const redeemBtn = page.locator('.reward-card .reward-redeem:not([disabled])').first();
    await expect(redeemBtn).toBeVisible();
    await redeemBtn.click();

    const praiseEl = page.locator(".big-praise").filter({ hasText: "兑换成功" });
    await expect(praiseEl).toBeVisible();

    const stars = page.locator(".fxstar");
    expect(await stars.count()).toBeGreaterThanOrEqual(1);

    // Verify the redundant disabled "待兑现" button is NOT displayed
    await expect(page.locator('.reward-card button:has-text("待兑现")')).toHaveCount(0);

    // Verify "确认兑现" and "取消兑换" are present
    const fulfillBtn = page.locator('.reward-card .reward-fulfill').first();
    await expect(fulfillBtn).toBeVisible();
    await expect(fulfillBtn).toHaveText("确认兑现");
    await expect(page.locator('.reward-card .reward-cancel').first()).toHaveText("取消兑换");

    // Click 确认兑现 and verify fulfillment praise
    await fulfillBtn.click();
    await expect(page.locator(".big-praise").filter({ hasText: "奖励已兑现" }).first()).toBeVisible();
  });

  test("fulfilled reward shows 24h undo window badge and revocation button, allows repeat redemption, and archives after 24h", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');

    // Earn points
    const toggles = page.locator(".pts-toggle");
    const count = await toggles.count();
    for (let i = 0; i < Math.min(3, count); i++) {
      await toggles.nth(i).click();
      await page.waitForTimeout(100);
    }

    // Go to grow page
    await page.click('[data-mod="grow"]');
    await page.click('[data-go-settings="growth"]');

    // Add a reward
    await page.fill('#rewardForm input[name="name"]', "绘本自选");
    await page.fill('#rewardForm input[name="cost"]', "1");
    await page.click('#rewardForm button[type="submit"]');
    await page.click('[data-mod="grow"]');

    const rewardCard = page.locator(".reward-card").filter({ hasText: "绘本自选" });
    await expect(rewardCard).toBeVisible();

    // 1. First redemption
    await rewardCard.locator(".reward-redeem").click();
    await expect(rewardCard.locator(".reward-pending-hint")).toHaveText("待兑现");
    await expect(rewardCard.locator(".reward-fulfill")).toHaveText("确认兑现");
    await expect(rewardCard.locator(".reward-cancel")).toHaveText("取消兑换");

    // 2. Fulfill redemption
    await rewardCard.locator(".reward-fulfill").click();
    await expect(page.locator(".big-praise").filter({ hasText: "奖励已兑现" }).first()).toBeVisible();

    // 3. Verify 24h undo window badge and revoke button
    const undoBadge = rewardCard.locator(".reward-undo-hint");
    await expect(undoBadge).toBeVisible();
    await expect(undoBadge).toHaveText("已兑现 · 24小时内可撤回");

    const revokeBtn = rewardCard.locator(".reward-cancel");
    await expect(revokeBtn).toBeVisible();
    await expect(revokeBtn).toHaveText("撤回兑现");
    await expect(revokeBtn).toHaveAttribute("title", "兑现后 24 小时内支持撤销履约并退还积分");

    // 4. Verify main button is decoupled and shows "再次兑换" (not locked to "已兑现")
    const repeatBtn = rewardCard.locator(".reward-redeem");
    await expect(repeatBtn).toBeVisible();
    await expect(repeatBtn).toHaveText("再次兑换");
    await expect(repeatBtn).not.toBeDisabled();

    // 5. Test repeat redemption
    await repeatBtn.click();
    await expect(rewardCard.locator(".reward-pending-hint")).toHaveText("待兑现");
    await expect(rewardCard.locator(".reward-fulfill")).toHaveText("确认兑现");

    // Fulfill the second redemption
    await rewardCard.locator(".reward-fulfill").click();
    await expect(rewardCard.locator(".reward-undo-hint")).toHaveText("已兑现 · 24小时内可撤回");
    await expect(rewardCard.locator(".reward-cancel")).toHaveText("撤回兑现");

    // 6. Test revocation of the fulfilled redemption
    page.on("dialog", (dialog) => dialog.accept());
    await rewardCard.locator(".reward-cancel").click();
    await expect(rewardCard.locator(".reward-cancel")).toHaveCount(0);
    await expect(rewardCard.locator(".reward-undo-hint")).toHaveCount(0);
    await expect(rewardCard.locator(".reward-redeem")).toHaveText("兑换");

    // 7. Test 24h expiration: redeem and fulfill again
    await rewardCard.locator(".reward-redeem").click();
    await rewardCard.locator(".reward-fulfill").click();
    await expect(rewardCard.locator(".reward-undo-hint")).toBeVisible();
    await expect(rewardCard.locator(".reward-cancel")).toBeVisible();

    // Mock time forward by 25 hours
    await page.evaluate(() => {
      const now = Date.now();
      window.__origDateNow = Date.now;
      Date.now = () => now + 25 * 60 * 60 * 1000;
      window.switchMod("grow");
    });

    // After 24h, undo badge and revoke button automatically disappear
    await expect(rewardCard.locator(".reward-undo-hint")).toHaveCount(0);
    await expect(rewardCard.locator(".reward-cancel")).toHaveCount(0);
    await expect(rewardCard.locator(".reward-redeem")).toBeVisible();

    // Restore Date.now
    await page.evaluate(() => {
      if (window.__origDateNow) Date.now = window.__origDateNow;
    });
  });
});
