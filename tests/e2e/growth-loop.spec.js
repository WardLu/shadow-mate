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

  test("auto-detects legacy points and imports them with one click from the grow page", async ({ page }) => {
    // Seed the pre-Growth-Loop daily records before the app boots; the app
    // migrates them into the envelope's legacy.points_readonly.
    await page.addInitScript(() => {
      localStorage.setItem("shadow_mate_workbench_v1", JSON.stringify({
        points: {
          "2026-7": { "0": { 5: 1, 6: 1 }, "3": { 7: 1 } },
          "2026-8": { "1": { 2: 1 } },
        },
        checkins: {},
        extra: {},
        bookShelf: {},
        peanutLog: [],
        peanutRead: {},
      }));
    });
    await page.goto("/");

    await page.click('[data-mod="grow"]');
    const card = page.locator(".growth-opening-card");
    await expect(card).toContainText("恢复旧积分");
    await expect(card).toContainText("10"); // 2+2+3+3 合计
    await expect(card.locator(".legacy-row")).toHaveCount(4);

    page.on("dialog", (dialog) => dialog.accept());
    await card.locator("#legacyImportBtn").click();
    await expect(card).toContainText("本机已导入，待云端确认");
    await expect(card).toContainText("10");

    // The imported daily detail shows in the recent history list.
    await expect(page.locator(".growth-history-list li")).toHaveCount(4);

    await page.evaluate(() => window.growthLoop.sync({
      transport: {
        send: async (event) => event.type === "legacy_points_import"
          ? { status: "rejected", error_code: "permission_denied" }
          : { status: "confirmed" },
      },
    }));
    await expect(card).toContainText("旧积分导入未完成");
    await expect(card).toContainText("云端拒绝了这次导入");
    await expect(card.locator("#legacyImportBtn")).toContainText("重新导入");
  });

  test("shows retryable legacy imports as waiting for cloud retry", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("shadow_mate_workbench_v1", JSON.stringify({
        points: { "2026-8": { "0": { 5: 1 } } },
        checkins: {},
        extra: {},
        bookShelf: {},
        peanutLog: [],
        peanutRead: {},
      }));
    });
    await page.goto("/");
    await page.click('[data-mod="grow"]');
    const card = page.locator(".growth-opening-card");
    page.on("dialog", (dialog) => dialog.accept());
    await card.locator("#legacyImportBtn").click();

    await expect(card).toContainText("本机已导入，待云端确认");
    await expect.poll(() => page.evaluate(async () => {
      const events = await window.growthLoop.pendingOutbox();
      return events.some((event) => event.type === "legacy_points_import");
    })).toBe(true);

    await page.evaluate(() => window.growthLoop.sync({
      transport: {
        send: async (event) => event.type === "legacy_points_import"
          ? { status: "retryable", error_code: "network_or_server_error" }
          : { status: "confirmed" },
      },
    }));

    await expect(card).toContainText("旧积分等待云端重试");
    await expect(card).toContainText("云端确认暂时失败，将自动重试");
  });
});
