import { test, expect } from "@playwright/test";

test.describe("Growth Loop local-first boundary", () => {
  test("lets a parent create a custom point item and a reward from the app", async ({ page }) => {
    await page.goto("/");
    await page.click('[data-mod="points"]');
    await page.fill('#pointItemForm input[name="name"]', "自己刷牙");
    await page.fill('#pointItemForm input[name="points"]', "2");
    await page.click('#pointItemForm button[type="submit"]');
    await expect(page.locator(".pts-card").filter({ hasText: "自己刷牙" })).toBeVisible();

    const customCard = page.locator(".pts-card").filter({ hasText: "自己刷牙" });
    await customCard.locator(".pts-toggle").click();
    await expect(customCard).toHaveClass(/done/);

    await page.click('[data-mod="grow"]');
    await page.fill('#rewardForm input[name="name"]', "选一个故事");
    await page.fill('#rewardForm input[name="cost"]', "2");
    await page.click('#rewardForm button[type="submit"]');
    const reward = page.locator(".reward-card").filter({ hasText: "选一个故事" });
    await expect(reward).toBeVisible();
    await reward.locator(".reward-redeem").click();
    await expect(reward).toContainText("待联网确认");
  });

  test("adopts pending local actions and claims one outbox event across two pages", async ({ browser }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    const second = await context.newPage();
    await first.goto("/");
    await second.goto("/");
    await first.evaluate(() => window.growthLoop.hydrate());
    await second.evaluate(() => window.growthLoop.hydrate());

    await first.evaluate(async () => {
      await window.growthLoop.recordPoint({
        item: { id: crypto.randomUUID(), name: "双连接测试", default_points: 2 },
        occurred_on: "2026-08-14",
        request_id: crypto.randomUUID(),
      });
    });

    await first.evaluate(async () => {
      await window.growthLoop.loadScope(
        { household_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", profile_id: "aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa" },
        { adoptPending: true },
      );
    });
    await second.evaluate(async () => {
      await window.growthLoop.loadScope({
        household_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        profile_id: "aaaaaaaa-bbbb-4aaa-8aaa-aaaaaaaaaaaa",
      });
    });
    const pendingCount = await first.evaluate(async () => (await window.growthLoop.pendingOutbox()).length);
    expect(pendingCount).toBeGreaterThan(0);
    await expect.poll(() => second.evaluate(async () => (await window.growthLoop.pendingOutbox()).length)).toBe(pendingCount);

    await first.evaluate(() => { window.__growthSyncSends = 0; });
    await second.evaluate(() => { window.__growthSyncSends = 0; });
    const syncScript = async () => {
      await window.growthLoop.sync({
        transport: {
          send: async () => {
            window.__growthSyncSends += 1;
            await new Promise((resolve) => setTimeout(resolve, 40));
            return { status: "confirmed", data: { id: crypto.randomUUID() } };
          },
        },
      });
    };
    await Promise.all([first.evaluate(syncScript), second.evaluate(syncScript)]);

    const sends = await first.evaluate(() => window.__growthSyncSends)
      + await second.evaluate(() => window.__growthSyncSends);
    expect(sends).toBe(pendingCount);
    await context.close();
  });
});
